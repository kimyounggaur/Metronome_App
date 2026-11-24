import { describe, expect, it } from "vitest";
import type { AccentLevel } from "../domain/types";
import { accentGroupStarts, advancePosition, createDefaultAccents, groupedBeatIndexes, normalizeAccents, secondsPerSubdivision } from "../domain/rhythm";

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

describe("R10 group accents", () => {
  it("preserves rests and all cells outside the group starts", () => {
    const before: AccentLevel[] = ["normal", "soft", "mute", "normal", "soft", "mute", "normal"];
    expect(accentGroupStarts(before, [2, 2, 3])).toEqual(["strong", "soft", "mute", "normal", "strong", "mute", "normal"]);
    expect(accentGroupStarts(before, [2, 3, 2])).toEqual(["strong", "soft", "mute", "normal", "soft", "mute", "normal"]);
    expect(before[0]).toBe("normal");
  });
});
