export const MIN_BPM = 30;
export const MAX_BPM = 300;

export function clampBpm(value: number, min = MIN_BPM, max = MAX_BPM): number {
  if (!Number.isFinite(value)) return 120;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.8;
  return Math.min(1, Math.max(0, value));
}

export function tempoMarking(bpm: number): string {
  if (bpm < 40) return "Grave";
  if (bpm < 60) return "Largo";
  if (bpm < 76) return "Adagio";
  if (bpm < 108) return "Andante";
  if (bpm < 120) return "Moderato";
  if (bpm < 168) return "Allegro";
  if (bpm < 200) return "Presto";
  return "Prestissimo";
}

export function formatTimeSignature(beats: number, noteValue: number): string {
  return `${beats}/${noteValue}`;
}

export function parseBpmInput(value: string): number {
  const normalized = value.replace(/[^\d.]/g, "");
  return clampBpm(Number(normalized));
}
