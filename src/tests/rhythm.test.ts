import { describe, expect, it } from "vitest";
import { advancePosition, createDefaultAccents, groupedBeatIndexes, normalizeAccents, secondsPerSubdivision } from "../domain/rhythm";

describe("rhythm", () => {
  it("creates strong first beat accents", () => {
    expect(createDefaultAccents(4)).toEqual(["strong", "normal", "normal", "normal"]);
  });

  it("normalizes accents to the selected signature length", () => {
    expect(normalizeAccents(["strong"], 3)).toEqual(["strong", "normal", "normal"]);
  });

  it("groups compound signatures", () => {
    expect(groupedBeatIndexes({ beats: 6, noteValue: 8 })).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  it("advances subdivisions and bars", () => {
    expect(advancePosition(3, 0, "none", 4)).toEqual({ beatIndex: 0, subIndex: 0, didStartNewBeat: true, didStartNewBar: true });
    expect(secondsPerSubdivision(120, "sixteenth")).toBeCloseTo(0.125);
  });
});
