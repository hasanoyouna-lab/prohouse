// Service Worker: Pro House Operations Center v4.0.0
// يخزّن هيكل التطبيق (HTML/CSS/JS) محلياً لدعم العمل أوفلاين التام للموظفين والفروع.

const CACHE_NAME = "prohouse-shell-v4.0.0";

function isAppCode(url) {
  return url.pathname.endsWith(".html") || url.pathname.endsWith(".js") ||
         url.pathname.endsWith(".css") || url.pathname.endsWith(".json") ||
         url.pathname.endsWith("/");
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isAppCode(url)) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
});
