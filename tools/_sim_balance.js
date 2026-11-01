/* 臨時：難度平衡模擬（Easy/Normal/Hard/Inferno 勝率）
   用真引擎跑 Monte Carlo，玩家隊 = 對手隊同物種同等級（鏡像基準）
   用法：node tools/_sim_balance.js */
const fs = require("fs");
const vm = require("vm");
const ctx = { console, Math, Date, JSON, require, window: {} };
vm.createContext(ctx);
const src = ["js/gens-data.js", "js/data.js", "js/pokemon.js", "js/battle/rng.js", "js/battle/engine.js", "js/battle/state.js"]
  .map(p => fs.readFileSync(p, "utf8")).join("\n;\n");
vm.runInContext(src, ctx, { filename: "battle-bundle.js" });
const { Battle, BattleState, moveInfo, learnsetOf } = vm.runInContext(
  "({Battle, BattleState, moveInfo, learnsetOf})", ctx);

const POKEMON_DEX = { pokemon: {} };
["data/pokemon-151.json", "data/pokemon-gen2.json", "data/pokemon-gen3.json", "data/pokemon-gen4.json", "data/pokemon-gen5.json"]
  .forEach(f => {
    const d = JSON.parse(fs.readFileSync(f));
    Object.keys(d).forEach(k => { if (k === "pokemon") Object.assign(POKEMON_DEX.pokemon, d.pokemon); else POKEMON_DEX[k] = d[k]; });
  });
const MOVES = JSON.parse(fs.readFileSync("data/moves.json")).moves;
const TYPE_CHART = JSON.parse(fs.readFileSync("data/type-chart.json")).chart;
const ABILITIES = JSON.parse(fs.readFileSync("data/abilities.json"));
vm.runInContext(`POKEMON_DEX = ${JSON.stringify(POKEMON_DEX)}; MOVES = ${JSON.stringify(MOVES)}; TYPE_CHART = ${JSON.stringify(TYPE_CHART)}; ABILITIES = ${JSON.stringify(ABILITIES)};`, ctx);

/* ---------- 訓練家（同 battle.js 一致） ---------- */
const AI_TRAINERS = [
  { id: "youngster", baseLevel: 5, team: [19] },
  { id: "bugcatcher", baseLevel: 8, team: [10, 11, 13, 14, 46, 48] },
  { id: "lass", baseLevel: 14, team: [133, 16] },
  { id: "hiker", baseLevel: 22, team: [74, 95, 66] },
  { id: "gentleman", baseLevel: 30, team: [96, 41] },
  { id: "swimmer", baseLevel: 38, team: [129, 60, 120, 116, 90, 98] },
  { id: "ace", baseLevel: 46, team: [359, 282, 306, 130] },
  { id: "jasmine", baseLevel: 55, team: [208, 227, 82] },
  { id: "psychic", baseLevel: 64, team: [65, 196, 97, 80, 121, 282] },
  { id: "cynthia", baseLevel: 76, team: [445, 448, 468, 350, 442] },
  { id: "alder", baseLevel: 82, team: [637, 534, 621, 626, 584, 571] },
  { id: "drake", baseLevel: 90, team: [373, 149, 445, 635, 230, 330] },
  { id: "anabel", baseLevel: 95, team: [65, 381, 380, 143, 245, 376] },
  { id: "red", baseLevel: 99, team: [25, 143, 6, 9, 3, 131] }
];

const TIERS = ["easy", "normal", "hard", "inferno"];

/* 可調參數：node tools/_sim_balance.js 40 [trainers] --hl=1.0 --hev=none */
function flag(name, dflt) {
  const hit = process.argv.find(a => a.startsWith("--" + name + "="));
  return hit ? hit.split("=")[1] : dflt;
}
const HARD_LV = Number(flag("hl", "1.1"));
const HARD_EVS = flag("hev", "main");
const HARD_IVS = flag("hiv", "perfect");
const HARD_PD = Number(flag("pd", "-1"));

function foeLevel(t, tier) {
  if (tier === "easy") {
    const v = Math.round(t.baseLevel * 0.9 * (t.team.length >= 6 ? 0.9 : 1));
    return Math.max(1, Math.min(100, v));
  }
  if (tier === "hard") return Math.max(1, Math.min(100, Math.round(t.baseLevel * HARD_LV)));
  return t.baseLevel;
}
function playerSlots(aiCount, tier) {
  if (tier === "easy") return Math.min(6, aiCount + 1);
  if (tier === "hard") return Math.max(1, aiCount + HARD_PD);
  if (tier === "inferno") return Math.max(1, aiCount - 1);
  return aiCount;
}
function ivs(mode, rng) {
  if (mode === "perfect") return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  if (mode === "zero") return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const o = {};
  ["hp", "atk", "def", "spa", "spd", "spe"].forEach(k => { o[k] = Math.floor(rng() * 32); });
  return o;
}
function evsFor(mode, dexId) {
  if (mode !== "main") return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const p = POKEMON_DEX.pokemon[String(dexId)];
  const phys = p && p.stats ? p.stats.atk >= p.stats.spa : true;
  return { hp: 6, atk: phys ? 252 : 0, def: 0, spa: phys ? 0 : 252, spd: 0, spe: 252 };
}
function natureFor(mode, dexId) {
  if (mode !== "best") return "hardy";
  const p = POKEMON_DEX.pokemon[String(dexId)];
  const phys = p && p.stats ? p.stats.atk >= p.stats.spa : true;
  return phys ? "adamant" : "modest";
}
/* 招式：該等級學到、按威力排序取最多 4 招（模擬一個有做功課的玩家） */
function movesFor(dexId, level, count) {
  const ls = learnsetOf(dexId).filter(m => m.level <= level);
  const seen = new Set();
  const list = [];
  ls.forEach(m => { if (!seen.has(m.move)) { seen.add(m.move); list.push(m.move); } });
  const score = slug => {
    const i = MOVES[slug] || {};
    return (i.power || 0) + (i.category === "status" ? -50 : 0);
  };
  let out = list.slice().sort((a, b) => score(b) - score(a)).slice(0, count || 4);
  if (out.length < 2) out = level1Moves(dexId);
  if (!out.length) out = ["tackle"];
  return out;
}
function level1Moves(dexId) {
  const ls = learnsetOf(dexId).filter(m => m.level <= 1).map(m => m.move);
  return [...new Set(ls)].slice(0, 4);
}
function buildEntry(dexId, level, mode, rng, moveCount) {
  return {
    dexId, level,
    ivs: ivs(mode.ivs, rng),
    evs: evsFor(mode.evs, dexId),
    nature: natureFor(mode.nature, dexId),
    moves: movesFor(dexId, level, moveCount),
    ability: null
  };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pickGreedy(state, side, allowedIdx) {
  const me = BattleState.active(state, side);
  const foe = BattleState.active(state, BattleState.otherSide(side));
  let best = null, bestDmg = -1;
  const idxs = allowedIdx || me.moves.map((_, i) => i);
  idxs.forEach(i => {
    if (me.moves[i].pp <= 0) return;
    const info = moveInfo(me.moves[i].slug);
    let dmg = 0;
    if (info && info.power) dmg = Battle.computeDamage(me, foe, info, {}).damage;
    if (dmg > bestDmg) { bestDmg = dmg; best = i; }
  });
  if (best == null) best = 0;
  return best;
}

function nextAlive(team, from) {
  for (let k = 1; k <= team.length; k++) {
    const idx = (from + k) % team.length;
    if (team[idx].hp > 0) return idx;
  }
  return -1;
}

function simulate(trainer, tier, seed) {
  const rng = mulberry32(seed);
  const lvF = foeLevel(trainer, tier);
  const lvP = tier === "inferno" ? Math.min(100, trainer.baseLevel + 2) : trainer.baseLevel;
  const nFoe = trainer.team.length;
  const nMe = playerSlots(nFoe, tier);

  const foePreset = tier === "easy" ? { ivs: "zero", evs: "none", nature: "neutral" }
    : tier === "normal" ? { ivs: "random", evs: "none", nature: "random" }
      : { ivs: tier === "hard" ? HARD_IVS : "perfect", evs: tier === "hard" ? HARD_EVS : "main", nature: "best" };
  const mePreset = { ivs: "random", evs: "none", nature: "neutral" };

  /* 玩家隊：假設玩家有足夠數量（唔夠就用輪換補滿），模擬「玩家帶 N 隻」 */
  const mySpecies = [];
  for (let i = 0; i < nMe; i++) mySpecies.push(trainer.team[i % trainer.team.length]);
  const foeEntries = trainer.team.slice(0, nFoe).map(d => buildEntry(d, lvF, foePreset, rng, 4));
  const meEntries = mySpecies.map(d => buildEntry(d, lvP, mePreset, rng, 4));

  const state = BattleState.create(meEntries, foeEntries, { seed: seed * 31 + 7 });
  let aiPotion = tier === "inferno" ? 1 : 0;
  let guard = 0;

  while (!BattleState.checkFinished(state) && guard++ < 400) {
    const myIdx = pickGreedy(state, "p1");
    const foeAllowed = tier === "easy"
      ? state.p2.team[state.p2.active].moves.map((_, i) => i).slice(-2) /* 最弱兩招（movesFor 已按威力排序） */
      : null;
    let foeIdx = pickGreedy(state, "p2", foeAllowed);
    /* Inferno：低血量先用 Potion（當成消耗一次行動） */
    const foeAct = (aiPotion > 0 && state.p2.team[state.p2.active].hp <= state.p2.team[state.p2.active].maxHp * 0.4)
      ? { kind: "item" } : { kind: "move", idx: foeIdx };
    const myMove = moveInfo(state.p1.team[state.p1.active].moves[myIdx].slug);
    const foeMove = foeAct.kind === "move" ? moveInfo(state.p2.team[state.p2.active].moves[foeIdx].slug) : null;
    const order = Battle.turnOrder(
      { kind: "move", side: "p1", priority: myMove ? myMove.priority : 0, speed: Battle.effectiveStat(state.p1.team[state.p1.active], "spe", false) },
      { kind: foeAct.kind, side: "p2", priority: foeMove ? foeMove.priority : 6, speed: Battle.effectiveStat(state.p2.team[state.p2.active], "spe", false) }
    );

    for (const act of order) {
      const side = act.side;
      const active = BattleState.active(state, side);
      if (active.hp <= 0) continue;
      if (act.kind === "item") {
        BattleState.useItem(state, "p2", "potion", "ai");
        aiPotion -= 1;
      } else {
        BattleState.executeMove(state, side, side === "p1" ? myIdx : foeIdx);
      }
      if (BattleState.checkFinished(state)) break;
      /* 倒下一隻：換下一隻出場 */
      [state.p1, state.p2].forEach(t => {
        if (t.team[t.active].hp > 0) return;
        const nx = nextAlive(t.team, t.active);
        if (nx >= 0) { t.active = nx; }
      });
    }
    if (BattleState.checkFinished(state)) break;
    BattleState.endTurnResidual(state, "p1");
    BattleState.endTurnResidual(state, "p2");
    BattleState.endTurnField(state);
  }

  return state.winner === "p1";
}

function run(trainer, tier, n) {
  let wins = 0;
  for (let i = 0; i < n; i++) if (simulate(trainer, tier, 1000 + i * 977)) wins++;
  return wins / n;
}

const N = Number(process.argv[2] || 40);
const only = process.argv[3] ? process.argv[3].split(",") : null;
const list = only ? AI_TRAINERS.filter(t => only.includes(t.id)) : AI_TRAINERS;

console.log(`battles per combo: ${N}`);
console.log("trainer".padEnd(12), "Lv".padEnd(9), TIERS.map(t => t.padEnd(10)).join(""));
const sums = { easy: 0, normal: 0, hard: 0, inferno: 0 };
for (const t of list) {
  const cells = [];
  TIERS.forEach(tier => {
    const wr = run(t, tier, N);
    sums[tier] += wr;
    cells.push((wr * 100).toFixed(0).padStart(3) + "%     ");
  });
  console.log(t.id.padEnd(12), `${foeLevel(t, "easy")}-${foeLevel(t, "hard")}`.padEnd(9), cells.join(""));
}
console.log("-".repeat(60));
console.log("average".padEnd(21), TIERS.map(t => ((sums[t] / list.length) * 100).toFixed(0).padStart(3) + "%     ").join(""));
