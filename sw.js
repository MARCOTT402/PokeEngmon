/* PokeEngmon Service Worker - 離線快取 */
const CACHE_NAME = "pokeengmon-1.15.17";
const TYPE_ICONS = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];
const BATTLE_TYPES = ["normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel", "unknown", "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark"];
const BATTLE_UI = [
  "foe-hp-box", "my-hp-box", "textbox-blue", "caret-red", "poke-ball-big", "poke-ball-tiny",
  "bg-grass", "bg-building", "bg-water", "bg-cave", "bg-pond", "bg-ice", "bg-sand", "bg-psychic", "bg-teal", "bg-plain",
  "status-psn", "status-par", "status-slp", "status-frz", "status-brn", "status-tox", "status-fnt"
];
const TRAINERS = ["red_back", "rival", "youngster", "bugcatcher", "lass", "gentleman", "ace_f"];
const BATTLE_FX = [
  "fx-normal", "fx-fire", "fx-fire-ring", "fx-water", "fx-water2", "fx-wave", "fx-electric",
  "fx-grass", "fx-bug", "fx-ice", "fx-ice2", "fx-rock", "fx-rock2", "fx-steel", "fx-fighting",
  "fx-dark", "fx-poison", "fx-ghost", "fx-psychic", "fx-fairy", "fx-flying", "fx-dragon",
  "fx-smoke", "fx-eyes"
];
const ASSETS = [
  "./",
  "./index.html",
  "./Q_folder/grammar/grammar.csv",
  "./Q_folder/vocab/vocab.csv",
  "./js/supabase-auth.js",
  "./js/sm2.js",
  "./js/sync.js",
  "./data/pokemon-151.json",
  "./data/moves.json",
  "./data/type-chart.json",
  "./data/abilities.json",
  "./css/style.css",
  "./js/data.js",
  "./js/qimg-db.js",
  "./js/gens-data.js",
  "./js/pokemon.js",
  "./js/genpack.js",
  "./js/storage.js",
  "./js/pet.js",
  "./js/explain.js",
  "./js/quiz.js",
  "./js/gacha.js",
  "./js/pokedex.js",
  "./js/leaderboard.js",
  "./js/calendar.js",
  "./js/evolve-scene.js",
  "./js/app.js",
  "./js/capture.js",
  "./js/battle/engine.js",
  "./js/battle/state.js",
  "./js/battle/moveanim.js",
  "./js/battle/sprites.js",
  "./js/battle/battle.js",
  "./vendor/gsap/gsap.min.js",
  "./vendor/three/three.module.js",
  "./vendor/three/addons/postprocessing/EffectComposer.js",
  "./vendor/three/addons/postprocessing/RenderPass.js",
  "./vendor/three/addons/postprocessing/ShaderPass.js",
  "./vendor/three/addons/postprocessing/UnrealBloomPass.js",
  "./vendor/three/addons/postprocessing/OutputPass.js",
  "./vendor/three/addons/postprocessing/BokehPass.js",
  "./vendor/three/addons/postprocessing/MaskPass.js",
  "./vendor/three/addons/postprocessing/Pass.js",
  "./vendor/three/addons/shaders/CopyShader.js",
  "./vendor/three/addons/shaders/LuminosityHighPassShader.js",
  "./vendor/three/addons/shaders/OutputShader.js",
  "./vendor/three/addons/shaders/BokehShader.js",
  "./manifest.json",
  "./assets/fonts/inter-latin-var.woff2",
  "./assets/fonts/dotgothic16-latin.woff2",
  "./assets/fonts/pokemon-emerald-pro.ttf",
  "./assets/battle/ui/pr-msg-bg.png",
  "./assets/battle/ui/pr-window-1.png",
  "./assets/battle/ui/pr-prompt.png",
  "./assets/battle/sfx/select.wav",
  "./assets/battle/sfx/pb_throw.wav",
  "./assets/battle/sfx/pb_rel.wav",
  "./assets/battle/sfx/hit.wav",
  "./assets/battle/sfx/hit_weak.wav",
  "./assets/battle/sfx/hit_strong.wav",
  "./assets/battle/sfx/faint.wav",
  "./assets/battle/sfx/stat_up.wav",
  "./assets/battle/sfx/stat_down.wav",
  "./assets/battle/party/party_bg.png",
  "./assets/battle/party/party_slot.png",
  "./assets/battle/party/party_slot_main.png",
  "./assets/battle/party/party_pb.png",
  "./assets/battle/party/party_cancel.png",
  "./assets/battle/party/party_slot_hp_bar.png",
  "./assets/battle/party/party_slot_hp_overlay.png",
  "./assets/battle/party/party_slot_overlay_lv.png",
  "./assets/audio/wrong-answer.mp3",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/bgm/wild-battle.mp3",
  "./assets/bgm/obtained-pokemon.mp3",
  "./assets/bgm/obtained-berry.mp3",
  "./assets/bgm/flat-water.mp3",
  "./assets/bgm/evolution.mp3",
  "./assets/bgm/evolution-fanfare.mp3",
  "./assets/gacha/dragonite.png",
  ...TYPE_ICONS.map(t => `./assets/types/${t}.png`),
  "./assets/items/poke-ball.png",
  ...TRAINERS.map(t => `./assets/trainers/${t}.png`),
  ...BATTLE_TYPES.map(t => `./assets/battle/ui/type-${t}.png`),
  ...BATTLE_UI.map(u => `./assets/battle/ui/${u}.png`),
  ...BATTLE_FX.map(f => `./assets/battle/fx/${f}.png`),
  "./assets/battle/anim/index.json",
  "./assets/battle/pkmn/index.json",
  ...Array.from({ length: 16 }, (_, i) => `./assets/badges/${i + 1}.png`),
  ...Array.from({ length: 151 }, (_, i) => `./assets/cries/${i + 1}.mp3`)
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async c => {
      await Promise.allSettled(
        ASSETS.map(u =>
          fetch(new Request(u, { cache: "reload" }))
            .then(res => { if (res && res.ok) return c.put(u, res); })
            .catch(() => {})
        )
      );
      /* 自動 skipWaiting：新 SW 即刻接管，用戶永遠玩最新版 */
      self.skipWaiting();
    })
  );
});

/* 新安裝嘅 SW 自動 skipWaiting（見上方 install listener），
   接管後前端 controllerchange 會自動 reload → 用戶永遠玩最新版 */

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
  /* 非 http(s) scheme（例如 chrome-extension://）Cache API 唔支援，直接放行，
     否則 caches.put 會抛「Request scheme is unsupported」 */
  if (!e.request.url.startsWith("http")) return;
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

