import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pageErrors = new WeakMap<Page, string[]>();
const evidenceDir = path.resolve('output/playwright/journeys');
async function record(name: string, value: unknown, info: TestInfo) {
  await mkdir(evidenceDir, { recursive: true });
  const json = JSON.stringify(value, null, 2);
  await writeFile(path.join(evidenceDir, `${name}.json`), json + '\n');
  await info.attach(name, { body: json, contentType: 'application/json' });
}
async function setNumber(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press('Enter');
}
async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    const boundary = dialog?.getBoundingClientRect();
    const controls = [...(dialog ?? document).querySelectorAll<HTMLElement>('button,input,select,textarea')]
      .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
      .map(element => ({ name: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 60), left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }))
      .filter(rect => rect.left < (boundary?.left ?? 0) - 1 || rect.right > (boundary?.right ?? innerWidth) + 1);
    return { documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, dialogWidth: dialog?.clientWidth, dialogScrollWidth: dialog?.scrollWidth, controlsOutside: controls };
  });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
});
test.afterEach(async ({ page }, info) => {
  await info.attach('page-errors', { body: JSON.stringify(pageErrors.get(page)), contentType: 'application/json' });
  expect(pageErrors.get(page)).toEqual([]);
});

test('journey A: count-in then sixty real seconds at 90 BPM in 3/4 with 2 subdivisions', async ({ page }, info) => {
  test.setTimeout(90_000);
  await setNumber(page, 'BPM 직접 입력', '90');
  await page.getByRole('button', { name: '3/4 박자 빠른 선택', exact: true }).click();
  await page.getByRole('button', { name: '리듬 시트 열기', exact: true }).click();
  await page.getByRole('button', { name: '2분할 세분박', exact: true }).click();
  await page.getByRole('button', { name: '리듬 닫기', exact: true }).click();
  await page.getByRole('button', { name: '연습 시트 열기', exact: true }).click();
  await page.getByRole('button', { name: '1마디 카운트인', exact: true }).click();
  await page.getByRole('button', { name: '1분 타이머', exact: true }).click();
  await expect(page.getByRole('button', { name: '1분 타이머', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '연습 닫기', exact: true }).click();
  const wallStarted = Date.now();
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.getByRole('button', { name: '정지', exact: true })).toBeVisible();
  await page.waitForFunction(() => window.__pulseDiagnostics?.getSnapshot().currentEvent?.phase === 'main', undefined, { timeout: 6000 });
  const started = await page.evaluate(() => ({ snapshot: window.__pulseDiagnostics!.getSnapshot(), diagnostics: window.__pulseDiagnostics!.getDiagnostics() }));
  expect(started.snapshot.currentEvent).toMatchObject({ bpm: 90, timeSignature: { beats: 3, noteValue: 4 }, subdivision: 'eighth' });
  expect(started.snapshot.timerDeadline! - started.snapshot.mainStartedAt!).toBeCloseTo(60, 6);
  await expect(page.getByText(/^남은 시간 /)).toBeVisible();
  await page.getByRole('button', { name: '재생', exact: true }).waitFor({ state: 'visible', timeout: 65_000 });
  await expect.poll(async () => page.evaluate(() => window.__pulseDiagnostics!.getDiagnostics().activeSources), { timeout: 2000 }).toBe(0);
  const stopped = await page.evaluate(() => ({ snapshot: window.__pulseDiagnostics!.getSnapshot(), diagnostics: window.__pulseDiagnostics!.getDiagnostics() }));
  const wallMilliseconds = Date.now() - wallStarted;
  expect(wallMilliseconds).toBeGreaterThanOrEqual(60_000);
  expect(wallMilliseconds).toBeLessThan(73_000);
  expect(stopped.snapshot).toMatchObject({ state: 'idle', currentEvent: null, timerRemainingSeconds: null });
  expect(stopped.diagnostics.queueLength).toBe(0);
  expect(stopped.diagnostics.skippedEventCount).toBe(0);
  expect(stopped.diagnostics.duplicateEventCount).toBe(0);
  expect(stopped.diagnostics.lastScheduledTime).toBeLessThan(started.snapshot.timerDeadline!);
  await record('journey-a', { browser: info.project.name || 'Chromium', viewport: page.viewportSize(), wallMilliseconds, started, stopped, pageErrors: pageErrors.get(page) }, info);
  await page.screenshot({ path: path.join(evidenceDir, 'journey-a-complete.png'), fullPage: true });
});

test('journey C: 6/8 dotted-quarter, gap 3:1, beat random 30 percent and increasing speed', async ({ page }, info) => {
  test.setTimeout(30_000);
  await setNumber(page, 'BPM 직접 입력', '60');
  await page.getByRole('button', { name: '6/8 박자 빠른 선택', exact: true }).click();
  await page.getByRole('button', { name: '리듬 시트 열기', exact: true }).click();
  await page.getByRole('dialog', { name: '리듬', exact: true }).getByLabel('BPM 기준 음표', { exact: true }).selectOption('dotted-quarter');
  await expect(page.getByRole('dialog', { name: '리듬', exact: true }).getByText('한 마디 2초 · 8분음표 셀 6개', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '리듬 닫기', exact: true }).click();
  await page.getByRole('button', { name: '연습 시트 열기', exact: true }).click();
  await expect(page.getByRole('button', { name: '0마디 카운트인', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '타이머 끄기', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '1분 타이머', exact: true }).click();
  await setNumber(page, '시작 BPM', '60');
  await setNumber(page, '목표 BPM', '64');
  await setNumber(page, '변화 폭 (BPM)', '2');
  await setNumber(page, '변화 간격 (마디)', '2');
  await page.getByLabel('속도 훈련 켜기', { exact: true }).check();
  await page.getByRole('button', { name: '3마디 재생 1마디 묵음', exact: true }).click();
  await page.getByLabel('랜덤 묵음 켜기', { exact: true }).check();
  await page.getByLabel('랜덤 묵음 단위', { exact: true }).selectOption('beat');
  await page.getByRole('slider', { name: /^확률 / }).fill('30');
  await expect(page.getByText('박 단위 30% 묵음', { exact: true })).toBeVisible();
  await expect(page.getByLabel('훈련 묵음 중 시각·햅틱 유지', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: '연습 닫기', exact: true }).click();
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.getByText('속도 훈련 · 목표 64', { exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const event = window.__pulseDiagnostics?.getSnapshot().currentEvent;
    return event?.barIndex === 3 && event.gapMute;
  }, undefined, { timeout: 12_000 });
  const duringGap = await page.evaluate(() => window.__pulseDiagnostics!.getSnapshot());
  expect(duringGap.currentEvent).toMatchObject({ bpm: 62, tempoUnit: 'dotted-quarter', timeSignature: { beats: 6, noteValue: 8 }, gapMute: true, isAudible: false });
  await expect(page.getByText('묵음 훈련', { exact: true })).toBeVisible();
  await expect(page.getByText(/^남은 시간 /)).toBeVisible();
  await page.waitForFunction(() => window.__pulseDiagnostics?.getSnapshot().currentEvent?.bpm === 64, undefined, { timeout: 5000 });
  const target = await page.evaluate(() => window.__pulseDiagnostics!.getSnapshot());
  const display = await page.getByLabel('BPM 직접 입력').inputValue();
  expect(display).toBe('64');
  await record('journey-c', { duringGap, target, displayedBpm: display, pageErrors: pageErrors.get(page) }, info);
  await page.screenshot({ path: path.join(evidenceDir, 'journey-c-target.png'), fullPage: true });
  await page.getByRole('button', { name: '정지', exact: true }).click();
});

for (const theme of ['dark', 'light']) test(`extended accessibility: ${theme} main, settings and rhythm`, async ({ page }, info) => {
  test.setTimeout(40_000);
  await page.getByRole('button', { name: '설정 열기', exact: true }).click();
  await page.getByRole('button', { name: `${theme} 테마`, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const settings = (await new AxeBuilder({ page }).analyze()).violations;
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  const main = (await new AxeBuilder({ page }).analyze()).violations;
  await page.getByRole('button', { name: '리듬 시트 열기', exact: true }).click();
  const rhythm = (await new AxeBuilder({ page }).analyze()).violations;
  await record(`accessibility-${theme}`, { main, settings, rhythm }, info);
  expect(main).toEqual([]);
  expect(settings).toEqual([]);
  expect(rhythm).toEqual([]);
});

test('200 percent text remains usable at320px and native page scale permits 200 percent pinch zoom', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const textMain = await noHorizontalOverflow(page);
  await page.getByRole('button', { name: '연습 시트 열기', exact: true }).click();
  const textModal = await noHorizontalOverflow(page);
  const textClose = await page.getByRole('button', { name: '연습 닫기', exact: true }).boundingBox();
  expect(textClose!.y).toBeGreaterThanOrEqual(0);
  expect(textClose!.y + textClose!.height).toBeLessThanOrEqual(568);
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, 'text-200-percent-practice.png') });
  await page.getByRole('button', { name: '연습 닫기', exact: true }).click();
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.getByRole('button', { name: '설정 열기', exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  const pinchZoom = await page.evaluate(() => ({ scale: visualViewport!.scale, visualWidth: visualViewport!.width, layoutWidth: innerWidth, viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') }));
  expect(pinchZoom.scale).toBe(2);
  expect(pinchZoom.visualWidth).toBe(160);
  expect(pinchZoom.viewportMeta).not.toMatch(/user-scalable=no|maximum-scale=1/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '설정', exact: true })).not.toBeVisible();
  await record('zoom', { textMain, textModal, textClose, pinchZoom, zoomMethod: 'font-size:200% at320px plus Chromium CDP page scale2 (actual visualViewport.scale2). Desktop browser-menu zoom and physical pinch gestures not measured.' }, info);
  for (const result of [textMain, textModal]) {
    expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
    expect(result.controlsOutside).toEqual([]);
    if (result.dialogWidth) expect(result.dialogScrollWidth).toBeLessThanOrEqual(result.dialogWidth + 1);
  }
});

test('reduced motion prevents fullscreen flash at maximum tempo and subdivision', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setNumber(page, 'BPM 직접 입력', '300');
  await page.getByRole('button', { name: '리듬 시트 열기', exact: true }).click();
  await page.getByRole('button', { name: '4분할 세분박', exact: true }).click();
  await page.getByRole('button', { name: '리듬 닫기', exact: true }).click();
  await page.getByRole('button', { name: '설정 열기', exact: true }).click();
  await page.getByLabel('전체화면 플래시', { exact: true }).check();
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await page.evaluate(() => {
    const audit = { seenFlash: false, mutations: 0 };
    (window as Window & { __flashAudit?: typeof audit }).__flashAudit = audit;
    new MutationObserver(() => { audit.mutations++; if (document.querySelector('.flash-on')) audit.seenFlash = true; }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '정지', exact: true }).click();
  const result = await page.evaluate(() => ({ ...(window as Window & { __flashAudit?: { seenFlash: boolean; mutations: number } }).__flashAudit, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, event: window.__pulseDiagnostics!.getSnapshot().currentEvent }));
  await record('reduced-motion', result, info);
  expect(result.reducedMotion).toBe(true);
  expect(result.seenFlash).toBe(false);
  expect(result.event).toBeNull();
});
