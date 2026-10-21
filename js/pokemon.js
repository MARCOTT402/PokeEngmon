/* ============================================================
   PokeEngmon - 本地 PokéAPI 資料 + 等級／能力值／招式
   資料來源：data/pokemon-151.json（由 PokéAPI 預先下載）
   ============================================================ */

let POKEMON_DEX = null;

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
const MAX_LEVEL = 99;
const MAX_IV = 31;
const MAX_EV = 252;
const MAX_EV_TOTAL = 510;

async function loadPokemonDex() {
  if (POKEMON_DEX) return POKEMON_DEX;
  try {
    const res = await fetch("data/pokemon-151.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    POKEMON_DEX = await res.json();
  } catch (e) {
    console.warn("Pokemon data load failed", e);
    POKEMON_DEX = null;
  }
  return POKEMON_DEX;
}

function dexOf(dexId) {
  return POKEMON_DEX ? POKEMON_DEX.pokemon[dexId] || null : null;
}

/* ---------- 等級／經驗值（照 PokéAPI growth-rate 表） ---------- */
function growthTableOf(dexId) {
  const p = dexOf(dexId);
  return p && POKEMON_DEX ? POKEMON_DEX.growthRates[p.growthRate] || null : null;
}

/* 該等級所需累積經驗值（Lv.1 = 0） */
function expAtLevel(dexId, level) {
  const table = growthTableOf(dexId);
  if (!table) return 0;
  const lv = Math.max(1, Math.min(MAX_LEVEL, level));
  return table[lv - 1] || 0;
}

/* 由累積經驗值反推等級 */
function levelFromExp(dexId, exp) {
  const table = growthTableOf(dexId);
  if (!table) return 1;
  let lv = 1;
  for (let i = 2; i <= MAX_LEVEL; i++) {
    if (exp >= table[i - 1]) lv = i;
    else break;
  }
  return lv;
}

/* 該等級升下一級需要幾多經驗（level span） */
function levelSpan(dexId, level) {
  const table = growthTableOf(dexId);
  if (!table) return 100;
  const lv = Math.max(1, Math.min(MAX_LEVEL, level));
  const next = lv >= MAX_LEVEL ? table[lv - 1] : table[lv];
  const cur = table[lv - 1] || 0;
  return Math.max(1, next - cur);
}

/* ---------- 能力值公式 ---------- */
function emptyIvs() {
  const o = {};
  STAT_KEYS.forEach(k => { o[k] = MAX_IV; });   // 預設滿個體 31
  return o;
}

function emptyEvs() {
  const o = {};
  STAT_KEYS.forEach(k => { o[k] = 0; });
  return o;
}

function evTotal(evs) {
  return STAT_KEYS.reduce((n, k) => n + (Number(evs && evs[k]) || 0), 0);
}

function natureInfo(name) {
  if (!POKEMON_DEX || !POKEMON_DEX.natures[name]) return { plus: null, minus: null };
  return POKEMON_DEX.natures[name];
}

function randomNature() {
  if (!POKEMON_DEX) return "hardy";
  const names = Object.keys(POKEMON_DEX.natures);
  return names[Math.floor(Math.random() * names.length)];
}

/* HP：floor((2B + IV + EV/4) × Lv / 100) + Lv + 10
   其他：floor((floor((2B + IV + EV/4) × Lv / 100) + 5) × Nature) */
function calcStats(dexId, level, ivs, evs, nature) {
  const p = dexOf(dexId);
  if (!p) return null;
  const nat = natureInfo(nature);
  const out = {};
  STAT_KEYS.forEach(k => {
    const base = p.baseStats[k] || 0;
    const iv = Number((ivs && ivs[k]) != null ? ivs[k] : MAX_IV);
    const ev = Number((evs && evs[k]) || 0);
    const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
    if (k === "hp") {
      out.hp = core + level + 10;
    } else {
      let mult = 1;
      if (nat.plus === k) mult = 1.1;
      else if (nat.minus === k) mult = 0.9;
      out[k] = Math.floor((core + 5) * mult);
    }
  });
  return out;
}

function statsForEntry(entry) {
  if (!entry || !entry.level) return null;
  const cur = entryCurrentSpecies(entry);
  return calcStats(cur[0], entry.level, entry.ivs, entry.evs, entry.nature);
}

/* ---------- 招式 ---------- */
function moveLabel(slug) {
  return String(slug).split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function learnsetOf(dexId) {
  const p = dexOf(dexId);
  return p ? p.learnset : [];
}

/* 新手招式：Lv.1 招式，最多 4 招 */
function initialMoves(dexId) {
  const lv1 = learnsetOf(dexId).filter(m => m.level <= 1).map(m => m.move);
  const pick = (lv1.length ? lv1 : learnsetOf(dexId).slice(0, 4).map(m => m.move));
  return [...new Set(pick)].slice(0, 4);
}

/* 某段等級之間新學到的招式（去重、排除已識） */
function movesBetween(dexId, fromLevel, toLevel, known) {
  const have = new Set(known || []);
  const out = [];
  learnsetOf(dexId).forEach(m => {
    if (m.level > fromLevel && m.level <= toLevel && !have.has(m.move)) {
      have.add(m.move);
      out.push(m);
    }
  });
  return out;
}

/* ---------- 擁有記錄相容／初始化 ---------- */
function ensureEntryPokemonData(entry) {
  const cur = entryCurrentSpecies(entry);
  const dexId = cur[0];
  let changed = false;
  if (!entry.ivs) { entry.ivs = emptyIvs(); changed = true; }
  if (!entry.evs) { entry.evs = emptyEvs(); changed = true; }
  if (!entry.nature) { entry.nature = randomNature(); changed = true; }
  if (typeof entry.level !== "number") {
    const lv = levelFromExp(dexId, entry.exp || 0);
    const stageMin = [0, 5, 16, 32][entry.stage] || 1;
    entry.level = Math.max(1, lv, stageMin);
    entry.exp = Math.max(entry.exp || 0, expAtLevel(dexId, entry.level));
    changed = true;
  }
  if (!Array.isArray(entry.moves)) {
    entry.moves = initialMoves(dexId);
    changed = true;
  }
  if (typeof entry.candies !== "number") { entry.candies = 0; changed = true; }
  if (typeof entry.dupes !== "number") { entry.dupes = 0; changed = true; }
  if (typeof entry.stars !== "number") {
    entry.stars = Math.min(5, 1 + Math.floor(entry.dupes / 5));
    changed = true;
  }
  return changed;
}
