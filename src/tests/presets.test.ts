import { describe, expect, it } from "vitest";
import { applyPreset, createPreset, defaultSettings, isPresetArray, safeParseJson, uniquePresetName } from "../domain/presets";

describe("presets", () => {
  it("creates and applies a preset", () => {
    const preset = createPreset({ ...defaultSettings, bpm: 92 }, "Warmup");
    expect(preset.bpm).toBe(92);
    expect(applyPreset(defaultSettings, preset).bpm).toBe(92);
  });

  it("falls back on invalid json", () => {
    expect(safeParseJson("not json", [], isPresetArray)).toEqual([]);
  });

  it("deduplicates preset names", () => {
    const preset = createPreset(defaultSettings, "Warmup");
    expect(uniquePresetName([preset], "Warmup")).toBe("Warmup 2");
  });
});
