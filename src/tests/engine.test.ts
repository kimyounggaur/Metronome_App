import { describe, expect, it, vi } from "vitest";
import { MetronomeEngine, settingsForEngine } from "../audio/MetronomeEngine";
import { defaultSettings } from "../domain/presets";
import { engineHarness } from "./audioHarness";

const settings = () => settingsForEngine(defaultSettings);
describe("engine lifecycle", () => {
  it("waits for resume and Worker ready, and cannot resurrect after stop", async () => {
    const h = engineHarness(false);
    h.context.state = "suspended";
    let unlock!: () => void;
    h.context.resume.mockImplementation(() => new Promise<void>((resolve) => { unlock = () => { h.context.state = "running"; resolve(); }; }));
    const engine = new MetronomeEngine(settings(), undefined, h.dependencies);
    const pending = engine.start();
    expect(engine.getSnapshot().state).toBe("starting");
    engine.stop(); unlock();
    await pending;
    expect(engine.getSnapshot().state).toBe("idle");
    expect(h.context.oscillators).toHaveLength(0);
    expect(h.workers[0].terminated).toBe(true);
    engine.dispose();
  });
  it("keeps only one worker, frame and session across 50 starts and stops", async () => {
    const h = engineHarness();
    const engine = new MetronomeEngine(settings(), undefined, h.dependencies);
    for (let i = 0; i < 50; i++) {
      const a = engine.start(); const b = engine.start(); expect(a).toBe(b);
      await a;
      expect(h.workers.filter((worker) => !worker.terminated)).toHaveLength(1);
      expect(h.frames.size).toBe(1);
      engine.stop();
      expect(h.frames.size).toBe(0);
    }
    engine.dispose();
    expect(h.context.close).toHaveBeenCalledOnce();
  });
  it("start-stop-start ignores the old unlock while the new session runs", async () => {
    const h = engineHarness(); h.context.state = "suspended";
    const unlocks: (() => void)[] = [];
    h.context.resume.mockImplementation(() => new Promise<void>((resolve) => unlocks.push(() => { h.context.state = "running"; resolve(); })));
    const engine = new MetronomeEngine(settings(), undefined, h.dependencies);
    const old = engine.start(); engine.stop(); const current = engine.start();
    unlocks[1](); await current;
    const session = engine.getSnapshot().sessionId;
    const count = h.context.oscillators.length;
    unlocks[0](); await old;
    expect(engine.getSnapshot()).toMatchObject({ state: "playing", sessionId: session });
    expect(h.context.oscillators).toHaveLength(count);
    expect(h.workers.filter((worker) => !worker.terminated)).toHaveLength(1);
    engine.dispose();
  });
  it("cancels every future source and fades the session in eight milliseconds", async () => {
    const h = engineHarness(); const engine = new MetronomeEngine({ ...settings(), bpm: 300, subdivision: "sixteenth" }, undefined, h.dependencies);
    await engine.start();
    const oldSession = h.context.gains[1];
    engine.stop();
    for (const osc of h.context.oscillators) expect(osc.stops.at(-1)).toBe(0);
    expect(oldSession.gain.events).toContainEqual({ type: "linear", value: 0, time: 0.008 });
    await engine.start();
    expect(h.context.gains[1]).toBe(oldSession);
    expect(oldSession.gain.events.at(-1)?.value).toBe(0);
    engine.dispose();
  });
  it.each([0.2, 2, 30])("never schedules past clicks after %ss delay", async (delay) => {
    const h = engineHarness(); const engine = new MetronomeEngine({ ...settings(), bpm: 300, subdivision: "sixteenth" }, undefined, h.dependencies);
    await engine.start(); const count = h.context.oscillators.length;
    h.tick(delay);
    expect(h.context.oscillators.slice(count).every((osc) => osc.starts[0] >= delay)).toBe(true);
    expect(engine.getSnapshot().state).toBe(delay > 0.5 ? "interrupted" : "playing");
    if (delay === 0.2) expect(engine.getDiagnostics().skippedEventCount).toBeGreaterThan(0);
    engine.dispose();
  });
  it("uses latest callbacks and coalesces old visual events", async () => {
    const h = engineHarness(); const old = vi.fn(); const next = vi.fn();
    const engine = new MetronomeEngine({ ...settings(), bpm: 300, subdivision: "sixteenth" }, { onBeat: old }, h.dependencies);
    await engine.start(); engine.setCallbacks({ onBeat: next });
    h.tick(0.08); h.tick(0.16); h.frame();
    expect(old).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledOnce();
    engine.dispose(); h.tick(0.24); h.frame(); expect(next).toHaveBeenCalledOnce();
  });
  it("recovers from resume failure and rejects stale worker messages", async () => {
    const h = engineHarness(); h.context.state = "suspended";
    h.context.resume.mockRejectedValueOnce(new Error("blocked"));
    const engine = new MetronomeEngine(settings(), undefined, h.dependencies);
    await expect(engine.start()).rejects.toThrow("blocked");
    expect(engine.getSnapshot().state).toBe("error");
    await engine.start();
    const count = h.context.oscillators.length;
    h.workers[0].send("tick");
    expect(h.context.oscillators).toHaveLength(count);
    engine.dispose();
  });
  it("stops on runtime Worker or AudioContext interruption and cleans listeners on dispose", async () => {
    const h = engineHarness(); const engine = new MetronomeEngine(settings(), undefined, h.dependencies);
    await engine.start();
    h.workers[0].onerror?.({} as ErrorEvent);
    expect(engine.getSnapshot().state).toBe("error");
    expect(h.workers[0].terminated).toBe(true);
    await engine.start(); h.context.interrupt();
    expect(engine.getSnapshot().state).toBe("interrupted");
    engine.dispose();
    expect(h.context.listeners.size).toBe(0);
    expect(h.frames.size).toBe(0);
  });
  it("fails a Worker that never becomes ready and permits retry", async () => {
    vi.useFakeTimers();
    const h = engineHarness(false); const engine = new MetronomeEngine(settings(), undefined, h.dependencies);
    const rejected = expect(engine.start()).rejects.toThrow("준비 시간");
    await vi.advanceTimersByTimeAsync(2000); await rejected;
    expect(engine.getSnapshot().state).toBe("error");
    const retry = engine.start(); h.workers.at(-1)!.send("ready"); await retry;
    expect(engine.isActive).toBe(true); engine.dispose(); vi.useRealTimers();
  });
  it("applies user volume once and keeps envelope relative", async () => {
    for (const volume of [0, 0.5, 1]) {
      const h = engineHarness(); const engine = new MetronomeEngine({ ...settings(), volume }, undefined, h.dependencies);
      await engine.start();
      expect(h.context.gains[0].gain.value).toBe(volume);
      expect(h.context.gains[2].gain.events.find((event) => event.type === "exponential")?.value).toBe(1);
      engine.dispose();
    }
  });
  it("keeps diagnostics bounded during ten virtual minutes", async () => {
    const h = engineHarness(); const engine = new MetronomeEngine({ ...settings(), bpm: 300, subdivision: "sixteenth" }, undefined, h.dependencies);
    await engine.start();
    for (let step = 1; step <= 24000; step++) { h.tick(step * 0.025); if (step % 4 === 0) h.frame(); }
    const diag = engine.getDiagnostics();
    expect(diag.records).toHaveLength(512);
    expect(diag.records.every((record) => record.skipped || record.eventTime >= record.scheduledAt)).toBe(true);
    expect(diag.queueLength).toBeLessThanOrEqual(256);
    expect(diag.activeSources).toBeLessThan(10);
    engine.dispose();
  });
});
