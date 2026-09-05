import { describe, expect, it } from "vitest";
import { calculateTapTempo, nextTapTempoIntervals } from "../domain/tapTempo";

describe("tap tempo", () => {
  it.each([30, 60, 120, 300])("accepts normal %s BPM tap sequences", (bpm) => {
    let taps: number[] = [];
    for (let index = 0; index < 5; index++) taps = nextTapTempoIntervals(taps, index * 60000 / bpm);
    expect(calculateTapTempo(taps).bpm).toBe(bpm);
  });

  it("keeps slow 30 BPM taps with small timing variation", () => {
    let taps: number[] = [];
    for (const timestamp of [0, 2020, 3990, 6010, 8020]) taps = nextTapTempoIntervals(taps, timestamp);
    expect(taps).toHaveLength(5);
    expect(calculateTapTempo(taps).bpm).toBe(30);
  });

  it("does not store duplicate or non-monotonic taps", () => {
    const taps = [0, 500];
    expect(nextTapTempoIntervals(taps, 500)).toBe(taps);
    expect(nextTapTempoIntervals(taps, 550)).toBe(taps);
    expect(nextTapTempoIntervals(taps, 450)).toBe(taps);
    expect(nextTapTempoIntervals(taps, Number.NaN)).toBe(taps);
  });

  it("calculates stable bpm from repeated taps", () => {
    const taps = [0, 500, 1000, 1500, 2000];
    expect(calculateTapTempo(taps).bpm).toBe(120);
  });

  it("resets after a long pause", () => {
    expect(nextTapTempoIntervals([0, 500], 2800)).toEqual([2800]);
  });

  it("ignores one rough outlier with trimming", () => {
    const taps = [0, 500, 1000, 1650, 2000, 2500, 3000];
    expect(calculateTapTempo(taps).bpm).toBeGreaterThanOrEqual(115);
    expect(calculateTapTempo(taps).bpm).toBeLessThanOrEqual(125);
  });
});
