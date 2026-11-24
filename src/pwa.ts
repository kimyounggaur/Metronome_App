import { useSyncExternalStore } from "react";

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export interface PwaState {
  offline: "preparing" | "ready" | "error" | "unsupported" | "development";
  updateReady: boolean;
  newerActive: boolean;
  candidateFailed: boolean;
  canInstall: boolean;
  isIos: boolean;
  standalone: boolean;
}
let state: PwaState = { offline: "preparing", updateReady: false, newerActive: false, candidateFailed: false, canInstall: false, isIos: false, standalone: false };
let registration: ServiceWorkerRegistration | null = null;
let installPrompt: InstallPrompt | null = null;
let initialized = false;
let statusSequence = 0;
const pageVersion = () => document.querySelector<HTMLMetaElement>('meta[name="pulse-build"]')?.content ?? "";
const listeners = new Set<() => void>();
function publish(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

interface WorkerReply { requestId?: string; type?: string; ready?: boolean; version?: string; active?: string; outcome?: string }
function askWorker(worker: ServiceWorker, type: string): Promise<WorkerReply> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => { channel.port1.close(); reject(new Error("Worker timeout")); }, 10000);
    channel.port1.onmessage = event => {
      if (event.data?.requestId !== requestId) return;
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };
    try { worker.postMessage({ type, requestId, version: pageVersion() }, [channel.port2]); }
    catch (error) { window.clearTimeout(timeout); channel.port1.close(); reject(error); }
  });
}
async function inspectActiveWorker() {
  const worker = navigator.serviceWorker.controller;
  if (!worker) return;
  if (worker.state !== "activated") {
    worker.addEventListener("statechange", () => { if (worker.state === "activated") void inspectActiveWorker(); }, { once: true });
    return;
  }
  const sequence = ++statusSequence;
  const response = await askWorker(worker, "PULSE_GET_STATUS").catch((): WorkerReply => ({}));
  if (sequence !== statusSequence || worker !== navigator.serviceWorker.controller) return;
  publish({
    offline: response.type === "PULSE_STATUS" && response.version === pageVersion() && response.ready ? "ready" : "error",
    newerActive: Boolean(response.active && response.active !== pageVersion()),
    updateReady: Boolean(registration?.waiting),
  });
}
export async function retryOffline(): Promise<void> {
  publish({ offline: "preparing" });
  try {
    if (!navigator.serviceWorker.controller) {
      await registerWorker();
    } else {
      if (state.candidateFailed) await registration?.update();
      await inspectActiveWorker();
    }
  } catch { publish({ offline: "error" }); }
}
async function registerWorker() {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  const item = await navigator.serviceWorker.register(new URL("sw.js", base).href, { scope: base.pathname, updateViaCache: "none" });
  const inspectInstalling = () => {
    const installing = item.installing;
    if (!installing) return;
    publish({ candidateFailed: false });
    const check = () => {
      if (installing.state === "installed") publish({ updateReady: Boolean(item.waiting && navigator.serviceWorker.controller) });
      if (installing.state === "redundant") {
        if (item.active) publish({ candidateFailed: !item.waiting, updateReady: Boolean(item.waiting) });
        else publish({ offline: "error" });
      }
    };
    installing.addEventListener("statechange", check);
    check();
  };
  if (registration !== item) {
    registration = item;
    item.addEventListener("updatefound", inspectInstalling);
  }
  publish({ updateReady: Boolean(item.waiting) });
  inspectInstalling();
  await inspectActiveWorker();
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
  const scopeKey = encodeURIComponent(base.pathname);
  const cachePrefixes = [`pulse-metronome-v3:${scopeKey}:`, `pulse-metronome-v2:${scopeKey}:`];
  if (import.meta.env.DEV) {
    publish({ offline: "development" });
    void navigator.serviceWorker.getRegistrations().then(async registrations => {
      for (const item of registrations) {
        const workers = [item.active, item.waiting, item.installing].filter(Boolean);
        if (item.scope === base.href && workers.some(worker => worker?.scriptURL === scriptURL)) await item.unregister();
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => cachePrefixes.some(prefix => key.startsWith(prefix))).map(key => caches.delete(key)));
      }
    }).catch(() => undefined);
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    publish({ updateReady: Boolean(registration?.waiting), candidateFailed: false });
    void inspectActiveWorker();
  });
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type === "PULSE_IDENTIFY") {
      event.ports[0]?.postMessage({ version: pageVersion() });
    } else if (event.source === navigator.serviceWorker.controller) {
      if (event.data?.type === "PULSE_OFFLINE_READY" || (event.data?.type === "PULSE_CACHE_CHANGED" && event.data.version === pageVersion())) {
        void inspectActiveWorker();
      }
    }
  });
  void registerWorker().catch(() => publish({ offline: "error" }));
  window.addEventListener("online", () => { void retryOffline(); });
  window.addEventListener("pageshow", () => { void inspectActiveWorker(); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void inspectActiveWorker();
      void registration?.update().catch(() => undefined);
    }
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

export async function applyPwaUpdate(): Promise<"accepted" | "absent" | "blocked" | "failed"> {
  if (state.newerActive) return "accepted";
  const waiting = registration?.waiting;
  if (!waiting || waiting.state !== "installed") {
    publish({ updateReady: false });
    await inspectActiveWorker();
    return "absent";
  }
  // Subscribe before sending the request: activation may beat the MessageChannel reply.
  let switched = () => {};
  let timer = 0;
  const activated = new Promise<boolean>(resolve => {
    switched = () => { if (navigator.serviceWorker.controller === waiting) resolve(true); };
    navigator.serviceWorker.addEventListener("controllerchange", switched);
    timer = window.setTimeout(() => resolve(false), 15000);
  });
  try {
    const reply = await askWorker(waiting, "PULSE_APPLY_UPDATE");
    if (reply.outcome === "alreadyRequested") return "absent";
    if (reply.outcome === "blocked") return "blocked";
    if (reply.outcome !== "accepted") return "failed";
    if (navigator.serviceWorker.controller !== waiting && !await activated) return "failed";
    return "accepted";
  } catch { return "failed"; }
  finally {
    window.clearTimeout(timer);
    navigator.serviceWorker.removeEventListener("controllerchange", switched);
    publish({ updateReady: Boolean(registration?.waiting) });
  }
}
