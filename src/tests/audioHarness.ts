import { vi } from "vitest";
import type { EngineDependencies, SchedulerPort } from "../audio/MetronomeEngine";
import type { SchedulerWorkerMessage } from "../audio/schedulerTypes";
export class FakeParam {
  value = 1;
  events: { type: string; value?: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: "set", value, time }); return this; }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: "linear", value, time }); return this; }
  exponentialRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: "exponential", value, time }); return this; }
  setTargetAtTime(value: number, time: number) { this.value = value; this.events.push({ type: "target", value, time }); return this; }
  cancelScheduledValues(time: number) { this.events.push({ type: "cancel", time }); return this; }
}
class FakeNode {
  connected: unknown[] = [];
  disconnect = vi.fn(() => { this.connected = []; });
  connect<T>(node: T): T { this.connected.push(node); return node; }
}
export class FakeGain extends FakeNode { gain = new FakeParam(); }
export class FakeOscillator extends FakeNode {
  frequency = new FakeParam();
  type = "sine";
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: number[] = [];
  start(time: number) { this.starts.push(time); }
  stop(time: number) { this.stops.push(time); }
}
export class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = "running";
  destination = new FakeNode();
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  pendingOscillators = new Set<FakeOscillator>();
  listeners = new Set<() => void>();
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  createGain() { const node = new FakeGain(); this.gains.push(node); return node; }
  createOscillator() { const node = new FakeOscillator(); this.oscillators.push(node); this.pendingOscillators.add(node); return node; }
  createBiquadFilter() { return Object.assign(new FakeNode(), { frequency: new FakeParam(), Q: new FakeParam(), type: "bandpass" }); }
  addEventListener(_name: string, callback: () => void) { this.listeners.add(callback); }
  removeEventListener(_name: string, callback: () => void) { this.listeners.delete(callback); }
  interrupt() { this.state = "suspended"; this.listeners.forEach((listener) => listener()); }
}
export class FakeWorker implements SchedulerPort {
  onmessage: SchedulerPort["onmessage"] = null;
  onerror: SchedulerPort["onerror"] = null;
  terminated = false;
  sessionId = 0;
  constructor(private automaticReady: boolean) {}
  postMessage(message: SchedulerWorkerMessage) {
    if (message.type === "start") { this.sessionId = message.sessionId; if (this.automaticReady) queueMicrotask(() => this.send("ready")); }
  }
  terminate() { this.terminated = true; }
  send(type: "tick" | "ready", sessionId = this.sessionId) { this.onmessage?.({ data: { type, sessionId } } as MessageEvent<SchedulerWorkerMessage>); }
}
export function engineHarness(automaticReady = true) {
  const context = new FakeAudioContext();
  const workers: FakeWorker[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const dependencies: Partial<EngineDependencies> = {
    createAudioContext: () => context as unknown as AudioContext,
    createWorker: () => { const worker = new FakeWorker(automaticReady); workers.push(worker); return worker; },
    requestFrame: (callback) => { const id = ++frameId; frames.set(id, callback); return id; },
    cancelFrame: (id) => { frames.delete(id); },
    random: () => 0.5, diagnostics: true,
  };
  const tick = (time: number) => {
    context.currentTime = time;
    for (const osc of context.pendingOscillators) {
      if (osc.stops.at(-1)! <= time) {
        context.pendingOscillators.delete(osc);
        osc.onended?.();
      }
    }
    workers.filter((worker) => !worker.terminated).forEach((worker) => worker.send("tick"));
  };
  const frame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(0)); };
  return { context, workers, frames, dependencies, tick, frame };
}
