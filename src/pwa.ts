import { useSyncExternalStore } from "react";

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export interface PwaState {
  offline: "preparing" | "ready" | "error" | "unsupported" | "development";
  updateReady: boolean;
  canInstall: boolean;
  isIos: boolean;
  standalone: boolean;
}
let state: PwaState = { offline: "preparing", updateReady: false, canInstall: false, isIos: false, standalone: false };
let registration: ServiceWorkerRegistration | null = null;
let installPrompt: InstallPrompt | null = null;
let initialized = false;
let applyingUpdate = false;
const listeners = new Set<() => void>();
function publish(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

async function inspectActiveWorker() {
  const worker = navigator.serviceWorker.controller;
  if (!worker) return;
  if (worker.state !== "activated") {
    worker.addEventListener("statechange", () => { if (worker.state === "activated") void inspectActiveWorker(); }, { once: true });
    return;
  }
  const ready = await new Promise<boolean>(resolve => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => { channel.port1.close(); resolve(false); }, 5000);
    channel.port1.onmessage = event => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data?.type === "PULSE_STATUS" && event.data.ready === true);
    };
    worker.postMessage({ type: "PULSE_GET_STATUS" }, [channel.port2]);
  });
  publish({ offline: ready ? "ready" : "error" });
}

export function initializePwa(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const standaloneMedia = window.matchMedia("(display-mode: standalone)");
  const readStandalone = () => publish({ standalone: standaloneMedia.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone) });
  readStandalone();
  standaloneMedia.addEventListener("change", readStandalone);
  publish({ isIos: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) });
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    publish({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    publish({ canInstall: false, standalone: true });
  });
  if (!("serviceWorker" in navigator)) { publish({ offline: "unsupported" }); return; }
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  const scriptURL = new URL("sw.js", base).href;
  const cachePrefix = `pulse-metronome-v2:${encodeURIComponent(base.pathname)}:`;
  if (import.meta.env.DEV) {
    publish({ offline: "development" });
    void navigator.serviceWorker.getRegistrations().then(async registrations => {
      for (const item of registrations) {
        const workers = [item.active, item.waiting, item.installing].filter(Boolean);
        if (item.scope === base.href && workers.some(worker => worker?.scriptURL === scriptURL)) await item.unregister();
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(cachePrefix)).map(key => caches.delete(key)));
      }
    }).catch(() => undefined);
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (applyingUpdate) window.location.reload();
    else void inspectActiveWorker();
  });
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.source === navigator.serviceWorker.controller && event.data?.type === "PULSE_OFFLINE_READY") void inspectActiveWorker();
  });
  void navigator.serviceWorker.register(scriptURL, { scope: base.pathname, updateViaCache: "none" }).then(item => {
    registration = item;
    publish({ updateReady: Boolean(item.waiting) });
    const inspectInstalling = () => {
      const installing = item.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") publish({ updateReady: Boolean(item.waiting && navigator.serviceWorker.controller) });
        if (installing.state === "redundant" && !item.active) publish({ offline: "error" });
      });
    };
    item.addEventListener("updatefound", inspectInstalling);
    inspectInstalling();
    void inspectActiveWorker();
    return navigator.serviceWorker.ready;
  }).then(() => inspectActiveWorker()).catch(() => publish({ offline: "error" }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void registration?.update().catch(() => undefined);
  });
}

export async function requestPwaInstall(): Promise<void> {
  const prompt = installPrompt;
  if (!prompt) return;
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } finally {
    installPrompt = null;
    publish({ canInstall: false });
  }
}

export function applyPwaUpdate(): void {
  if (!registration?.waiting || applyingUpdate) return;
  applyingUpdate = true;
  registration.waiting.postMessage({ type: "PULSE_APPLY_UPDATE" });
}
