// scripts/build-sw.mjs embeds the release identity and digests of the exact files it publishes.
const BUILD_VERSION = "__PULSE_BUILD_VERSION__";
const PRECACHE = []; // __PULSE_PRECACHE__
const SCOPE = new URL(self.registration.scope);
const PREFIX = `pulse-metronome-v3:${encodeURIComponent(SCOPE.pathname)}:`;
const LEGACY_PREFIX = `pulse-metronome-v2:${encodeURIComponent(SCOPE.pathname)}:`;
const META = PREFIX + "state";
const appURL = path => new URL(path, SCOPE).href;
const metaURL = key => appURL(".pulse-state/" + key);
const releaseURL = metaURL("manifest");
const validVersion = value => typeof value === "string" && /^[a-f0-9]{20}$/.test(value);

async function readState(key) {
  const response = await (await caches.open(META)).match(metaURL(key));
  return response ? response.json() : null;
}
async function writeState(key, value) {
  await (await caches.open(META)).put(metaURL(key), Response.json(value));
}
async function release(version) {
  if (!validVersion(version)) return null;
  const name = PREFIX + version;
  let entries = version === BUILD_VERSION ? PRECACHE : await readState("release/" + version);
  // The completion record also preserves the routing manifest if the scope metadata was evicted.
  if (!entries && await caches.has(name)) {
    const journal = await (await caches.open(name)).match(releaseURL);
    if (journal) entries = await journal.json();
  }
  if (!Array.isArray(entries) || !entries.length) return null;
  return { version, cache: await caches.open(name), entries };
}
async function validResponse(response, url, entry) {
  if (!response || response.url !== url || response.status !== 200) return false;
  const type = (response.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!entry.mime.includes(type)) return false;
  const bytes = await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer());
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("") === entry.digest;
}
// A replacement is consumed only after its bytes match this release. A failed repair leaves the old entry intact.
async function readAsset(cache, entry) {
  const url = appURL(entry.path);
  const stored = await cache.match(url);
  if (await validResponse(stored, url, entry)) return stored;
  const fetched = await fetch(new Request(url, { cache: "reload", redirect: "error" }));
  if (!await validResponse(fetched, url, entry)) throw new Error("Invalid release asset: " + entry.path);
  await cache.put(url, fetched.clone());
  return fetched;
}
async function ready(build) {
  if (!build) return false;
  try {
    for (const entry of build.entries) await readAsset(build.cache, entry);
    return true;
  } catch { return false; }
}
async function liveWindows() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return windows.filter(client => client.url.startsWith(SCOPE.href));
}
function askVersion(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
    const timer = setTimeout(() => finish(null), 1000);
    channel.port1.onmessage = event => finish(validVersion(event.data?.version) ? event.data.version : null);
    try { client.postMessage({ type: "PULSE_IDENTIFY" }, [channel.port2]); } catch { finish(null); }
  });
}
async function clientVersions() {
  const clients = await liveWindows();
  const versions = await Promise.all(clients.map(async client => {
    const key = "client/" + client.id;
    const recorded = await readState(key);
    if (validVersion(recorded)) return recorded;
    const version = await askVersion(client);
    if (version) await writeState(key, version);
    return version;
  }));
  return { clients, versions };
}
function withReleaseLock(task) {
  return self.navigator.locks ? self.navigator.locks.request(PREFIX + "lifecycle", task) : task();
}
async function pruneUnlocked() {
  // Take the name snapshot first: a cache created by a subsequent install cannot be collected here.
  const cacheNames = await caches.keys();
  const { clients, versions } = await clientVersions();
  if (versions.includes(null)) return;
  const active = await readState("active");
  if (!active || active !== BUILD_VERSION) return;
  const candidate = await readState("candidate");
  // If the metadata cache disappeared while a new worker was installing/waiting,
  // we cannot identify its cache from the registration's stable sw.js URL.
  if (!candidate && (self.registration.installing || self.registration.waiting)) return;
  const keep = new Set([active, candidate, ...versions]);
  for (const name of cacheNames) {
    if (name.startsWith(LEGACY_PREFIX) || (name.startsWith(PREFIX) && validVersion(name.slice(PREFIX.length)) && !keep.has(name.slice(PREFIX.length)))) {
      await caches.delete(name);
      if (name.startsWith(PREFIX)) await (await caches.open(META)).delete(metaURL("release/" + name.slice(PREFIX.length)));
    }
  }
  const live = new Set(clients.map(client => metaURL("client/" + client.id)));
  const meta = await caches.open(META);
  for (const key of await meta.keys()) {
    if (key.url.startsWith(metaURL("client/")) && !live.has(key.url)) await meta.delete(key);
  }
}

const prune = () => withReleaseLock(pruneUnlocked);

self.addEventListener("install", event => {
  event.waitUntil(withReleaseLock(async () => {
    if (!PRECACHE.length || !validVersion(BUILD_VERSION)) throw new Error("Missing release manifest");
    const oldCandidate = await readState("candidate");
    const active = await readState("active");
    // Validate the successor before releasing a waiting candidate's slot. Defer when the old candidate is being activated.
    const replacing = oldCandidate && oldCandidate !== active && oldCandidate !== BUILD_VERSION;
    let pendingResponses;
    if (replacing) {
      pendingResponses = [];
      for (const entry of PRECACHE) {
        const url = appURL(entry.path);
        const response = await fetch(new Request(url, { cache: "reload", redirect: "error" }));
        if (!await validResponse(response, url, entry)) throw new Error("Invalid candidate: " + entry.path);
        pendingResponses.push([url, response]);
      }
      if (self.registration.active?.state === "activating") throw new Error("Activation in progress");
      await caches.delete(PREFIX + oldCandidate);
      await (await caches.open(META)).delete(metaURL("release/" + oldCandidate));
    }
    await writeState("candidate", BUILD_VERSION);
    const cache = await caches.open(PREFIX + BUILD_VERSION);
    const wasComplete = !!await cache.match(releaseURL);
    try {
      if (pendingResponses) {
        for (const [url, response] of pendingResponses) await cache.put(url, response);
      } else {
        for (const entry of PRECACHE) await readAsset(cache, entry);
      }
      await cache.put(releaseURL, Response.json(PRECACHE));
      await writeState("release/" + BUILD_VERSION, PRECACHE);
    } catch (error) {
      if (!wasComplete) await caches.delete(PREFIX + BUILD_VERSION);
      if (await readState("candidate") === BUILD_VERSION) await writeState("candidate", null);
      throw error;
    }
  }));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    if (!await ready(await release(BUILD_VERSION))) throw new Error("Incomplete release");
    await writeState("active", BUILD_VERSION);
    if (await readState("candidate") === BUILD_VERSION) await writeState("candidate", null);
    await self.clients.claim();
    for (const client of await liveWindows()) client.postMessage({ type: "PULSE_OFFLINE_READY", version: BUILD_VERSION });
    await prune();
  })());
});

let activationInFlight = false;
self.addEventListener("message", event => {
  const message = event.data;
  if (!event.source?.id || !event.source.url?.startsWith(SCOPE.href)) return;
  const reply = data => event.ports[0]?.postMessage({ ...data, requestId: message.requestId });
  if (message?.type === "PULSE_APPLY_UPDATE") {
    if (activationInFlight) { reply({ outcome: "alreadyRequested" }); return; }
    activationInFlight = true;
    event.waitUntil((async () => {
      try {
        const { versions } = await clientVersions();
        const active = await readState("active");
        // A legacy/unidentified tab cannot safely switch; leave the browser's natural activation intact.
        if (versions.some(version => !version || (version !== active && version !== BUILD_VERSION))) {
          reply({ outcome: "blocked" }); return;
        }
        if (!await ready(await release(BUILD_VERSION))) { reply({ outcome: "failed" }); return; }
        reply({ outcome: "accepted" });
        await self.skipWaiting();
      } catch { reply({ outcome: "failed" }); }
      finally { activationInFlight = false; }
    })());
  } else if (message?.type === "PULSE_GET_STATUS") {
    event.waitUntil((async () => {
      const version = message.version;
      let complete = false;
      try {
        const build = await release(version);
        if (!await readState("active")) {
          const controlled = await self.clients.matchAll({ type: "window" });
          if (controlled.some(client => client.id === event.source.id)) await writeState("active", BUILD_VERSION);
        }
        if (build) {
          await writeState("client/" + event.source.id, version);
          complete = await ready(build);
        }
        reply({ type: "PULSE_STATUS", version, active: BUILD_VERSION, ready: complete });
        await prune();
      } catch { reply({ type: "PULSE_STATUS", version, active: BUILD_VERSION, ready: false }); }
    })());
  }
});

async function fetchForClient(event, url) {
  const path = url.pathname.slice(SCOPE.pathname.length);
  let build = await release(BUILD_VERSION);
  let entry;
  if (event.request.mode === "navigate") entry = build?.entries.find(asset => asset.path === "index.html");
  else {
    const clientVersion = event.clientId && await readState("client/" + event.clientId);
    if (validVersion(clientVersion) && clientVersion !== BUILD_VERSION) build = await release(clientVersion);
    entry = build?.entries.find(asset => asset.path === path);
    // The old shell may ask for its hashed Worker before its client handshake completes.
    if (!entry && /^assets\/.+-[\w-]+\.(js|css)$/.test(path)) {
      for (const key of await caches.keys()) {
        if (!key.startsWith(PREFIX)) continue;
        const other = await release(key.slice(PREFIX.length));
        const match = other?.entries.find(asset => asset.path === path);
        if (match) { build = other; entry = match; break; }
      }
    }
  }
  if (entry) {
    try { return await readAsset(build.cache, entry); }
    catch (error) {
      // A tab may have been continuously visible since the browser evicted an asset.
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.postMessage({ type: "PULSE_CACHE_CHANGED", version: build.version });
      }
      throw error;
    }
  }
  const response = await fetch(event.request);
  const expectsAsset = ["script", "style", "worker", "sharedworker"].includes(event.request.destination)
    || /\/api(?:\/|$)/.test(url.pathname) || /\.(?:js|mjs|css|json|wasm)$/i.test(url.pathname);
  if (expectsAsset && response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return response;
}
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  event.respondWith(fetchForClient(event, url).catch(() => new Response("Release asset unavailable", {
    status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
  })));
});
