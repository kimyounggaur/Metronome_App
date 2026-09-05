import { describe, expect, it, vi } from "vitest";
import { createPracticeSession, planNextEvent, type PlannerSettings } from "../domain/planner";
import { settingsForEngine } from "../audio/MetronomeEngine";
import { defaultSettings } from "../domain/presets";
import type { BeatEvent } from "../domain/types";
function settings(): PlannerSettings { return settingsForEngine(defaultSettings); }
function collect(config: PlannerSettings, count: number, random: () => number = () => 0.5) {
  let state = createPracticeSession(config, 0);
  const events: BeatEvent[] = [];
  for (let i = 0; i < count && state.phase !== "complete"; i++) {
    const result = planNextEvent(state, config, random); state = result.state;
    if (result.event) events.push(result.event);
  }
  return { events, state };
}
function speedSettings(startBpm = 80, targetBpm = 84, onReach: "stop" | "hold" | "loop" = "stop", step = 2): PlannerSettings {
  const config = settings();
  config.practice.speedTrainer = { enabled: true, startBpm, targetBpm, step, everyBars: 2, onReach };
  return config;
}
function bars(events: BeatEvent[]) { return events.filter((event) => event.phase === "main" && event.beatIndex === 0 && event.subIndex === 0).map((event) => event.bpm); }
describe("practice planner", () => {
  it.each(["stop", "hold", "loop"] as const)("plays the target interval before %s", (mode) => {
    const result = collect(speedSettings(80, 84, mode), 40);
    const expected = mode === "stop" ? [80, 80, 82, 82, 84, 84] : mode === "hold" ? [80, 80, 82, 82, 84, 84, 84, 84, 84, 84] : [80, 80, 82, 82, 84, 84, 80, 80, 82, 82];
    expect(bars(result.events)).toEqual(expected);
    expect(result.state.phase === "complete").toBe(mode === "stop");
  });
  it("descends and gives start=target a full interval", () => {
    expect(bars(collect(speedSettings(120, 116), 50).events)).toEqual([120, 120, 118, 118, 116, 116]);
    expect(bars(collect(speedSettings(80, 80), 50).events)).toEqual([80, 80]);
  });
  it.each([[298, 300, 10], [32, 30, 10]] as const)("clamps a large step from %s to %s", (start, target, step) => {
    expect(bars(collect(speedSettings(start, target, "stop", step), 50).events)).toEqual([start, start, target, target]);
  });
  it("starts timer after exactly two count-in bars and excludes deadline events", () => {
    const config = settings(); config.bpm = 120; config.practice.countInBars = 2; config.practice.timerSeconds = 1;
    const { events, state } = collect(config, 100);
    expect(events.filter((event) => event.phase === "count-in")).toHaveLength(8);
    const main = events.filter((event) => event.phase === "main");
    expect(main[0]).toMatchObject({ time: 4, barIndex: 0, beatIndex: 0, mainStartedAt: 4, timerDeadline: 5 });
    expect(main.map((event) => event.time)).toEqual([4, 4.5]);
    expect(state.stopAt).toBe(5);
  });
  it("repeats gap3:1 on main bars, with an independent count-in", () => {
    const config = settings(); config.practice.countInBars = 2; config.practice.gapTrainer.enabled = true;
    const { events } = collect(config, 40);
    expect(events.filter((event) => event.phase === "count-in").every((event) => !event.gapMute)).toBe(true);
    expect(events.filter((event) => event.phase === "main" && event.beatIndex === 0).map((event) => event.gapMute)).toEqual([false, false, false, true, false, false, false, true]);
  });
  it.each(["beat", "bar"] as const)("draws seeded random once per %s and shares all four subdivisions", (unit) => {
    const config = settings(); config.subdivision = "sixteenth"; config.practice.randomMute = { enabled: true, probability: 0.5, unit };
    let seed = 12345;
    const random = vi.fn(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
    const { events } = collect(config, 32, random);
    expect(random).toHaveBeenCalledTimes(unit === "beat" ? 8 : 2);
    const scope = unit === "beat" ? 4 : 16;
    for (let index = 0; index < events.length; index += scope) expect(new Set(events.slice(index, index + scope).map((event) => event.randomMute)).size).toBe(1);
    expect(new Set(events.map((event) => event.randomMute)).size).toBe(2);
  });
  it.each([0, 1])("handles probability %s without drawing and combines rest, gap, random", (probability) => {
    const config = settings(); config.subdivision = "sixteenth"; config.accents[1] = "mute";
    config.practice.randomMute = { enabled: true, probability, unit: "beat" };
    config.practice.gapTrainer = { enabled: true, playBars: 1, muteBars: 1, keepVisual: false };
    const random = vi.fn(); const { events } = collect(config, 32, random);
    expect(random).not.toHaveBeenCalled();
    for (const event of events) {
      expect(event.randomMute).toBe(probability === 1);
      if (event.beatIndex === 1) { expect(event.accentRest).toBe(true); expect(event.isAudible).toBe(false); }
      if (event.gapMute || event.randomMute) { expect(event.isAudible).toBe(false); expect(event.showVisual).toBe(false); }
    }
  });
  it("preserves visual cues for global mute and hides training silence", () => {
    const config = settings(); config.muted = true; config.practice.gapTrainer.keepVisual = false;
    const { events } = collect(config, 1);
    expect(events[0]).toMatchObject({ globalMute: true, isAudible: false, showVisual: true });
  });
  it("does not mutate saved settings or previous session states", () => {
    const config = speedSettings(); const original = structuredClone(config); const state = createPracticeSession(config, 0); const before = { ...state };
    planNextEvent(state, config, () => 0.1);
    expect(config).toEqual(original); expect(state).toEqual(before);
  });
});

