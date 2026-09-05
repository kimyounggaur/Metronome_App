import { createDefaultData, PRESETS_KEY, SETLISTS_KEY, SETTINGS_KEY } from "../domain/presets";
import { parseBackup, parseBackupValue } from "../domain/migration";
import { formatIssues, validatePulseData } from "../domain/schema";
import type { PulseData } from "../domain/types";

export const PULSE_DATA_KEY = "pulse:data:v2";
export const RECOVERY_KEY = "pulse:recovery:v2";
export const SAVE_FAILURE = "이번 변경은 이 기기에 저장되지 않았습니다. 백업을 내려받아 보관해 주세요.";
export type StorageLike = Pick<Storage, "getItem" | "setItem">;
export interface LoadedPulse { data: PulseData; storageError: string | null; recoveryRaw: string | null; }

function legacyDefaultSettings() {
  const { tempoUnit: _tempo, beatGroups: _groups, ...settings } = createDefaultData().settings;
  const { timerSeconds, ...practice } = settings.practice;
  return { ...settings, practice: { ...practice, timerMinutes: timerSeconds === null ? null : timerSeconds / 60 } };
}
export function loadPulseData(storage: StorageLike): LoadedPulse {
  const fallback = createDefaultData();
  let raw: string | null = null;
  const originals: Record<string, string | null> = {};
  try {
    raw = storage.getItem(PULSE_DATA_KEY);
    if (raw !== null) {
      const parsed = parseBackup(raw);
      if (!parsed.ok) return { data: fallback, storageError: `저장된 데이터를 읽지 못했습니다. 원본을 보존했습니다.\n${formatIssues(parsed.issues)}`, recoveryRaw: raw };
      return { data: parsed.data, storageError: null, recoveryRaw: null };
    }
    for (const key of [SETTINGS_KEY, PRESETS_KEY, SETLISTS_KEY]) originals[key] = storage.getItem(key);
    if (Object.values(originals).every((value) => value === null)) return { data: fallback, storageError: null, recoveryRaw: null };
    const parseKey = (key: string, defaultValue: unknown): unknown => {
      if (originals[key] === null) return defaultValue;
      try { return JSON.parse(originals[key]!) as unknown; } catch { throw new Error(`${key}: JSON 문법 오류`); }
    };
    const parsed = parseBackupValue({ settings: parseKey(SETTINGS_KEY, legacyDefaultSettings()), presets: parseKey(PRESETS_KEY, []), setlists: parseKey(SETLISTS_KEY, []) });
    if (!parsed.ok) return { data: fallback, storageError: `이전 데이터 이관에 실패했습니다. 원본을 보존했습니다.\n${formatIssues(parsed.issues)}`, recoveryRaw: JSON.stringify(originals, null, 2) };
    // Original v1 keys remain intact even when this single v2 write fails.
    try { storage.setItem(PULSE_DATA_KEY, JSON.stringify(parsed.data)); }
    catch { return { data: parsed.data, storageError: SAVE_FAILURE, recoveryRaw: JSON.stringify(originals, null, 2) }; }
    return { data: parsed.data, storageError: null, recoveryRaw: null };
  } catch (error) {
    return { data: fallback, storageError: error instanceof Error && error.message.includes("JSON") ? error.message : SAVE_FAILURE, recoveryRaw: raw ?? (Object.keys(originals).length ? JSON.stringify(originals, null, 2) : null) };
  }
}
export function savePulseData(storage: StorageLike, data: PulseData): string | null {
  const parsed = validatePulseData(data);
  if (!parsed.ok) return formatIssues(parsed.issues);
  try { storage.setItem(PULSE_DATA_KEY, JSON.stringify(parsed.data)); return null; } catch { return SAVE_FAILURE; }
}
export function downloadText(raw: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
