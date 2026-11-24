import { describe, expect, it } from "vitest";
import { MetronomeEngine, settingsForEngine } from "../audio/MetronomeEngine";
import { defaultSettings } from "../domain/presets";
import { engineHarness } from "./audioHarness";
import type { BeatEvent } from "../domain/types";
const config = () => settingsForEngine(defaultSettings);
function advance(h: ReturnType<typeof engineHarness>, until: number, frame = true) {
  for (let time = h.context.currentTime + 0.025; time <= until; time += 0.025) { h.tick(time); if (frame) h.frame(); }
}
describe("engine practice integration", () => {
  it("has the same speed/gap/random/cutoff timeline with rAF suspended", async () => {
    const timelines: number[][] = [];
    for (const showFrames of [false, true]) {
      const h = engineHarness(); const initial = config();
      initial.practice.speedTrainer = { enabled: true, startBpm: 80, targetBpm: 84, step: 2, everyBars: 2, onReach: "stop" };
      initial.practice.gapTrainer = { enabled: true, playBars: 3, muteBars: 1, keepVisual: false };
      initial.practice.randomMute = { enabled: true, probability: 0.3, unit: "beat" };
      initial.subdivision = "sixteenth";
      const engine = new MetronomeEngine(initial, undefined, h.dependencies);
      await engine.start(); advance(h, 20, showFrames);
      timelines.push(h.context.oscillators.map((osc) => osc.starts[0]));
      expect(engine.getSnapshot().state).toBe("idle");
      expect(engine.getDiagnostics().totalScheduledCount).toBe(96);
      engine.dispose();
    }
    expect(timelines[0]).toEqual(timelines[1]);
  });
  it("uses main start as timer origin, reserves hard-zero before deadline, and starts no source at/after it", async () => {
    const h = engineHarness(); const initial = config(); initial.bpm = 120;
    initial.practice.countInBars = 2; initial.practice.timerSeconds = 1;
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); expect(engine.getSnapshot().timerRemainingSeconds).toBe(1);
    advance(h, 4.2, false);
    expect(engine.getSnapshot().mainStartedAt).toBeCloseTo(4.06);
    expect(engine.getSnapshot().timerDeadline).toBeCloseTo(5.06);
    const zero = h.context.gains[1].gain.events.find((event) => event.type === "linear" && event.value === 0)!;
    expect(zero.time).toBeCloseTo(5.06);
    advance(h, 5.2, false);
    expect(h.context.oscillators.every((osc) => osc.starts[0] < 5.06)).toBe(true);
    expect(engine.getSnapshot()).toMatchObject({ state: "idle", currentEvent: null, timerRemainingSeconds: null });
    engine.dispose();
  });
  it("holds a preset through count-in, changes volume at main time, and retains pending until displayed", async () => {
    const h = engineHarness(); const initial = config(); initial.bpm = 120; initial.practice.countInBars = 1;
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); advance(h, 0.2);
    const preset = { ...initial, bpm: 60, volume: 0.2, timeSignature: { beats: 3, noteValue: 4 as const }, beatGroups: [3], accents: ["strong", "normal", "normal"] as const };
    engine.updateSettings({ ...preset, accents: [...preset.accents] }, "preset");
    engine.updateSettings({ ...preset, accents: [...preset.accents] });
    expect(h.context.gains[0].gain.value).toBe(initial.volume);
    advance(h, 2.01, false);
    expect(engine.getSnapshot().pendingSettings).toBe(true);
    expect(h.context.gains[0].gain.events.some((event) => event.type === "set" && event.value === 0.2 && Math.abs(event.time - 2.06) < 1e-9)).toBe(true);
    h.context.currentTime = 2.07; h.frame();
    expect(engine.getSnapshot()).toMatchObject({ pendingSettings: false, currentEvent: { bpm: 60, timeSignature: { beats: 3 }, phase: "main" } });
    engine.dispose();
  });
  it("applies gap/random/speed at the next main bar and timer edits on next session", async () => {
    const h = engineHarness(); const initial = config(); initial.bpm = 120; initial.practice.timerSeconds = 10;
    const events: BeatEvent[] = [];
    const engine = new MetronomeEngine(initial, { onBeat: (event) => events.push(event) }, h.dependencies);
    await engine.start(); advance(h, 0.2);
    const next = structuredClone(initial); next.practice.timerSeconds = 1; next.practice.randomMute = { enabled: true, probability: 1, unit: "bar" };
    engine.updateSettings(next); advance(h, 2.3);
    expect(events.filter((event) => event.barIndex === 0).every((event) => !event.randomMute)).toBe(true);
    expect(events.find((event) => event.barIndex === 1)?.randomMute).toBe(true);
    expect(engine.getSnapshot().timerDeadline).toBeCloseTo(10.06);
    engine.stop(); await engine.start();
    expect(engine.getSnapshot().timerRemainingSeconds).toBe(1);
    engine.dispose();
  });
  it("manual BPM immediately releases speed and the next unreserved interval uses it", async () => {
    const h = engineHarness(); const initial = config(); initial.practice.speedTrainer.enabled = true;
    const events: BeatEvent[] = [];
    const engine = new MetronomeEngine(initial, { onBeat: (event) => events.push(event) }, h.dependencies);
    await engine.start(); advance(h, 0.2);
    const next = structuredClone(initial); next.bpm = 150; next.practice.speedTrainer.enabled = false;
    engine.updateSettings(next, "manual"); advance(h, 1.4);
    expect(events.at(-1)?.bpm).toBe(150);
    const manual = events.filter((event) => event.bpm === 150);
    expect(manual[1].time - manual[0].time).toBeCloseTo(0.4);
    engine.dispose();
  });
  it("restarts with desired preset volume and cancels the old future volume automation", async () => {
    const h = engineHarness(); const initial = config(); initial.bpm = 120;
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); advance(h, 0.2);
    engine.updateSettings({ ...initial, volume: 0.2 }, "preset");
    engine.stop(); await engine.start();
    expect(h.context.gains[0].gain.value).toBe(0.2);
    engine.updateSettings({ ...initial, volume: 0.7 }, "preset");
    advance(h, 2.21, false);
    const master = h.context.gains[0].gain;
    const future = master.events.reduce((index, event, current) => event.type === "set" && event.value === 0.7 ? current : index, -1);
    expect(future).toBeGreaterThan(-1);
    expect(master.events[future].time).toBeGreaterThan(h.context.currentTime);
    engine.stop();
    expect(master.events.slice(future + 1).some((event) => event.type === "cancel" && event.time <= master.events[future].time)).toBe(true);
    engine.dispose();
  });
});

describe("R08 scheduled clicks and mixer boundaries", () => {
  it("reuses the already reserved click at 0.56 when unmuted at 0.51", async () => {
    const h = engineHarness();
    const initial = { ...config(), muted: true };
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); advance(h, 0.505);
    expect(h.context.oscillators.map(voice => voice.starts[0])).toEqual([0.06, 0.56]);
    h.tick(0.51); engine.updateSettings({ ...initial, muted: false });
    advance(h, 1.1);
    expect(h.context.oscillators.map(voice => voice.starts[0])).toEqual([0.06, 0.56, 1.06]);
    expect(engine.getDiagnostics().totalVoiceCount).toBe(3);
    engine.dispose();
  });

  it("keeps a preset gain and subdivision on the same effective bar", async () => {
    const h = engineHarness();
    const initial = config();
    const preset = { ...initial, volume: 0 };
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); advance(h, 0.20);
    engine.updateSettings(preset, "preset", "quiet");
    h.tick(0.30); engine.updateSettings({ ...preset, subdivision: "eighth" });
    advance(h, 1.95);
    const master = h.context.gains[0].gain;
    expect(master.events.filter(event => event.value === 0)).toEqual([]);
    advance(h, 2.01);
    expect(master.events.find(event => event.value === 0)?.time).toBeCloseTo(2.06);
    expect(engine.getSnapshot().currentEvent?.presetId).toBeNull();
    advance(h, 2.4);
    expect(engine.getSnapshot().currentEvent).toMatchObject({ presetId: "quiet", subdivision: "eighth" });
    expect(h.context.oscillators.map(source => source.starts[0])).toContain(2.31);
    engine.dispose();
  });

  it.each([false, true])("keeps the reserved level after mixer edits (replace volume %s)", async replaceVolume => {
    const h = engineHarness();
    const initial = config();
    const preset = { ...initial, volume: 0.20 };
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start(); advance(h, 0.20); engine.updateSettings(preset, "preset");
    advance(h, 2.00);
    const master = h.context.gains[0].gain;
    h.tick(2.01); engine.updateSettings({ ...preset, muted: true });
    expect(master.events.at(-1)).toMatchObject({time: 2.06, value: 0});
    h.tick(2.03); engine.updateSettings(preset);
    expect(master.events.at(-2)).toMatchObject({value: 0.82});
    expect(master.events.at(-1)).toMatchObject({time: 2.06, value: 0.20});
    h.tick(2.056);
    engine.updateSettings(replaceVolume ? { ...preset, volume: 0.40 } : { ...preset, muted: true });
    const segment = master.events.slice(master.events.map(event => event.type).lastIndexOf("cancel"));
    expect(segment.every(event => event.time <= 2.06)).toBe(true);
    expect(segment.at(-1)).toMatchObject({time: 2.06, value: replaceVolume ? 0.4 : 0});
    engine.dispose();
  });

  it("schedules the name of musically identical presets with each reserved bar", async () => {
    const h = engineHarness();
    const initial = config();
    const engine = new MetronomeEngine(initial, undefined, h.dependencies);
    await engine.start("A"); advance(h, .2);
    engine.updateSettings(initial, "preset", "B"); advance(h, 2.0);
    expect(engine.getSnapshot().currentEvent?.presetId).toBe("A");
    engine.updateSettings(initial, "preset", "C"); advance(h, 2.2);
    expect(engine.getSnapshot().currentEvent?.presetId).toBe("B");
    advance(h, 4.2);
    expect(engine.getSnapshot().currentEvent?.presetId).toBe("C");
    engine.dispose();
  });
});
