import type { AccentLevel, SoundType } from "../domain/types";

export type ClickLevel = AccentLevel | "subdivision";

export interface ClickSpec {
  level: ClickLevel;
  frequency: number;
  duration: number;
  volume: number;
  waveform: OscillatorType;
}

export function clickSpecFor(level: ClickLevel, sound: SoundType, masterVolume: number): ClickSpec | null {
  if (level === "mute") return null;

  const base: Record<Exclude<ClickLevel, "mute">, Omit<ClickSpec, "waveform">> = {
    strong: { level: "strong", frequency: 1400, duration: 0.035, volume: 1 },
    normal: { level: "normal", frequency: 900, duration: 0.025, volume: 0.75 },
    soft: { level: "soft", frequency: 650, duration: 0.02, volume: 0.45 },
    subdivision: { level: "subdivision", frequency: 500, duration: 0.015, volume: 0.25 },
  };

  const waveform: Record<SoundType, OscillatorType> = {
    classic: level === "strong" ? "triangle" : "sine",
    wood: "triangle",
    digital: "square",
  };

  const spec = base[level];
  return {
    ...spec,
    waveform: waveform[sound],
    volume: Math.max(0.0001, spec.volume * masterVolume),
  };
}

export function scheduleClick(ctx: AudioContext, masterGain: GainNode, time: number, spec: ClickSpec, sound: SoundType): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  let output: AudioNode = gain;

  osc.type = spec.waveform;
  osc.frequency.setValueAtTime(spec.frequency, time);

  if (sound === "wood") {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(spec.frequency * 0.8, time);
    filter.Q.setValueAtTime(7, time);
    gain.connect(filter);
    output = filter;
  }

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, spec.volume), time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + spec.duration);

  osc.connect(gain);
  output.connect(masterGain);
  osc.start(time);
  osc.stop(time + spec.duration + 0.01);
}
