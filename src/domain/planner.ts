import { advancePosition, secondsPerSubdivision, subdivisionCount } from "./rhythm";
import { isGapMutedBar } from "./practiceModes";
import { clampBpm } from "./tempo";
import type { AppSettings, BeatEvent } from "./types";

export type PlannerSettings = Pick<AppSettings, "bpm" | "tempoUnit" | "beatGroups" | "timeSignature" | "subdivision" | "accents" | "sound" | "volume" | "muted" | "practice">;
export interface PracticeSessionState {
  phase: "count-in" | "main" | "complete";
  beatIndex: number;
  subIndex: number;
  barIndex: number;
  countInRemainingBeats: number;
  time: number;
  bpm: number;
  mainStartedAt: number | null;
  timerDeadline: number | null;
  timerSeconds: number | null;
  speedSegmentStartBar: number;
  speedHolding: boolean;
  speedConfigKey: string;
  randomBeatMuted: boolean;
  randomBarMuted: boolean;
  stopAt: number | null;
  completionReason: "timer" | "speed" | null;
}
export interface PlannedEvent { event: BeatEvent | null; state: PracticeSessionState }
export function createPracticeSession(settings: PlannerSettings, startTime: number): PracticeSessionState {
  const countIn = settings.practice.countInBars * settings.timeSignature.beats;
  return { phase: countIn > 0 ? "count-in" : "main", beatIndex: 0, subIndex: 0, barIndex: 0,
    countInRemainingBeats: countIn, time: startTime, bpm: settings.practice.speedTrainer.enabled ? settings.practice.speedTrainer.startBpm : settings.bpm,
    mainStartedAt: null, timerDeadline: null, timerSeconds: settings.practice.timerSeconds, speedSegmentStartBar: 0,
    speedHolding: false, speedConfigKey: JSON.stringify(settings.practice.speedTrainer), randomBeatMuted: false, randomBarMuted: false,
    stopAt: null, completionReason: null };
}
function drawMute(enabled: boolean, probability: number, random: () => number): boolean {
  if (!enabled || probability <= 0) return false;
  return probability >= 1 || random() < probability;
}
/** Pure timeline transition. RNG is an explicit dependency; no UI clock or effects are read. */
export function planNextEvent(previous: PracticeSessionState, settings: PlannerSettings, random: () => number, sessionId = 0): PlannedEvent {
  const state = { ...previous };
  if (state.phase === "complete") return { event: null, state };
  const speed = settings.practice.speedTrainer;
  const speedKey = JSON.stringify(speed);
  if (!speed.enabled) state.bpm = settings.bpm;
  if (speedKey !== state.speedConfigKey) {
    state.speedConfigKey = speedKey;
    state.bpm = speed.enabled ? speed.startBpm : settings.bpm;
    state.speedSegmentStartBar = state.barIndex;
    state.speedHolding = false;
  }
  const main = state.phase === "main";
  if (main && state.mainStartedAt === null) {
    state.mainStartedAt = state.time;
    state.timerDeadline = state.timerSeconds === null ? null : state.time + state.timerSeconds;
  }
  if (state.timerDeadline !== null && state.time >= state.timerDeadline - 1e-9) {
    return { event: null, state: { ...state, phase: "complete", stopAt: state.timerDeadline, completionReason: "timer" } };
  }
  const barStart = state.beatIndex === 0 && state.subIndex === 0;
  if (main && barStart && speed.enabled && !state.speedHolding && state.barIndex >= state.speedSegmentStartBar + speed.everyBars) {
    if (state.bpm === speed.targetBpm) {
      if (speed.onReach === "stop") return { event: null, state: { ...state, phase: "complete", stopAt: state.time, completionReason: "speed" } };
      if (speed.onReach === "hold") state.speedHolding = true;
      if (speed.onReach === "loop") state.bpm = speed.startBpm;
    } else {
      const direction = Math.sign(speed.targetBpm - state.bpm);
      state.bpm = clampBpm(state.bpm + direction * Math.min(Math.abs(speed.step), Math.abs(speed.targetBpm - state.bpm)));
    }
    state.speedSegmentStartBar = state.barIndex;
  }
  const randomMute = settings.practice.randomMute;
  if (main && state.subIndex === 0) {
    if (barStart) state.randomBarMuted = drawMute(randomMute.enabled && randomMute.unit === "bar", randomMute.probability, random);
    state.randomBeatMuted = drawMute(randomMute.enabled && randomMute.unit === "beat", randomMute.probability, random);
  }
  const gap = settings.practice.gapTrainer;
  const gapMuted = main && gap.enabled && isGapMutedBar(state.barIndex, gap.playBars, gap.muteBars);
  const randomMuted = main && (randomMute.unit === "bar" ? state.randomBarMuted : state.randomBeatMuted);
  const accentRest = settings.accents[state.beatIndex] === "mute";
  const accent = state.subIndex > 0 ? "subdivision" : settings.accents[state.beatIndex] ?? (state.beatIndex === 0 ? "strong" : "normal");
  const event: BeatEvent = { beatIndex: state.beatIndex, subIndex: state.subIndex, barIndex: state.barIndex,
    time: state.time, phase: main ? "main" : "count-in", isAudible: !settings.muted && !accentRest && !gapMuted && !randomMuted,
    accent, countInRemainingBeats: main ? 0 : state.countInRemainingBeats, isGapMuted: gapMuted,
    sessionId, bpm: state.bpm, tempoUnit: settings.tempoUnit, timeSignature: { ...settings.timeSignature },
    subdivision: settings.subdivision, beatGroups: [...settings.beatGroups], accents: [...settings.accents],
    globalMute: settings.muted, accentRest, gapMute: gapMuted, randomMute: randomMuted,
    showVisual: gap.keepVisual || (!gapMuted && !randomMuted), mainStartedAt: state.mainStartedAt, timerDeadline: state.timerDeadline };
  const lastSubdivision = state.subIndex === subdivisionCount(settings.subdivision) - 1;
  state.time += secondsPerSubdivision(state.bpm, settings.subdivision, settings.timeSignature, settings.tempoUnit);
  if (!main && lastSubdivision && --state.countInRemainingBeats <= 0) {
    state.phase = "main"; state.beatIndex = state.subIndex = state.barIndex = 0;
    state.randomBeatMuted = state.randomBarMuted = false;
  } else {
    const next = advancePosition(state.beatIndex, state.subIndex, settings.subdivision, settings.timeSignature.beats);
    state.beatIndex = next.beatIndex; state.subIndex = next.subIndex;
    if (main && next.didStartNewBar) state.barIndex++;
  }
  return { event, state };
}
