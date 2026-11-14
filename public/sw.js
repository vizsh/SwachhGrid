/* SwachhGrid service worker: the resident and crew apps keep working in lanes with no signal.
 *
 *  - App pages:        network first, cached copy when offline
 *  - /_next/static:    cache first (file names are content-hashed)
 *  - /data/*.json/png: stale-while-revalidate (seed, routes, density, lanes, bins, terrain)
 *  - map tiles, fonts: cache first, capped, so lanes a resident has looked at stay visible offline
 *
 * Reports filed offline are queued in the app itself (see store.ts) and sent when "online" fires.
 */
const VERSION = "sg-v1";
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;
const DATA = `${VERSION}-data`;
const TILES = `${VERSION}-tiles`;
const TILE_LIMIT = 600;

const PRECACHE = ["/report", "/worker", "/", "/manifest.webmanifest", "/icons/icon-192.png", "/data/seed.json", "/data/density.json", "/data/routes.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(PAGES)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req, cacheName, limit) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    await c.put(req, res.clone());
    if (limit) trim(cacheName, limit);
  }
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

async function networkFirst(req) {
  const c = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch {
    const url = new URL(req.url);
    return (
      (await c.match(req, { ignoreSearch: true })) ||
      (await c.match(url.pathname)) ||
      (await c.match("/report")) ||
      new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/maplibre/") || url.pathname.startsWith("/icons/"))
      return e.respondWith(cacheFirst(req, STATIC));
    if (url.pathname.startsWith("/data/")) return e.respondWith(staleWhileRevalidate(req, DATA));
    if (req.mode === "navigate") return e.respondWith(networkFirst(req));
    return;
  }
  // satellite imagery, vector tiles and map fonts
  if (/arcgisonline\.com|openfreemap\.org/.test(url.hostname)) return e.respondWith(cacheFirst(req, TILES, TILE_LIMIT));
  if (/fonts\.(gstatic|googleapis)\.com/.test(url.hostname)) return e.respondWith(cacheFirst(req, STATIC));
});
