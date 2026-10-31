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
const ABILITIES = JSON.parse(fs.readFileSync("data/abilities.json"));
/* pokemon.js 用 let POKEMON_DEX/MOVES/TYPE_CHART/ABILITIES，要喺 context 內賦值 */
vm.runInContext(`POKEMON_DEX = ${JSON.stringify(POKEMON_DEX)}; MOVES = ${JSON.stringify(MOVES)}; TYPE_CHART = ${JSON.stringify(TYPE_CHART)}; ABILITIES = ${JSON.stringify(ABILITIES)};`, ctx);

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
  const skipped = !s.log.some(l => /used /.test(l.msg));
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

/* ---------- 特性系統（v1.15.16） ---------- */
const mk = (dexId, level, moves) => ({ dexId, level, ivs: {}, evs: {}, nature: "hardy", moves });

/* TR-AB1: 特性資料載入（Gastly slot1 = levitate） */
const gastly = Battle.makeBattlePokemon(mk(92, 30, []));
t("Gastly slot1 ability = levitate", gastly.ability === "levitate");

/* TR-AB2: Levitate 免疫地面招 */
const lev = BattleState.create([mk(4, 30, ["earthquake"])], [mk(92, 30, ["tackle"])]);
BattleState.executeMove(lev, "p1", 0);
t("Levitate 擋 earthquake：HP 唔跌", lev.p2.team[0].hp === lev.p2.team[0].maxHp);
t("Levitate 出免疫訊息", lev.log.some(l => /doesn't affect/.test(l.msg)));

/* TR-AB3: 屬性相剋 0 倍零傷（地面打飛行） */
const imm = BattleState.create([mk(4, 30, ["earthquake"])], [mk(16, 30, ["tackle"])]);
BattleState.executeMove(imm, "p1", 0);
t("地面打飛行：零傷", imm.p2.team[0].hp === imm.p2.team[0].maxHp);
t("出「doesn't affect」", imm.log.some(l => /doesn't affect/.test(l.msg)));

/* TR-AB4: Intimidate 上場扣攻 */
const itd = BattleState.create([mk(58, 30, ["tackle"])], [mk(4, 30, ["tackle"])]);
const itdMsgs = BattleState.onSwitchIn(itd, "p1");
t("Intimidate 出訊息", itdMsgs.some(m => /Intimidate/.test(m)));
t("對手 atk stage -1", itd.p2.team[0].statStages.atk === -1);

/* TR-AB5: Sturdy 滿血留 1 HP */
const stu = BattleState.create([mk(4, 50, ["ember"])], [mk(74, 1, ["tackle"])]);
stu.p2.team[0].ability = "sturdy";
BattleState.executeMove(stu, "p1", 0);
t("Sturdy 留 1 HP", stu.p2.team[0].hp === 1);
t("出 Sturdy 訊息", stu.log.some(l => /Sturdy/.test(l.msg)));

/* TR-AB6: Guts（Machop slot1）—— 異常時攻 ×1.5、burn 唔再扣攻 */
const machop = Battle.makeBattlePokemon(mk(66, 30, []));
machop.status = "burn";
const gutsAtk = Battle.effectiveStat(machop, "atk");
t("Guts + burn：atk = base ×1.5", Math.abs(gutsAtk - Math.floor(machop.stats.atk * 1.5)) <= 1);

/* TR-AB7: stat_changes alias 修正（Growl 真係降到攻） */
const gr = BattleState.create([mk(4, 15, ["growl"])], [mk(1, 15, [])]);
BattleState.executeMove(gr, "p1", 0);
t("Growl 後 target atk stage = -1", gr.p2.team[0].statStages.atk === -1);
t("冇再寫錯 key", gr.p2.team[0].statStages.attack === undefined);

/* TR-AB8: Hyper Cutter（Krabby slot1）擋降攻 */
const hc = BattleState.create([mk(1, 15, ["growl"])], [mk(98, 15, [])]);
BattleState.executeMove(hc, "p1", 0);
t("Hyper Cutter 唔跌攻", hc.p2.team[0].statStages.atk === 0);
t("出 Hyper Cutter 訊息", hc.log.some(l => /Hyper Cutter/.test(l.msg)));

/* TR-AB9: Insomnia（Drowzee slot1）擋睡眠 */
const ins = BattleState.create([mk(1, 15, ["spore"])], [mk(96, 15, [])]);
BattleState.executeMove(ins, "p1", 0);
t("Insomnia 唔會瞓", ins.p2.team[0].status === null);
t("出特性訊息", ins.log.some(l => /Insomnia/.test(l.msg)));

/* TR-AB10: Volt Absorb（Jolteon slot1）吸電回血 1/4 */
const va = BattleState.create([mk(25, 30, ["thunderbolt"])], [mk(135, 30, ["tackle"])]);
va.p2.team[0].hp = Math.floor(va.p2.team[0].maxHp / 2);
BattleState.executeMove(va, "p1", 0);
t("Volt Absorb 回復 1/4", va.p2.team[0].hp === Math.floor(va.p2.team[0].maxHp / 2) + Math.floor(va.p2.team[0].maxHp / 4));
t("出 absorb 訊息", va.log.some(l => /absorbed/.test(l.msg)));

/* TR-AB11: Speed Boost 回合完提速 */
const sb = BattleState.create([mk(4, 30, ["tackle"])], [mk(1, 30, [])]);
sb.p1.team[0].ability = "speed-boost";
BattleState.endTurnResidual(sb, "p1");
t("Speed Boost +1 spe", sb.p1.team[0].statStages.spe === 1);

/* TR-AB12: Thick Fat 火傷減半 */
const tfA = Battle.makeBattlePokemon(mk(4, 30, []));
const tfB = Battle.makeBattlePokemon(mk(1, 30, []));
const emberInfo = ctx.moveInfo("ember");
const noTF = Battle.computeDamage(tfA, tfB, emberInfo, {}).damage;
tfB.ability = "thick-fat";
const withTF = Battle.computeDamage(tfA, tfB, emberInfo, {}).damage;
t("Thick Fat 火傷減半", withTF <= noTF * 0.65);

/* TR-AB13: Flash Fire 吸火零傷 + flag */
const ff = BattleState.create([mk(4, 30, ["ember"])], [mk(1, 30, [])]);
ff.p2.team[0].ability = "flash-fire";
BattleState.executeMove(ff, "p1", 0);
t("Flash Fire 零傷", ff.p2.team[0].hp === ff.p2.team[0].maxHp);
t("flashFire flag 著咗", ff.p2.team[0].volatile.flashFire === true);

/* TR-AB14: Overgrow（Bulbasaur slot1）HP≤1/3 草招 ×1.5 */
const ogA = Battle.makeBattlePokemon(mk(1, 30, []));
const ogB = Battle.makeBattlePokemon(mk(4, 30, []));
const vwInfo = ctx.moveInfo("vine-whip");
const ogFull = Battle.computeDamage(ogA, ogB, vwInfo, {}).damage;
ogA.hp = Math.floor(ogA.maxHp / 3);
const ogPinch = Battle.computeDamage(ogA, ogB, vwInfo, {}).damage;
t("Overgrow pinch 草招加強", ogPinch >= ogFull * 1.3);

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
