import { clampBpm } from "./tempo";

export interface TapTempoResult {
  bpm: number | null;
  intervals: number[];
}

const RESET_AFTER_MS = 2000;
const MIN_INTERVAL_MS = 150;
const MAX_INTERVAL_MS = 3000;
const MAX_INTERVALS = 8;

export function nextTapTempoIntervals(previousTaps: number[], timestamp: number): number[] {
  const last = previousTaps.at(-1);
  if (last === undefined || timestamp - last > RESET_AFTER_MS) {
    return [timestamp];
  }
  return [...previousTaps, timestamp].slice(-MAX_INTERVALS - 1);
}

export function calculateTapTempo(taps: number[]): TapTempoResult {
  if (taps.length < 2) {
    return { bpm: null, intervals: [] };
  }

  const intervals = taps
    .slice(1)
    .map((tap, index) => tap - taps[index])
    .filter((interval) => interval >= MIN_INTERVAL_MS && interval <= MAX_INTERVAL_MS);

  if (intervals.length < 3) {
    return { bpm: null, intervals };
  }

  const sorted = [...intervals].sort((a, b) => a - b);
  const trimmed =
    sorted.length >= 5 ? sorted.slice(1, sorted.length - 1) : sorted.slice(Math.floor(sorted.length / 2), Math.floor(sorted.length / 2) + 1);
  const average = trimmed.reduce((sum, interval) => sum + interval, 0) / trimmed.length;
  return { bpm: clampBpm(60000 / average), intervals };
}
