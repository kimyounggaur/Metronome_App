import { describe, expect, it } from "vitest";
import { MetronomeEngine, settingsForEngine } from "../audio/MetronomeEngine";
import { defaultSettings } from "../domain/presets";
import { engineHarness } from "./audioHarness";
import type { BeatEvent } from "../domain/types";
function advance(h: ReturnType<typeof engineHarness>, until: number) {
  for (let time = h.context.currentTime + 0.025; time < until + 1e-9; time += 0.025) { h.tick(time); h.frame(); }
}
describe("manual tempo applies to the next unreserved interval", () => {
  it.each(["manual", "settings"] as const)("30 to120 at0.20 applies at0.56 for %s changes and retains timer deadline", async (source) => {
    const h = engineHarness(); const initial = { ...settingsForEngine(defaultSettings), bpm: 30 };
    initial.practice.timerSeconds = 5;
    const events: BeatEvent[] = [];
    const engine = new MetronomeEngine(initial, { onBeat: (event) => events.push(event) }, h.dependencies);
    await engine.start(); advance(h, 0.2);
    const deadline = engine.getSnapshot().timerDeadline;
    engine.updateSettings({ ...initial, bpm: 120 }, source); advance(h, 0.6);
    expect(h.context.oscillators.map((osc) => osc.starts[0])).toEqual([0.06, 0.56]);
    expect(events[1]).toMatchObject({ beatIndex: 1, subIndex: 0, bpm: 120 });
    expect(engine.getSnapshot().timerDeadline).toBe(deadline);
    engine.dispose();
  });
  it("120 to30 slows the next unreserved click from0.56 to2.06", async () => {
    const h = engineHarness(); const initial = { ...settingsForEngine(defaultSettings), bpm: 120 };
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); advance(h, 0.2);
    engine.updateSettings({ ...initial, bpm: 30 }, "manual"); advance(h, 0.7);
    expect(h.context.oscillators.map((osc) => osc.starts[0])).toEqual([0.06]);
    advance(h, 2.1);
    expect(h.context.oscillators[1].starts[0]).toBeCloseTo(2.06);
    engine.dispose();
  });
  it("skips recalculated past positions after strong acceleration without catch-up sources", async () => {
    const h = engineHarness(); const initial = { ...settingsForEngine(defaultSettings), bpm: 30 };
    const events: BeatEvent[] = [];
    const engine = new MetronomeEngine(initial, { onBeat: (event) => events.push(event) }, h.dependencies);
    await engine.start(); advance(h, 1.8);
    engine.updateSettings({ ...initial, bpm: 300 }, "manual"); advance(h, 1.9);
    const newStarts = h.context.oscillators.slice(1).map((osc) => osc.starts[0]);
    expect(newStarts.length).toBe(1);
    expect(newStarts[0]).toBeCloseTo(1.86);
    expect(newStarts.every((time) => time >= 1.8)).toBe(true);
    expect(engine.getDiagnostics().skippedEventCount).toBe(8);
    expect(events.at(-1)).toMatchObject({ barIndex: 2, beatIndex: 1, bpm: 300 });
    engine.dispose();
  });
  it("preserves every already-reserved subdivision and recalculates only its following interval", async () => {
    const h = engineHarness(); const initial = { ...settingsForEngine(defaultSettings), bpm: 300, subdivision: "sixteenth" as const };
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); h.tick(0.08);
    const reserved = h.context.oscillators.map((osc) => osc.starts[0]);
    expect(reserved).toHaveLength(3);
    engine.updateSettings({ ...initial, bpm: 120 }, "manual"); h.tick(0.2);
    expect(h.context.oscillators.slice(0, 3).map((osc) => osc.starts[0])).toEqual(reserved);
    expect(h.context.oscillators[3].starts[0]).toBeCloseTo(reserved[2] + 0.125);
    engine.dispose();
  });
  it("keeps preset tempo changes atomic at the original next-bar boundary", async () => {
    const h = engineHarness(); const initial = { ...settingsForEngine(defaultSettings), bpm: 30 };
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); advance(h, 0.2);
    engine.updateSettings({ ...initial, bpm: 120 }, "preset"); advance(h, 2.1);
    expect(h.context.oscillators[1].starts[0]).toBeCloseTo(2.06);
    engine.dispose();
  });
  it("uses the effective meter unit while a different signature is pending", async () => {
    const h = engineHarness();
    const initial = { ...settingsForEngine(defaultSettings), bpm: 60, tempoUnit: "dotted-quarter" as const,
      timeSignature: { beats: 6, noteValue: 8 as const }, beatGroups: [3, 3], accents: ["strong", "normal", "normal", "normal", "normal", "normal"] as BeatEvent["accents"] };
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); h.tick(0.1);
    const pending = { ...initial, tempoUnit: "quarter" as const, timeSignature: { beats: 4, noteValue: 4 as const }, beatGroups: [4], accents: initial.accents.slice(0, 4) };
    engine.updateSettings(pending);
    engine.updateSettings({ ...pending, bpm: 120 }, "manual"); h.tick(0.15);
    expect(h.context.oscillators[1].starts[0]).toBeCloseTo(0.06 + 1 / 6);
    engine.dispose();
  });
});
