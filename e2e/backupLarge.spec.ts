import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { largeBackupFixture } from "../scripts/refactor-fixtures.mjs";

for (const scenario of [
  { name: "historic 2,261,076-byte backup", lists: 25, streamed: false },
  { name: "backup above the streaming threshold", lists: 38, streamed: true },
]) {
  test(`R02 restores a ${scenario.name} and exports the same domain data`, async ({ page }) => {
    test.setTimeout(70_000);
    const backup = largeBackupFixture(scenario.lists);
    const json = Buffer.from(JSON.stringify(backup, null, 2));
    const file = scenario.streamed
      ? Buffer.concat([json, Buffer.alloc(4 * 1024 * 1024 + 1 - json.byteLength, 32)])
      : json;
    expect(file.byteLength).toBe(scenario.streamed ? 4 * 1024 * 1024 + 1 : 2_261_076);
    await page.goto("/");
    await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
    await page.getByLabel("백업 JSON 파일", { exact: true }).setInputFiles({ name: "수업백업.json", mimeType: "application/json", buffer: file });
    await page.getByRole("button", { name: "대용량 백업 열기" }).click();
    const verified = page.getByText(`검증 완료 · 프리셋 500개 / 셋리스트 ${scenario.lists}개 / 거절 0개`);
    await expect(verified).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "연습 0 불러오기", exact: true })).toHaveCount(0);
    await page.getByLabel("가져오기 방식").selectOption("replace");
    await page.getByRole("checkbox", { name: "현재 설정·프리셋·셋리스트를 백업 내용으로 교체합니다." }).check();
    await page.getByRole("button", { name: "가져오기 적용", exact: true }).click();
    await expect(verified).toHaveCount(0);
    await expect(page.getByRole("button", { name: "연습 0 불러오기", exact: true })).toHaveCount(1);
    await page.reload();
    await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
    await expect(page.getByRole("button", { name: "연습 0 불러오기", exact: true })).toHaveCount(1);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "백업 다운로드", exact: true }).click(),
    ]);
    const restored = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(restored).toEqual(backup);
  });
}
