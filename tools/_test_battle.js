/* 臨時測試：battle engine + state */
const fs = require("fs");
const vm = require("vm");
const ctx = { console, Math, Date, JSON, require, window: {} };
vm.createContext(ctx);
/* 所有 js 喺同一個 context 跑（const 跨 script 先互通） */
const src = ["js/gens-data.js", "js/data.js", "js/pokemon.js", "js/battle/engine.js", "js/battle/state.js"]
  .map(p => fs.readFileSync(p, "utf8")).join("\n;\n");
vm.runInContext(src, ctx, { filename: "battle-bundle.js" });
const { Battle, BattleState, moveInfo, entryCurrentSpecies, calcStats } =
  vm.runInContext("({Battle, BattleState, moveInfo, entryCurrentSpecies, calcStats})", ctx);

const POKEMON_DEX = JSON.parse(fs.readFileSync("data/pokemon-151.json"));
const MOVES = JSON.parse(fs.readFileSync("data/moves.json")).moves;
const TYPE_CHART = JSON.parse(fs.readFileSync("data/type-chart.json")).chart;
/* pokemon.js 用 let POKEMON_DEX/MOVES/TYPE_CHART，要喺 context 內賦值 */
vm.runInContext(`POKEMON_DEX = ${JSON.stringify(POKEMON_DEX)}; MOVES = ${JSON.stringify(MOVES)}; TYPE_CHART = ${JSON.stringify(TYPE_CHART)};`, ctx);

let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }

/* TR-2.1: priority */
const a = { kind: "move", priority: 1, speed: 1 };
const b = { kind: "move", priority: 0, speed: 100 };
const ord = Battle.turnOrder(a, b);
t("priority+1 先出", ord[0] === a);

/* TR-2.2: 傷害公式含 STAB + 相剋 */
const charmander = Battle.makeBattlePokemon({ chainKey: "charmander", stage: 1, dexId: 4, level: 15, ivs: {}, evs: {}, nature: "hardy", moves: ["ember"] });
const bulbasaur = Battle.makeBattlePokemon({ chainKey: "bulbasaur", stage: 1, dexId: 1, level: 15, ivs: {}, evs: {}, nature: "hardy", moves: [] });
const ember = ctx.moveInfo("ember");
let total = 0, n = 50;
for (let i = 0; i < n; i++) total += Battle.computeDamage(charmander, bulbasaur, ember, {}).damage;
const avg = total / n;
t("Ember 打草有相剋+STAB，平均傷害 > 10", avg > 10);
console.log("Ember avg damage:", avg.toFixed(1));

/* TR-3.1: paralyze skip ~25% */
const p = Battle.makeBattlePokemon({ dexId: 4, level: 15, ivs: {}, evs: {}, nature: "hardy", moves: ["tackle"] });
p.status = "paralyze";
let skips = 0, turns = 2000;
for (let i = 0; i < turns; i++) {
  const s = BattleState.create([{ dexId: 4, level: 15, ivs: {}, evs: {}, nature: "hardy", moves: ["tackle"] }], [{ dexId: 1, level: 15, ivs: {}, evs: {}, nature: "hardy", moves: [] }]);
  s.p1.team[0].status = "paralyze";
  BattleState.executeMove(s, "p1", 0);
  const skipped = !s.log.some(l => /使出/.test(l.msg));
  if (skipped) skips++;
}
const rate = skips / turns;
t("paralyze skip 率 ~25%", rate > 0.18 && rate < 0.32);
console.log("paralyze skip rate:", (rate * 100).toFixed(1) + "%");

/* TR-3.2: Swords Dance atk+2 */
const atk0 = Battle.effectiveStat(Battle.makeBattlePokemon({ dexId: 4, level: 15, ivs: {}, evs: {}, nature: "hardy", moves: [] }), "atk");
const sd = Battle.makeBattlePokemon({ dexId: 4, level: 15, ivs: {}, evs: {}, nature: "hardy", moves: [] });
sd.statStages.atk = 2;
const atk2 = Battle.effectiveStat(sd, "atk");
t("atk+2 = base × 2", Math.abs(atk2 - atk0 * 2) < 2);
console.log("atk base:", atk0, "atk+2:", atk2);

/* TR-3.3: multi-hit 2-5 */
let counts = new Set();
for (let i = 0; i < 200; i++) counts.add(Battle.rollHitCount(2, 5));
t("hit count ∈ {2,3,4,5}", [...counts].every(c => c >= 2 && c <= 5) && counts.has(2) && counts.has(5));
console.log("hit counts seen:", [...counts].sort().join(","));

/* 完整對戰模擬：Charmander vs Bulbasaur */
const state = BattleState.create(
  [{ dexId: 4, level: 15, ivs: {}, evs: {}, nature: "hardy", moves: ["ember", "scratch", "growl", "smokescreen"] }],
  [{ dexId: 1, level: 15, ivs: {}, evs: {}, nature: "hardy", moves: ["tackle", "growl", "leech-seed", "vine-whip"] }]
);
let guard = 0;
while (!BattleState.checkFinished(state) && guard++ < 100) {
  state.turn++;
  const myMove = Math.floor(Math.random() * 4);
  const foeMove = Math.floor(Math.random() * 4);
  const myAct = { kind: "move", priority: ctx.moveInfo(state.p1.team[0].moves[myMove].slug).priority, speed: Battle.effectiveStat(state.p1.team[0], "spe") };
  const foeAct = { kind: "move", priority: ctx.moveInfo(state.p2.team[0].moves[foeMove].slug).priority, speed: Battle.effectiveStat(state.p2.team[0], "spe") };
  const order = Battle.turnOrder(myAct, foeAct);
  order.forEach(act => {
    if (state.finished) return;
    const side = act === myAct ? "p1" : "p2";
    BattleState.executeMove(state, side, side === "p1" ? myMove : foeMove);
    BattleState.checkFinished(state);
  });
  BattleState.endTurnResidual(state, "p1");
  BattleState.endTurnResidual(state, "p2");
}
t("對戰有勝負", state.finished && state.winner);
console.log("對戰結果:", state.winner, "回合:", state.turn);

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
