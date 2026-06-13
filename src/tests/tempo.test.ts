import { describe, expect, it } from "vitest";
import { clampBpm, tempoMarking } from "../domain/tempo";

describe("tempo", () => {
  it("clamps bpm to the supported mobile range", () => {
    expect(clampBpm(12)).toBe(30);
    expect(clampBpm(301)).toBe(300);
    expect(clampBpm(119.6)).toBe(120);
  });

  it("maps common tempo words", () => {
    expect(tempoMarking(50)).toBe("Largo");
    expect(tempoMarking(120)).toBe("Allegro");
    expect(tempoMarking(210)).toBe("Prestissimo");
  });
});
