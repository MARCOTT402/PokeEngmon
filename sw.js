/* PokeEngmon Service Worker - 離線快取 */
const CACHE_NAME = "pokeengmon-v23";
const TYPE_ICONS = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];
const ASSETS = [
  "./",
  "./index.html",
  "./questions.csv",
  "./data/pokemon-151.json",
  "./data/moves.json",
  "./css/style.css",
  "./js/data.js",
  "./js/pokemon.js",
  "./js/storage.js",
  "./js/explain.js",
  "./js/quiz.js",
  "./js/gacha.js",
  "./js/pokedex.js",
  "./js/calendar.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  ...TYPE_ICONS.map(t => `./assets/types/${t}.png`),
  ...Array.from({ length: 151 }, (_, i) => `./assets/cries/${i + 1}.mp3`)
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
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
   assets/（屬性 Icon、動態 GIF）同 Pokemon 圖片（外部 CDN）：快取優先，慳流量 */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const sameOrigin = e.request.url.startsWith(self.location.origin);
  const isAsset = sameOrigin && e.request.url.includes("/assets/");

  if (sameOrigin && !isAsset) {
    e.respondWith(
      fetch(new Request(e.request, { cache: "reload" })).then(res => {
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
