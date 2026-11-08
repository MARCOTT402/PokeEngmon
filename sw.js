/* PokeEngmon Service Worker - 離線快取 */
const CACHE_NAME = "pokeengmon-1.72.0";
const TYPE_ICONS = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];
const BATTLE_TYPES = ["normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel", "unknown", "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark"];
const BATTLE_UI = [
  "foe-hp-box", "my-hp-box", "textbox-blue", "caret-red", "poke-ball-big", "poke-ball-tiny",
  "bg-grass", "bg-building", "bg-water", "bg-cave", "bg-pond", "bg-ice", "bg-sand", "bg-psychic", "bg-teal", "bg-plain",
  "status-psn", "status-par", "status-slp", "status-frz", "status-brn", "status-tox", "status-fnt"
];
const TRAINERS = ["red_back", "rival", "youngster", "bugcatcher", "lass", "gentleman", "ace_f",
  "ai-youngster", "ai-bugcatcher", "ai-lass", "ai-hiker", "ai-gentleman", "ai-swimmer", "ai-ace",
  "ai-jasmine", "ai-psychic", "ai-cynthia", "ai-alder", "ai-drake", "ai-anabel", "ai-red"];
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
  "./Q_folder/grammar/grammar_images/index.json",
  "./js/core/guard.js",
  "./js/core/dom.js",
  "./js/core/html.js",
  "./js/core/net.js",
  "./supabase/supabase-config.js",
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
  "./js/mega-data.js",
  "./js/avatars.js",
  "./js/dex-sort.js",
  "./js/trainer-level.js",
  "./js/genpack.js",
  "./js/storage.js",
  "./js/store.js",
  "./js/anim-speed.js",
  "./js/keys.js",
  "./js/pet.js",
  "./js/care.js",
  "./js/bag.js",
  "./js/battle/landscape.js",
  "./js/explain.js",
  "./js/quiz.js",
  "./js/quiz/session.js",
  "./js/quiz/hud.js",
  "./js/quiz/cells.js",
  "./js/quiz/keyboard.js",
  "./js/quiz/hints.js",
  "./js/quiz/catch.js",
  "./js/quiz/check.js",
  "./js/quiz/media.js",
  "./js/quiz/dialogs.js",
  "./js/gacha.js",
  "./js/gacha/core.js",
  "./js/gacha/pull.js",
  "./js/gacha/charge.js",
  "./js/gacha/multi.js",
  "./js/gacha/arm.js",
  "./js/gacha/scene.js",
  "./js/pokedex.js",
  "./js/gym.js",
  "./js/leaderboard.js",
  "./js/friends.js",
  "./js/quests.js",
  "./js/calendar.js",
  "./js/evolve-scene.js",
  "./js/app.js",
  "./js/app/router.js",
  "./js/app/layout.js",
  "./js/app/home.js",
  "./js/app/setup-custom.js",
  "./js/app/settlement.js",
  "./js/app/settings.js",
  "./js/app/auth-ui.js",
  "./js/app/sheets.js",
  "./js/app/modals.js",
  "./js/app/boot.js",
  "./js/audio.js",
  "./js/capture.js",
  "./js/battle/rng.js",
  "./js/battle/energy.js",
  "./js/battle/realtime.js",
  "./js/battle/pvp.js",
  "./js/battle/engine.js",
  "./js/battle/state.js",
  "./js/battle/moveanim.js",
  "./js/battle/sprites.js",
  "./js/battle/battle.js",
  "./js/battle/ui/menu.js",
  "./js/battle/ui/trainer-card.js",
  "./js/battle/ui/match.js",
  "./js/battle/ui/team.js",
  "./js/battle/ui/stage.js",
  "./js/battle/ui/hud.js",
  "./js/battle/ui/turn.js",
  "./js/battle/ui/result.js",
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
  "./assets/fonts/pokemon-emerald-pro-latin.woff2",   /* 原 ttf 5 MB 唔 precache，用到中日文先載（Rule 103） */
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
  /* focus-brown-noise.mp3／focus-isochronic.mp3（Setting → Music track，各 ~1.8 MB）刻意唔 precache：
     只有揀咗嘅用戶先下載，/assets/ cache-first 播過一次就離線可用 */
  "./assets/bgm/evolution.mp3",
  "./assets/bgm/evolution-fanfare.mp3",
  "./assets/gacha/dragonite.png",
  "./assets/quiz/progress-runner.png",
  ...TYPE_ICONS.map(t => `./assets/types/${t}.png`),
  "./assets/items/poke-ball.png",
  ...TRAINERS.map(t => `./assets/trainers/${t}.png`),
  /* battle menu 指令框 Friends icon（index.html 直接用） */
  "./assets/trainers/avatars/blue.png", "./assets/trainers/avatars/leaf.png",
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

/* ---------- fetch 策略（Rule 102） ----------
   - 跨域：只 cache 圖片／音效／字型（精靈 CDN 等）。Supabase REST／RPC 等 API **一律唔經 SW**：
     舊做法跨域全部 cache-first，`user_account?select=*` 等 GET 會返上次（甚至上一個帳號）嘅資料。
   - 頁面（navigate／index.html）：network-first，3 秒冇回應先用 cache（慢網唔使白等）。
   - 帶 `?v=<本 SW 版本>` 嘅檔案：版本化 → cache-first（precache key 冇 query，用 ignoreSearch 對返）。
     版本唔同（新 index 配舊 SW 嘅過渡期）就照行 network-first。
   - /assets/：cache-first。其他同源（CSV、data/*.json）：network-first＋3 秒 timeout。
   - localhost／127.0.0.1：版本化檔案都唔 cache-first，開發改 code 唔使 bump 版本（Rule 62）。 */
const SW_VERSION = CACHE_NAME.slice("pokeengmon-".length);
const NET_TIMEOUT_MS = 3000;
const IS_DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname);

function swRoute(req) {
  if (req.method !== "GET") return "skip";
  /* 非 http(s) scheme（例如 chrome-extension://）Cache API 唔支援（Rule 10） */
  if (!req.url.startsWith("http")) return "skip";
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return /^(image|audio|font|video)$/.test(req.destination || "") ? "cache-first" : "skip";
  }
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) return "page";
  if (url.pathname.endsWith("/sw.js")) return "skip";
  if (url.pathname.includes("/assets/")) return "cache-first";
  if (!IS_DEV && url.searchParams.get("v") === SW_VERSION) return "versioned";
  return "network-first";
}

function _put(req, res) {
  if (!res || !res.ok || res.type === "opaque") return;
  const clone = res.clone();
  caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
}

async function _fromCache(req, loose) {
  const hit = await caches.match(req);
  if (hit || !loose) return hit;
  return caches.match(req, { ignoreSearch: true });
}

async function cacheFirst(req, loose) {
  const hit = await _fromCache(req, loose);
  if (hit) return hit;
  const res = await fetch(req);
  _put(req, res);
  return res;
}

/* 網絡優先：timeout 到咗而 cache 有就用 cache；網絡繼續跑完照更新 cache */
function networkFirst(req, fetchReq, fallbackKey) {
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const fromCache = () => _fromCache(req, true)
      .then(hit => hit || (fallbackKey ? caches.match(fallbackKey) : undefined));
    const net = fetch(fetchReq).then(res => {
      if (res && res.ok) _put(req, res);
      return res;
    });
    const timer = setTimeout(() => fromCache().then(finish), NET_TIMEOUT_MS);
    net.then(res => { clearTimeout(timer); finish(res); })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then(hit => {
          if (hit) finish(hit);
          else if (!done) { done = true; resolve(Response.error()); }
        });
      });
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const kind = swRoute(req);
  if (kind === "skip") return;
  if (kind === "page") {
    /* no-cache：同 server revalidate（GitHub Pages 有 ETag，冇改返 304） */
    e.respondWith(networkFirst(req, new Request(req.url, { cache: "no-cache", credentials: "same-origin" }), "./index.html"));
  } else if (kind === "versioned") {
    e.respondWith(cacheFirst(req, true).catch(() => networkFirst(req, req)));
  } else if (kind === "cache-first") {
    e.respondWith(cacheFirst(req, false).catch(() => _fromCache(req, true).then(h => h || Response.error())));
  } else {
    e.respondWith(networkFirst(req, new Request(req, { cache: "no-cache" })));
  }
});
