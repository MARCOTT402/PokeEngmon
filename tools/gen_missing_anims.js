/* ============================================================
   gen_missing_anims.js — 一次性離線腳本
   為 PokeRogue 冇資源嘅 27 招自製 battle anim JSON。

   做法：唔新增任何 PNG，全部重用 assets/battle/anim/sheets/
   現有 PRAS sheets 重新編排影格（設計對照表見
   .trae/specs/missing-move-anims/spec.md）。

   會做：
   1. 生成 assets/battle/anim/<slug>.json（minified 單行）
   2. 更新 assets/battle/anim/index.json（value = frames.length）
   3. 重新生成 assets/gen-packs/gen{2..5}.json
      （複製 tools/fetch_gen_assets.py 嘅 manifest 邏輯，唔使上網）

   用法：node tools/gen_missing_anims.js
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ANIM_DIR = path.join(ROOT, "assets", "battle", "anim");
const SHEETS_DIR = path.join(ANIM_DIR, "sheets");

/* ---------- layer 簡寫 ----------
   focus: 1=TARGET 2=USER 3=USER_TARGET 4=SCREEN
   o: { z=zoom 通用, zy=zoomY, o=opacity, a=angle, m=mirror } */
function L(x, y, gf, focus, o = {}) {
  const l = {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    zoomX: o.z != null ? o.z : 100,
    zoomY: o.zy != null ? o.zy : (o.z != null ? o.z : 100),
    opacity: o.o != null ? Math.round(o.o) : 255,
    graphicFrame: gf,
    target: 2,
    focus
  };
  if (o.a) l.angle = Math.round(o.a);
  if (o.m) l.mirror = true;
  return l;
}
const seq = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
const TAU = Math.PI * 2;

/* ---------- 27 招影格定義 ---------- */
const MOVES = {
  /* 粉紫 ring 喺對手頭上來回擺 */
  "confusion": {
    graphic: "PRAS- Psybeam",
    frames: seq(10, i => [L(118 + (i % 2) * 20, -84, i % 4, 1, { z: 85 + (i % 3) * 15, o: i < 8 ? 255 : 130 })])
  },
  /* 黃 spotlight 落對手身上 */
  "after-you": {
    graphic: "PRAS- Follow Me",
    frames: [[180, 70], [160, 130], [140, 190], [125, 255], [112, 255], [104, 255], [100, 200], [96, 110]]
      .map(([z, o]) => [L(128, -64, 2, 1, { z, o })])
  },
  /* 白色泡泡由 user 身上升起 */
  "rest": {
    graphic: "PRAS- Yawn",
    frames: seq(16, i => {
      const ls = [];
      if (i < 10) { const t = i / 9; ls.push(L(-4 - 4 * t, -20 - 48 * t, Math.min(3, Math.floor(t * 4)), 2, { o: t < 0.75 ? 255 : 90 })); }
      if (i >= 6) { const t = (i - 6) / 9; ls.push(L(6 + 4 * t, -20 - 48 * t, Math.min(3, Math.floor(t * 4)), 2, { o: t < 0.75 ? 255 : 90 })); }
      return ls;
    })
  },
  /* 鉛筆喺 user 前面掃，最後粉波彈出 */
  "mimic": {
    graphic: "PRAS- Sketch + Lick",
    frames: seq(10, i => i < 8
      ? [L(-20 + (i % 4) * 13, -45, i < 6 ? 0 : 2, 2, { a: i % 2 ? 25 : -25 })]
      : [L(0, -55, 1, 2, { z: i === 8 ? 60 : 100 })])
  },
  /* 紫色牆磚喺螢幕四個位置浮現 */
  "wonder-room": {
    graphic: "PRAS- Magic Coat",
    frames: seq(10, i => {
      const spots = [[-60, -70, 0], [168, -70, 1], [-60, 78, 6], [168, 78, 7]];
      return spots.map(([x, y, gf], j) => L(x, y, gf, 4, { o: Math.min(255, 60 + i * 30), a: Math.max(0, (8 - i) * 12), z: 90 + j * 5 }));
    })
  },
  /* sludge 大波 user 推去 target + 殘留滴落 */
  "sludge-wave": {
    graphic: "PRAS- Poison",
    frames: seq(12, i => {
      const ls = [];
      if (i < 8) {
        ls.push(L(i * 16, -i * 8, 10 + (i % 5), 3, { z: 130 }));
        if (i >= 2) ls.push(L((i - 2) * 16, -(i - 2) * 8, 10 + ((i + 2) % 5), 3, { z: 100, o: 190 }));
      } else {
        ls.push(L(124, -50 + (i - 8) * 8, 20 + (i - 8), 1, { o: 255 - (i - 8) * 55 }));
      }
      return ls;
    })
  },
  /* 螺旋水柱喺對手位升起 + 頂部水花 */
  "surf": {
    graphic: "PRAS- Water",
    frames: seq(14, i => {
      if (i < 11) {
        const t = i / 10;
        return [
          L(112, -10 - 55 * t, 8 + (i % 7), 1, { z: 120 + 40 * t, o: t < 0.85 ? 230 : 150 }),
          L(144, -16 - 50 * t, 8 + ((i + 3) % 7), 1, { z: 110 + 40 * t, o: t < 0.85 ? 200 : 130 })
        ];
      }
      return [L(128, -70, 20 + (i - 11), 1, { z: 150, o: 210 - (i - 11) * 65 })];
    })
  },
  /* 雪團斜落全屏（天氣） */
  "snowscape": {
    graphic: "PRAS- Powder Snow",
    frames: seq(16, i => seq(3, p => L(200 - p * 40 - i * 18, -80 + p * 60 + Math.sin(i / 2) * 6, (i + p * 3) % 10, 4, { o: 180 })))
  },
  /* 紫色旋渦旋轉收縮（變細） */
  "minimize": {
    graphic: "PRAS- Stats",
    frames: seq(8, i => [L(0, -40, 5 + (i % 5), 2, { z: 100 - i * 11, a: i * 50, o: 255 - i * 22 })])
  },
  /* 黑環喺 user 擴大 + 紅鋸齒，後段落對手 */
  "memento": {
    graphic: "PRAS- Night Daze",
    frames: seq(12, i => i < 6
      ? [L(0, -40, 0, 2, { z: 60 + i * 28, o: 200 }), L(0, -40, 1 + (i % 3), 2, { o: 160 + (i % 2) * 95 })]
      : [L(128, -60, 1 + (i % 3), 1, { o: 255 - (i - 6) * 38 })])
  },
  /* 藍盾浮現 hold 再淡 */
  "endure": {
    graphic: "PRAS- Protect",
    frames: seq(8, i => [L(0, -40, Math.min(4, Math.floor(i / 2)), 2, { z: 110, o: i < 6 ? 120 + i * 22 : 255 - (i - 5) * 110 })])
  },
  /* 兩隻手喺對手身邊 wiggle */
  "tickle": {
    graphic: "PRAS- Hands",
    frames: seq(10, i => [
      L(108 + (i % 2) * 6, -50, 0, 1, { a: i % 2 ? 18 : -18, o: i < 8 ? 255 : 120 }),
      L(148 - (i % 2) * 6, -50, 1, 1, { a: i % 2 ? -18 : 18, m: true, o: i < 8 ? 255 : 120 })
    ])
  },
  /* 彩色音符繞對手螺旋上升 */
  "teeter-dance": {
    graphic: "PRAS- Sound",
    frames: seq(12, i => [0, Math.PI].map(off => {
      const th = (i / 12) * TAU + off;
      return L(128 + Math.cos(th) * 30, -58 - i * 2 + Math.sin(th) * 14, i % 15, 1, { o: 230 });
    }))
  },
  /* 兩爪由兩側夾埋 */
  "vice-grip": {
    graphic: "PRAS- Hands",
    frames: seq(10, i => {
      const t = Math.min(1, i / 7);
      const squeeze = t >= 1 ? 100 + (i % 2) * 20 : 100;
      const o = i < 9 ? 255 : 110;
      return [L(88 + 28 * t, -50, 5, 1, { z: squeeze, o }), L(168 - 28 * t, -50, 6, 1, { z: squeeze, m: true, o })];
    })
  },
  /* 泥波推進 + 對手位濺泥 */
  "muddy-water": {
    graphic: "PRAS- Mud Slap",
    frames: seq(12, i => {
      const ls = [];
      if (i < 8) {
        ls.push(L(i * 16, -i * 8, i % 5, 3, { z: 115 }));
        if (i >= 2) ls.push(L((i - 2) * 16, -(i - 2) * 8, (i + 2) % 5, 3, { z: 90, o: 190 }));
      } else {
        ls.push(L(128, -55, 5 + (i - 8), 1, { z: 100 + (i - 8) * 14, o: 255 - (i - 8) * 50 }));
      }
      return ls;
    })
  },
  /* 白圈罩住 user 擴大→收縮（變身） */
  "transform": {
    graphic: "PRAS- Swap",
    frames: seq(12, i => {
      const grow = i <= 5 ? i : Math.max(0, 10 - i);
      return [L(0, -40, 35 + Math.min(3, grow), 2, { z: 90 + grow * 18, o: i < 9 ? 235 : 235 - (i - 8) * 70 })];
    })
  },
  /* 旋風 user 向上衝，再喺對手位落下 */
  "bounce": {
    graphic: "PRAS- Fly",
    frames: seq(12, i => i < 6
      ? [L(0, -30 - i * 14, 2 + (i % 4), 2, { z: 120, a: i * 30, o: 255 - i * 20 })]
      : [L(128, -100 + (i - 6) * 9, 2 + (i % 4), 1, { z: 130, a: i * 30, o: 130 + (i - 6) * 25 })])
  },
  /* 黑環由上壓落對手 */
  "quash": {
    graphic: "PRAS- Night Daze",
    frames: seq(8, i => {
      const t = Math.min(1, i / 5);
      return [L(128, -110 + 55 * t, 0, 1, { z: 200 - 100 * t, o: i < 6 ? 220 : 220 - (i - 5) * 90 })];
    })
  },
  /* 紅珠 user ↔ 藍珠 target 互換 */
  "power-split": {
    graphic: "PRAS- Swap",
    frames: seq(12, i => {
      const t = i / 11;
      return [L(128 * t, -64 * t, 0, 3, { z: 90 }), L(128 * (1 - t), -64 * (1 - t), 20, 3, { z: 90 })];
    })
  },
  /* 彩虹珠繞 user 公轉 */
  "power-trick": {
    graphic: "PRAS- Swap",
    frames: seq(10, i => [0, Math.PI].map(off => {
      const th = (i / 10) * TAU + off;
      return L(Math.cos(th) * 32, -40 + Math.sin(th) * 22, (i * 3) % 30, 2, { z: 80 });
    }))
  },
  /* 黃音符飄去對手再徘徊 */
  "entrainment": {
    graphic: "PRAS- Sound",
    frames: seq(10, i => i < 7
      ? [L(i * 18.3, -i * 9.1 + Math.sin(i) * 4, 25 + (i % 5), 3, { z: 80, o: 230 })]
      : [L(128, -70 + Math.sin(i) * 5, 25 + (i % 5), 1, { z: 80, o: 230 - (i - 7) * 60 })])
  },
  /* 牆磚喺螢幕中央浮現旋轉定住 */
  "magic-room": {
    graphic: "PRAS- Magic Coat",
    frames: seq(10, i => [[54, 4, 0, 1], [22, -28, 6, 0.7]].map(([x, y, gf, zs], j) =>
      L(x, y, gf, 4, { z: (40 + Math.min(1, i / 5) * 80) * zs, a: Math.max(0, 180 - i * 22), o: Math.min(255, 70 + i * 26) })))
  },
  /* 四屬性鑽石繞 user 快閃 */
  "camouflage": {
    graphic: "PRAS- Conversion",
    frames: seq(10, i => seq(4, d => {
      const th = (i / 10) * TAU + d * (TAU / 4);
      return L(Math.cos(th) * 26, -40 + Math.sin(th) * 18, d, 2, { z: 70, o: 220 });
    }))
  },
  /* 花瓣圍 user 飄落 + 閃爍 */
  "aromatic-mist": {
    graphic: "PRAS- Aromatherapy",
    frames: seq(12, i => {
      const ls = seq(3, p => L(-24 + p * 24 + Math.sin((i + p) / 2) * 5, -70 + ((i * 6 + p * 14) % 70), (i + p) % 5, 2, { o: 210 }));
      if (i >= 6) ls.push(L(16, -50, 5 + (i % 4), 2, { o: 255 - (i - 6) * 35 }));
      return ls;
    })
  },
  /* 單個黑音符細聲飄去對手 */
  "confide": {
    graphic: "PRAS- Sound",
    frames: seq(8, i => [L(i * 16, -i * 8 + Math.sin(i / 1.5) * 3, 15 + (i % 5), 3, { z: 65, o: 220 - (i > 5 ? (i - 5) * 60 : 0) })])
  },
  /* 牆磚喺螢幕四角+中央浮現旋轉 */
  "trick-room": {
    graphic: "PRAS- Magic Coat",
    frames: seq(12, i => {
      const spots = [[-60, -70, 0], [168, -70, 1], [54, 4, 3], [-60, 78, 6], [168, 78, 7]];
      return spots.map(([x, y, gf], j) => {
        const t = Math.max(0, Math.min(1, (i + 1.5 - j * 1.5) / 6));
        return t <= 0 ? null : L(x, y, gf, 4, { z: 50 + 50 * t, a: (1 - t) * 180, o: 60 + 195 * t });
      }).filter(Boolean);
    })
  },
  /* 大白圓由上壓落（壓扁）+ 紅爆散開 */
  "body-press": {
    graphic: "PRAS- Strike",
    frames: seq(10, i => {
      if (i < 5) {
        const t = i / 4;
        return [L(128, -110 + 55 * t, 26, 1, { z: 140, zy: 140 - 70 * t, o: 230 })];
      }
      const k = i - 5;
      return [
        L(112, -50, 3 + (k % 2), 1, { z: 120 + k * 8, o: 255 - k * 45 }),
        L(144, -50, 4 - (k % 2), 1, { z: 120 + k * 8, o: 255 - k * 45 }),
        L(128, -55, 27, 1, { z: 130, o: 200 - k * 45 })
      ];
    })
  }
};

/* ---------- 校驗 helpers ---------- */
function sheetCells(graphic) {
  const p = path.join(SHEETS_DIR, graphic + ".png");
  if (!fs.existsSync(p)) throw new Error("sheet 唔存在: " + graphic);
  const b = fs.readFileSync(p);
  const cols = Math.floor(b.readUInt32BE(16) / 96);
  const rows = Math.floor(b.readUInt32BE(20) / 96);
  return cols * rows;
}

function main() {
  const slugs = Object.keys(MOVES);
  console.log(`[1/3] 生成 ${slugs.length} 招 anim JSON`);

  /* 校驗：slug 必須喺 moves.json 入面（raw text 包含） */
  const movesRaw = fs.readFileSync(path.join(ROOT, "data", "moves.json"), "utf8");
  for (const s of slugs) {
    if (!movesRaw.includes('"' + s + '"')) throw new Error("moves.json 搵唔到 slug: " + s);
  }

  /* 校驗 + 寫 JSON */
  for (const slug of slugs) {
    const def = MOVES[slug];
    const maxCell = sheetCells(def.graphic);
    let layers = 0;
    def.frames.forEach((f, fi) => {
      if (!Array.isArray(f) || !f.length) throw new Error(`${slug} frame ${fi} 係空`);
      for (const l of f) {
        layers++;
        if (l.target !== 2) throw new Error(`${slug} frame ${fi} target!=2`);
        if (l.graphicFrame < 0 || l.graphicFrame >= maxCell) {
          throw new Error(`${slug} frame ${fi} graphicFrame ${l.graphicFrame} 超出 ${def.graphic}（max ${maxCell - 1}）`);
        }
      }
    });
    fs.writeFileSync(path.join(ANIM_DIR, slug + ".json"), JSON.stringify(def));
    console.log(`  ${slug}: ${def.frames.length} frames, ${layers} layers (${def.graphic})`);
  }

  /* [2/3] 更新 index.json */
  console.log("[2/3] 更新 index.json");
  const idxPath = path.join(ANIM_DIR, "index.json");
  const idxRaw = fs.readFileSync(idxPath, "utf8");
  const idx = JSON.parse(idxRaw);
  for (const slug of slugs) idx[slug] = MOVES[slug].frames.length;   /* append 新 key 喺尾 */
  const pretty = idxRaw.includes("\n");
  fs.writeFileSync(idxPath, pretty ? JSON.stringify(idx, null, 1) : JSON.stringify(idx));
  console.log(`  index.json: ${Object.keys(idx).length} entries（+${slugs.length}）`);

  /* [3/3] 重新生成 gen-packs manifest（邏輯同 fetch_gen_assets.py L129-180 一致） */
  console.log("[3/3] 重新生成 gen-packs manifest");
  const GEN_RANGES = { 2: [152, 251], 3: [252, 386], 4: [387, 493], 5: [494, 649] };
  const rel = p => path.relative(ROOT, p).replace(/\\/g, "/");
  const entry = p => ({ path: rel(p), bytes: fs.statSync(p).size });

  const battleExtra = [];
  for (const side of ["front", "back"]) {
    const dir = path.join(ROOT, "assets", "battle", "pkmn", side);
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith(".png")) battleExtra.push(path.join(dir, name));
    }
  }
  for (const name of fs.readdirSync(ANIM_DIR).sort()) {
    if (name.endsWith(".json")) battleExtra.push(path.join(ANIM_DIR, name));
  }
  for (const name of fs.readdirSync(SHEETS_DIR).sort()) {
    if (name.endsWith(".png")) battleExtra.push(path.join(SHEETS_DIR, name));
  }
  const dexOfPkmnRel = r => {
    if (!r.startsWith("assets/battle/pkmn/")) return null;
    return parseInt(path.basename(r, ".png"), 10);
  };

  const today = new Date().toISOString().slice(0, 10);
  for (let g = 2; g <= 5; g++) {
    const [lo, hi] = GEN_RANGES[g];
    const files = [];
    let total = 0;
    for (let dex = lo; dex <= hi; dex++) {
      for (const p of [path.join(ROOT, "assets", "animated", dex + ".gif"), path.join(ROOT, "assets", "cries", dex + ".mp3")]) {
        if (!fs.existsSync(p)) continue;
        const e = entry(p); files.push(e); total += e.bytes;
      }
    }
    const extra = [
      path.join(ROOT, "assets", "gen-icons", g + ".png"),
      path.join(ROOT, "data", `pokemon-gen${g}.json`),
      ...battleExtra
    ];
    for (const p of extra) {
      if (!fs.existsSync(p)) continue;
      const r = rel(p);
      const dex = dexOfPkmnRel(r);
      if (dex != null && !(lo <= dex && dex <= hi)) continue;
      const e = { path: r, bytes: fs.statSync(p).size };
      files.push(e); total += e.bytes;
    }
    const doc = { gen: g, files, totalBytes: total, generatedAt: today };
    fs.writeFileSync(path.join(ROOT, "assets", "gen-packs", `gen${g}.json`), JSON.stringify(doc, null, 1));
    console.log(`  gen${g}: ${files.length} files, ${(total / 1024 / 1024).toFixed(1)} MB`);
  }

  console.log("=== 完成 ===");
}

main();
