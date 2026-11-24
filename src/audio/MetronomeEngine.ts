import { MasterOutput } from "./MasterOutput";
import { clickSpecFor, scheduleClick, type ScheduledClick } from "./clickFactory";
import { EVENT_TIME_EPSILON, INTERRUPTION_SECONDS, LOOKAHEAD_MS, SCHEDULE_AHEAD_TIME, STOP_FADE_SECONDS, type SchedulerWorkerMessage } from "./schedulerTypes";
import { createPracticeSession, planNextEvent, type PlannerSettings, type PracticeSessionState } from "../domain/planner";
import { secondsPerSubdivision } from "../domain/rhythm";
import type { AppSettings, BeatEvent } from "../domain/types";
import { clampBpm, clampVolume } from "../domain/tempo";

export type EngineSettings = PlannerSettings;
export type TransportState = "idle" | "starting" | "playing" | "stopping" | "interrupted" | "error";
export type SettingsSource = "settings" | "manual" | "preset";
export interface EngineSnapshot {
  state: TransportState;
  error: string | null;
  sessionId: number;
  currentEvent: BeatEvent | null;
  pendingSettings: boolean;
  timerRemainingSeconds: number | null;
  mainStartedAt: number | null;
  timerDeadline: number | null;
}
export interface EngineCallbacks { onBeat: (event: BeatEvent, cellStart?: BeatEvent) => void }
export interface SchedulerPort {
  onmessage: ((event: MessageEvent<SchedulerWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: SchedulerWorkerMessage) => void;
  terminate: () => void;
}
export interface EngineDependencies {
  createAudioContext: () => AudioContext;
  createWorker: () => SchedulerPort;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  setTimer: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer: (id: ReturnType<typeof setTimeout>) => void;
  audioTime: (context: AudioContext) => number;
  random: () => number;
  diagnostics: boolean;
}
export interface ScheduleDiagnostic { sessionId: number; eventTime: number; scheduledAt: number; skipped: boolean; queueLength: number }
export const ENGINE_DIAGNOSTICS_ENABLED = import.meta.env.DEV || import.meta.env.MODE === "diagnostics";
const defaultDependencies: EngineDependencies = {
  createAudioContext() {
    const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) throw new Error("이 브라우저는 Web Audio를 지원하지 않습니다.");
    return new Constructor();
  },
  createWorker: () => new Worker(new URL("./schedulerWorker.ts", import.meta.url), { type: "module" }),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (id) => clearTimeout(id),
  audioTime: (context) => context.currentTime,
  random: () => Math.random(),
  diagnostics: ENGINE_DIAGNOSTICS_ENABLED,
};
export function settingsForEngine(settings: AppSettings): EngineSettings {
  return structuredClone({ bpm: clampBpm(settings.bpm), tempoUnit: settings.tempoUnit, beatGroups: settings.beatGroups,
    timeSignature: settings.timeSignature, subdivision: settings.subdivision, accents: settings.accents, sound: settings.sound,
    volume: clampVolume(settings.volume), muted: settings.muted, practice: settings.practice });
}

export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private output: MasterOutput | null = null;
  private desiredPresetId: string | null = null;
  private scheduledPresetId: string | null = null;
  private sessionGain: GainNode | null = null;
  private worker: SchedulerPort | null = null;
  private frameId: number | null = null;
  private generation = 0;
  private disposed = false;
  private startPromise: Promise<void> | null = null;
  private cancelReady: (() => void) | null = null;
  private settings: EngineSettings;
  private desiredSettings: EngineSettings;
  private pending: EngineSettings | null = null;
  private pendingAppliedAt: number | null = null;
  private callbacks: EngineCallbacks;
  private dependencies: EngineDependencies;
  private subscribers = new Set<() => void>();
  private sources = new Set<ScheduledClick>();
  private retiring = new Set<{ gain: GainNode; sources: ScheduledClick[]; timer: ReturnType<typeof setTimeout> }>();
  private notesInQueue: BeatEvent[] = [];
  private lastTickTime = 0;
  private plan: PracticeSessionState | null = null;
  private lastPlannedEvent: BeatEvent | null = null;
  private scheduledCutoff: number | null = null;
  private diagnostics: ScheduleDiagnostic[] = [];
  private lateEventCount = 0;
  private skippedEventCount = 0;
  private totalScheduledCount = 0;
  private totalAudibleScheduledCount = 0;
  private totalVoiceCount = 0;
  private firstScheduledTime: number | null = null;
  private lastScheduledTime: number | null = null;
  private maxQueueLength = 0;
  private maxWorkerTickGap = 0;
  private duplicateEventCount = 0;
  private visualDeliveredTime: number | null = null;
  private snapshot: EngineSnapshot = { state: "idle", error: null, sessionId: 0, currentEvent: null, pendingSettings: false,
    timerRemainingSeconds: null, mainStartedAt: null, timerDeadline: null };

  constructor(settings: EngineSettings, callbacks: EngineCallbacks = { onBeat: () => {} }, dependencies: Partial<EngineDependencies> = {}) {
    this.settings = structuredClone(settings);
    this.desiredSettings = structuredClone(settings);
    this.callbacks = callbacks;
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }
  getSnapshot = (): EngineSnapshot => this.snapshot;
  subscribe = (callback: () => void): (() => void) => { this.subscribers.add(callback); return () => this.subscribers.delete(callback); };
  setCallbacks(callbacks: EngineCallbacks): void { this.callbacks = callbacks; }
  getDiagnostics() { return { records: [...this.diagnostics], lateEventCount: this.lateEventCount, skippedEventCount: this.skippedEventCount,
    queueLength: this.notesInQueue.length, sessionId: this.generation, activeSources: this.sources.size,
    totalScheduledCount: this.totalScheduledCount, totalAudibleScheduledCount: this.totalAudibleScheduledCount, totalVoiceCount: this.totalVoiceCount,
    firstScheduledTime: this.firstScheduledTime, lastScheduledTime: this.lastScheduledTime, maxQueueLength: this.maxQueueLength,
    maxWorkerTickGap: this.maxWorkerTickGap, duplicateEventCount: this.duplicateEventCount, visualDeliveredTime: this.visualDeliveredTime }; }
  get isActive(): boolean { return this.snapshot.state === "playing"; }
  get currentTime(): number { return this.ctx ? this.dependencies.audioTime(this.ctx) : 0; }
  /** Undo just the transport effects of a canceled BPM drag, retaining the
   * current bar, timer, mixer changes and every already-reserved voice. */
  captureTempoRollback(): () => number | undefined {
    const sessionId = this.generation;
    const plan = this.plan;
    if (!this.isActive || !plan) return () => undefined;
    const saved = {
      bpm: this.settings.bpm, enabled: this.settings.practice.speedTrainer.enabled,
      trainingBpm: plan.bpm, segment: plan.speedSegmentStartBar,
      holding: plan.speedHolding, speedKey: plan.speedConfigKey,
    };
    return () => {
      if (sessionId !== this.generation || !this.isActive || !this.plan || this.plan.phase === "complete") return;
      this.settings.bpm = saved.bpm;
      this.settings.practice.speedTrainer.enabled = saved.enabled;
      this.plan.bpm = saved.trainingBpm;
      this.plan.speedSegmentStartBar = saved.segment;
      this.plan.speedHolding = saved.holding;
      this.plan.speedConfigKey = saved.speedKey;
      const bpm = saved.enabled ? saved.trainingBpm : saved.bpm;
      this.retimeNext(bpm);
      return bpm;
    };
  }
  private retimeNext(bpm: number): void {
    if (!this.plan || this.plan.phase === "complete" || !this.lastPlannedEvent) return;
    // Reserved events are immutable. Scheduler subsequently skips recalculated
    // positions that have already passed without creating catch-up voices.
    this.plan.time = this.lastPlannedEvent.time + secondsPerSubdivision(bpm, this.settings.subdivision, this.settings.timeSignature, this.settings.tempoUnit);
  }
  updateSettings(settings: EngineSettings, source: SettingsSource = "settings", presetId = this.desiredPresetId): void {
    if (JSON.stringify(settings) === JSON.stringify(this.desiredSettings) && presetId === this.desiredPresetId && source !== "manual") return;
    this.desiredPresetId = presetId;
    const previous = this.desiredSettings;
    this.desiredSettings = structuredClone(settings);
    if (!this.isActive) this.settings = structuredClone(settings);
    else {
      const next = structuredClone(settings);
      // Count-in and timer are session settings; live edits apply on the next start.
      next.practice.countInBars = this.settings.practice.countInBars;
      next.practice.timerSeconds = this.settings.practice.timerSeconds;
      const key = (value: EngineSettings) => JSON.stringify({ tempoUnit: value.tempoUnit, timeSignature: value.timeSignature, beatGroups: value.beatGroups,
        subdivision: value.subdivision, accents: value.accents, sound: value.sound, speed: value.practice.speedTrainer, gap: value.practice.gapTrainer, random: value.practice.randomMute });
      const shouldQueue = source === "preset" || this.pending !== null || key(previous) !== key(settings);
      if (shouldQueue) this.pending = next;
      if (source !== "preset") {
        const outputPatch: Partial<Pick<EngineSettings, "volume" | "muted">> = {};
        if (next.volume !== previous.volume) outputPatch.volume = next.volume;
        if (next.muted !== previous.muted) outputPatch.muted = next.muted;
        if (Object.keys(outputPatch).length) {
          Object.assign(this.settings, outputPatch);
          this.output?.edit(this.currentTime, outputPatch);
        }
        if (next.bpm !== previous.bpm || source === "manual") {
          this.settings.bpm = next.bpm;
          this.retimeNext(next.bpm);
        }
        if (source === "manual") this.settings.practice.speedTrainer.enabled = false;
      }
      if (shouldQueue) this.emit({ pendingSettings: true });
    }
  }
  start(presetId = this.desiredPresetId): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("오디오 엔진이 종료되었습니다."));
    if (this.snapshot.state === "playing") return Promise.resolve();
    if (this.snapshot.state === "starting" && this.startPromise) return this.startPromise;
    this.desiredPresetId = presetId;
    const sessionId = ++this.generation;
    this.emit({ state: "starting", error: null, sessionId, currentEvent: null });
    // Creation and resume are called synchronously on the user's gesture path.
    try {
      this.ensureContext();
      const worker = this.dependencies.createWorker();
      this.worker = worker;
      const resume = this.ctx!.state === "running" ? Promise.resolve() : this.ctx!.resume();
      this.startPromise = this.prepareWorker(worker, sessionId, resume).then(() => {
        if (this.disposed || sessionId !== this.generation) return;
        if (this.ctx!.state !== "running") throw new Error("오디오 재개가 허용되지 않았습니다. 재생을 다시 눌러 주세요.");
        this.sessionGain = this.ctx!.createGain();
        this.sessionGain.gain.setValueAtTime(1, this.currentTime);
        this.sessionGain.connect(this.masterGain!);
        this.resetTimeline();
        this.output = new MasterOutput(this.masterGain!.gain, this.currentTime, this.settings);
        this.lastTickTime = this.currentTime;
        this.emit({ state: "playing", timerRemainingSeconds: this.settings.practice.timerSeconds });
        this.scheduler();
        this.startVisualLoop(sessionId);
      }).catch((error: unknown) => {
        if (sessionId !== this.generation || this.disposed) return;
        this.finish("error", error instanceof Error ? error.message : "오디오 시작에 실패했습니다.");
        throw error;
      }).finally(() => { if (sessionId === this.generation) this.startPromise = null; });
      return this.startPromise;
    } catch (error) {
      this.finish("error", error instanceof Error ? error.message : "오디오 시작에 실패했습니다.");
      return Promise.reject(error);
    }
  }
  stop(): void { if (!this.disposed) this.finish("idle"); }
  dispose(): void {
    if (this.disposed) return;
    this.finish("idle");
    this.disposed = true;
    this.subscribers.clear();
    for (const item of this.retiring) { this.dependencies.clearTimer(item.timer); item.sources.forEach((source) => source.disconnect()); item.gain.disconnect(); }
    this.retiring.clear();
    if (this.ctx) { this.ctx.removeEventListener("statechange", this.onContextStateChange); void this.ctx.close().catch(() => {}); }
    this.masterGain?.disconnect();
    this.ctx = null;
    this.masterGain = null;
  }
  private emit(change: Partial<EngineSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const subscriber of this.subscribers) subscriber();
  }
  private ensureContext(): void {
    if (this.ctx) return;
    this.ctx = this.dependencies.createAudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.ctx.addEventListener("statechange", this.onContextStateChange);
  }
  private onContextStateChange = () => {
    if (this.isActive && this.ctx?.state !== "running") this.finish("interrupted", "오디오가 중단되었습니다. 재생을 누르면 새 연습을 시작합니다.");
  };
  private prepareWorker(worker: SchedulerPort, sessionId: number, resume: Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let workerReady = false;
      let audioReady = false;
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        this.dependencies.clearTimer(timeout);
        if (this.worker === worker) this.cancelReady = null;
        if (error) reject(error); else resolve();
      };
      const finishIfReady = () => { if (workerReady && audioReady) settle(); };
      const timeout = this.dependencies.setTimer(() => settle(new Error("오디오와 예약 Worker의 준비 시간이 초과되었습니다.")), 2000);
      resume.then(() => { audioReady = true; finishIfReady(); }, error => settle(error instanceof Error ? error : new Error("오디오를 재개하지 못했습니다.")));
      this.cancelReady = () => settle();
      worker.onmessage = (event) => {
        if (this.disposed || sessionId !== this.generation || event.data.sessionId !== sessionId) return;
        if (event.data.type === "ready") { workerReady = true; finishIfReady(); }
        if (event.data.type === "tick") this.scheduler();
      };
      worker.onerror = () => {
        const error = new Error("오디오 예약 Worker를 시작하거나 실행할 수 없습니다.");
        if (!settled) settle(error);
        else if (sessionId === this.generation) this.finish("error", error.message);
      };
      worker.postMessage({ type: "start", lookaheadMs: LOOKAHEAD_MS, sessionId });
    });
  }
  private finish(state: TransportState, error: string | null = null): void {
    ++this.generation;
    this.emit({ state: "stopping" });
    this.cancelReady?.();
    this.cancelReady = null;
    if (this.worker) { this.worker.onmessage = null; this.worker.onerror = null; this.worker.terminate(); this.worker = null; }
    if (this.frameId !== null) { this.dependencies.cancelFrame(this.frameId); this.frameId = null; }
    this.notesInQueue = [];
    this.output?.stop(this.currentTime);
    this.output = null;
    if (this.sessionGain) {
      const gain = this.sessionGain;
      const now = this.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + STOP_FADE_SECONDS);
      const sources = [...this.sources];
      for (const source of sources) source.cancel(now, STOP_FADE_SECONDS);
      const item = { gain, sources, timer: this.dependencies.setTimer(() => {
        sources.forEach((source) => source.disconnect()); gain.disconnect(); this.retiring.delete(item);
      }, 30) };
      this.retiring.add(item);
      this.sources.clear();
      this.sessionGain = null;
    }
    this.startPromise = null;
    this.emit({ state, error, sessionId: this.generation, currentEvent: null, pendingSettings: false,
      timerRemainingSeconds: null, timerDeadline: null, mainStartedAt: null });
  }
  private resetTimeline(): void {
    this.settings = structuredClone(this.desiredSettings);
    this.pending = null;
    this.pendingAppliedAt = null;
    this.notesInQueue = [];
    this.scheduledPresetId = this.desiredPresetId;
    this.plan = createPracticeSession(this.settings, this.currentTime + 0.06);
    this.lastPlannedEvent = null;
    this.scheduledCutoff = null;
    this.lastScheduledTime = this.firstScheduledTime = null;
    this.totalScheduledCount = this.totalAudibleScheduledCount = this.totalVoiceCount = this.duplicateEventCount = 0;
    this.maxQueueLength = this.maxWorkerTickGap = 0;
    this.lateEventCount = this.skippedEventCount = 0;
    this.diagnostics = [];
  }
  private scheduler(): void {
    if (!this.isActive || !this.ctx || !this.sessionGain || !this.plan) return;
    const now = this.currentTime;
    this.maxWorkerTickGap = Math.max(this.maxWorkerTickGap, now - this.lastTickTime);
    if (now - this.lastTickTime > INTERRUPTION_SECONDS) { this.finish("interrupted", "예약이 오래 중단되었습니다. 재생을 누르면 새 연습을 시작합니다."); return; }
    this.lastTickTime = now;
    if (this.scheduledCutoff !== null && now >= this.scheduledCutoff) { this.finish("idle"); return; }
    while (this.plan.phase !== "complete" && this.plan.time < now + SCHEDULE_AHEAD_TIME) {
      if (this.pending && this.plan.phase === "main" && this.plan.beatIndex === 0 && this.plan.subIndex === 0) {
        this.settings = this.pending;
        this.pending = null;
        this.pendingAppliedAt = this.plan.time;
        this.scheduledPresetId = this.desiredPresetId;
        this.output!.atBar(now, this.plan.time, this.settings);
      }
      const planned = planNextEvent(this.plan, this.settings, this.dependencies.random, this.generation);
      this.plan = planned.state;
      if (this.plan.mainStartedAt !== this.snapshot.mainStartedAt || this.plan.timerDeadline !== this.snapshot.timerDeadline) {
        this.emit({ mainStartedAt: this.plan.mainStartedAt, timerDeadline: this.plan.timerDeadline });
      }
      if (this.plan.timerDeadline !== null) this.scheduleCutoff(this.plan.timerDeadline);
      if (this.plan.stopAt !== null) this.scheduleCutoff(this.plan.stopAt);
      const event = planned.event;
      if (!event) break;
      event.presetId = this.scheduledPresetId;
      this.lastPlannedEvent = event;
      const skipped = event.time < now - EVENT_TIME_EPSILON;
      if (skipped) { this.lateEventCount++; this.skippedEventCount++; }
      else {
        this.notesInQueue.push(event);
        if (this.notesInQueue.length > 256) this.notesInQueue.shift();
        this.totalScheduledCount++;
        this.maxQueueLength = Math.max(this.maxQueueLength, this.notesInQueue.length);
        if (this.firstScheduledTime === null) this.firstScheduledTime = event.time;
        if (this.lastScheduledTime !== null && event.time <= this.lastScheduledTime) this.duplicateEventCount++;
        this.lastScheduledTime = event.time;
        if (!event.accentRest && !event.gapMute && !event.randomMute) {
          const click = clickSpecFor(event.accent, this.settings.sound);
          if (click) {
            this.totalVoiceCount++;
            if (event.isAudible && this.settings.volume > 0) this.totalAudibleScheduledCount++;
            this.sources.add(scheduleClick(this.ctx, this.sessionGain, Math.max(event.time, now), click, this.settings.sound, source => this.sources.delete(source)));
          }
        }
      }
      if (this.dependencies.diagnostics) {
        this.diagnostics.push({ sessionId: this.generation, eventTime: event.time, scheduledAt: now, skipped, queueLength: this.notesInQueue.length });
        if (this.diagnostics.length > 512) this.diagnostics.shift();
      }
    }
    const remaining = this.snapshot.timerDeadline === null ? this.plan.timerSeconds : Math.min(this.plan.timerSeconds ?? Infinity, Math.max(0, Math.ceil(this.snapshot.timerDeadline - now)));
    if (remaining !== this.snapshot.timerRemainingSeconds) this.emit({ timerRemainingSeconds: remaining });
  }
  private scheduleCutoff(time: number): void {
    if (!this.sessionGain || (this.scheduledCutoff !== null && this.scheduledCutoff <= time)) return;
    this.scheduledCutoff = time;
    const start = Math.max(this.currentTime, time - STOP_FADE_SECONDS);
    this.sessionGain.gain.cancelScheduledValues(start);
    this.sessionGain.gain.setValueAtTime(1, start);
    this.sessionGain.gain.linearRampToValueAtTime(0, Math.max(start, time));
  }
  private startVisualLoop(sessionId: number): void {
    const loop = () => {
      if (!this.isActive || sessionId !== this.generation) return;
      let latest: BeatEvent | undefined;
      let cellStart: BeatEvent | undefined;
      while (this.notesInQueue.length && this.notesInQueue[0].time <= this.currentTime) {
        latest = this.notesInQueue.shift()!;
        if (latest.subIndex === 0) cellStart = latest.showVisual ? latest : undefined;
      }
      if (latest) {
        this.visualDeliveredTime = this.currentTime;
        const pendingSettings = this.pending !== null || (this.pendingAppliedAt !== null && latest.time < this.pendingAppliedAt);
        if (!pendingSettings) this.pendingAppliedAt = null;
        this.emit({ currentEvent: latest, pendingSettings }); this.callbacks.onBeat(latest, latest.showVisual ? cellStart : undefined);
      }
      this.frameId = this.dependencies.requestFrame(loop);
    };
    this.frameId = this.dependencies.requestFrame(loop);
  }
}
