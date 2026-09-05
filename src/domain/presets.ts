import { defaultPracticeSettings } from "./practiceModes";
import { clampBpm, clampVolume } from "./tempo";
import type { AppSettings, MetronomePreset, PulseData, SetlistItem } from "./types";
import { DATA_LIMITS, validateAppSettings, validatePresets, validateSetlists } from "./schema";

export const SETTINGS_KEY = "pulse:settings:v1";
export const PRESETS_KEY = "pulse:presets:v1";
export const SETLISTS_KEY = "pulse:setlists:v1";

export const defaultSettings: AppSettings = {
  bpm: 120,
  tempoUnit: "quarter",
  beatGroups: [4],
  timeSignature: { beats: 4, noteValue: 4 },
  subdivision: "none",
  accents: ["strong", "normal", "normal", "normal"],
  sound: "classic",
  volume: 0.82,
  muted: false,
  haptics: false,
  flash: false,
  theme: "dark",
  wakeLock: true,
  showInstallHint: true,
  autoLandscape: false,
  practice: defaultPracticeSettings,
};

export function createPreset(settings: AppSettings, name: string): MetronomePreset {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || `Pulse ${settings.bpm}`,
    bpm: clampBpm(settings.bpm),
    tempoUnit: settings.tempoUnit,
    beatGroups: [...settings.beatGroups],
    timeSignature: { ...settings.timeSignature },
    subdivision: settings.subdivision,
    accents: [...settings.accents],
    sound: settings.sound,
    volume: clampVolume(settings.volume),
    practice: structuredClone(settings.practice),
    createdAt: now,
    updatedAt: now,
  };
}

export function applyPreset(settings: AppSettings, preset: MetronomePreset): AppSettings {
  return {
    ...settings,
    bpm: clampBpm(preset.bpm),
    tempoUnit: preset.tempoUnit,
    beatGroups: [...preset.beatGroups],
    timeSignature: { ...preset.timeSignature },
    subdivision: preset.subdivision,
    accents: [...preset.accents],
    sound: preset.sound,
    volume: clampVolume(preset.volume),
    practice: structuredClone(preset.practice),
  };
}

export function safeParseJson<T>(raw: string | null, fallback: T, validate: (value: unknown) => value is T): T {
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export const isPresetArray = validatePresets;
export const isSetlistArray = validateSetlists;
export const isAppSettings = validateAppSettings;

export function createDefaultData(): PulseData {
  return { schemaVersion: 2, settings: structuredClone(defaultSettings), presets: [], setlists: [], navigation: { activePresetId: null, activeSetlistId: null, activeItemIndex: 0 } };
}

export function uniquePresetName(existing: MetronomePreset[], desired: string): string {
  const base = desired.trim().slice(0, 80) || "이름 없음";
  const names = new Set(existing.map((preset) => preset.name));
  if (!names.has(base)) return base;

  let index = 2;
  while (names.has(`${base.slice(0, 80 - String(index).length - 1)} ${index}`)) {
    index += 1;
  }
  return `${base.slice(0, 80 - String(index).length - 1)} ${index}`;
}

export function reconcileNavigation(data: PulseData, previous?: PulseData): PulseData {
  const current = structuredClone(data);
  const list = current.setlists.find((s) => s.id === current.navigation.activeSetlistId);
  if (!list) { current.navigation.activeSetlistId = null; current.navigation.activeItemIndex = 0; }
  else {
    const oldList = previous?.setlists.find((s) => s.id === list.id && s.id === previous.navigation.activeSetlistId);
    const oldItem = oldList?.items[previous!.navigation.activeItemIndex];
    const retainedIndex = oldItem ? list.items.findIndex((item) => item.id === oldItem.id) : -1;
    current.navigation.activeItemIndex = retainedIndex >= 0 ? retainedIndex : Math.min(Math.max(0, current.navigation.activeItemIndex), Math.max(0, list.items.length - 1));
    if (oldItem && previous?.navigation.activePresetId === oldItem.presetId) {
      const nextPreset = current.presets.find((p) => p.id === list.items[current.navigation.activeItemIndex]?.presetId);
      if (nextPreset && nextPreset.id !== current.navigation.activePresetId) {
        current.settings = applyPreset(current.settings, nextPreset);
        current.navigation.activePresetId = nextPreset.id;
      }
    }
  }
  if (!current.presets.some((p) => p.id === current.navigation.activePresetId)) current.navigation.activePresetId = null;
  return current;
}

export function selectPreset(data: PulseData, presetId: string, itemIndex?: number): PulseData {
  const preset = data.presets.find((p) => p.id === presetId);
  if (!preset) return data;
  const next = reconcileNavigation(data);
  next.settings = applyPreset(next.settings, preset);
  next.navigation.activePresetId = preset.id;
  const list = next.setlists.find((s) => s.id === next.navigation.activeSetlistId);
  if (list) {
    const selected = itemIndex !== undefined && list.items[itemIndex]?.presetId === presetId ? itemIndex : list.items.findIndex((item) => item.presetId === presetId);
    if (selected >= 0) next.navigation.activeItemIndex = selected;
  }
  return next;
}

export function navigateSetlist(data: PulseData, direction: -1 | 1): PulseData {
  const next = reconcileNavigation(data);
  const list = next.setlists.find((s) => s.id === next.navigation.activeSetlistId);
  if (!list?.items.length) return next;
  const index = (next.navigation.activeItemIndex + direction + list.items.length) % list.items.length;
  return selectPreset(next, list.items[index].presetId, index);
}

export function selectSetlist(data: PulseData, setlistId: string | null): PulseData {
  const list = data.setlists.find((s) => s.id === setlistId);
  const next = { ...data, navigation: { ...data.navigation, activeSetlistId: list?.id ?? null, activeItemIndex: 0 } };
  return list?.items.length ? selectPreset(next, list.items[0].presetId, 0) : next;
}

export function selectSetlistItem(data: PulseData, index: number): PulseData {
  const list = data.setlists.find((s) => s.id === data.navigation.activeSetlistId);
  const item = list?.items[index];
  return item ? selectPreset(data, item.presetId, index) : data;
}

function replaceSetlistItems(data: PulseData, listId: string, items: SetlistItem[]): PulseData {
  return reconcileNavigation({ ...data, setlists: data.setlists.map((s) => s.id === listId ? { ...s, items } : s) }, data);
}

export function addSetlistItem(data: PulseData, listId: string, presetId: string): PulseData {
  const list = data.setlists.find((s) => s.id === listId);
  if (!list || !data.presets.some((p) => p.id === presetId) || list.items.length >= DATA_LIMITS.setlistItems) return data;
  const next = replaceSetlistItems(data, listId, [...list.items, { id: crypto.randomUUID(), presetId }]);
  return list.items.length === 0 && data.navigation.activeSetlistId === listId ? selectSetlistItem(next, 0) : next;
}

export function removeSetlistItem(data: PulseData, listId: string, itemId: string): PulseData {
  const list = data.setlists.find((s) => s.id === listId);
  return list ? replaceSetlistItems(data, listId, list.items.filter((item) => item.id !== itemId)) : data;
}

export function moveSetlistItem(data: PulseData, listId: string, itemId: string, direction: -1 | 1): PulseData {
  const list = data.setlists.find((s) => s.id === listId);
  if (!list) return data;
  const from = list.items.findIndex((item) => item.id === itemId), to = from + direction;
  if (from < 0 || to < 0 || to >= list.items.length) return data;
  const items = [...list.items]; [items[from], items[to]] = [items[to], items[from]];
  return replaceSetlistItems(data, listId, items);
}

export function removePreset(data: PulseData, presetId: string): PulseData {
  const oldIndex = data.presets.findIndex((p) => p.id === presetId);
  const next = reconcileNavigation({ ...data, presets: data.presets.filter((p) => p.id !== presetId), setlists: data.setlists.map((s) => ({ ...s, items: s.items.filter((item) => item.presetId !== presetId) })) }, data);
  if (data.navigation.activePresetId === presetId && next.navigation.activePresetId === null && next.presets.length) return selectPreset(next, next.presets[Math.min(Math.max(0, oldIndex), next.presets.length - 1)].id);
  return next;
}

export function removeSetlist(data: PulseData, setlistId: string): PulseData {
  return reconcileNavigation({ ...data, setlists: data.setlists.filter((s) => s.id !== setlistId) });
}

export function renamePreset(data: PulseData, presetId: string, name: string): PulseData {
  if (!name.trim()) return data;
  const uniqueName = uniquePresetName(data.presets.filter((p) => p.id !== presetId), name);
  return { ...data, presets: data.presets.map((p) => p.id === presetId ? { ...p, name: uniqueName, updatedAt: new Date().toISOString() } : p) };
}

export function updatePresetFromSettings(data: PulseData, presetId: string): PulseData {
  return { ...data, presets: data.presets.map((p) => p.id === presetId ? { ...createPreset(data.settings, p.name), id: p.id, createdAt: p.createdAt } : p) };
}

export function duplicatePreset(data: PulseData, presetId: string): PulseData {
  const original = data.presets.find((p) => p.id === presetId);
  if (!original || data.presets.length >= DATA_LIMITS.presets) return data;
  const copy = createPreset(applyPreset(data.settings, original), uniquePresetName(data.presets, `${original.name} 복사`));
  return { ...data, presets: [...data.presets, copy] };
}

export function renameSetlist(data: PulseData, setlistId: string, name: string): PulseData {
  const desired = name.trim().slice(0, 80);
  return desired ? { ...data, setlists: data.setlists.map((s) => s.id === setlistId ? { ...s, name: desired } : s) } : data;
}

export function presetMatchesSettings(preset: MetronomePreset, settings: AppSettings): boolean {
  const fields = (value: MetronomePreset | AppSettings) => ({ bpm: value.bpm, tempoUnit: value.tempoUnit, beatGroups: value.beatGroups, timeSignature: value.timeSignature, subdivision: value.subdivision, accents: value.accents, sound: value.sound, volume: value.volume, practice: value.practice });
  const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, childValue]) => [key, ordered(childValue)])) : value;
  return JSON.stringify(ordered(fields(preset))) === JSON.stringify(ordered(fields(settings)));
}
