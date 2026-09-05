import { useCallback, useEffect, useRef, useState } from "react";
import { calculateTapTempo, nextTapTempoIntervals, tapTempoResetAfterMs } from "../domain/tapTempo";

type TapTempo = (() => number | null) & { tapCount: number };

export function useTapTempo(onBpm: (bpm: number) => void): TapTempo {
  const tapsRef = useRef<number[]>([]);
  const onBpmRef = useRef(onBpm);
  onBpmRef.current = onBpm;
  const resetTimer = useRef<number | null>(null);
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const tap = useCallback(() => {
    const now = performance.now();
    const previous = tapsRef.current;
    tapsRef.current = nextTapTempoIntervals(previous, now);
    if (tapsRef.current === previous) return null;
    setTapCount(tapsRef.current.length);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      tapsRef.current = [];
      setTapCount(0);
    }, tapTempoResetAfterMs(tapsRef.current));
    const result = calculateTapTempo(tapsRef.current);
    if (result.bpm !== null) onBpmRef.current(result.bpm);
    return result.bpm;
  }, []);

  return Object.assign(tap, { tapCount });
}
