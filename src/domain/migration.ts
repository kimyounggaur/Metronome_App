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
// These conversion helpers take records whose source schema has already been checked.
export const convertLegacyPreset = (preset: Record<string, unknown>) =>
  migrateMusical(preset) as unknown as MetronomePreset;
export function convertLegacySetlist(value: unknown): Setlist {
  const row = value as { id: string; name: string; presetIds: string[] };
  return { id: row.id, name: row.name, items: row.presetIds.map((presetId, index) => ({ id: `legacy-item-${index + 1}`, presetId })) };
}
export function parseBackupValue(value: unknown, ownsInput = false): ParseResult<PulseData> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, issues: [{ path: "$", message: "백업 객체가 필요합니다" }] };
  const root = value as Record<string, unknown>;
  if (root.schemaVersion === 2) {
    if (!ownsInput) return validatePulseData(value);
    const issues = validateEnvelope(value);
    return issues.length ? { ok: false, issues } : { ok: true, data: value as PulseData, warnings: [] };
  }
  if (root.schemaVersion !== undefined && root.schemaVersion !== 1) return { ok: false, issues: [{ path: "schemaVersion", message: `지원하지 않는 백업 버전입니다: ${String(root.schemaVersion)}` }] };
  const issues = validateEnvelope(root, true);
  if (issues.length) return { ok: false, issues };
  const cloned = ownsInput ? root : structuredClone(root);
  const data: PulseData = {
    ...createDefaultData(),
    settings: { ...migrateMusical(cloned.settings as Record<string, unknown>), autoLandscape: false } as unknown as AppSettings,
    presets: (cloned.presets as Record<string, unknown>[]).map(convertLegacyPreset),
    setlists: (cloned.setlists as unknown[]).map(convertLegacySetlist),
  };
  const migrated = validatePulseData(data);
  return migrated.ok ? { ...migrated, warnings: ["v1 백업을 변환했습니다. 기존 박 간격과 프리셋 순서·반복을 보존했습니다."] } : migrated;
}
export function serializeBackup(data: PulseData): string {
  return JSON.stringify(data);
}
export function parseBackup(raw: string, source: "paste" | "storage" | "file" = "paste"): ParseResult<PulseData> {
  if (source === "paste" && (raw.length > DATA_LIMITS.importBytes || new Blob([raw]).size > DATA_LIMITS.importBytes)) {
    return { ok: false, issues: [{ path: "$", message: "붙여넣기는 2 MiB까지 지원합니다. 백업 JSON 파일을 선택해 주세요." }] };
  }
  try { return parseBackupValue(JSON.parse(raw) as unknown, true); }
  catch { return { ok: false, issues: [{ path: "$", message: "JSON 문법을 확인해 주세요" }] }; }
}
export function mergeBackup(
  current: PulseData,
  incoming: PulseData,
  makeId: () => string = () => crypto.randomUUID(),
  shareImmutableRecords = false,
): ParseResult<PulseData> {
  const presetIds = new Set(current.presets.map(preset => preset.id));
  const listIds = new Set(current.setlists.map(list => list.id));
  const mapping = new Map<string,string>();
  function reserve(id: string, used: Set<string>) {
    while (used.has(id)) id = makeId();
    used.add(id);
    return id;
  }
  const addedPresets = incoming.presets.map(preset => {
    const id = reserve(preset.id, presetIds);
    mapping.set(preset.id, id);
    return id === preset.id ? preset : {...preset, id};
  });
  const addedLists = incoming.setlists.map(list => {
    const id = reserve(list.id, listIds);
    const remap = list.items.some(item => mapping.has(item.presetId) && mapping.get(item.presetId) !== item.presetId);
    const items = remap ? list.items.map(item => {
      const presetId = mapping.get(item.presetId) ?? item.presetId;
      return item.presetId === presetId ? item : {...item,presetId};
    }) : list.items;
    return id === list.id && items === list.items ? list : {...list,id,items};
  });
  const result = { ...current, settings:incoming.settings, presets:[...current.presets,...addedPresets], setlists:[...current.setlists,...addedLists] };
  const issues = validateEnvelope(result);
  if (issues.length) return {ok:false,issues};
  // The application holds both snapshots as immutable. The default API retains
  // independent ownership for callers that want to edit the returned backup.
  return {ok:true,data:shareImmutableRecords ? result : structuredClone(result),
    warnings:["가져온 설정을 적용하고 프리셋·셋리스트를 병합합니다. 충돌 ID는 새 ID로 연결했습니다."]};
}
