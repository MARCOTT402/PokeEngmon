/* PokeEngmon Service Worker - 離線快取 */
const CACHE_NAME = "pokeengmon-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./questions.csv",
  "./css/style.css",
  "./js/data.js",
  "./js/storage.js",
  "./js/explain.js",
  "./js/quiz.js",
  "./js/gacha.js",
  "./js/pokedex.js",
  "./js/calendar.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* App 檔案（同源）：網絡優先，離線先用快取 → 更新即時生效
   Pokemon 圖片（外部 CDN）：快取優先，慳流量 */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const sameOrigin = e.request.url.startsWith(self.location.origin);

  if (sameOrigin) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetched = fetch(e.request).then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
  }
});
