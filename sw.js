/* 理财记账 · Service Worker
 * 策略：首屏 network-first（保证更新能落地，离线回退缓存），静态资源 cache-first。
 * 行情接口（跨域 JSONP）一律直连网络，不缓存；离线时由页面降级为手动录入。
 */
const VERSION = "2026-11-20.77";
const CACHE = "licai-jizhang-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(function (u) { return new Request(u, { cache: "reload" }); }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // 行情接口直连，不介入

  if (req.mode === "navigate") {
    e.respondWith((async function () {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", res.clone());
        return res;
      } catch (err) {
        const cached = await caches.match("./index.html");
        return cached || new Response("离线且没有首屏缓存，请先联网打开一次。", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  e.respondWith((async function () {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
