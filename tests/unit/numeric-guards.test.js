"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.chdir(require("path").join(__dirname, "../.."));   /* data／js 路徑以 repo root 為準 */
/* 數值兜底測試（Rule 99）：傷害公式、HP、存檔計數、Guard helpers 遇到 undefined／NaN／字串都要回有限值
   用法：npm test（tests/unit/numeric_guards.test.js） */
const fs = require("fs");
const vm = require("vm");


const t = (name, cond) => { test(String(name), () => assert.ok(cond, String(name))); };
const fin = v => typeof v === "number" && Number.isFinite(v);

/* ---------- 戰鬥 ---------- */
const reports = [];
const ctx = { console, Math, Date, JSON, require, window: {} };
ctx.window.Guard = { report: (e, c) => reports.push((c && c.where) + ": " + e.message) };
ctx.Guard = ctx.window.Guard;
vm.createContext(ctx);
const src = ["js/gens-data.js", "js/data.js", "js/pokemon.js", "js/battle/rng.js", "js/battle/engine.js", "js/battle/state.js"]
  .map(p => fs.readFileSync(p, "utf8")).join("\n;\n");
vm.runInContext(src, ctx, { filename: "battle-bundle.js" });
const POKEMON_DEX = JSON.parse(fs.readFileSync("data/pokemon-151.json"));
const MOVES = JSON.parse(fs.readFileSync("data/moves.json")).moves;
const TYPE_CHART = JSON.parse(fs.readFileSync("data/type-chart.json")).chart;
const ABILITIES = JSON.parse(fs.readFileSync("data/abilities.json"));
vm.runInContext(`POKEMON_DEX = ${JSON.stringify(POKEMON_DEX)}; MOVES = ${JSON.stringify(MOVES)}; TYPE_CHART = ${JSON.stringify(TYPE_CHART)}; ABILITIES = ${JSON.stringify(ABILITIES)};`, ctx);
const { Battle, BattleState, BattleRng } = vm.runInContext("({Battle, BattleState, BattleRng})", ctx);

const mk = (dex, moves) => Battle.makeBattlePokemon({ dexId: dex, level: 20, ivs: {}, evs: {}, nature: "hardy", moves: moves || ["tackle"] });
const tackle = ctx.moveInfo("tackle");

/* 正常輸入：結果同改之前一樣係有限正整數 */
const a0 = mk(4), b0 = mk(1);
const d0 = Battle.computeDamage(a0, b0, tackle, {}).damage;
t("normal damage finite >= 1", fin(d0) && d0 >= 1);

/* 壞輸入：level undefined、stats 冇、power 字串 */
const bad = [
  ["level undefined", () => { const a = mk(4); a.level = undefined; return [a, mk(1), tackle]; }],
  ["level NaN", () => { const a = mk(4); a.level = NaN; return [a, mk(1), tackle]; }],
  ["attacker stats missing", () => { const a = mk(4); a.stats = {}; return [a, mk(1), tackle]; }],
  ["defender def undefined", () => { const b = mk(1); b.stats.def = undefined; return [mk(4), b, tackle]; }],
  ["move power string", () => [mk(4), mk(1), Object.assign({}, tackle, { power: "abc" })]],
  ["move power undefined", () => [mk(4), mk(1), Object.assign({}, tackle, { power: undefined })]],
  ["statStages NaN", () => { const a = mk(4); a.statStages.atk = NaN; return [a, mk(1), tackle]; }]
];
bad.forEach(([name, make]) => {
  const [a, b, m] = make();
  const r = Battle.computeDamage(a, b, m, {});
  t("computeDamage finite: " + name + " (" + r.damage + ")", fin(r.damage) && r.damage >= 0 && fin(r.effectiveness));
});

/* RNG 抽數次序唔變（PvP 兩邊要一致）：壞輸入同好輸入都只抽 1 次 */
BattleRng.seed && BattleRng.seed(12345);
const before = BattleRng.next();
BattleRng.seed && BattleRng.seed(12345);
const aBad = mk(4); aBad.level = undefined;
Battle.computeDamage(aBad, mk(1), tackle, {});
const afterBad = BattleRng.next();
BattleRng.seed && BattleRng.seed(12345);
Battle.computeDamage(mk(4), mk(1), tackle, {});
const afterGood = BattleRng.next();
t("RNG consumption identical for bad vs good input", !BattleRng.seed || afterBad === afterGood);
void before;

/* HP 兜底：NaN／Infinity／負數／超 maxHp 都夾返；NaN 當暈 → 戰鬥可以完 */
const state = { p1: { team: [mk(4), mk(7)] }, p2: { team: [mk(1)] } };
state.p1.team[0].hp = NaN;
state.p1.team[1].hp = Infinity;
state.p2.team[0].hp = NaN;
state.p2.team[0].maxHp = undefined;
BattleState.checkFinished(state);
t("NaN hp → 0", state.p1.team[0].hp === 0);
t("Infinity hp → 0", state.p1.team[1].hp === 0);
t("maxHp repaired >= 1", fin(state.p2.team[0].maxHp) && state.p2.team[0].maxHp >= 1);
t("battle can finish after NaN", state.finished === true);
const s2 = { p1: { team: [mk(4)] }, p2: { team: [mk(1)] } };
s2.p1.team[0].hp = -5; s2.p2.team[0].hp = 99999;
BattleState.checkFinished(s2);
t("negative hp → 0", s2.p1.team[0].hp === 0);
t("hp > maxHp clamped", s2.p2.team[0].hp === s2.p2.team[0].maxHp);
t("guards reported", reports.length > 0);

/* ---------- 存檔計數 ---------- */
const store = new Map();
const sctx = {
  console, JSON, Math, Date, Object, Array, Number, String, Error, Set, Map, RegExp,
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  setTimeout: () => 0, crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000000" }
};
sctx.window = sctx;
sctx.Guard = { report: () => { sctx.rep = (sctx.rep || 0) + 1; } };
vm.createContext(sctx);
vm.runInContext(fs.readFileSync("js/storage.js", "utf8"), sctx);
vm.runInContext(`const st = loadState(); st.diamonds = 42; saveState({ now: true });
  st.diamonds = undefined; saveState({ now: true });`, sctx);
let saved = JSON.parse(store.get("pokeengmon_state_v1"));
t("diamonds undefined → last good (42)", saved.diamonds === 42);
vm.runInContext(`loadState().diamonds = "17"; saveState({ now: true });`, sctx);
saved = JSON.parse(store.get("pokeengmon_state_v1"));
t("diamonds numeric string → number", saved.diamonds === 17);
vm.runInContext(`loadState().totalQuestions = NaN; saveState({ now: true });`, sctx);
saved = JSON.parse(store.get("pokeengmon_state_v1"));
t("totalQuestions NaN → finite", fin(saved.totalQuestions));
t("state guards reported", sctx.rep >= 2);

/* ---------- Guard helpers ---------- */
const gctx = { console, JSON, Math, Date, Number, String, Error, Map, Object, Array, setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: "", onLine: true }, location: { protocol: "http:", hostname: "localhost", origin: "" },
  document: { currentScript: null, addEventListener() {}, querySelector: () => null, getElementById: () => null, visibilityState: "visible" },
  addEventListener() {}, innerWidth: 400, innerHeight: 800, matchMedia: () => ({ matches: false }) };
gctx.window = gctx;
vm.createContext(gctx);
vm.runInContext(fs.readFileSync("js/core/guard.js", "utf8"), gctx);
const G = gctx.Guard;
t("num(undefined)=0", G.num(undefined) === 0);
t("num('abc',5)=5", G.num("abc", 5) === 5);
t("num(Infinity,1)=1", G.num(Infinity, 1) === 1);
t("num('3.5')=3.5", G.num("3.5") === 3.5);
t("clamp(NaN,0,10)=0", G.clamp(NaN, 0, 10) === 0);
t("clamp(99,0,10)=10", G.clamp(99, 0, 10) === 10);
t("posDim(0,100)=100", G.posDim(0, 100) === 100);
t("posDim(-3)=1", G.posDim(-3) === 1);
t("safeJSON bad", G.safeJSON("{bad", "fb") === "fb");
t("safeJSON null", G.safeJSON("null", "fb") === "fb");
