import { expect, test, type Locator, type Page } from "@playwright/test";

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

async function inViewport(locator: Locator) {
  await expect(locator).toBeInViewport({ ratio: 1 });
}

for (const width of [320, 390]) {
  test(`R11 every cell in both 12/8 groupings is directly operable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    for (const grouping of ["12", "3+3+3+3"]) {
      await button(page, "리듬 시트 열기").click();
      const rhythm = page.getByRole("dialog", { name: "리듬" });
      await rhythm.getByRole("button", { name: "12/8 박자 선택" }).click();
      await rhythm.getByLabel("박 그룹 직접 입력").fill(grouping);
      await rhythm.getByRole("button", { name: "그룹 적용" }).click();
      await button(page, "리듬 닫기").click();
      const cells = page.getByRole("group", { name: "비트 도트와 악센트" }).getByRole("button");
      await expect(cells).toHaveCount(12);
      for (let index = 0; index < 12; index++) {
        const cell = cells.nth(index);
        const rect = (await cell.boundingBox())!;
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(width);
        expect(rect.width).toBeGreaterThanOrEqual(44);
        expect(rect.height).toBeGreaterThanOrEqual(44);
        const before = await cells.allTextContents();
        await cell.click();
        const after = await cells.allTextContents();
        expect(after[index]).not.toEqual(before[index]);
        expect(after.filter((value, i) => value !== before[i])).toHaveLength(1);
      }
    }
  });
}

for (const viewport of [{ width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`R11–12 performance status and keyboard recovery at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      const NativeAudio = window.AudioContext;
      window.AudioContext = class extends NativeAudio {
        constructor(options?: AudioContextOptions) {
          super(options);
          Object.assign(window, { suspendClassroomAudio: () => this.suspend() });
        }
      };
    });
    await page.goto("/");
    await button(page, "연습 시트 열기").click();
    await button(page, "1마디 카운트인").click();
    await button(page, "1분 타이머").click();
    await button(page, "연습 닫기").click();
    await expect(button(page, "연습 시트 열기")).toBeFocused();
    const trigger = button(page, "공연 모드 열기");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(button(page, "재생")).toBeFocused();
    await expect(page.getByRole("img", { name: "1박 강" })).toBeVisible();
    await page.keyboard.press("Space");
    await inViewport(button(page, "정지"));
    await inViewport(page.locator(".performance-bpm"));
    await inViewport(page.getByText(/^카운트 \d+$/));
    await expect.poll(() => page.evaluate(() => window.__pulseDiagnostics?.getSnapshot().currentEvent?.phase)).toBe("main");
    const remaining = page.getByText(/^남은 시간 /);
    await inViewport(remaining);
    expect(await remaining.evaluate(element => element.closest('[aria-live="assertive"],[aria-live="polite"],[role="status"]') !== null)).toBe(false);
    await page.evaluate(async () => {
      await (window as typeof window & {suspendClassroomAudio(): Promise<void>}).suspendClassroomAudio();
    });
    const resume = button(page, "재개");
    await inViewport(resume);
    await resume.focus();
    await page.keyboard.press("Enter");
    await expect(button(page, "정지")).toBeVisible();
    await button(page, "정지").click();
    await button(page, "일반 화면으로").focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toBeFocused();
  });
}

for (const mode of ["일반", "공연"]) {
  test(`R09 muted 1/4 has a visible stationary cue in ${mode} mode`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await button(page, "리듬 시트 열기").click();
    const rhythm = page.getByRole("dialog", { name: "리듬" });
    await rhythm.getByRole("button", { name: "1/4 박자 선택" }).click();
    await rhythm.getByRole("button", { name: "4분할 세분박" }).click();
    await button(page, "리듬 닫기").click();
    await button(page, "설정 열기").click();
    await page.getByLabel("뮤트 / 시각 메트로놈").check();
    await button(page, "설정 닫기").click();
    if (mode === "공연") await button(page, "공연 모드 열기").click();
    const observations = page.locator(".cell-pulse").evaluate(element => new Promise<number[]>((resolve, reject) => {
      const changes: number[] = [];
      const observer = new MutationObserver(() => {
        const markers = Array.from(element.children);
        const active = markers.findIndex(mark => getComputedStyle(mark).backgroundColor !== "rgba(0, 0, 0, 0)");
        if (active < 0 || active === changes.at(-1)) return;
        changes.push(active);
        if (changes.length === 4) {
          observer.disconnect();
          clearTimeout(timeout);
          resolve(changes);
        }
      });
      observer.observe(element, { subtree: true, attributes: true, attributeFilter: ["class"] });
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error("시각 주박 4회 미검출")); }, 7_000);
    }));
    await button(page, "재생").click();
    const four = await observations;
    expect(four).toHaveLength(4);
    expect(new Set(four)).toEqual(new Set([0, 1]));
    expect(await page.evaluate(() => window.__pulseDiagnostics?.getSnapshot().currentEvent?.isAudible)).toBe(false);
    await expect(page.locator(".flash-on")).toHaveCount(0);
    await button(page, "정지").click();
    await expect(page.locator(".cell-pulse-on")).toHaveCount(0);
  });
}

test("R10 compound beat summary and group accents preserve manually assigned rests", async ({ page }) => {
  await page.goto("/");
  const bpm = page.getByLabel("BPM 직접 입력", { exact: true });
  await bpm.fill("60");
  await bpm.press("Enter");
  await button(page, "리듬 시트 열기").click();
  const sheet = page.getByRole("dialog", { name: "리듬" });
  await sheet.getByRole("button", { name: "6/8 박자 선택" }).click();
  await sheet.getByLabel("BPM 기준 음표").selectOption("dotted-quarter");
  const summary = "점4분음표 = 60 · 큰박 2개 · 8분음표 6칸";
  await expect(sheet.getByText(summary)).toBeVisible();
  await button(page, "리듬 닫기").click();
  await button(page, "공연 모드 열기").click();
  await expect(page.getByText(summary)).toBeVisible();
  await button(page, "일반 화면으로").click();
  await button(page, "리듬 시트 열기").click();
  await sheet.getByRole("button", { name: "7/8 박자 선택" }).click();
  await sheet.getByRole("button", { name: "3박 보통 악센트 변경" }).click();
  await sheet.getByRole("button", { name: "3박 약 악센트 변경" }).click();
  await sheet.getByRole("button", { name: "2박 보통 악센트 변경" }).click();
  await sheet.getByRole("button", { name: "2+3+2" }).click();
  await sheet.getByRole("button", { name: "2+2+3" }).click();
  await sheet.getByRole("button", { name: "그룹 첫박에 강세 적용" }).click();
  for (const accent of ["1박 강", "2박 약", "3박 쉼", "5박 강"]) {
    await expect(sheet.getByRole("button", { name: accent + " 악센트 변경" })).toBeVisible();
  }
});

test("R11 the pending meter notice fits beside performance controls before the new bar", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  const bpm = page.getByLabel("BPM 직접 입력", { exact: true });
  await bpm.fill("30");
  await bpm.press("Enter");
  await button(page, "재생").click();
  await expect.poll(() => page.evaluate(() => window.__pulseDiagnostics?.getSnapshot().currentEvent?.beatIndex)).toBe(0);
  await button(page, "3/4 박자 빠른 선택").click();
  await button(page, "공연 모드 열기").click();
  await inViewport(page.locator(".performance-status").getByText(/다음 마디/));
  await inViewport(button(page, "정지"));
  await inViewport(page.locator(".performance-bpm"));
  await button(page, "정지").click();
});

for (const trainer of ["gap", "random"] as const) {
  test(`R09 ${trainer} training obeys the visual and haptic policy without revealing silent cells`, async ({ page }) => {
    await page.addInitScript(() => {
      const evidence = { vibrations: [] as boolean[] };
      Object.assign(window, { classroomFeedback: evidence });
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => {
        const event = window.__pulseDiagnostics?.getSnapshot().currentEvent;
        evidence.vibrations.push(Boolean(event?.gapMute || event?.randomMute));
        return true;
      } });
    });
    await page.goto("/");
    const bpm = page.getByLabel("BPM 직접 입력", { exact: true });
    await bpm.fill("60");
    await bpm.press("Enter");
    await button(page, "리듬 시트 열기").click();
    await page.getByRole("dialog", { name: "리듬" }).getByRole("button", { name: "1/4 박자 선택" }).click();
    await button(page, "리듬 닫기").click();
    await button(page, "설정 열기").click();
    await page.getByLabel("햅틱", { exact: true }).check();
    await button(page, "설정 닫기").click();
    for (const keep of [false, true]) {
      await button(page, "연습 시트 열기").click();
      if (trainer === "gap") {
        await button(page, "1마디 재생 1마디 묵음").click();
      } else {
        await page.getByLabel("랜덤 묵음 켜기").check();
        await page.getByRole("slider", { name: /^확률/ }).fill("100");
      }
      await page.getByLabel("훈련 묵음 중 시각·햅틱 유지").setChecked(keep);
      await button(page, "연습 닫기").click();
      await page.evaluate(() => { (window as typeof window & { classroomFeedback: { vibrations: boolean[] } }).classroomFeedback.vibrations = []; });
      await button(page, "재생").click();
      const result = await page.evaluate(async ({ trainer, keep }) => {
        const until = performance.now() + 6500;
        while (performance.now() < until) {
          await new Promise<void>(request => requestAnimationFrame(() => request()));
          const event = window.__pulseDiagnostics?.getSnapshot().currentEvent;
          if (!(trainer === "gap" ? event?.gapMute : event?.randomMute)) continue;
          const indicator = document.querySelector(".cell-pulse-on") !== null;
          const vibrated = (window as typeof window & { classroomFeedback: { vibrations: boolean[] } }).classroomFeedback.vibrations.includes(true);
          // Wait for React to deliver this cell before reading that frame.
          if (indicator !== keep || vibrated !== keep) continue;
          const badge = Array.from(document.querySelectorAll(".tempo-section span")).some(span => span.textContent === (trainer === "gap" ? "묵음 훈련" : "랜덤 묵음"));
          return { indicator, vibrated, badge, audible: event?.isAudible };
        }
        throw new Error("묵음 셀 피드백 확인 시간 초과");
      }, { trainer, keep });
      expect(result).toEqual({ indicator: keep, vibrated: keep, badge: keep, audible: false });
      await button(page, "정지").click();
    }
  });
}
