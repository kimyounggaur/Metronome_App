import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach } from "vitest";
import { applyPreset, createDefaultData, createPreset, isAppSettings, isPresetArray, isSetlistArray, PRESETS_KEY, SETLISTS_KEY, SETTINGS_KEY } from "../domain/presets";
import { mergeBackup, parseBackup, parseBackupValue } from "../domain/migration";
import { formatIssues, validatePulseData } from "../domain/schema";
import { loadPulseData, PULSE_DATA_KEY, SAVE_FAILURE, savePulseData, type StorageLike } from "../storage/pulseStorage";
import { usePulseStorage } from "../hooks/usePulseStorage";

function sample() {
  const data = createDefaultData();
  data.presets = [createPreset(data.settings, "A"), createPreset(data.settings, "B")];
  data.setlists = [{ id: "set-1", name: "레슨", items: [{ id: "i-1", presetId: data.presets[0].id }, { id: "i-2", presetId: data.presets[1].id }, { id: "i-3", presetId: data.presets[0].id }] }];
  return data;
}
function legacy() {
  const data = sample();
  const musical = (value: typeof data.settings | typeof data.presets[number]) => {
    const { tempoUnit: _tempo, beatGroups: _groups, ...old } = value;
    const { timerSeconds: _seconds, ...practice } = old.practice;
    return { ...old, bpm: 120, timeSignature: { beats: 6, noteValue: 8 }, accents: ["strong", "normal", "soft", "normal", "mute", "normal"], practice: { ...practice, timerMinutes: 3 } };
  };
  const { autoLandscape: _landscape, ...oldSettings } = data.settings;
  return { settings: musical({ ...oldSettings, autoLandscape: false }), presets: data.presets.map(musical), setlists: data.setlists.map((s) => ({ id: s.id, name: s.name, presetIds: s.items.map((item) => item.presetId) })) };
}
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) } satisfies StorageLike & { values: Map<string, string> };
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("strict backup schema", () => {
  it("rejects the original crashing settings and partial preset", () => {
    expect(isAppSettings({ bpm: 120, volume: 0.5, timeSignature: null })).toBe(false);
    expect(isPresetArray([{ id: "bad", name: "bad", bpm: 120 }])).toBe(false);
    const parsed = parseBackup('{"presets":[{"id":"bad","name":"bad","bpm":120}]}');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.some((i) => i.path === "presets[0].timeSignature")).toBe(true);
    if (!parsed.ok) expect(formatIssues(parsed.issues)).toContain("presets[0].timeSignature:");
  });
  it("collapses missing-object cascades without hiding other field paths or accepting partial input", () => {
    const data = sample(); const invalid = { ...data, settings: { ...data.settings, practice: { ...data.settings.practice, speedTrainer: null, gapTrainer: null, randomMute: null } }, presets: [{ id: "bad", name: "bad", bpm: 120 }] };
    const result = validatePulseData(invalid); expect(result.ok).toBe(false);
    if (!result.ok) {
      const originalIssues = structuredClone(result.issues); const message = formatIssues(result.issues);
      expect(message).toContain("settings.practice.speedTrainer:"); expect(message).not.toContain("settings.practice.speedTrainer.startBpm:"); expect(message).toContain("presets[0].timeSignature:"); expect(message).toContain("추가 오류"); expect(result.issues).toEqual(originalIssues);
    }
  });
  it.each([
    ["bpm", 301], ["bpm", 30.5], ["bpm", Number.NaN], ["volume", -0.1], ["volume", Number.POSITIVE_INFINITY], ["muted", "false"], ["theme", "pink"], ["tempoUnit", "half"], ["autoLandscape", 1],
  ])("rejects invalid settings %s=%s", (key, value) => { const d = sample(); Object.assign(d.settings, { [key]: value }); expect(validatePulseData(d).ok).toBe(false); });
  it("checks every nested practice bound and enum", () => {
    const bad = sample(); bad.settings.practice.speedTrainer.step = 0; bad.settings.practice.speedTrainer.everyBars = 65; bad.settings.practice.timerSeconds = 3601; bad.settings.practice.gapTrainer.muteBars = 0; bad.settings.practice.randomMute.probability = 1.1;
    const result = validatePulseData(bad); expect(result.ok).toBe(false);
    if (!result.ok) for (const path of ["speedTrainer.step", "speedTrainer.everyBars", "timerSeconds", "gapTrainer.muteBars", "randomMute.probability"]) expect(result.issues.some((i) => i.path.endsWith(path))).toBe(true);
  });
  it("rejects invalid accents, groups, dates, duplicate IDs and missing references", () => {
    const d = sample(); d.settings.accents = []; d.settings.beatGroups = [0, 4]; d.presets[0].createdAt = "2026-02-31T00:00:00.000Z"; d.presets[1].id = d.presets[0].id; d.setlists[0].items[1].id = "i-1"; d.setlists[0].items[2].presetId = "missing";
    const result = validatePulseData(d); expect(result.ok).toBe(false);
    if (!result.ok) for (const path of ["settings.accents", "settings.beatGroups[0]", "presets[0].createdAt", "presets[1].id", "setlists[0].items[1].id", "setlists[0].items[2].presetId"]) expect(result.issues.map((i) => i.path)).toContain(path);
    expect(isSetlistArray([{ id: "a", name: "A", items: [{ id: "b", presetId: 8 }] }])).toBe(false);
  });
  it("rejects future versions and oversized files without interpreting them", () => {
    expect(parseBackupValue({ ...sample(), schemaVersion: 900 }).ok).toBe(false);
    expect(parseBackup(" ".repeat(2 * 1024 * 1024 + 1)).ok).toBe(false);
  });
  it("round trips all settings and references and owns independent nested copies", () => {
    const original = sample(); const restored = parseBackup(JSON.stringify(original)); expect(restored.ok).toBe(true);
    if (restored.ok) { expect(restored.data).toEqual(original); restored.data.settings.accents[0] = "mute"; expect(original.settings.accents[0]).toBe("strong"); }
    const p = createPreset(original.settings, "C"); p.practice.gapTrainer.playBars = 8; expect(original.settings.practice.gapTrainer.playBars).toBe(3);
    const loaded = applyPreset(original.settings, p); loaded.accents[0] = "mute"; expect(p.accents[0]).toBe("strong");
  });
});

describe("v1 migration and transaction storage", () => {
  it("preserves /8 click intervals, timer units, accents, order and repeats", () => {
    const old = legacy(), parsed = parseBackupValue(old); expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.settings.tempoUnit).toBe("eighth"); expect(parsed.data.settings.practice.timerSeconds).toBe(180); expect(parsed.data.settings.autoLandscape).toBe(false);
      expect(parsed.data.settings.beatGroups).toEqual([3, 3]); expect(parsed.data.settings.accents).toEqual(old.settings.accents);
      const settings = parsed.data.settings; const duration = 60 / settings.bpm / 0.5 * 4 / settings.timeSignature.noteValue * settings.timeSignature.beats; expect(duration).toBe(3);
      expect(parsed.data.setlists[0].items.map((i) => i.presetId)).toEqual(old.setlists[0].presetIds); expect(new Set(parsed.data.setlists[0].items.map((i) => i.id)).size).toBe(3);
    }
  });
  it("explicitly rejects /16 legacy data", () => { const old = legacy(); old.settings.timeSignature.noteValue = 16; const result = parseBackupValue(old); expect(result.ok).toBe(false); if (!result.ok) expect(result.issues.some((i) => i.path === "settings.timeSignature.noteValue")).toBe(true); });
  it("writes one envelope while preserving all original v1 bytes", () => {
    const old = legacy(); const raws = { [SETTINGS_KEY]: JSON.stringify(old.settings), [PRESETS_KEY]: JSON.stringify(old.presets), [SETLISTS_KEY]: JSON.stringify(old.setlists) }; const storage = memoryStorage(raws); const loaded = loadPulseData(storage);
    expect(loaded.storageError).toBeNull(); expect(storage.setItem).toHaveBeenCalledTimes(1); expect(storage.values.has(PULSE_DATA_KEY)).toBe(true);
    for (const [key, raw] of Object.entries(raws)) expect(storage.values.get(key)).toBe(raw);
  });
  it("does not overwrite a corrupt v2 or malformed v1 origin", () => {
    for (const [key, raw] of [[PULSE_DATA_KEY, '{"schemaVersion":999}'], [SETTINGS_KEY, "broken"]]) { const storage = memoryStorage({ [key]: raw }); const loaded = loadPulseData(storage); expect(loaded.storageError).not.toBeNull(); expect(loaded.recoveryRaw).not.toBeNull(); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.values.get(key)).toBe(raw); }
  });
  it("retains original v1 data and migrated memory when quota is denied", () => {
    const old = legacy(); const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify(old.settings), [PRESETS_KEY]: JSON.stringify(old.presets), [SETLISTS_KEY]: JSON.stringify(old.setlists) }); storage.setItem.mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    const loaded = loadPulseData(storage); expect(loaded.data.settings.practice.timerSeconds).toBe(180); expect(loaded.storageError).toBe(SAVE_FAILURE); expect(loaded.recoveryRaw).toContain(SETTINGS_KEY); expect(storage.values.has(PULSE_DATA_KEY)).toBe(false);
  });
  it("rejects invalid writes before storage is touched", () => { const storage = memoryStorage(); const d = sample(); d.setlists[0].items[0].presetId = "missing"; expect(savePulseData(storage, d)).toContain("presetId"); expect(storage.setItem).not.toHaveBeenCalled(); });
  it("remaps colliding IDs and references as one merge plan", () => {
    const original = sample(); let i = 0; const merged = mergeBackup(original, original, () => `new-${++i}`); expect(merged.ok).toBe(true);
    if (merged.ok) { expect(merged.data.presets).toHaveLength(4); expect(merged.data.setlists).toHaveLength(2); expect(merged.data.setlists[1].items.map((entry) => entry.presetId)).toEqual(["new-1", "new-2", "new-1"]); expect(merged.data.setlists[1].id).toBe("new-3"); expect(validatePulseData(merged.data).ok).toBe(true); }
    expect(original.presets).toHaveLength(2);
  });
});

describe("storage React boundary", () => {
  it("keeps unsaved memory and allows backup when localStorage rejects writes", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
    const { result } = renderHook(() => usePulseStorage());
    act(() => result.current.setSettings((settings) => ({ ...settings, bpm: 90 })));
    act(() => { expect(result.current.flush()).toBe(false); });
    expect(result.current.settings.bpm).toBe(90); expect(result.current.storageError).toBe(SAVE_FAILURE); expect(JSON.parse(result.current.exportJson()).settings.bpm).toBe(90); expect(spy).toHaveBeenCalled();
  });
  it("does not silently save fallback after finding damaged data", () => {
    localStorage.setItem(PULSE_DATA_KEY, "invalid"); const spy = vi.spyOn(Storage.prototype, "setItem"); const { result } = renderHook(() => usePulseStorage());
    act(() => result.current.setSettings((settings) => ({ ...settings, bpm: 88 })));
    expect(result.current.settings.bpm).toBe(88); expect(result.current.recoveryRaw).toBe("invalid"); expect(localStorage.getItem(PULSE_DATA_KEY)).toBe("invalid"); expect(spy).not.toHaveBeenCalled();
  });
  it("refuses invalid imports and preserves all prior state", () => {
    const { result } = renderHook(() => usePulseStorage()); const before = result.current.exportJson(); const bad = sample(); bad.settings.volume = 9;
    act(() => { expect(result.current.importData(bad, "replace")).toBe(false); }); expect(result.current.exportJson()).toBe(before);
  });
  it("does not apply replacement if persistence fails", () => {
    const { result } = renderHook(() => usePulseStorage()); const before = result.current.exportJson(); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    act(() => { expect(result.current.importData(sample(), "replace")).toBe(false); }); expect(result.current.exportJson()).toBe(before);
  });
  it("restores validated backup with a single complete payload", () => {
    const { result } = renderHook(() => usePulseStorage()); const incoming = sample(); act(() => { expect(result.current.importData(incoming, "replace")).toBe(true); });
    expect(result.current.data).toEqual(incoming); expect(JSON.parse(localStorage.getItem(PULSE_DATA_KEY)!)).toEqual(incoming);
  });
});
