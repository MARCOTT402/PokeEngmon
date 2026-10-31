/* ============================================================
   PokeEngmon - PokeRogue 對戰精靈圖播放器
   ------------------------------------------------------------------
   素材：pokerogue-assets（beta）images/pokemon/<dex>.png（兼用 .json
   Atlas 資料），已預先抽成 assets/battle/pkmn/<side>/<dex>.png +
   index.json。PokeRogue 播放參數：frameRate 10、無限循環。
   我方 = back（背面），對手 = front（正面）。
   ============================================================ */
const PokeSprite = (() => {
  const BASE = "assets/battle/pkmn/";
  const FPS = 10;
  const SHEETS = new Map();       /* "front/4" -> Promise<Image> */
  const LOOPS = new WeakMap();    /* canvas -> { raf } */
  const PENDING = new WeakMap();  /* canvas -> token（避免重覆載入時開兩條 loop） */
  let indexPromise = null;

  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(BASE + "index.json")
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
    return indexPromise;
  }

  function loadSheet(side, dex) {
    const key = side + "/" + dex;
    if (SHEETS.has(key)) return SHEETS.get(key);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = BASE + side + "/" + dex + ".png";
    });
    SHEETS.set(key, p);
    return p;
  }

  function stop(el) {
    if (!el) return;
    const s = LOOPS.get(el);
    if (s && s.raf) cancelAnimationFrame(s.raf);
    LOOPS.delete(el);
  }

  /* 顯示尺寸：跟 PokeRogue 320×240 設計空間比例（1.6×），再用場地大小封頂 */
  function fit(el, meta, side) {
    const stage = el.closest(".battle-stage");
    const sw = (stage && stage.clientWidth) || 320;
    const sh = (stage && stage.clientHeight) || 240;
    const maxW = sw * (side === "front" ? 0.42 : 0.46);
    const maxH = sh * 0.78;
    let k = (sw / 320) * 1.6;
    k = Math.min(k, maxW / meta.w, maxH / meta.h);
    el.width = meta.w;
    el.height = meta.h;
    el.style.width = Math.round(meta.w * k) + "px";
    el.style.height = Math.round(meta.h * k) + "px";
  }

  function start(el, sheet, meta) {
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const step = 1000 / FPS;
    let i = 0;
    let last = 0;
    let acc = 0;
    const draw = () => {
      const f = meta.f[i % meta.f.length];
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(sheet, f[0], f[1], f[2], f[3], f[4], f[5], f[2], f[3]);
    };
    const loop = t => {
      if (!LOOPS.has(el)) return;
      if (!last) last = t;
      acc += t - last;
      last = t;
      while (acc >= step) { acc -= step; i++; }
      draw();
      const s = LOOPS.get(el);
      if (s) s.raf = requestAnimationFrame(loop);
    };
    const s = { raf: 0 };
    LOOPS.set(el, s);
    draw();
    s.raf = requestAnimationFrame(loop);
  }

  /* 指定 canvas 播放某隻精靈（重覆呼叫同一個 key 唔會重啟） */
  async function show(el, dex, side, opts) {
    if (!el || !el.getContext) return false;
    const key = side + ":" + dex + (opts && opts.still ? ":still" : "");
    if (el.dataset.spriteKey === key && (LOOPS.has(el) || PENDING.has(el))) return true;
    stop(el);
    const token = (PENDING.get(el) || 0) + 1;
    PENDING.set(el, token);
    el.dataset.spriteKey = key;
    const [index, sheet] = await Promise.all([loadIndex(), loadSheet(side, dex)]);
    if (PENDING.get(el) !== token) return false;      /* 期間被換走／收埋 */
    if (!sheet) { el.dataset.spriteKey = ""; PENDING.delete(el); return false; }
    const meta = index && index[side] && index[side][String(dex)];
    if (!meta || !meta.f || !meta.f.length) { el.dataset.spriteKey = ""; PENDING.delete(el); return false; }
    PENDING.delete(el);
    fit(el, meta, side);
    if (opts && opts.still) {
      const ctx = el.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      const f = meta.f[0];
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(sheet, f[0], f[1], f[2], f[3], f[4], f[5], f[2], f[3]);
      return true;
    }
    start(el, sheet, meta);
    return true;
  }

  /* 收埋（換寵用）：停動畫 + 清空 */
  function hide(el) {
    if (!el) return;
    stop(el);
    el.dataset.spriteKey = "";
    const ctx = el.getContext && el.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, el.width, el.height);
  }

  /* 重新量度尺寸（視窗 resize 後） */
  function refit(el) {
    const key = el && el.dataset.spriteKey;
    if (!key) return;
    const [side, dex] = key.split(":");
    loadIndex().then(index => {
      const meta = index && index[side] && index[side][String(dex)];
      if (meta && LOOPS.has(el)) fit(el, meta, side);
    });
  }

  return { show, hide, stop, refit, FPS };
})();
