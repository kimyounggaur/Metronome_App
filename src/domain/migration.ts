import { createDefaultData } from "./presets";
import { DATA_LIMITS, validateEnvelope, validatePulseData, type ParseResult } from "./schema";
import type { AppSettings, MetronomePreset, PulseData, Setlist } from "./types";

export function defaultBeatGroups(beats: number, noteValue: number): number[] {
  if (noteValue === 8 && beats === 6) return [3, 3];
  if (noteValue === 8 && beats === 12) return [3, 3, 3, 3];
  if (noteValue === 8 && beats === 7) return [2, 2, 3];
  return [beats];
}
function migrateMusical(value: Record<string, unknown>) {
  const signature = value.timeSignature as { beats: number; noteValue: number };
  const practice = value.practice as Record<string, unknown>;
  const { timerMinutes, ...otherPractice } = practice;
  return { ...value, tempoUnit: signature.noteValue === 8 ? "eighth" : "quarter", beatGroups: defaultBeatGroups(signature.beats, signature.noteValue), practice: { ...otherPractice, timerSeconds: timerMinutes === null ? null : (timerMinutes as number) * 60 } };
}
export function parseBackupValue(value: unknown): ParseResult<PulseData> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, issues: [{ path: "$", message: "백업 객체가 필요합니다" }] };
  const root = value as Record<string, unknown>;
  if (root.schemaVersion === 2) return validatePulseData(value);
  if (root.schemaVersion !== undefined && root.schemaVersion !== 1) return { ok: false, issues: [{ path: "schemaVersion", message: `지원하지 않는 백업 버전입니다: ${String(root.schemaVersion)}` }] };
  const issues = validateEnvelope(root, true);
  if (issues.length) return { ok: false, issues };
  const cloned = structuredClone(root);
  const data: PulseData = {
    ...createDefaultData(),
    settings: { ...migrateMusical(cloned.settings as Record<string, unknown>), autoLandscape: false } as unknown as AppSettings,
    presets: (cloned.presets as Record<string, unknown>[]).map((p) => migrateMusical(p) as unknown as MetronomePreset),
    setlists: (cloned.setlists as { id: string; name: string; presetIds: string[] }[]).map((s): Setlist => ({ id: s.id, name: s.name, items: s.presetIds.map((presetId, index) => ({ id: `legacy-item-${index + 1}`, presetId })) })),
  };
  const migrated = validatePulseData(data);
  return migrated.ok ? { ...migrated, warnings: ["v1 백업을 변환했습니다. 기존 박 간격과 프리셋 순서·반복을 보존했습니다."] } : migrated;
}
export function parseBackup(raw: string): ParseResult<PulseData> {
  if (new TextEncoder().encode(raw).byteLength > DATA_LIMITS.importBytes) return { ok: false, issues: [{ path: "$", message: "백업 파일은 2 MiB 이하여야 합니다" }] };
  try { return parseBackupValue(JSON.parse(raw) as unknown); }
  catch { return { ok: false, issues: [{ path: "$", message: "JSON 문법을 확인해 주세요" }] }; }
}
export function mergeBackup(current: PulseData, incoming: PulseData, makeId: () => string = () => crypto.randomUUID()): ParseResult<PulseData> {
  const result = structuredClone(current), copy = structuredClone(incoming);
  const presetIds = new Set(result.presets.map((p) => p.id));
  const listIds = new Set(result.setlists.map((s) => s.id));
  const mapping = new Map<string, string>();
  const uniqueId = (used: Set<string>) => { let id = makeId(); while (used.has(id)) id = makeId(); return id; };
  for (const p of copy.presets) { const old = p.id; if (presetIds.has(p.id)) p.id = uniqueId(presetIds); mapping.set(old, p.id); presetIds.add(p.id); result.presets.push(p); }
  for (const s of copy.setlists) { if (listIds.has(s.id)) s.id = uniqueId(listIds); listIds.add(s.id); s.items = s.items.map((item) => ({ ...item, presetId: mapping.get(item.presetId) ?? item.presetId })); result.setlists.push(s); }
  result.settings = copy.settings;
  const validated = validatePulseData(result);
  return validated.ok ? { ...validated, warnings: ["가져온 설정을 적용하고 프리셋·셋리스트를 병합합니다. 충돌 ID는 새 ID로 연결했습니다."] } : validated;
}
