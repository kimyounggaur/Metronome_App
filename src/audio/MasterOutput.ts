import { STOP_FADE_SECONDS } from "./schedulerTypes";

type Level = { volume: number; muted: boolean };
const amplitude = (level: Level) => level.muted ? 0 : level.volume;

/** Keeps already reserved bar changes independent from immediate mixer edits. */
export class MasterOutput {
  private effective: Level;
  private scheduled: { at: number; level: Level }[] = [];
  private ramp: { start: number; end: number; from: number; to: number } | null = null;

  constructor(private readonly gain: AudioParam, now: number, level: Level) {
    this.effective = { volume: level.volume, muted: level.muted };
    this.gain.cancelScheduledValues(now);
    this.gain.setValueAtTime(amplitude(level), now);
  }

  private advance(now: number) {
    while (this.scheduled.length && this.scheduled[0].at <= now) {
      this.effective = this.scheduled.shift()!.level;
      this.ramp = null;
    }
  }

  private valueAt(now: number) {
    if (!this.ramp || now >= this.ramp.end) return amplitude(this.effective);
    const { start, end, from, to } = this.ramp;
    return from + (to - from) * (now - start) / (end - start);
  }

  atBar(now: number, at: number, level: Level) {
    this.advance(now);
    const entry = { at: Math.max(now, at), level: { volume: level.volume, muted: level.muted } };
    if (this.ramp && this.ramp.end >= entry.at) {
      // Preserve the part of the in-flight ramp before the bar without writing
      // an old target after the boundary.
      const value = this.valueAt(entry.at);
      this.gain.cancelScheduledValues(entry.at);
      this.gain.linearRampToValueAtTime(value, entry.at);
    }
    this.gain.setValueAtTime(amplitude(level), entry.at);
    this.scheduled.push(entry);
  }

  edit(now: number, patch: Partial<Level>) {
    this.advance(now);
    const held = this.valueAt(now);
    Object.assign(this.effective, patch);
    const target = amplitude(this.effective);
    const end = Math.min(now + STOP_FADE_SECONDS, this.scheduled[0]?.at ?? Infinity);
    this.gain.cancelScheduledValues(now);
    this.gain.setValueAtTime(held, now);
    this.gain.linearRampToValueAtTime(target, end);
    this.ramp = { start: now, end, from: held, to: target };
    for (const entry of this.scheduled) {
      Object.assign(entry.level, patch);
      this.gain.setValueAtTime(amplitude(entry.level), entry.at);
    }
  }

  stop(now: number) {
    this.advance(now);
    const held = this.valueAt(now);
    this.gain.cancelScheduledValues(now);
    this.gain.setValueAtTime(held, now);
    this.scheduled = [];
    this.ramp = null;
  }
}
