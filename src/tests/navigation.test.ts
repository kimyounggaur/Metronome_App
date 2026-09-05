import { afterEach, describe, expect, it, vi } from "vitest";
import { addSetlistItem, createDefaultData, createPreset, duplicatePreset, moveSetlistItem, navigateSetlist, presetMatchesSettings, removePreset, removeSetlist, removeSetlistItem, renamePreset, renameSetlist, selectPreset, selectSetlist, selectSetlistItem, updatePresetFromSettings } from "../domain/presets";
import { validatePulseData } from "../domain/schema";

function fixture() {
  const data = createDefaultData();
  const a = createPreset(data.settings, "A"); a.id = "A";
  const b = createPreset({ ...data.settings, timeSignature: { beats: 3, noteValue: 4 }, beatGroups: [3], accents: ["strong", "normal", "normal"] }, "B"); b.id = "B";
  const c = createPreset({ ...data.settings, timeSignature: { beats: 6, noteValue: 8 }, tempoUnit: "eighth", beatGroups: [3, 3], accents: ["strong", "normal", "normal", "soft", "normal", "normal"] }, "C"); c.id = "C";
  data.presets = [a, b, c];
  data.setlists = [{ id: "lesson", name: "레슨", items: ["A", "B", "C", "A"].map((presetId, i) => ({ id: `entry-${i}`, presetId })) }, { id: "single", name: "한 곡", items: [{ id: "only", presetId: "B" }] }, { id: "empty", name: "빈 목록", items: [] }];
  return selectSetlist(data, "lesson");
}
afterEach(() => vi.useRealTimers());

describe("ID and occurrence based navigation", () => {
  it("moves through equal BPM songs by IDs and musical snapshot", () => {
    let data = fixture(); data = navigateSetlist(data, 1); expect(data.navigation.activePresetId).toBe("B"); expect(data.settings.timeSignature.beats).toBe(3); expect(data.settings.bpm).toBe(120);
    data = navigateSetlist(data, 1); expect(data.navigation.activePresetId).toBe("C"); expect(data.settings.tempoUnit).toBe("eighth"); expect(data.settings.beatGroups).toEqual([3, 3]);
    data = navigateSetlist(data, -1); expect(data.navigation.activePresetId).toBe("B"); expect(data.navigation.activeItemIndex).toBe(1);
  });
  it("distinguishes the second A occurrence and wraps in both directions", () => {
    let data = selectSetlistItem(fixture(), 3); expect(data.navigation.activePresetId).toBe("A"); expect(data.navigation.activeItemIndex).toBe(3);
    data = navigateSetlist(data, 1); expect(data.navigation.activeItemIndex).toBe(0); data = navigateSetlist(data, -1); expect(data.navigation.activeItemIndex).toBe(3);
    expect(navigateSetlist(data, -1).navigation.activePresetId).toBe("C");
  });
  it("direct B selection gives the same next C as selecting list item 2", () => { const direct = selectPreset(fixture(), "B"); expect(navigateSetlist(direct, 1).navigation.activePresetId).toBe("C"); expect(direct.navigation).toEqual(selectSetlistItem(fixture(), 1).navigation); });
  it("retains selected occurrence and unsaved settings when preceding item is removed", () => {
    let data = selectSetlistItem(fixture(), 3); data.settings.bpm = 133; data = removeSetlistItem(data, "lesson", "entry-0");
    expect(data.navigation.activeItemIndex).toBe(2); expect(data.setlists[0].items[2].id).toBe("entry-3"); expect(data.settings.bpm).toBe(133);
  });
  it("retains identity through up/down ordering, including repeated presets", () => {
    let data = selectSetlistItem(fixture(), 3); data = moveSetlistItem(data, "lesson", "entry-3", -1); expect(data.navigation.activeItemIndex).toBe(2); expect(data.setlists[0].items[2].id).toBe("entry-3");
    data = moveSetlistItem(data, "lesson", "entry-1", 1); expect(data.navigation.activeItemIndex).toBe(1); expect(data.navigation.activePresetId).toBe("A");
  });
  it("chooses nearest surviving item when active item is deleted", () => {
    const middle = removeSetlistItem(selectSetlistItem(fixture(), 1), "lesson", "entry-1"); expect(middle.navigation.activePresetId).toBe("C"); expect(middle.navigation.activeItemIndex).toBe(1); expect(middle.settings.timeSignature.beats).toBe(6);
    const last = removeSetlistItem(selectSetlistItem(fixture(), 3), "lesson", "entry-3"); expect(last.navigation.activePresetId).toBe("C"); expect(last.navigation.activeItemIndex).toBe(2);
  });
  it("deleting a preset updates all lists and restores the active selection", () => {
    const data = removePreset(selectPreset(fixture(), "B"), "B"); expect(data.presets.some((p) => p.id === "B")).toBe(false); expect(data.setlists.every((s) => s.items.every((item) => item.presetId !== "B"))).toBe(true); expect(data.navigation.activePresetId).toBe("C"); expect(data.setlists[1].items).toHaveLength(0); expect(validatePulseData(data).ok).toBe(true);
  });
  it("handles empty, single and deleted active lists without invalid cursors", () => {
    const empty = selectSetlist(fixture(), "empty"); expect(navigateSetlist(empty, 1)).toEqual(empty);
    const single = selectSetlist(fixture(), "single"); expect(navigateSetlist(single, -1)).toEqual(single);
    const deleted = removeSetlist(single, "single"); expect(deleted.navigation).toEqual({ activePresetId: "B", activeSetlistId: null, activeItemIndex: 0 }); expect(deleted.settings).toEqual(single.settings); expect(validatePulseData(deleted).ok).toBe(true);
  });
  it("new repeats use separate item IDs and empty list additions select first item", () => {
    let data = selectSetlist(fixture(), "empty"); data = addSetlistItem(data, "empty", "A"); data = addSetlistItem(data, "empty", "A"); const list = data.setlists.find((s) => s.id === "empty")!;
    expect(list.items.map((item) => item.presetId)).toEqual(["A", "A"]); expect(new Set(list.items.map((item) => item.id)).size).toBe(2); expect(data.navigation.activePresetId).toBe("A"); expect(validatePulseData(data).ok).toBe(true);
  });
  it("ignores deleted preset references and out of range movement commands", () => {
    const data = fixture(); expect(addSetlistItem(data, "lesson", "missing")).toBe(data); expect(selectSetlistItem(data, 99)).toBe(data); expect(moveSetlistItem(data, "lesson", "entry-0", -1)).toBe(data);
  });
});

describe("preset CRUD and dirty state", () => {
  it("updates settings snapshot while preserving identity and creation time", () => {
    const data = fixture(), original = data.presets[0]; vi.useFakeTimers(); vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z")); data.settings.bpm = 135;
    const next = updatePresetFromSettings(data, "A"), updated = next.presets[0]; expect(updated.id).toBe(original.id); expect(updated.createdAt).toBe(original.createdAt); expect(updated.updatedAt).toBe("2030-01-01T00:00:00.000Z"); expect(updated.bpm).toBe(135); expect(presetMatchesSettings(updated, data.settings)).toBe(true);
  });
  it("renames within limits and deduplicates names without changing IDs", () => {
    let data = renamePreset(fixture(), "A", "B"); expect(data.presets[0].name).toBe("B 2"); expect(data.presets[0].id).toBe("A"); data = renamePreset(data, "A", "가".repeat(100)); expect(data.presets[0].name).toHaveLength(80); expect(renamePreset(data, "A", " ")).toBe(data);
    expect(renameSetlist(data, "lesson", "새 레슨").setlists[0].name).toBe("새 레슨");
  });
  it("duplicates the stored preset independently, preserving its musical values", () => {
    const data = fixture(); data.settings.bpm = 155; const next = duplicatePreset(data, "B"); const copy = next.presets[3]; expect(copy.id).not.toBe("B"); expect(copy.name).toBe("B 복사"); expect(copy.bpm).toBe(120); expect(copy.timeSignature.beats).toBe(3); copy.practice.gapTrainer.playBars = 9; expect(data.presets[1].practice.gapTrainer.playBars).toBe(3);
  });
  it("dirty detection follows musical fields and ignores global display preferences and JSON key order", () => {
    const data = fixture(), preset = data.presets[0]; expect(presetMatchesSettings(preset, data.settings)).toBe(true); data.settings.theme = "light"; data.settings.muted = true; data.settings.autoLandscape = true; expect(presetMatchesSettings(preset, data.settings)).toBe(true);
    data.settings.timeSignature = { noteValue: 4, beats: 4 }; expect(presetMatchesSettings(preset, data.settings)).toBe(true);
    data.settings.practice.randomMute.probability = 0.3; expect(presetMatchesSettings(preset, data.settings)).toBe(false);
  });
});
