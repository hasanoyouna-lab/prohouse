// Service Worker: يخزّن هيكل التطبيق (HTML/CSS/JS) محلياً حتى يفتح بدون إنترنت نهائياً.
// لا يتدخل أبداً بطلبات API_URL (Apps Script) — تلك تمر مباشرة للشبكة ويديرها js/sync.js.

const CACHE_NAME = "prohouse-shell-v4";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./assets/logo.png",
  "./assets/fonts/tajawal-400-ar.woff2",
  "./assets/fonts/tajawal-400-lat.woff2",
  "./assets/fonts/tajawal-700-ar.woff2",
  "./assets/fonts/tajawal-700-lat.woff2",
  "./assets/fonts/tajawal-800-ar.woff2",
  "./assets/fonts/tajawal-800-lat.woff2",
  "./js/config.js",
  "./js/sync.js",
  "./js/entry.js",
  "./js/items.js",
  "./js/tomorrow.js",
  "./js/report.js",
  "./js/settings.js",
  "./js/dashboard.js",
  "./js/main.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // اطلبات الكتابة (POST لـ Apps Script) تمر عادي
  if (new URL(req.url).origin !== self.location.origin) return; // ملفات خارجية (CDN، Apps Script) لا تُعترض

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached);
    })
  );
});
