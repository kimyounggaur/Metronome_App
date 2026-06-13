import { useCallback, useRef } from "react";
import { calculateTapTempo, nextTapTempoIntervals } from "../domain/tapTempo";

export function useTapTempo(onBpm: (bpm: number) => void): () => number | null {
  const tapsRef = useRef<number[]>([]);

  return useCallback(() => {
    const now = performance.now();
    tapsRef.current = nextTapTempoIntervals(tapsRef.current, now);
    const result = calculateTapTempo(tapsRef.current);

    if (result.bpm !== null) {
      onBpm(result.bpm);
    }

    return result.bpm;
  }, [onBpm]);
}
