/* gen_moves_data.js — 由 PokéAPI 生成完整招式資料 + 屬性相剋表（一次性離線腳本）
 *
 * 輸出：
 *   data/moves.json       {"moves": {slug: {...}}}   ← js/pokemon.js loadPokemonDex() 直接食
 *   data/type-chart.json  {atkType: {defType: mult}} ← 只記非 1 倍率，預設 1
 *
 * 來源：掃 data/pokemon-151.json + pokemon-gen2..5.json 嘅 learnset slug，
 *       逐招 fetch PokéAPI（raw 快取喺 tools/.cache_pokeapi/move/，重跑唔會重撈）。
 *
 * 跑法：node tools/gen_moves_data.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CACHE_DIR = path.join(__dirname, ".cache_pokeapi", "move");
const TYPE_CACHE_DIR = path.join(__dirname, ".cache_pokeapi", "type");
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(TYPE_CACHE_DIR, { recursive: true });

const DEX_FILES = ["pokemon-151.json", "pokemon-gen2.json", "pokemon-gen3.json", "pokemon-gen4.json", "pokemon-gen5.json"];

/* ---------- 1. 掃 learnset slug ---------- */
const slugs = new Set();
for (const f of DEX_FILES) {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
  for (const id of Object.keys(doc.pokemon || {})) {
    for (const l of doc.pokemon[id].learnset || []) slugs.add(l.move);
  }
}
console.log(`[1/3] learnset 掃到 ${slugs.size} 招`);

/* ---------- 2. 逐招攞資料（有 cache 用 cache） ---------- */
async function fetchJson(url, cachePath) {
  if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const j = await res.json();
  fs.writeFileSync(cachePath, JSON.stringify(j));
  return j;
}

function enName(m) {
  const n = (m.names || []).find(x => x.language.name === "en");
  return n ? n.name : m.name;
}
function enDesc(m) {
  const e = (m.effect_entries || []).find(x => x.language.name === "en");
  return e ? e.short_effect.replace(/\$effect_chance/g, m.effect_chance == null ? "" : m.effect_chance).replace(/\s+/g, " ").trim() : "";
}

function compactMove(m) {
  const meta = m.meta || {};
  return {
    name: enName(m),
    type: m.type.name,
    power: m.power ?? null,
    accuracy: m.accuracy ?? null,
    pp: m.pp ?? null,
    priority: m.priority || 0,
    damage_class: m.damage_class.name,                       // physical / special / status
    target: (m.target && m.target.name) || "selected-pokemon",
    effect_chance: m.effect_chance ?? null,
    desc: enDesc(m),
    /* 對戰用追加數值（全部官方 PokéAPI meta） */
    meta: {
      ailment: (meta.ailment && meta.ailment.name) || "none",
      ailment_chance: meta.ailment_chance || 0,
      crit_rate: meta.crit_rate || 0,                        // 額外會心等級
      drain: meta.drain || 0,                                // 吸血 %（傷害比例）
      flinch_chance: meta.flinch_chance || 0,
      healing: meta.healing || 0,                            // 回復自身最大 HP %
      stat_chance: meta.stat_chance || 0,
      min_hits: meta.min_hits ?? null,
      max_hits: meta.max_hits ?? null,
      min_turns: meta.min_turns ?? null,
      max_turns: meta.max_turns ?? null
    },
    /* 能力升降（例如 growl atk-1） */
    stat_changes: (m.stat_changes || []).map(s => ({ stat: s.stat.name, change: s.change }))
  };
}

const CONCURRENCY = 6;
async function pool(items, worker) {
  const out = {};
  let i = 0, done = 0, failed = 0;
  async function next() {
    while (i < items.length) {
      const slug = items[i++];
      try {
        const raw = await fetchJson(`https://pokeapi.co/api/v2/move/${slug}`, path.join(CACHE_DIR, `${slug}.json`));
        out[slug] = compactMove(raw);
      } catch (e) {
        failed++;
        console.warn(`  ! ${slug}: ${e.message}`);
      }
      if (++done % 50 === 0) console.log(`  ${done}/${items.length}…`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
  if (failed) console.warn(`  ${failed} 招 fetch 失敗（重跑會用 cache 續撈）`);
  return out;
}

/* ---------- 3. 屬性相剋表 ---------- */
const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison","ground",
  "flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];

async function buildTypeChart() {
  const chart = {};
  for (const t of TYPES) {
    const raw = await fetchJson(`https://pokeapi.co/api/v2/type/${t}`, path.join(TYPE_CACHE_DIR, `${t}.json`));
    const rel = raw.damage_relations;
    const row = {};
    (rel.double_damage_to || []).forEach(x => { row[x.name] = 2; });
    (rel.half_damage_to || []).forEach(x => { row[x.name] = 0.5; });
    (rel.no_damage_to || []).forEach(x => { row[x.name] = 0; });
    chart[t] = row;
  }
  return chart;
}

(async () => {
  console.log(`[2/3] 攞招式資料（cache: ${CACHE_DIR}）`);
  const moves = await pool([...slugs], null);
  const missing = [...slugs].filter(s => !moves[s]);
  const out = { moves };
  fs.writeFileSync(path.join(ROOT, "data", "moves.json"), JSON.stringify(out));
  console.log(`  data/moves.json 寫好：${Object.keys(moves).length} 招，缺 ${missing.length}`);
  if (missing.length) console.log(`  缺少：${missing.join(", ")}`);

  console.log("[3/3] 屬性相剋表");
  const chart = await buildTypeChart();
  fs.writeFileSync(path.join(ROOT, "data", "type-chart.json"), JSON.stringify({ chart }));
  console.log(`  data/type-chart.json 寫好：${TYPES.length} 屬`);
})().catch(e => { console.error(e); process.exit(1); });
