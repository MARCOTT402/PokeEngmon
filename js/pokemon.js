/* ============================================================
   PokeEngmon - 本地 PokéAPI 資料 + 等級／能力值／招式
   資料來源：data/pokemon-151.json（由 PokéAPI 預先下載）
   ============================================================ */

let POKEMON_DEX = null;
let MOVES = null;
let TYPE_CHART = null;   /* {atkType: {defType: mult}}，只記非 1 倍率 */
let ABILITIES = null;    /* {dexId: [非隱藏特性 slug（slot 順序）]}，data/abilities.json */

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
const MAX_LEVEL = 99;
const MAX_IV = 31;
const MAX_EV = 252;
const MAX_EV_TOTAL = 510;

/* ---------- Types ---------- */
const TYPE_COLORS = {
  normal: "#A8A77A", fire: "#EE8130", water: "#6390F0", electric: "#F7D02C",
  grass: "#7AC74C", ice: "#96D9D6", fighting: "#C22E28", poison: "#A33EA1",
  ground: "#E2BF65", flying: "#A98FF3", psychic: "#F95587", bug: "#A6B91A",
  rock: "#B6A136", ghost: "#735797", dragon: "#6F35FC", dark: "#705746",
  steel: "#B7B7CE", fairy: "#D685AD"
};

const TYPE_LABELS = {
  normal: "Normal", fire: "Fire", water: "Water", electric: "Electric",
  grass: "Grass", ice: "Ice", fighting: "Fighting", poison: "Poison",
  ground: "Ground", flying: "Flying", psychic: "Psychic", bug: "Bug",
  rock: "Rock", ghost: "Ghost", dragon: "Dragon", dark: "Dark",
  steel: "Steel", fairy: "Fairy"
};

const DAMAGE_CLASS_INFO = {
  physical: {
    label: "Physical",
    color: "#c0392b",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 20.1l2.6-2.6-1.7-1.7-2.6 2.6a1.2 1.2 0 000 1.7 1.2 1.2 0 001.7 0z" fill="currentColor"/><path d="M8.2 17.9l-2.1-2.1L16.5 5.4l3.5-1.5-1.5 3.5L8.2 17.9z" fill="currentColor"/><path d="M17.7 3l3.3 3.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
  },
  special: {
    label: "Special",
    color: "#2f6fce",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.3 6 6 2.4-6 2.4-2.3 6-2.3-6-6-2.4 6-2.4z" fill="currentColor"/><circle cx="19" cy="4" r="1.6" fill="currentColor"/><circle cx="5" cy="19" r="1.6" fill="currentColor"/></svg>`
  },
  status: {
    label: "Status",
    color: "#6b7280",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.4" fill="currentColor"/><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="3 3.4"/></svg>`
  }
};

async function loadPokemonDex() {
  if (POKEMON_DEX) return POKEMON_DEX;
  try {
    const [dexRes, moveRes, chartRes, abRes] = await Promise.all([
      fetch("data/pokemon-151.json"),
      fetch("data/moves.json"),
      fetch("data/type-chart.json"),
      fetch("data/abilities.json")
    ]);
    if (!dexRes.ok) throw new Error(`HTTP ${dexRes.status}`);
    POKEMON_DEX = await dexRes.json();
    POKEMON_DEX._loadedGens = { 1: true };   // 記低已載入嘅世代（Gen 1 開 app 即載）
    if (moveRes.ok) MOVES = (await moveRes.json()).moves || {};
    if (chartRes.ok) TYPE_CHART = (await chartRes.json()).chart || {};
    if (abRes.ok) ABILITIES = await abRes.json();
  } catch (e) {
    console.warn("Pokemon data load failed", e);
    POKEMON_DEX = null;
  }
  return POKEMON_DEX;
}

/* 按需載入其他世代資料（解鎖時呼叫）：合併入 POKEMON_DEX.pokemon，
   growthRates / natures 同 Gen 1 一樣嘅話唔會覆蓋（腳本輸出已對齊 shape） */
async function ensureGenDataLoaded(gen) {
  if (gen <= 1) return loadPokemonDex();
  await loadPokemonDex();
  if (!POKEMON_DEX) return null;
  if (POKEMON_DEX._loadedGens[gen]) return POKEMON_DEX;
  try {
    const res = await fetch(`data/pokemon-gen${gen}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    Object.assign(POKEMON_DEX.pokemon, doc.pokemon);
    /* 新 growth-rate 表（erratic / fluctuating）補入，唔覆蓋現有 */
    Object.keys(doc.growthRates || {}).forEach(k => {
      if (!POKEMON_DEX.growthRates[k]) POKEMON_DEX.growthRates[k] = doc.growthRates[k];
    });
    POKEMON_DEX._loadedGens[gen] = true;
  } catch (e) {
    console.warn(`Gen ${gen} data load failed`, e);
  }
  return POKEMON_DEX;
}

/* 招式資料（本地 moves.json，離線可用） */
function moveInfo(slug) {
  const m = MOVES && MOVES[slug];
  if (m) return m;
  return {
    name: moveLabel(slug), power: null, accuracy: null, pp: null, priority: 0,
    type: "normal", damage_class: "status", target: "selected-pokemon",
    effect_chance: null, desc: ""
  };
}

/* 精靈特性：data/abilities.json（非隱藏 slot 順序），戰鬥用 slot 1 做預設 */
function abilityOf(dexId) {
  if (!ABILITIES) return null;
  const a = ABILITIES[String(dexId)];
  return (a && a.length) ? a[0] : null;
}

/* 攻擊屬性 atkType 對防守方屬性組合嘅總倍率（相剋表未載入 → 當 1） */
function typeMultiplier(atkType, defTypes) {
  if (!TYPE_CHART || !atkType) return 1;
  const row = TYPE_CHART[atkType];
  if (!row) return 1;
  let mult = 1;
  (defTypes || []).forEach(dt => {
    mult *= (row[dt] != null) ? row[dt] : 1;
  });
  return mult;
}

function typeIconURL(type) {
  return `assets/types/${TYPE_COLORS[type] ? type : "normal"}.png`;
}
function typeColor(type) {
  return TYPE_COLORS[type] || TYPE_COLORS.normal;
}
function typeLabel(type) {
  return TYPE_LABELS[type] || "Normal";
}
function damageClassInfo(cls) {
  return DAMAGE_CLASS_INFO[cls] || DAMAGE_CLASS_INFO.status;
}

/* 招式卡：屬性 Icon + 招式名 + 傷害分類 Icon + 威力／PP */
function moveCardHTML(slug, opts) {
  const m = moveInfo(slug);
  const cls = damageClassInfo(m.damage_class);
  const prio = m.priority
    ? `<span class="move-prio">${m.priority > 0 ? "+" : ""}${m.priority} PRI</span>`
    : "";
  return `<div class="move-card" style="--type-color:${typeColor(m.type)}">
    <div class="move-card-head">
      <img class="move-type-icon" src="${typeIconURL(m.type)}" alt="${typeLabel(m.type)}" title="${typeLabel(m.type)}">
      <span class="move-card-name">${escapeHTML(m.name)}</span>
      <span class="move-class" style="color:${cls.color}" title="${cls.label}">${cls.icon}</span>
    </div>
    <div class="move-card-meta">
      <span>Power <b>${m.power == null ? "—" : m.power}</b></span>
      <span>PP <b>${m.pp == null ? "—" : m.pp}</b></span>
      ${m.accuracy == null ? "" : `<span>Acc <b>${m.accuracy}</b></span>`}
      ${prio}
    </div>
    ${opts && opts.hideDesc ? "" : `<div class="move-card-desc">${escapeHTML(m.desc)}</div>`}
  </div>`;
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
  STAT_KEYS.forEach(k => { o[k] = MAX_IV; });
  return o;
}

/* 新抽到嘅 Pokemon：每項 IV 隨機 0-31 */
function randomIvs() {
  const o = {};
  STAT_KEYS.forEach(k => { o[k] = Math.floor(Math.random() * (MAX_IV + 1)); });
  return o;
}

function ivTotal(ivs) {
  return STAT_KEYS.reduce((n, k) => n + (Number(ivs && ivs[k]) || 0), 0);
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
  if (MOVES && MOVES[slug]) return MOVES[slug].name;
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
  if (!entry.nature) {
    entry.nature = randomNature();
    changed = true;
    /* 新補的性格要即刻上雲，否則換裝置／重新登入又會再抽一次 */
    if (window.Sync && Sync.isEnabled && Sync.isEnabled() && entry.uid) {
      try { Sync.patchEntry(entry.uid, { nature: entry.nature }); } catch (e) {}
    }
  }
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
  /* 招式池 backfill：舊 entry（功能前建立）冇 knownMoves → 按所有擁有過嘅形態
     喺現等級內可學嘅招重推（同 deriveEntryFields 一致）。
     空陣列都當缺失：v113 已知 pre-dex derive 會寫 []。
     必須等 POKEMON_DEX 就緒先推 —— 否則 learnset 係空，會寫出「得持有招」
     嘅殘缺池，之後非空就永遠補唔返（migrateEntries 會喺 dex 就緒後強制重推） */
  if (POKEMON_DEX && (!Array.isArray(entry.knownMoves) || entry.knownMoves.length === 0)) {
    const owned = (Array.isArray(entry.ownedSpecies) && entry.ownedSpecies.length) ? entry.ownedSpecies : [dexId];
    const poolSet = new Set(entry.moves.slice());
    owned.forEach(dex => {
      learnsetOf(dex).forEach(l => { if (l.level <= (entry.level || 1)) poolSet.add(l.move); });
    });
    entry.knownMoves = [...poolSet];
    changed = true;
  }
  /* 舊資料（功能前 derive）moves 可能寫成「全部學過」超過 4 招 → trim 至 4，
     多餘嘅留喺 knownMoves 池，Pokédex 會顯示喺 Other Moves 可以換入 */
  if (entry.moves.length > 4) {
    entry.moves = entry.moves.slice(0, 4);
    changed = true;
  }
  if (typeof entry.candies !== "number") { entry.candies = 0; changed = true; }
  if (typeof entry.evPoints !== "number") { entry.evPoints = 0; changed = true; }
  if (typeof entry.dupes !== "number") { entry.dupes = 0; changed = true; }
  if (typeof entry.stars !== "number") {
    entry.stars = Math.min(5, 1 + Math.floor(entry.dupes / 5));
    changed = true;
  }
  /* v140：ownedSpecies null／非陣列 → derive 重推，避免 forEach crash */
  if (!Array.isArray(entry.ownedSpecies) || entry.ownedSpecies.length === 0) {
    const derived = deriveEntryFields(entry);
    entry.ownedSpecies = derived.ownedSpecies || [dexId];
    if (derived.stage) entry.stage = derived.stage;
    changed = true;
  }
  return changed;
}
