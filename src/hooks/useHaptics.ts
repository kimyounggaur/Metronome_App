import { useCallback } from "react";
import type { BeatEvent } from "../domain/types";

export function useHaptics(enabled: boolean): (event: BeatEvent) => void {
  return useCallback(
    (event: BeatEvent) => {
      if (!enabled || typeof navigator === "undefined") return;
      if (!navigator.vibrate || event.subIndex > 0 || event.phase === "count-in") return;

      if (event.accent === "strong") navigator.vibrate(18);
      if (event.accent === "normal") navigator.vibrate(10);
      if (event.accent === "soft") navigator.vibrate(6);
    },
    [enabled],
  );
}
