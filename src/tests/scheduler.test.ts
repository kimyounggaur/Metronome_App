import { describe, expect, it } from "vitest";
import { LOOKAHEAD_MS, SCHEDULE_AHEAD_TIME } from "../audio/schedulerTypes";
import { secondsPerSubdivision } from "../domain/rhythm";

describe("scheduler constants", () => {
  it("uses short lookahead and schedules ahead of audio time", () => {
    expect(LOOKAHEAD_MS).toBe(25);
    expect(SCHEDULE_AHEAD_TIME).toBe(0.1);
  });

  it("keeps 60 bpm quarter notes at one second", () => {
    expect(secondsPerSubdivision(60, "none")).toBeCloseTo(1);
  });
});
