import type { AccentLevel, Subdivision, TimeSignature } from "./types";

export const TIME_SIGNATURES: TimeSignature[] = [
  { beats: 1, noteValue: 4 },
  { beats: 2, noteValue: 4 },
  { beats: 3, noteValue: 4 },
  { beats: 4, noteValue: 4 },
  { beats: 5, noteValue: 4 },
  { beats: 6, noteValue: 8 },
  { beats: 7, noteValue: 8 },
  { beats: 12, noteValue: 8 },
];

export const SUBDIVISION_LABELS: Record<Subdivision, string> = {
  none: "없음",
  eighth: "8분",
  triplet: "셋잇단",
  sixteenth: "16분",
};

export const ACCENT_LABELS: Record<AccentLevel, string> = {
  strong: "강",
  normal: "보통",
  soft: "약",
  mute: "쉼",
};

export function subdivisionCount(subdivision: Subdivision): number {
  switch (subdivision) {
    case "eighth":
      return 2;
    case "triplet":
      return 3;
    case "sixteenth":
      return 4;
    case "none":
    default:
      return 1;
  }
}

export function createDefaultAccents(beats: number): AccentLevel[] {
  return Array.from({ length: beats }, (_, index) => (index === 0 ? "strong" : "normal"));
}

export function normalizeAccents(accents: AccentLevel[], beats: number): AccentLevel[] {
  const fallback = createDefaultAccents(beats);
  return Array.from({ length: beats }, (_, index) => accents[index] ?? fallback[index]);
}

export function cycleAccent(accent: AccentLevel): AccentLevel {
  switch (accent) {
    case "strong":
      return "normal";
    case "normal":
      return "soft";
    case "soft":
      return "mute";
    case "mute":
      return "strong";
  }
}

export function groupedBeatIndexes(signature: TimeSignature): number[][] {
  if (signature.noteValue !== 8) {
    return [Array.from({ length: signature.beats }, (_, index) => index)];
  }

  if (signature.beats === 6) return [[0, 1, 2], [3, 4, 5]];
  if (signature.beats === 12) return [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
  if (signature.beats === 7) return [[0, 1], [2, 3], [4, 5, 6]];
  return [Array.from({ length: signature.beats }, (_, index) => index)];
}

export function advancePosition(
  beatIndex: number,
  subIndex: number,
  subdivision: Subdivision,
  beatsPerBar: number,
): { beatIndex: number; subIndex: number; didStartNewBeat: boolean; didStartNewBar: boolean } {
  const subdivisions = subdivisionCount(subdivision);
  const nextSub = subIndex + 1;
  if (nextSub < subdivisions) {
    return { beatIndex, subIndex: nextSub, didStartNewBeat: false, didStartNewBar: false };
  }

  const nextBeat = beatIndex + 1;
  if (nextBeat < beatsPerBar) {
    return { beatIndex: nextBeat, subIndex: 0, didStartNewBeat: true, didStartNewBar: false };
  }

  return { beatIndex: 0, subIndex: 0, didStartNewBeat: true, didStartNewBar: true };
}

export function secondsPerSubdivision(bpm: number, subdivision: Subdivision): number {
  return 60 / bpm / subdivisionCount(subdivision);
}
