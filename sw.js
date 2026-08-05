// Service Worker: يخزّن هيكل التطبيق (HTML/CSS/JS) محلياً حتى يفتح بدون إنترنت نهائياً.
// لا يتدخل أبداً بطلبات API_URL (Apps Script) — تلك تمر مباشرة للشبكة ويديرها js/sync.js.

const CACHE_NAME = "prohouse-shell-v16";

// ملفات الكود (HTML/CSS/JS) بتتغيّر مع كل تحديث ننشره — لازم تُطلب من الشبكة أولاً وقت ما يكون
// في نت، وإلا الموظف بيضل شايف نسخة قديمة لحد ما يعمل Hard Refresh يدوي (هاي كانت مشكلة حقيقية:
// نشرنا تحديث والأجهزة ضلت على القديم). الخطوط والصور بتضل cache-first لأنها ما بتتغيّر.
function isAppCode(url) {
  return url.pathname.endsWith(".html") || url.pathname.endsWith(".js") ||
         url.pathname.endsWith(".css") || url.pathname.endsWith(".json") ||
         url.pathname.endsWith("/");
}
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
  "./js/auth.js",
  "./js/sync.js",
  "./js/entry.js",
  "./js/items.js",
  "./js/tomorrow.js",
  "./js/juices.js",
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
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ملفات خارجية (CDN، Apps Script) لا تُعترض

  // كود التطبيق: الشبكة أولاً (أحدث نسخة دايماً)، والكاش احتياط لما ما يكون في نت.
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

  // خطوط وصور: الكاش أولاً (ما بتتغيّر، وهيك بتفتح فوراً)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});
