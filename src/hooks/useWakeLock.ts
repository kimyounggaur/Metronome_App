import { useEffect, useRef } from "react";

export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function requestLock() {
      if (!active || typeof navigator === "undefined") return;
      if (!("wakeLock" in navigator)) return;

      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        sentinelRef.current = null;
      }
    }

    requestLock();

    return () => {
      cancelled = true;
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        sentinel.release().catch(() => undefined);
      }
    };
  }, [active]);
}
