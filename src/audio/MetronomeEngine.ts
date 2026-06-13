import { clickSpecFor, scheduleClick } from "./clickFactory";
import { LOOKAHEAD_MS, SCHEDULE_AHEAD_TIME, type SchedulerWorkerMessage } from "./schedulerTypes";
import { advancePosition, secondsPerSubdivision, subdivisionCount } from "../domain/rhythm";
import { isGapMutedBar } from "../domain/practiceModes";
import type { AccentLevel, AppSettings, BeatEvent, PracticeSettings, SoundType, Subdivision, TimeSignature } from "../domain/types";
import { clampBpm, clampVolume } from "../domain/tempo";

type AudioContextConstructor = typeof AudioContext;

interface BrowserWindow extends Window {
  webkitAudioContext?: AudioContextConstructor;
}

interface EngineSettings {
  bpm: number;
  timeSignature: TimeSignature;
  subdivision: Subdivision;
  accents: AccentLevel[];
  sound: SoundType;
  volume: number;
  muted: boolean;
  practice: PracticeSettings;
}

interface EngineCallbacks {
  onBeat: (event: BeatEvent) => void;
}

export function settingsForEngine(settings: AppSettings): EngineSettings {
  return {
    bpm: clampBpm(settings.bpm),
    timeSignature: settings.timeSignature,
    subdivision: settings.subdivision,
    accents: settings.accents,
    sound: settings.sound,
    volume: clampVolume(settings.volume),
    muted: settings.muted,
    practice: settings.practice,
  };
}

export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private worker: Worker | null = null;
  private frameId: number | null = null;
  private isRunning = false;
  private settings: EngineSettings;
  private callbacks: EngineCallbacks;
  private notesInQueue: BeatEvent[] = [];
  private nextNoteTime = 0;
  private beatIndex = 0;
  private subIndex = 0;
  private barIndex = 0;
  private phase: BeatEvent["phase"] = "main";
  private countInRemainingBeats = 0;
  private randomBarMuted = false;

  constructor(settings: EngineSettings, callbacks: EngineCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
  }

  updateSettings(settings: EngineSettings): void {
    this.settings = settings;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(settings.muted ? 0.0001 : clampVolume(settings.volume), this.ctx.currentTime, 0.01);
    }
  }

  async start(): Promise<void> {
    await this.ensureAudioUnlocked();
    if (!this.ctx || !this.masterGain) return;

    this.resetTimeline();
    this.masterGain.gain.setValueAtTime(this.settings.muted ? 0.0001 : clampVolume(this.settings.volume), this.ctx.currentTime);
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    this.isRunning = true;
    this.startWorker();
    this.startVisualLoop();
  }

  stop(): void {
    this.isRunning = false;
    this.notesInQueue = [];
    this.stopWorker();

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  get isActive(): boolean {
    return this.isRunning;
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private async ensureAudioUnlocked(): Promise<void> {
    if (!this.ctx) {
      const browserWindow = window as BrowserWindow;
      const Constructor = window.AudioContext ?? browserWindow.webkitAudioContext;
      if (!Constructor) {
        throw new Error("Web Audio API is not supported in this browser.");
      }
      this.ctx = new Constructor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const buffer = this.ctx.createBuffer(1, 1, 22050);
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    source.buffer = buffer;
    source.connect(gain).connect(this.ctx.destination);
    source.start(0);
  }

  private resetTimeline(): void {
    this.beatIndex = 0;
    this.subIndex = 0;
    this.barIndex = 0;
    this.notesInQueue = [];
    this.countInRemainingBeats = this.settings.practice.countInBars * this.settings.timeSignature.beats;
    this.phase = this.countInRemainingBeats > 0 ? "count-in" : "main";
    this.randomBarMuted = this.shouldRandomMuteBar();
  }

  private startWorker(): void {
    this.stopWorker();
    this.worker = new Worker(new URL("./schedulerWorker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<SchedulerWorkerMessage>) => {
      if (event.data.type === "tick") {
        this.scheduler();
      }
    };
    this.worker.postMessage({ type: "start", lookaheadMs: LOOKAHEAD_MS } satisfies SchedulerWorkerMessage);
  }

  private stopWorker(): void {
    if (!this.worker) return;
    this.worker.postMessage({ type: "stop" } satisfies SchedulerWorkerMessage);
    this.worker.terminate();
    this.worker = null;
  }

  private scheduler(): void {
    if (!this.isRunning || !this.ctx || !this.masterGain) return;

    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD_TIME) {
      const event = this.createBeatEvent(this.nextNoteTime);
      this.notesInQueue.push(event);

      if (event.isAudible) {
        const click = clickSpecFor(event.accent, this.settings.sound, clampVolume(this.settings.volume));
        if (click) {
          scheduleClick(this.ctx, this.masterGain, event.time, click, this.settings.sound);
        }
      }

      this.advanceNote();
    }
  }

  private createBeatEvent(time: number): BeatEvent {
    const isSubdivision = this.subIndex > 0;
    const accent = isSubdivision ? "subdivision" : this.settings.accents[this.beatIndex] ?? (this.beatIndex === 0 ? "strong" : "normal");
    const gapMuted =
      this.phase === "main" &&
      this.settings.practice.gapTrainer.enabled &&
      isGapMutedBar(this.barIndex, this.settings.practice.gapTrainer.playBars, this.settings.practice.gapTrainer.muteBars);
    const randomMuted = this.phase === "main" && this.shouldRandomMuteBeat(isSubdivision);
    const audibleAccent = accent !== "mute" && !gapMuted && !randomMuted;

    return {
      beatIndex: this.beatIndex,
      subIndex: this.subIndex,
      barIndex: this.barIndex,
      time,
      phase: this.phase,
      isAudible: !this.settings.muted && audibleAccent,
      isGapMuted: gapMuted,
      accent,
      countInRemainingBeats: this.phase === "count-in" ? this.countInRemainingBeats : 0,
    };
  }

  private advanceNote(): void {
    const subdivisions = subdivisionCount(this.settings.subdivision);
    const isLastSubdivisionInBeat = this.subIndex === subdivisions - 1;
    this.nextNoteTime += secondsPerSubdivision(this.settings.bpm, this.settings.subdivision);

    if (this.phase === "count-in" && isLastSubdivisionInBeat) {
      this.countInRemainingBeats -= 1;
      if (this.countInRemainingBeats <= 0) {
        this.phase = "main";
        this.beatIndex = 0;
        this.subIndex = 0;
        this.barIndex = 0;
        this.randomBarMuted = this.shouldRandomMuteBar();
        return;
      }
    }

    const next = advancePosition(this.beatIndex, this.subIndex, this.settings.subdivision, this.settings.timeSignature.beats);
    this.beatIndex = next.beatIndex;
    this.subIndex = next.subIndex;

    if (this.phase === "main" && next.didStartNewBar) {
      this.barIndex += 1;
      this.randomBarMuted = this.shouldRandomMuteBar();
    }
  }

  private shouldRandomMuteBar(): boolean {
    const randomMute = this.settings.practice.randomMute;
    return randomMute.enabled && randomMute.unit === "bar" && Math.random() < randomMute.probability;
  }

  private shouldRandomMuteBeat(isSubdivision: boolean): boolean {
    const randomMute = this.settings.practice.randomMute;
    if (!randomMute.enabled || randomMute.probability <= 0) return false;
    if (randomMute.unit === "bar") return this.randomBarMuted;
    return !isSubdivision && Math.random() < randomMute.probability;
  }

  private startVisualLoop(): void {
    const loop = () => {
      if (!this.isRunning || !this.ctx) return;
      const now = this.ctx.currentTime;

      while (this.notesInQueue.length > 0 && this.notesInQueue[0].time <= now) {
        const event = this.notesInQueue.shift();
        if (event) {
          this.callbacks.onBeat(event);
        }
      }

      this.frameId = requestAnimationFrame(loop);
    };

    this.frameId = requestAnimationFrame(loop);
  }
}
