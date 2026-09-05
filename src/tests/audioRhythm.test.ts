import { describe, expect, it } from "vitest";
import { secondsPerBar, secondsPerMeterCell, validBeatGroups } from "../domain/rhythm";
import { MetronomeEngine, settingsForEngine } from "../audio/MetronomeEngine";
import { defaultSettings } from "../domain/presets";
import { engineHarness } from "./audioHarness";
import type { BeatEvent, TempoUnit } from "../domain/types";

describe("musical time and boundary snapshots", () => {
  it.each([
    [4, 4, 120, "quarter", 0.5, 2], [6, 8, 60, "dotted-quarter", 1 / 3, 2],
    [6, 8, 120, "eighth", 0.5, 3], [6, 8, 120, "quarter", 0.25, 1.5],
  ] as const)("%s/%s at %s %s has correct event intervals", async (beats, noteValue, bpm, tempoUnit, cell, bar) => {
    const signature = { beats, noteValue };
    expect(secondsPerMeterCell(bpm, signature, tempoUnit)).toBeCloseTo(cell);
    expect(secondsPerBar(bpm, signature, tempoUnit)).toBeCloseTo(bar);
    const h = engineHarness(); const events: BeatEvent[] = [];
    const engine = new MetronomeEngine({ ...settingsForEngine(defaultSettings), bpm, tempoUnit, timeSignature: signature }, { onBeat: (event) => events.push(event) }, h.dependencies);
    await engine.start();
    for (let step = 1; step <= Math.ceil((bar + 0.2) / 0.025); step++) { h.tick(step * 0.025); h.frame(); }
    expect(events.find((event) => event.barIndex === 1)?.time! - events[0].time).toBeCloseTo(bar);
    engine.dispose();
  });
  it.each([[4, 4, 3, 4], [12, 8, 4, 4]] as const)("atomically changes %s/%s to %s/%s while scheduling the last cell", async (beats, noteValue, nextBeats, nextNoteValue) => {
    const h = engineHarness(); const events: BeatEvent[] = [];
    const initial = { ...settingsForEngine(defaultSettings), bpm: 120, tempoUnit: (noteValue === 8 ? "eighth" : "quarter") as TempoUnit,
      timeSignature: { beats, noteValue }, subdivision: "sixteenth" as const, accents: Array.from({ length: beats }, () => "normal" as const) };
    const engine = new MetronomeEngine(initial, { onBeat: (event) => events.push(event) }, h.dependencies);
    await engine.start();
    const boundary = beats * 0.5 + 0.06;
    for (let time = 0.025; time < boundary - 0.3; time += 0.025) { h.tick(time); h.frame(); }
    engine.updateSettings({ ...initial, tempoUnit: "quarter", timeSignature: { beats: nextBeats, noteValue: nextNoteValue }, subdivision: "none", beatGroups: [nextBeats], accents: Array.from({ length: nextBeats }, () => "normal") });
    for (let time = h.context.currentTime + 0.025; time < boundary + 2; time += 0.025) { h.tick(time); h.frame(); }
    expect(events.every((event) => event.beatIndex < event.timeSignature.beats)).toBe(true);
    expect(events.every((event, index) => index === 0 || event.time > events[index - 1].time)).toBe(true);
    const nextBar = events.filter((event) => event.barIndex === 1);
    expect(nextBar[0].beatIndex).toBe(0); expect(nextBar[0].time).toBeCloseTo(boundary);
    expect(nextBar.every((event) => event.subIndex === 0 && event.timeSignature.beats === nextBeats)).toBe(true);
    engine.dispose();
  });
  it("validates exact positive group sums", () => {
    expect(validBeatGroups([2, 2, 3], 7)).toBe(true);
    for (const groups of [[], [0, 7], [-1, 8], [2, 2, 2], [1.5, 5.5]]) expect(validBeatGroups(groups, 7)).toBe(false);
  });
});
