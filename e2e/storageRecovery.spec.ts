import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readSavedData } from "./savedData";
import { createDefaultData, createPreset, selectSetlist } from "../src/domain/presets";

function fixture() {
  const data = createDefaultData(); data.settings.bpm = 90; data.settings.practice.timerSeconds = 60; data.settings.practice.gapTrainer.enabled = true;
  const preset = createPreset(data.settings, "복원할 연습"); preset.id = "recover-practice";
  data.presets = [preset]; data.setlists = [{ id: "recover-list", name: "복원할 순서", items: [{ id: "first", presetId: preset.id }, { id: "repeat", presetId: preset.id }] }];
  return selectSetlist(data, "recover-list");
}
const damaged = '{"schemaVersion":2,"settings":null,"presets":"damaged-original"}';

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript((raw) => {
    if (!localStorage.getItem("pulse:data:v2")) localStorage.setItem("pulse:data:v2", raw);
  }, info.title.startsWith("corrupt") ? damaged : JSON.stringify(fixture()));
  await page.goto("/");
  await expect(page.getByLabel("BPM 직접 입력")).toBeVisible();
});

test("malformed, partial and future imports show useful paths and preserve all current data", async ({ page }) => {
  const original = await readSavedData(page);
  const pageErrors: string[] = []; page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.getByRole("button", { name: "프리셋 열기", exact: true }).click();
  const input = page.getByLabel("설정 JSON 가져오기", { exact: true });
  for (const [raw, expectedPath] of [
    ['{"presets":', "$: JSON 문법"],
    ['{"presets":[{"id":"bad","name":"bad","bpm":120}]}', "presets[0].timeSignature:"],
    ['{"schemaVersion":999}', "schemaVersion:"],
  ]) {
    await input.fill(raw); await page.getByRole("button", { name: "JSON 가져오기", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(expectedPath);
    await expect(page.getByRole("button", { name: "가져오기 적용", exact: true })).toHaveCount(0);
    expect(await readSavedData(page)).toEqual(original);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("BPM 직접 입력")).toHaveValue("90");
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await expect(page.getByRole("button", { name: "정지", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "정지", exact: true }).click();
  expect(pageErrors).toEqual([]);
});

test("corrupt storage can be downloaded unchanged and restored from its complete backup", async ({ page }) => {
  const original = fixture();
  const backupRaw = JSON.stringify(original);
  await expect(page.getByText(/원본을 보존했습니다/)).toBeVisible();
  const recoveryDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "원본 데이터 내려받기", exact: true }).click();
  const recovery = await recoveryDownload; expect(await readFile((await recovery.path())!, "utf8")).toBe(damaged);
  await page.getByRole("button", { name: "BPM 1 증가", exact: true }).click(); await expect(page.getByLabel("BPM 직접 입력")).toHaveValue("121");
  expect(await page.evaluate(() => localStorage.getItem("pulse:data:v2"))).toBe(damaged);
  await page.getByRole("button", { name: "정상 백업 가져오기", exact: true }).click();
  await page.getByLabel("설정 JSON 가져오기", { exact: true }).fill(backupRaw); await page.getByRole("button", { name: "JSON 가져오기", exact: true }).click();
  await page.getByLabel("가져오기 방식").selectOption("replace");
  await page.getByRole("checkbox", { name: "현재 설정·프리셋·셋리스트를 백업 내용으로 교체합니다." }).check();
  await page.getByRole("button", { name: "가져오기 적용", exact: true }).click();
  await expect.poll(() => readSavedData(page)).toEqual(original);
  expect(await page.evaluate(() => localStorage.getItem("pulse:data:v2"))).toBe(damaged);
  await page.keyboard.press("Escape"); await expect(page.getByLabel("BPM 직접 입력")).toHaveValue("90");
  await expect(page.getByRole("button", { name: "원본 데이터 내려받기", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("BPM 직접 입력")).toHaveValue("90");
  expect(await readSavedData(page)).toEqual(original);
  expect(await page.evaluate(() => localStorage.getItem("pulse:data:v2"))).toBe(damaged);
});
