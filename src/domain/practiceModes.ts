import type { PracticeSettings } from "./types";

export const defaultPracticeSettings: PracticeSettings = {
  countInBars: 0,
  timerSeconds: null,
  speedTrainer: {
    enabled: false,
    startBpm: 80,
    targetBpm: 120,
    step: 2,
    everyBars: 4,
    onReach: "hold",
  },
  gapTrainer: {
    enabled: false,
    playBars: 3,
    muteBars: 1,
    keepVisual: true,
  },
  randomMute: {
    enabled: false,
    probability: 0,
    unit: "beat",
  },
};

export function isGapMutedBar(barIndex: number, playBars: number, muteBars: number): boolean {
  if (playBars <= 0 || muteBars <= 0) return false;
  const cycle = playBars + muteBars;
  return barIndex % cycle >= playBars;
}

export function nextSpeedTrainerBpm(
  currentBpm: number,
  targetBpm: number,
  step: number,
  onReach: "stop" | "hold" | "loop",
  startBpm: number,
): { bpm: number; reached: boolean; shouldStop: boolean } {
  // Called after a full interval, so a newly reached target plays one full interval.
  if (currentBpm === targetBpm) {
    return { bpm: onReach === "loop" ? startBpm : targetBpm, reached: true, shouldStop: onReach === "stop" };
  }
  const distance = targetBpm - currentBpm;
  const next = currentBpm + Math.sign(distance) * Math.min(Math.abs(step), Math.abs(distance));
  return { bpm: next, reached: next === targetBpm, shouldStop: false };
}
