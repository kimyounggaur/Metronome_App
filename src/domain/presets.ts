import { defaultPracticeSettings } from "./practiceModes";
import { clampBpm, clampVolume } from "./tempo";
import type { AppSettings, MetronomePreset, Setlist } from "./types";

export const SETTINGS_KEY = "pulse:settings:v1";
export const PRESETS_KEY = "pulse:presets:v1";
export const SETLISTS_KEY = "pulse:setlists:v1";

export const defaultSettings: AppSettings = {
  bpm: 120,
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
  practice: defaultPracticeSettings,
};

export function createPreset(settings: AppSettings, name: string): MetronomePreset {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || `Pulse ${settings.bpm}`,
    bpm: clampBpm(settings.bpm),
    timeSignature: settings.timeSignature,
    subdivision: settings.subdivision,
    accents: settings.accents,
    sound: settings.sound,
    volume: clampVolume(settings.volume),
    practice: settings.practice,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyPreset(settings: AppSettings, preset: MetronomePreset): AppSettings {
  return {
    ...settings,
    bpm: clampBpm(preset.bpm),
    timeSignature: preset.timeSignature,
    subdivision: preset.subdivision,
    accents: preset.accents,
    sound: preset.sound,
    volume: clampVolume(preset.volume),
    practice: preset.practice,
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

export function isPresetArray(value: unknown): value is MetronomePreset[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const preset = item as Partial<MetronomePreset>;
      return typeof preset.id === "string" && typeof preset.name === "string" && typeof preset.bpm === "number";
    })
  );
}

export function isSetlistArray(value: unknown): value is Setlist[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const setlist = item as Partial<Setlist>;
      return typeof setlist.id === "string" && typeof setlist.name === "string" && Array.isArray(setlist.presetIds);
    })
  );
}

export function isAppSettings(value: unknown): value is AppSettings {
  if (typeof value !== "object" || value === null) return false;
  const settings = value as Partial<AppSettings>;
  return typeof settings.bpm === "number" && typeof settings.volume === "number" && typeof settings.timeSignature === "object";
}

export function uniquePresetName(existing: MetronomePreset[], desired: string): string {
  const base = desired.trim() || "Untitled";
  const names = new Set(existing.map((preset) => preset.name));
  if (!names.has(base)) return base;

  let index = 2;
  while (names.has(`${base} ${index}`)) {
    index += 1;
  }
  return `${base} ${index}`;
}
