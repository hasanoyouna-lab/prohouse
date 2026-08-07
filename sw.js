// Service Worker: Pro House Operations Center
// يخزّن هيكل التطبيق (HTML/CSS/JS) محلياً لدعم العمل أوفلاين التام للموظفين والفروع.
// لا يتدخل أبداً بطلبات API_URL (Apps Script) — تلك تمر مباشرة للشبكة ويديرها js/sync.js.

const CACHE_NAME = "prohouse-shell-v4.1.0";

// التخزين المسبق ضروري: بدونه أول فتحة بدون نت بتفشل كلياً لأنه ما في شي مخزّن أصلاً.
// أي ملف جديد ينضاف لـ index.html لازم ينضاف هون كمان، وإلا التطبيق بينكسر أوفلاين بس.
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
  "./js/items.js",
  "./js/camera.js",
  "./js/branches.js",
  "./js/receiving.js",
  "./js/remaining.js",
  "./js/waste.js",
  "./js/users.js",
  "./js/audit.js",
  "./js/entry.js",
  "./js/forecast.js",
  "./js/tomorrow.js",
  "./js/juices.js",
  "./js/checklist.js",
  "./js/report.js",
  "./js/settings.js",
  "./js/dashboard.js",
  "./js/main.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    // ملف واحد مفقود ما لازم يفشّل التثبيت كله ويترك الموظف بدون أي كاش
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(SHELL_FILES.map((f) => cache.add(f).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // نحذف النسخ القديمة بس — حذف الكل (بما فيه الحالي) بيمسح اللي لسا خزّناه بالتثبيت
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // طلبات الكتابة (POST لـ Apps Script) تمر عادي
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ملفات خارجية (CDN، Apps Script) لا تُعترض

  const isAppCode = url.pathname.endsWith(".html") || url.pathname.endsWith(".js") ||
                    url.pathname.endsWith(".css") || url.pathname.endsWith(".json") ||
                    url.pathname.endsWith("/");

  // ignoreSearch ضروري: السكربتات بتنطلب بلاحقة ?v=4.0.0 بينما المخزّن بدونها،
  // وبدون هالخيار الكاش ما بيطابق ولا ملف ساعة ما ينقطع النت.
  const fromCache = () => caches.match(req, { ignoreSearch: true });

  if (isAppCode) {
    // كود التطبيق: الشبكة أولاً (أحدث نسخة دايماً)، والكاش احتياط لما ما يكون في نت
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(fromCache)
    );
    return;
  }

  // خطوط وصور: الكاش أولاً (ما بتتغيّر، وهيك بتفتح فوراً وبتشتغل أوفلاين)
  event.respondWith(
    fromCache().then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      return res;
    }))
  );
});
