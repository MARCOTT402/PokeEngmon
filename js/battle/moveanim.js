/* ============================================================
   PokeEngmon Battle - 逐招原裝動畫播放器

   素材：Pokémon Reborn / PokeRogue 的 battle-anims
   （battle-anims/<slug>.json + images/battle_anims/<graphic>.png）
   每格 spritesheet 96×96、60fps；只畫 target===2（GRAPHIC）圖層。

   座標換算（跟 PokeRogue src/data/battle-anims.ts）：
     USER(2)        ：相對出招寶可夢「底部中心」(x, y) = (rawX, rawY)
     TARGET(1)      ：相對受擊寶可夢「底部中心」= (rawX-128, rawY+64)
     USER_TARGET(3) ：沿出招→受擊連線插值 t=rawX/128, u=rawY/-64
     SCREEN(4)      ：320×240 設計空間絕對座標 (rawX+106, rawY+116)
   每格以 96 設計像素繪製，按對戰舞台闊度等比縮放。
   ============================================================ */

const MoveAnim = (() => {
  const FRAME_MS = 1000 / 60;      /* PokeRogue FPS = 60 */
  const CELL = 96;                 /* loadSpritesheet(graphic, "battle_anims", 96) */
  const DESIGN_W = 320;
  const DESIGN_H = 240;
  const MIN_MS = 260;              /* 太短嘅招式（如 Tackle）保留一下，睇得清 */
  const BASE = "assets/battle/anim/";

  let indexPromise = null;
  const configCache = new Map();   /* slug → Promise<config|null> */
  const sheetCache = new Map();    /* graphic → Promise<img|null> */

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(BASE + "index.json")
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    return indexPromise;
  }

  function loadConfig(slug) {
    if (!configCache.has(slug)) {
      configCache.set(slug, fetch(BASE + slug + ".json")
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null));
    }
    return configCache.get(slug);
  }

  function loadSheet(graphic) {
    if (!sheetCache.has(graphic)) {
      sheetCache.set(graphic, new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = BASE + "sheets/" + graphic + ".png";
      }));
    }
    return sheetCache.get(graphic);
  }

  function has(slug) {
    return loadIndex().then(idx => !!(idx && slug && idx[slug]));
  }

  /* 圖層座標（舞台像素） */
  function layerPos(l, user, targ, sepX, stageW, stageH) {
    const rx = l.x || 0;
    const ry = l.y || 0;
    switch (l.focus) {
      case 1: /* TARGET */
        return [
          targ.cx + (rx - 128) * sepX.absX,
          targ.by + (ry + 64) * sepX.absY
        ];
      case 2: /* USER */
        return [user.cx + rx * sepX.sx, user.by + ry * sepX.sy];
      case 3: /* USER_TARGET：沿連線插值 */
        return [
          user.cx + (targ.cx - user.cx) * (rx / 128),
          user.by + (targ.by - user.by) * (ry / -64)
        ];
      case 4: /* SCREEN */
      default:
        return [
          stageW / 2 + (rx + 106 - 160) * sepX.s,
          stageH / 2 + (ry + 116 - 120) * sepX.s
        ];
    }
  }

  /**
   * 播放一招動畫。
   * @returns {Promise<number>} 動畫長度 ms；0 = 冇資源（叫 caller 用 fallback）
   */
  async function play(slug, opts) {
    const o = opts || {};
    const layer = o.layer;
    const stageEl = o.stageEl;
    if (!slug || !layer || !stageEl) return 0;

    const idx = await loadIndex();
    if (!idx || !idx[slug]) return 0;

    const cfg = await loadConfig(slug);
    if (!cfg || !Array.isArray(cfg.frames) || !cfg.frames.length) return 0;

    const sheet = await loadSheet(cfg.graphic);
    if (!sheet || !sheet.naturalWidth) return 0;

    const stage = stageEl.getBoundingClientRect();
    if (!stage.width || !stage.height) return 0;

    const atk = o.attackerEl ? o.attackerEl.getBoundingClientRect() : stage;
    const def = o.defenderEl ? o.defenderEl.getBoundingClientRect() : stage;
    const user = {
      cx: atk.left - stage.left + atk.width / 2,
      by: atk.top - stage.top + atk.height
    };
    const targ = {
      cx: def.left - stage.left + def.width / 2,
      by: def.top - stage.top + def.height
    };

    const dx = targ.cx - user.cx;
    const dy = targ.by - user.by;
    const s = stage.width / DESIGN_W;
    const absX = Math.abs(dx) / 128 || s;          /* raw 128 = 雙方中心距離 */
    const absY = Math.abs(dy) / 64 || s;           /* raw 64  = 雙方底線距離 */
    const sep = {
      s,
      absX,
      absY,
      sx: dx / 128,                                /* 有號：rawX 正 = 向對手 */
      sy: dy / -64                                 /* 有號：rawY 負 = 向上 */
    };
    if (Math.abs(dy) < 8) sep.sy = Math.abs(sep.sx);

    const frames = cfg.frames;
    const cols = Math.max(1, Math.floor(sheet.naturalWidth / CELL));
    const maxCell = Math.max(1, cols * Math.floor(sheet.naturalHeight / CELL));
    const reversed = dx < 0;
    const frameMs = o.frameMs || FRAME_MS;
    const nodes = [];
    let lastFrame = -1;

    layer.innerHTML = "";

    function drawFrame(fi) {
      const list = frames[fi] || [];
      let k = 0;
      for (const l of list) {
        if (!l || l.target !== 2) continue;
        let node = nodes[k];
        if (!node) {
          node = document.createElement("div");
          node.className = "moveanim-layer";
          layer.appendChild(node);
          nodes.push(node);
        }
        k++;

        const p = layerPos(l, user, targ, sep, stage.width, stage.height);
        const gx = Math.min(Math.max(0, l.graphicFrame || 0), maxCell - 1);
        const col = gx % cols;
        const row = Math.floor(gx / cols);
        const zx = (l.zoomX || 0) / 100;
        const zy = (l.zoomY || 0) / 100;
        const mirror = l.mirror ? -1 : 1;
        const scX = zx * mirror * (reversed && l.focus === 3 ? -1 : 1);
        const scY = zy || zx;

        node.style.left = p[0] + "px";
        node.style.top = p[1] + "px";
        node.style.width = CELL * s + "px";
        node.style.height = CELL * s + "px";
        node.style.backgroundImage = `url("${sheet.src}")`;
        node.style.backgroundSize = (sheet.naturalWidth * s) + "px " + (sheet.naturalHeight * s) + "px";
        node.style.backgroundPosition = (-col * CELL * s) + "px " + (-row * CELL * s) + "px";
        node.style.opacity = String(l.opacity == null ? 1 : Math.max(0, Math.min(1, l.opacity / 255)));
        /* PokeRogue 用 ADD（深色背景先啱）；我哋 FRLG 草地背景偏淺，
           ADD 會將水／電特效洗白，所以一律用 normal 保留原圖顏色同描邊 */
        node.style.mixBlendMode = "normal";
        node.style.transform =
          "translate(-50%,-50%) rotate(" + (-(l.angle || 0)) + "deg) scale(" + scX + "," + scY + ")";
        node.style.display = "";
      }
      for (let i = k; i < nodes.length; i++) nodes[i].style.display = "none";
    }

    const total = Math.max(frames.length * frameMs, MIN_MS);
    return new Promise(res => {
      const t0 = performance.now();
      function step(now) {
        const elapsed = now - t0;
        const fi = Math.min(frames.length - 1, Math.floor(elapsed / frameMs));
        if (fi !== lastFrame) { lastFrame = fi; drawFrame(fi); }
        if (elapsed < total) { requestAnimationFrame(step); return; }
        layer.innerHTML = "";
        res(Math.round(total));
      }
      drawFrame(0);
      lastFrame = 0;
      requestAnimationFrame(step);
    });
  }

  return { has, play, FRAME_MS, CELL };
})();
