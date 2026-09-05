import { describe, expect, it } from "vitest";
import { MetronomeEngine, settingsForEngine } from "../audio/MetronomeEngine";
import { defaultSettings } from "../domain/presets";
import type { Subdivision } from "../domain/types";
import { engineHarness } from "./audioHarness";

const subdivisions: [Subdivision, number][] = [["none", 1], ["eighth", 2], ["triplet", 3], ["sixteenth", 4]];
const cases = [30, 60, 120, 240, 300].flatMap((bpm) => subdivisions.map(([subdivision, count]) => ({ bpm, subdivision, count })));

describe("full BPM × subdivision scheduling matrix", () => {
  it.each(cases)("$bpm BPM with $count subdivisions keeps exact spacing, future scheduling, and bounded queues", async ({ bpm, subdivision, count }) => {
    const h = engineHarness();
    const engine = new MetronomeEngine({ ...settingsForEngine(defaultSettings), bpm, subdivision }, undefined, h.dependencies);
    const interval = 60 / bpm / count;
    const duration = 16 * 60 / bpm;
    await engine.start();
    for (let tick = 1; tick * 0.025 <= duration; tick++) { h.tick(tick * 0.025); h.frame(); }
    const diagnostics = engine.getDiagnostics();
    const starts = h.context.oscillators.flatMap((source) => source.starts);
    expect(starts.length).toBeGreaterThanOrEqual(16 * count);
    starts.forEach((time, index) => expect(time).toBeCloseTo(0.06 + index * interval, 8));
    expect(diagnostics.records.every((record) => !record.skipped && record.eventTime >= record.scheduledAt)).toBe(true);
    expect(diagnostics.duplicateEventCount).toBe(0);
    expect(diagnostics.skippedEventCount).toBe(0);
    expect(diagnostics.maxQueueLength).toBeLessThanOrEqual(Math.ceil(0.1 / interval) + 2);
    expect(diagnostics.activeSources).toBeLessThanOrEqual(Math.ceil(0.145 / interval) + 1);
    expect(h.workers.filter((worker) => !worker.terminated)).toHaveLength(1);
    expect(h.frames.size).toBe(1);
    engine.dispose();
    expect(h.frames.size).toBe(0);
  });
});
