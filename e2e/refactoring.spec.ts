import { expect, test, type Page } from "@playwright/test";
import { largeBackupFixture } from "../scripts/refactor-fixtures.mjs";
import { readSavedData } from "./savedData";

type TempoControl = "normal" | "performance" | "keyboard";

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const tempo = (page: Page) => page.getByLabel("BPM 직접 입력", { exact: true });

async function enterNumber(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}

async function enableSpeedTraining(page: Page) {
  await button(page, "연습 시트 열기").click();
  await enterNumber(page, "목표 BPM", "84");
  await enterNumber(page, "변화 폭 (BPM)", "4");
  await enterNumber(page, "변화 간격 (마디)", "1");
  await page.getByLabel("속도 훈련 켜기", { exact: true }).check();
  await page.keyboard.press("Escape");
}

async function plusOne(page: Page, control: TempoControl) {
  if (control === "performance") await button(page, "공연 모드 열기").click();
  if (control === "keyboard") {
    // A shortcut targets the page. Buttons and numeric inputs own their native keys.
    await page.locator('[aria-label="템포 표시"]').getByText(/= BPM/).click();
    await page.keyboard.press("ArrowUp");
  } else {
    await button(page, "BPM 1 증가").click();
  }
}

async function checkTrainingDisabled(page: Page) {
  await button(page, "연습 시트 열기").click();
  await expect(page.getByLabel("속도 훈련 켜기")).not.toBeChecked();
  await page.keyboard.press("Escape");
}

for (const control of ["normal", "performance", "keyboard"] as const) {
  test(`R06 idle 120 plus one starts manual 121 via ${control}`, async ({ page }) => {
    await page.goto("/");
    await enableSpeedTraining(page);
    await expect(tempo(page)).toHaveValue("120");
    await plusOne(page, control);
    if (control === "performance") {
      await expect(page.getByText("121", { exact: true })).toBeVisible();
      await button(page, "일반 화면으로").click();
    }
    await expect(tempo(page)).toHaveValue("121");
    await button(page, "재생").click();
    await expect.poll(() => page.evaluate(() => window.__pulseDiagnostics?.getSnapshot().currentEvent?.bpm)).toBe(121);
    await button(page, "정지").click();
    await page.reload();
    await expect(tempo(page)).toHaveValue("121");
    await checkTrainingDisabled(page);
  });

  test(`R06 running 84 plus one persists manual 85 via ${control}`, async ({ page }) => {
    await page.goto("/");
    await enableSpeedTraining(page);
    await button(page, "리듬 시트 열기").click();
    await button(page, "1/4 박자 선택").click();
    await page.keyboard.press("Escape");
    await button(page, "재생").click();
    await expect(tempo(page)).toHaveValue("84");
    await plusOne(page, control);
    if (control === "performance") {
      await expect(page.getByText("85", { exact: true })).toBeVisible();
      await button(page, "일반 화면으로").click();
    }
    await expect(tempo(page)).toHaveValue("85");
    const manual = await page.waitForFunction(() => {
      const event = window.__pulseDiagnostics?.getSnapshot().currentEvent;
      return event?.bpm === 85 ? event.barIndex : null;
    });
    const manualBar = await manual.jsonValue() as number;
    await page.waitForFunction(first => {
      const event = window.__pulseDiagnostics?.getSnapshot().currentEvent;
      return event?.bpm === 85 && event.barIndex > first;
    }, manualBar, { timeout: 4000 });
    await button(page, "정지").click();
    await page.reload();
    await expect(tempo(page)).toHaveValue("85");
    await checkTrainingDisabled(page);
  });
}

test("R06 three same-frame keyboard increments persist 123 and play it", async ({ page }) => {
  await page.goto("/");
  await expect(tempo(page)).toHaveValue("120");
  // Test same-frame handler closures in addition to the native key cases above.
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
    );
  });
  await expect(tempo(page)).toHaveValue("123");
  await button(page, "재생").click();
  await expect.poll(() => page.evaluate(() => window.__pulseDiagnostics?.getSnapshot().currentEvent?.bpm)).toBe(123);
  await button(page, "정지").click();
  await page.reload();
  await expect(tempo(page)).toHaveValue("123");
});

test("R07 shrink 4/4 to 3/4 while playing and edit the next bar", async ({ page }) => {
  await page.goto("/");
  // Slow real-time tempo leaves an eight-second window for human UI actions.
  await enterNumber(page, "BPM 직접 입력", "30");
  await button(page, "재생").click();
  await expect.poll(() => page.evaluate(() => window.__pulseDiagnostics?.getSnapshot().currentEvent?.timeSignature.beats)).toBe(4);
  const dots = page.getByRole("group", { name: "비트 도트와 악센트" }).getByRole("button");
  await expect(dots).toHaveCount(4);
  await button(page, "3/4 박자 빠른 선택").click();
  await expect(dots.nth(3)).toBeDisabled();
  expect(await page.evaluate(() => window.__pulseDiagnostics!.getSnapshot().currentEvent!.timeSignature.beats)).toBe(4);
  await button(page, "리듬 시트 열기").click();
  const sheet = page.getByRole("dialog", { name: "리듬" });
  await sheet.getByRole("button", { name: "3박 보통 악센트 변경", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "3박 약 악센트 변경", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const firstEvent = await page.waitForFunction(() => {
    const event = window.__pulseDiagnostics?.getSnapshot().currentEvent;
    return event?.timeSignature.beats === 3 && event.barIndex === 1 && event.beatIndex === 0 ? event : null;
  }, undefined, { timeout: 12_000 });
  expect(await firstEvent.jsonValue()).toMatchObject({ accents: ["strong", "normal", "soft"] });
  await expect(dots).toHaveCount(3);
  await expect(dots.nth(2)).toBeEnabled();
  await button(page, "정지").click();
  await page.reload();
  await expect(dots).toHaveCount(3);
  await expect(dots.nth(2)).toHaveAccessibleName(/3박.*약/);
  await expect(page.getByText(/원본을 보존했습니다|저장되지 않았습니다/)).toHaveCount(0);
});

test("R02 migrate historic 2,139,763-byte v2 and preserve its original and navigation in a fresh tab", async ({ page, context }) => {
  const original = largeBackupFixture(38);
  const raw = JSON.stringify(original);
  expect(Buffer.byteLength(raw)).toBe(2_139_763);
  // Only the old tab injects the legacy key. This migration must also be visible in a new tab.
  await page.addInitScript(text => localStorage.setItem("pulse:data:v2", text), raw);
  await page.goto("/");
  await expect(button(page, "프리셋 열기")).toContainText("연습 499");
  const fresh = await context.newPage();
  try {
    await fresh.goto("/");
    await expect(button(fresh, "프리셋 열기")).toContainText("연습 499");
    expect(await readSavedData(fresh)).toEqual(original);
    expect(await fresh.evaluate(text => localStorage.getItem("pulse:data:v2") === text, raw)).toBe(true);
    await expect(fresh.getByRole("button", { name: "원본 데이터 내려받기" })).toHaveCount(0);
  } finally {
    await fresh.close();
  }
});
