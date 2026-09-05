// Replaced with the complete build manifest by scripts/build-sw.mjs.
const BUILD_VERSION = "__PULSE_BUILD_VERSION__";
const PRECACHE = []; // __PULSE_PRECACHE__
const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `pulse-metronome-v2:${encodeURIComponent(SCOPE.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`;
const assetURLs = PRECACHE.map(path => new URL(path, SCOPE).href);
const allowedAssets = new Set(assetURLs);
const indexURL = new URL("index.html", SCOPE).href;

async function cacheIsComplete() {
  if (!PRECACHE.length) return false;
  const cache = await caches.open(CACHE_NAME);
  return (await Promise.all(assetURLs.map(url => cache.match(url)))).every(Boolean);
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    if (!PRECACHE.length || BUILD_VERSION.startsWith("__")) throw new Error("Pulse precache was not generated");
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(assetURLs.map(url => new Request(url, { cache: "reload" })));
      if (!await cacheIsComplete()) throw new Error("Pulse precache is incomplete");
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
  // A replacement waits until the user applies it or all old clients close.
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    if (!await cacheIsComplete()) throw new Error("Pulse activation requires complete precache");
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) client.postMessage({ type: "PULSE_OFFLINE_READY", version: BUILD_VERSION });
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "PULSE_APPLY_UPDATE") {
    event.waitUntil(self.skipWaiting());
  } else if (event.data?.type === "PULSE_GET_STATUS") {
    event.waitUntil((async () => {
      let ready = await cacheIsComplete();
      if (!ready) {
        // Browser storage can be evicted. Repair only this build's declared assets while online.
        try {
          const cache = await caches.open(CACHE_NAME);
          const missing = [];
          for (const url of assetURLs) if (!await cache.match(url)) missing.push(new Request(url, { cache: "reload" }));
          if (missing.length) await cache.addAll(missing);
          ready = await cacheIsComplete();
        } catch { /* Keep the truthful not-ready result when network recovery is unavailable. */ }
      }
      event.ports[0]?.postMessage({ type: "PULSE_STATUS", ready, version: BUILD_VERSION });
    })());
  }
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const assetURL = new URL(url.pathname, SCOPE.origin).href;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      // Serve one build's shell and its hashed assets together until update acceptance.
      const cached = await (await caches.open(CACHE_NAME)).match(indexURL);
      return cached ?? fetch(request);
    })());
    return;
  }
  event.respondWith((async () => {
    if (allowedAssets.has(assetURL)) {
      const cached = await (await caches.open(CACHE_NAME)).match(assetURL);
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      // Some SPA hosts return HTML for missing assets; do not execute that as JS/Worker/API data.
      const expectsAsset = ["script", "style", "worker", "sharedworker"].includes(request.destination)
        || /\/api(?:\/|$)/.test(url.pathname) || /\.(?:js|mjs|css|json|wasm)$/i.test(url.pathname);
      if (response.headers.get("content-type")?.includes("text/html") && expectsAsset) {
        return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
      return response;
    } catch {
      return new Response("Offline: resource unavailable", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
