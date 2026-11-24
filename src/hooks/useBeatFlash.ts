import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BeatEvent } from "../domain/types";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function prefersReducedMotion() {
  return matchMedia(reducedMotionQuery).matches;
}
function subscribeToReducedMotion(notify: () => void) {
  const query = matchMedia(reducedMotionQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

export function useBeatFlash(enabled: boolean, event: BeatEvent | null, isPlaying: boolean): boolean {
  const [on, setOn] = useState(false);
  const reduced = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => true);
  const last = useRef(-Infinity);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (enabled && isPlaying && !reduced) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setOn(false);
    last.current = -Infinity;
  }, [enabled, isPlaying, reduced]);

  useEffect(() => {
    if (event?.showVisual === false) {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      setOn(false);
      return;
    }
    if (!enabled || !isPlaying || reduced || prefersReducedMotion() || !event || event.subIndex !== 0) return;
    const now = performance.now();
    if (now - last.current < 500) return;
    last.current = now;
    setOn(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setOn(false); timer.current = null; }, 100);
  }, [enabled, event, isPlaying, reduced]);

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  return on && !reduced && !prefersReducedMotion();
}
