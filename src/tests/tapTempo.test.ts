import { describe, expect, it } from "vitest";
import { calculateTapTempo, nextTapTempoIntervals } from "../domain/tapTempo";

describe("tap tempo", () => {
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
