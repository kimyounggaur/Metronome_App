import type { AppSettings, MetronomePreset, PulseData, Setlist } from "./types";

export const DATA_LIMITS = { bpm: [30, 300], volume: [0, 1], step: [1, 30], bars: [1, 64], timerSeconds: [1, 3600], nameLength: 80, importBytes: 2 * 1024 * 1024, presets: 1000, setlists: 100, setlistItems: 1000 } as const;
export interface ValidationIssue { path: string; message: string; }
export type ParseResult<T> = { ok: true; data: T; warnings: string[] } | { ok: false; issues: ValidationIssue[] };
type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const issue = (issues: ValidationIssue[], path: string, message: string) => { issues.push({ path, message }); };
const child = (path: string, key: string) => path ? `${path}.${key}` : key;
function object(value: unknown, path: string, issues: ValidationIssue[]): Obj {
  if (isObj(value)) return value;
  issue(issues, path, "객체가 필요합니다");
  return {};
}
function number(value: unknown, path: string, issues: ValidationIssue[], min: number, max: number, integer = true) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) issue(issues, path, `${min}~${max} 사이의 ${integer ? "정수" : "숫자"}가 필요합니다`);
}
function text(value: unknown, path: string, issues: ValidationIssue[], max = 128) {
  if (typeof value !== "string" || !value.trim() || value.length > max) issue(issues, path, `1~${max}자의 문자열이 필요합니다`);
}
function choice(value: unknown, options: readonly unknown[], path: string, issues: ValidationIssue[]) {
  if (!options.includes(value)) issue(issues, path, `허용 값: ${options.join(", ")}`);
}
function boolean(value: unknown, path: string, issues: ValidationIssue[]) { if (typeof value !== "boolean") issue(issues, path, "참/거짓 값이 필요합니다"); }
function date(value: unknown, path: string, issues: ValidationIssue[]) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) issue(issues, path, "유효한 ISO UTC 날짜가 필요합니다");
}
function practice(value: unknown, path: string, issues: ValidationIssue[], legacy: boolean) {
  if (!isObj(value)) { issue(issues, path, "연습 설정 객체가 필요합니다"); return; }
  const p = object(value, path, issues);
  choice(p.countInBars, [0, 1, 2], child(path, "countInBars"), issues);
  const timerKey = legacy ? "timerMinutes" : "timerSeconds";
  if (p[timerKey] !== null) number(p[timerKey], child(path, timerKey), issues, legacy ? 1 / 60 : 1, legacy ? 60 : 3600, !legacy);
  if (legacy && typeof p[timerKey] === "number" && !Number.isInteger(p[timerKey] * 60)) issue(issues, child(path, timerKey), "초로 정확히 변환 가능한 값이 필요합니다");
  const s = object(p.speedTrainer, child(path, "speedTrainer"), issues);
  boolean(s.enabled, child(path, "speedTrainer.enabled"), issues);
  number(s.startBpm, child(path, "speedTrainer.startBpm"), issues, 30, 300);
  number(s.targetBpm, child(path, "speedTrainer.targetBpm"), issues, 30, 300);
  number(s.step, child(path, "speedTrainer.step"), issues, 1, 30);
  number(s.everyBars, child(path, "speedTrainer.everyBars"), issues, 1, 64);
  choice(s.onReach, ["stop", "hold", "loop"], child(path, "speedTrainer.onReach"), issues);
  const g = object(p.gapTrainer, child(path, "gapTrainer"), issues);
  boolean(g.enabled, child(path, "gapTrainer.enabled"), issues);
  boolean(g.keepVisual, child(path, "gapTrainer.keepVisual"), issues);
  number(g.playBars, child(path, "gapTrainer.playBars"), issues, 1, 64);
  number(g.muteBars, child(path, "gapTrainer.muteBars"), issues, 1, 64);
  const r = object(p.randomMute, child(path, "randomMute"), issues);
  boolean(r.enabled, child(path, "randomMute.enabled"), issues);
  number(r.probability, child(path, "randomMute.probability"), issues, 0, 1, false);
  choice(r.unit, ["beat", "bar"], child(path, "randomMute.unit"), issues);
}
function musical(value: unknown, path: string, issues: ValidationIssue[], legacy: boolean) {
  if (!isObj(value)) { issue(issues, path, "설정 객체가 필요합니다"); return null; }
  const o = object(value, path, issues);
  number(o.bpm, child(path, "bpm"), issues, 30, 300);
  number(o.volume, child(path, "volume"), issues, 0, 1, false);
  const signature = object(o.timeSignature, child(path, "timeSignature"), issues);
  number(signature.beats, child(path, "timeSignature.beats"), issues, 1, 12);
  choice(signature.noteValue, [4, 8], child(path, "timeSignature.noteValue"), issues);
  if (signature.noteValue === 16) issue(issues, child(path, "timeSignature.noteValue"), "기존 /16 데이터는 속도 보존 단위가 없어 자동 변환하지 않습니다");
  choice(o.subdivision, ["none", "eighth", "triplet", "sixteenth"], child(path, "subdivision"), issues);
  choice(o.sound, ["classic", "wood", "digital"], child(path, "sound"), issues);
  if (!Array.isArray(o.accents)) issue(issues, child(path, "accents"), "악센트 배열이 필요합니다");
  else {
    if (o.accents.length !== signature.beats) issue(issues, child(path, "accents"), "악센트 개수가 박자 분자와 같아야 합니다");
    o.accents.forEach((a, i) => choice(a, ["strong", "normal", "soft", "mute"], `${child(path, "accents")}[${i}]`, issues));
  }
  if (!legacy) {
    choice(o.tempoUnit, ["quarter", "eighth", "dotted-quarter"], child(path, "tempoUnit"), issues);
    if (!Array.isArray(o.beatGroups) || o.beatGroups.length === 0 || o.beatGroups.length > 12) issue(issues, child(path, "beatGroups"), "1~12개의 그룹이 필요합니다");
    else {
      o.beatGroups.forEach((n, i) => number(n, `${child(path, "beatGroups")}[${i}]`, issues, 1, 12));
      if (o.beatGroups.reduce((sum: number, n: unknown) => sum + (typeof n === "number" ? n : 0), 0) !== signature.beats) issue(issues, child(path, "beatGroups"), "그룹 합이 박자 분자와 같아야 합니다");
    }
  }
  practice(o.practice, child(path, "practice"), issues, legacy);
  return o;
}
function settings(value: unknown, path: string, issues: ValidationIssue[], legacy: boolean) {
  const o = musical(value, path, issues, legacy);
  if (!o) return;
  for (const key of ["muted", "haptics", "flash", "wakeLock", "showInstallHint"]) boolean(o[key], child(path, key), issues);
  if (!legacy) boolean(o.autoLandscape, child(path, "autoLandscape"), issues);
  choice(o.theme, ["dark", "light", "system"], child(path, "theme"), issues);
}
function preset(value: unknown, path: string, issues: ValidationIssue[], legacy: boolean) {
  const o = musical(value, path, issues, legacy);
  if (!o) return;
  text(o.id, child(path, "id"), issues);
  text(o.name, child(path, "name"), issues, 80);
  date(o.createdAt, child(path, "createdAt"), issues);
  date(o.updatedAt, child(path, "updatedAt"), issues);
}
function lists(value: unknown, path: string, issues: ValidationIssue[], legacy: boolean, presetIds?: Set<unknown>) {
  if (!Array.isArray(value) || value.length > DATA_LIMITS.setlists) { issue(issues, path, "셋리스트는 최대 100개인 배열이어야 합니다"); return; }
  const ids = new Set<unknown>();
  value.forEach((entry, index) => {
    const p = `${path}[${index}]`, s = object(entry, p, issues);
    text(s.id, `${p}.id`, issues); text(s.name, `${p}.name`, issues, 80);
    if (ids.has(s.id)) issue(issues, `${p}.id`, "중복 셋리스트 ID입니다"); ids.add(s.id);
    const key = legacy ? "presetIds" : "items", entries = s[key];
    if (!Array.isArray(entries) || entries.length > DATA_LIMITS.setlistItems) { issue(issues, `${p}.${key}`, "항목은 최대 1000개인 배열이어야 합니다"); return; }
    const itemIds = new Set<unknown>();
    entries.forEach((entryValue, i) => {
      const ip = `${p}.${key}[${i}]`, item: Obj = legacy ? { presetId: entryValue } : object(entryValue, ip, issues);
      text(item.presetId, legacy ? ip : `${ip}.presetId`, issues);
      if (presetIds && !presetIds.has(item.presetId)) issue(issues, legacy ? ip : `${ip}.presetId`, "존재하지 않는 프리셋 참조입니다");
      if (!legacy) { text(item.id, `${ip}.id`, issues); if (itemIds.has(item.id)) issue(issues, `${ip}.id`, "중복 항목 ID입니다"); itemIds.add(item.id); }
    });
  });
}
function presets(value: unknown, issues: ValidationIssue[], legacy: boolean): Set<unknown> {
  const ids = new Set<unknown>();
  if (!Array.isArray(value) || value.length > DATA_LIMITS.presets) { issue(issues, "presets", "프리셋은 최대 1000개인 배열이어야 합니다"); return ids; }
  value.forEach((entry, i) => { preset(entry, `presets[${i}]`, issues, legacy); if (isObj(entry)) { if (ids.has(entry.id)) issue(issues, `presets[${i}].id`, "중복 프리셋 ID입니다"); ids.add(entry.id); } });
  return ids;
}
export function validateAppSettings(value: unknown): value is AppSettings { const issues: ValidationIssue[] = []; settings(value, "settings", issues, false); return issues.length === 0; }
export function validatePresets(value: unknown): value is MetronomePreset[] { const issues: ValidationIssue[] = []; presets(value, issues, false); return issues.length === 0; }
export function validateSetlists(value: unknown): value is Setlist[] { const issues: ValidationIssue[] = []; lists(value, "setlists", issues, false); return issues.length === 0; }
export function validateEnvelope(value: unknown, legacy = false): ValidationIssue[] {
  const issues: ValidationIssue[] = [], o = object(value, "$", issues);
  if (!legacy) choice(o.schemaVersion, [2], "schemaVersion", issues);
  settings(o.settings, "settings", issues, legacy);
  const ids = presets(o.presets, issues, legacy);
  lists(o.setlists, "setlists", issues, legacy, ids);
  if (!legacy) {
    const n = object(o.navigation, "navigation", issues);
    if (n.activePresetId !== null && !ids.has(n.activePresetId)) issue(issues, "navigation.activePresetId", "존재하는 프리셋 ID 또는 null이 필요합니다");
    const activeList = Array.isArray(o.setlists) ? o.setlists.find((s) => isObj(s) && s.id === n.activeSetlistId) : undefined;
    if (n.activeSetlistId !== null && !activeList) issue(issues, "navigation.activeSetlistId", "존재하는 셋리스트 ID 또는 null이 필요합니다");
    number(n.activeItemIndex, "navigation.activeItemIndex", issues, 0, 999);
    if (isObj(activeList) && Array.isArray(activeList.items) && typeof n.activeItemIndex === "number" && n.activeItemIndex >= Math.max(1, activeList.items.length)) issue(issues, "navigation.activeItemIndex", "선택 위치가 목록 범위를 벗어납니다");
  }
  return issues;
}
export function validatePulseData(value: unknown): ParseResult<PulseData> {
  const issues = validateEnvelope(value);
  return issues.length ? { ok: false, issues } : { ok: true, data: structuredClone(value) as PulseData, warnings: [] };
}
export function formatIssues(issues: ValidationIssue[]): string {
  const missingObjects = new Set(issues.filter((entry) => /객체가 필요합니다$/.test(entry.message)).map((entry) => entry.path));
  const distinct = issues.filter((entry) => {
    // A missing object explains its required children too; retain the parent path
    // so a large cascade cannot hide errors in the supplied preset or setlist.
    for (let index = 0; index < entry.path.length; index++) {
      if ((entry.path[index] === "." || entry.path[index] === "[") && missingObjects.has(entry.path.slice(0, index))) return false;
    }
    return true;
  });
  const lines = distinct.slice(0, 12).map((entry) => `${entry.path}: ${entry.message}`);
  if (distinct.length > 12) lines.push(`추가 오류 ${distinct.length - 12}개가 있습니다. 표시된 필드를 수정한 뒤 다시 검증해 주세요.`);
  return lines.join("\n");
}
