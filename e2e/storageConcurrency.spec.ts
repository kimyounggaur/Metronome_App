import { expect, test, type Page } from "@playwright/test";
import { readSavedData } from "./savedData";

async function openReady(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "프리셋 열기", exact: true })).toBeVisible();
}
async function saveSong(page: Page, name: string) {
  await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
  await page.getByLabel("프리셋 이름", { exact: true }).fill(name);
  await page.getByRole("button", { name: "현재 설정 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: name + " 불러오기", exact: true })).toBeVisible();
}
for (const order of ["save-first", "tempo-first", "together"] as const) {
  test(`R01 two stale tabs preserve the song and BPM (${order})`, async ({ context, page }) => {
    // Disable only notifications. Both tabs retain their actual independently loaded base.
    await context.addInitScript(() => {
      Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true });
    });
    const second = await context.newPage();
    await Promise.all([openReady(page), openReady(second)]);
    await expect(page.getByLabel("BPM 직접 입력")).toHaveValue("120");
    await expect(second.getByLabel("BPM 직접 입력")).toHaveValue("120");
    const song = () => saveSong(page, "교사용 A");
    const tempo = async () => {
      await second.getByRole("button", { name: "BPM 1 증가", exact: true }).click();
      await expect.poll(async () => (await readSavedData(second)).settings.bpm).toBe(121);
    };
    if (order === "save-first") {
      await song();
      await tempo();
    }
    if (order === "tempo-first") {
      await tempo();
      await song();
    }
    if (order === "together") await Promise.all([song(), tempo()]);
    const fresh = await context.newPage();
    await openReady(fresh);
    await expect(fresh.getByLabel("BPM 직접 입력")).toHaveValue("121");
    const stored = await readSavedData(fresh);
    expect(stored.presets.map((item: { name: string }) => item.name)).toEqual(["교사용 A"]);
  });
}

test("R01 simultaneous edits to one preset preserve both alternatives for review", async ({ context, page }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true });
  });
  await openReady(page);
  await saveSong(page, "원래 곡");
  await expect.poll(async () => (await readSavedData(page)).presets.length).toBe(1);
  const second = await context.newPage();
  await openReady(second);
  await second.getByRole("button", { name: "프리셋 열기", exact: true }).click();
  for (const [tab, name] of [
    [page, "A 이름"],
    [second, "B 이름"],
  ] as const) {
    await tab.getByRole("button", { name: "원래 곡 이름 변경", exact: true }).click();
    await tab.getByLabel("변경할 프리셋 이름", { exact: true }).fill(name);
  }
  await page.getByRole("button", { name: "이름 적용", exact: true }).click();
  await expect.poll(async () => (await readSavedData(page)).presets[0].name).toBe("A 이름");
  await second.getByRole("button", { name: "이름 적용", exact: true }).click();
  await expect(second.getByRole("dialog", { name: "저장", exact: true })).toContainText(/충돌|다른 탭/);
  expect((await readSavedData(second)).presets[0].name).toBe("A 이름");
});

test("R01 a late legacy write is reviewed separately from the active library", async ({ page, context }) => {
  await openReady(page);
  await saveSong(page, "현재 수업");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await readSavedData(page)).presets.length).toBe(1);
  const older = await context.newPage();
  await older.goto("/");
  const candidate = await readSavedData(page);
  candidate.settings.bpm = 72;
  candidate.presets[0].name = "이전 탭의 편집";
  await older.evaluate((raw) => localStorage.setItem("pulse:data:v2", raw), JSON.stringify(candidate));
  await page.getByRole("button", { name: "이전 버전에서 변경한 내용 검토" }).click();
  await expect(page.getByLabel("BPM 직접 입력")).toHaveValue("120");
  await page.getByRole("checkbox", { name: /현재 수업 → 이전 탭의 편집/ }).check();
  await page.getByRole("button", { name: "선택한 변경 적용" }).click();
  await expect.poll(async () => (await readSavedData(page)).presets[0].name).toBe("이전 탭의 편집");
  expect((await readSavedData(page)).settings.bpm).toBe(120);
});
