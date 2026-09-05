import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { createDefaultData, createPreset, selectSetlist } from "../src/domain/presets";

function fixture() {
  const data = createDefaultData();
  const a = createPreset(data.settings, "A"); a.id = "A";
  const b = createPreset({ ...data.settings, timeSignature: { beats: 3, noteValue: 4 }, beatGroups: [3], accents: ["strong", "normal", "normal"] }, "B"); b.id = "B";
  const c = createPreset({ ...data.settings, timeSignature: { beats: 6, noteValue: 8 }, tempoUnit: "eighth", beatGroups: [3, 3], accents: ["strong", "normal", "normal", "soft", "normal", "normal"] }, "C"); c.id = "C";
  data.presets = [a, b, c];
  data.setlists = [{ id: "lesson", name: "레슨", items: ["A", "B", "C"].map((presetId, index) => ({ id: `item-${index}`, presetId })) }];
  return selectSetlist(data, "lesson");
}
async function readData(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem("pulse:data:v2")!)); }
test.beforeEach(async ({ page }) => {
  const initial = fixture();
  await page.addInitScript((data) => { if (!localStorage.getItem("pulse:data:v2")) localStorage.setItem("pulse:data:v2", JSON.stringify(data)); }, initial);
  await page.goto("/");
});

test("equal BPM songs share navigation across preset sheet and performance mode and retain updates", async ({ page }) => {
  await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
  await page.getByRole("button", { name: "2번 B 선택", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "프리셋 열기", exact: true })).toHaveText("B · 3/4");
  await page.getByRole("button", { name: "공연 모드 열기" }).click();
  await page.getByRole("button", { name: "다음 프리셋", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("C");
  await page.getByRole("button", { name: "이전 프리셋", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("B");
  await page.getByRole("button", { name: "일반 화면으로" }).click();
  await page.getByRole("button", { name: "BPM 1 증가", exact: true }).click();
  await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
  await expect(page.getByText(/저장본과 다름/)).toBeVisible();
  await page.getByRole("button", { name: "현재 항목 업데이트", exact: true }).click();
  await expect(page.getByRole("button", { name: "현재 항목 업데이트", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("BPM 직접 입력")).toHaveValue("121");
  const data = await readData(page);
  expect(data.navigation).toEqual({ activePresetId: "B", activeSetlistId: "lesson", activeItemIndex: 1 });
  expect(data.presets.find((p: { id: string }) => p.id === "B").bpm).toBe(121);
});

test("preset CRUD, search, repeated items and ordering work with named controls", async ({ page }) => {
  await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
  await page.getByRole("button", { name: "B 이름 변경", exact: true }).click();
  await page.getByLabel("변경할 프리셋 이름", { exact: true }).fill("발라드");
  await page.getByRole("button", { name: "이름 적용", exact: true }).click();
  await page.getByRole("button", { name: "발라드 복제", exact: true }).click();
  await page.getByLabel("프리셋 검색", { exact: true }).fill("발라드");
  await expect(page.getByRole("button", { name: "발라드 복사 불러오기", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "A 불러오기", exact: true })).toHaveCount(0);
  await page.getByLabel("프리셋 검색", { exact: true }).fill("");
  await page.getByLabel("셋리스트에 추가할 프리셋", { exact: true }).selectOption("A");
  await page.getByRole("button", { name: "곡 추가", exact: true }).click();
  await page.getByRole("button", { name: "4번 A 선택", exact: true }).click();
  await page.getByRole("button", { name: "4번 곡 위로", exact: true }).click();
  await expect(page.getByRole("button", { name: "3번 A 선택", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "1번 곡 제거", exact: true }).click();
  await expect(page.getByRole("button", { name: "2번 A 선택", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "셋리스트 이름 변경", exact: true }).click();
  await page.getByLabel("변경할 셋리스트 이름", { exact: true }).fill("공연 순서");
  await page.getByRole("button", { name: "이름 적용", exact: true }).click();
  let data = await readData(page);
  expect(data.setlists[0].name).toBe("공연 순서"); expect(data.navigation.activeItemIndex).toBe(1);
  await page.getByRole("button", { name: "현재 프리셋 목록으로 셋리스트 만들기", exact: true }).click();
  data = await readData(page); expect(data.setlists).toHaveLength(2);
  await page.getByRole("button", { name: "현재 셋리스트 삭제", exact: true }).click();
  data = await readData(page); expect(data.setlists).toHaveLength(1); expect(data.presets).toHaveLength(4);
  await page.getByRole("button", { name: "발라드 복사 삭제", exact: true }).click();
  data = await readData(page); expect(data.presets).toHaveLength(3); expect(data.presets.find((p: { id: string }) => p.id === "B").name).toBe("발라드");
});

test("downloaded backup restores all data in an independent browser context", async ({ page, browser }) => {
  await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "백업 다운로드", exact: true }).click();
  const download = await downloadPromise;
  const raw = await readFile((await download.path())!, "utf8");
  const original = JSON.parse(raw);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const restoredPage = await context.newPage(); await restoredPage.goto("http://127.0.0.1:5173/");
    await restoredPage.getByRole("button", { name: "프리셋 열기", exact: true }).click();
    await restoredPage.getByLabel("설정 JSON 가져오기", { exact: true }).fill(raw);
    await restoredPage.getByRole("button", { name: "JSON 가져오기", exact: true }).click();
    await restoredPage.getByLabel("가져오기 방식").selectOption("replace");
    await expect(restoredPage.getByRole("button", { name: "가져오기 적용", exact: true })).toBeDisabled();
    await restoredPage.getByRole("checkbox", { name: "현재 설정·프리셋·셋리스트를 백업 내용으로 교체합니다." }).check();
    await restoredPage.getByRole("button", { name: "가져오기 적용", exact: true }).click();
    expect(await readData(restoredPage)).toEqual(original);
    await restoredPage.reload(); expect(await readData(restoredPage)).toEqual(original);
  } finally { await context.close(); }
});

test("expanded storage panel remains accessible and scrollable at 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "저장", exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "3번 곡 아래로", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/playwright/stage07-setlist-320x568.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "프리셋 열기", exact: true })).toBeFocused();
});
