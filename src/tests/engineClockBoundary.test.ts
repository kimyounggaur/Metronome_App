import { describe, expect, it } from "vitest";
import { MetronomeEngine, settingsForEngine } from "../audio/MetronomeEngine";
import { defaultSettings } from "../domain/presets";
import { engineHarness } from "./audioHarness";

describe("floating point event boundary", () => {
  it("does not count the mathematically equal3.56 event as late and starts at the current clock", async () => {
    const h = engineHarness();
    const engine = new MetronomeEngine({ ...settingsForEngine(defaultSettings), bpm: 300, subdivision: "sixteenth" }, undefined, h.dependencies);
    await engine.start();
    // Reserve through3.51, then wake exactly at3.56. Summed0.05 intervals are
    // 3.5599999999999956, while currentTime reports3.56.
    for (let step = 1; step <= 137; step++) h.tick(step * 0.025);
    const count = h.context.oscillators.length;
    h.tick(3.56);
    expect(engine.getDiagnostics().skippedEventCount).toBe(0);
    expect(h.context.oscillators[count].starts[0]).toBe(3.56);
    expect(h.context.oscillators.slice(count).every((source) => source.starts[0] >= 3.56)).toBe(true);
    engine.dispose();
  });
  it("continues skipping a genuine50ms overdue event at the same boundary", async () => {
    const h = engineHarness();
    const engine = new MetronomeEngine({ ...settingsForEngine(defaultSettings), bpm: 300, subdivision: "sixteenth" }, undefined, h.dependencies);
    await engine.start();
    for (let step = 1; step <= 135; step++) h.tick(step * 0.025);
    const count = h.context.oscillators.length;
    h.tick(3.56);
    const skipped = engine.getDiagnostics().records.filter((record) => record.skipped);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].eventTime).toBeCloseTo(3.51);
    expect(h.context.oscillators.slice(count).every((source) => source.starts[0] >= 3.56)).toBe(true);
    engine.dispose();
  });
});
