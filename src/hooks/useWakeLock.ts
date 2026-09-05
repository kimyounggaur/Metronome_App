import { useEffect, useRef } from "react";

/** Wake lock is optional; audio continues when the API is absent or rejects. */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const pendingRef = useRef(false);
  const reconcileRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retriedRelease = false;
    let retryTimer: number | null = null;
    const clearRetry = () => { if (retryTimer !== null) window.clearTimeout(retryTimer); retryTimer = null; };
    const release = () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
    };
    async function requestLock() {
      if (cancelled || !active || document.hidden || !("wakeLock" in navigator) || pendingRef.current || sentinelRef.current) return;
      pendingRef.current = true;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled || !active || document.hidden) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current !== sentinel) return;
          sentinelRef.current = null;
          // Retry an unexpected release once per visible session, avoiding battery-policy retry loops.
          if (!cancelled && active && !document.hidden && !retriedRelease) {
            retriedRelease = true;
            retryTimer = window.setTimeout(() => { retryTimer = null; void requestLock(); }, 750);
          }
        }, { once: true });
      } catch {
        // A visibility change is the next retry opportunity after permission/power-policy failure.
      } finally {
        pendingRef.current = false;
        if (cancelled) reconcileRef.current?.();
      }
    }
    const reconcile = () => { void requestLock(); };
    reconcileRef.current = reconcile;
    const onVisibility = () => {
      clearRetry();
      if (document.hidden) release();
      else { retriedRelease = false; void requestLock(); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void requestLock();
    return () => {
      cancelled = true;
      clearRetry();
      if (reconcileRef.current === reconcile) reconcileRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [active]);
}
