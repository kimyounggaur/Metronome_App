import type { PracticeSettings } from "./types";

export const defaultPracticeSettings: PracticeSettings = {
  countInBars: 0,
  timerMinutes: null,
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
  const next = currentBpm + Math.abs(step);
  if (next < targetBpm) {
    return { bpm: next, reached: false, shouldStop: false };
  }

  if (onReach === "loop") {
    return { bpm: startBpm, reached: true, shouldStop: false };
  }

  return { bpm: targetBpm, reached: true, shouldStop: onReach === "stop" };
}
