import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { failStorageWrites, readSavedData } from './savedData';

test.beforeEach(async ({ page }, info) => {
  if (info.title.startsWith("corrupt storage")) {
    await page.addInitScript(() => localStorage.setItem("pulse:data:v2", '{"broken":true}'));
  }
  await page.goto("/");
  await expect(page.getByLabel("BPM 직접 입력")).toBeVisible();
});

test('corrupt storage stays intact while basic metronome remains usable',async({page})=>{
  await expect(page.getByText(/원본을 보존했습니다/)).toBeVisible();
  await page.getByRole('button',{name:'BPM 1 증가',exact:true}).click();
  await expect(page.getByLabel('BPM 직접 입력')).toHaveValue('121');
  expect(await page.evaluate(()=>localStorage.getItem('pulse:data:v2'))).toBe('{"broken":true}');
  await expect(page.getByRole('button',{name:'원본 데이터 내려받기'})).toBeVisible();
});

test('storage write denial keeps memory state and exposes a backup',async({page})=>{
  await failStorageWrites(page);
  await page.getByRole('button',{name:'BPM 1 증가',exact:true}).click();
  await expect(page.getByLabel('BPM 직접 입력')).toHaveValue('121');
  await expect(page.getByText(/이번 변경은 이 기기에 저장되지 않았습니다/)).toBeVisible();
  await expect(page.getByRole('button',{name:'현재 데이터 백업'})).toBeVisible();
});

test("R03 failed preset save exposes the pending backup and retries once", async ({ page }) => {
  const restore = await failStorageWrites(page);
  await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "저장", exact: true });
  await dialog.getByRole("textbox", { name: "프리셋 이름", exact: true }).fill("저장 실패 검증");
  await dialog.getByRole("button", { name: "현재 설정 저장" }).click();
  await expect(dialog.getByText(/이번 변경은 이 기기에 저장되지 않았습니다/)).toBeVisible();
  await expect(dialog.getByText("이 기기에 저장됨", { exact: true })).toHaveCount(0);
  expect((await readSavedData(page)).presets).toHaveLength(0);

  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "현재 작업 백업", exact: true }).click();
  const path = await (await downloaded).path();
  expect(JSON.parse(await readFile(path!, "utf8")).presets.map((preset: { name: string }) => preset.name)).toEqual(["저장 실패 검증"]);

  await restore();
  await dialog.getByRole("button", { name: "저장 다시 시도", exact: true }).click();
  await expect(dialog.getByText("이 기기에 저장됨", { exact: true })).toBeVisible();
  await expect.poll(async () => (await readSavedData(page)).presets.map((preset: { name: string }) => preset.name)).toEqual(["저장 실패 검증"]);
});

test('BPM pointer, keyboard and direct input stay synchronized', async ({page}) => {
  const input=page.getByLabel('BPM 직접 입력');
  const plus=page.getByRole('button',{name:'BPM 1 증가',exact:true});
  await plus.click();
  await expect(input).toHaveValue('121');
  await expect(page.getByLabel('BPM 슬라이더')).toHaveValue('121');
  await plus.press('Enter');
  await expect(input).toHaveValue('122');
  await input.fill('999'); await input.press('Enter');
  await expect(input).toHaveValue('300');
  await input.fill(''); await input.press('Enter');
  await expect(input).toHaveValue('300');
  await input.fill('20'); await input.press('Enter');
  await expect(input).toHaveValue('30');
  await input.fill('90'); await input.press('Escape');
  await expect(input).toHaveValue('30');
});

test('desktop exposes full controls and performance mode has an exit',async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await expect(page.getByLabel('BPM 직접 입력')).toBeVisible();
  await page.getByRole('button',{name:'공연 모드 열기'}).click();
  await page.getByRole('button',{name:'일반 화면으로'}).click();
  await expect(page.getByLabel('BPM 직접 입력')).toBeVisible();
});

test('help traps focus, closes on Escape and restores its trigger',async ({page})=>{
  const menu=page.getByRole('button',{name:'키보드 단축키',exact:true});
  await menu.click();
  const dialog=page.getByRole('dialog',{name:'키보드 단축키'});
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(menu).toBeFocused();
});

test('all specified viewports retain controls without horizontal overflow',async({page})=>{
  for(const [width,height] of [[320,568],[360,740],[390,844],[768,1024],[844,390],[1440,900]]){
    await page.setViewportSize({width,height});
    await expect(page.getByLabel('BPM 직접 입력')).toBeVisible();
    await expect(page.getByRole('button',{name:'재생',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:`output/playwright/final-${width}x${height}.png`,fullPage:true});
  }
});

test('main screen and modal pass automated accessibility checks',async({page})=>{
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'연습 시트 열기'}).click();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});

test("R05 navigating untouched time and tempo fields preserves practice settings", async ({ page }) => {
  const practice = page.getByRole("button", {name: "연습 시트 열기"});
  await practice.click();
  const seconds = page.getByLabel("연습 시간 (초)", {exact: true});
  const timerOff = page.getByRole("button", {name: "타이머 끄기", exact: true});
  await expect(seconds).toHaveValue("");
  for (const key of ["Tab", "Enter", "Escape"]) {
    await seconds.focus();
    await seconds.press(key);
    await expect(timerOff).toHaveAttribute("aria-pressed", "true");
  }
  await seconds.fill("60");
  await seconds.press("Escape");
  await expect(timerOff).toHaveAttribute("aria-pressed", "true");
  await seconds.fill("60");
  await seconds.press("Enter");
  await expect(page.getByRole("button", {name: "1분 타이머", exact: true})).toHaveAttribute("aria-pressed", "true");
  const trainer = page.getByLabel("속도 훈련 켜기", {exact: true});
  await trainer.check();
  await page.getByRole("button", {name: "연습 닫기", exact: true}).click();

  await page.getByRole("button", {name: "재생", exact: true}).click();
  const bpm = page.getByLabel("BPM 직접 입력", {exact: true});
  await expect(bpm).toHaveValue("80");
  for (const key of ["Tab", "Enter", "Escape"]) {
    await bpm.focus();
    await bpm.press(key);
  }
  await page.getByRole("button", {name: "정지", exact: true}).click();
  await expect.poll(async () => (await readSavedData(page)).settings.practice.speedTrainer.enabled).toBe(true);
  await expect.poll(async () => (await readSavedData(page)).settings.practice.timerSeconds).toBe(60);
  await page.reload();
  await practice.click();
  await expect(page.getByRole("dialog", { name: "연습", exact: true })).toBeVisible();
  await expect(trainer).toBeChecked();
  await expect(seconds).toHaveValue("60");
});
