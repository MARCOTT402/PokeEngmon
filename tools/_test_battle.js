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

/* ---------- 場地效果（v1.15.18）：天氣 + 釘子 + 壁 ---------- */

/* TR-F1: 天氣招設定 + 互斥（新蓋舊） */
const fw = BattleState.create([mk(4, 30, ["sunny-day", "rain-dance"])], [mk(1, 30, [])]);
BattleState.executeMove(fw, "p1", 0);
t("Sunny Day 出太陽", fw.weather && fw.weather.name === "sun" && fw.weather.turns === 5);
BattleState.executeMove(fw, "p1", 1);
t("Rain Dance 蓋過太陽", fw.weather && fw.weather.name === "rain" && fw.weather.turns === 5);
t("晴天 log 出咗", fw.log.some(l => /sunlight turned harsh/.test(l.msg)));

/* TR-F2: 晴天火×1.5／水×0.5；雨天反轉 */
const sunA = Battle.makeBattlePokemon(mk(4, 30, []));   /* Charmander */
const sunB = Battle.makeBattlePokemon(mk(7, 30, []));   /* Squirtle */
const emberI = ctx.moveInfo("ember");
const noW = Battle.computeDamage(sunA, sunB, emberI, {}).damage;
const inSun = Battle.computeDamage(sunA, sunB, emberI, { weather: "sun" }).damage;
const inRain = Battle.computeDamage(sunA, sunB, emberI, { weather: "rain" }).damage;
t("晴天火招加強 ~×1.5", inSun >= noW * 1.3);
t("雨天火招減弱 ~×0.5", inRain <= noW * 0.7);

/* TR-F3: 天氣倒數 + 5 回合後消散 */
const fw3 = BattleState.create([mk(4, 30, [])], [mk(1, 30, [])]);
fw3.weather = { name: "sandstorm", turns: 1 };
BattleState.endTurnField(fw3);
t("沙暴 1 回合後消散", fw3.weather === null);
t("出消散 log", fw3.log.some(l => /subsided/.test(l.msg)));

/* TR-F4: 沙暴 chip 1/16，岩/地/鋼免疫 */
const chip = BattleState.create([mk(4, 30, [])], [mk(95, 30, [])]);   /* p2 Onix = rock/ground */
chip.weather = { name: "sandstorm", turns: 5 };
const cHp1 = chip.p1.team[0].hp;
BattleState.endTurnResidual(chip, "p1");
BattleState.endTurnResidual(chip, "p2");
t("Charmander 被沙暴磨 1/16", cHp1 - chip.p1.team[0].hp === Math.floor(chip.p1.team[0].maxHp / 16));
t("Onix 岩屬性免疫沙暴", chip.p2.team[0].hp === chip.p2.team[0].maxHp);

/* TR-F5: Reflect 物理半減（crit 無視）；Light Screen 特殊半減 */
const scA = Battle.makeBattlePokemon(mk(4, 30, []));
const scB = Battle.makeBattlePokemon(mk(1, 30, []));
const tackleI = ctx.moveInfo("tackle");
const noRef = Battle.computeDamage(scA, scB, tackleI, {}).damage;
const withRef = Battle.computeDamage(scA, scB, tackleI, { reflect: true }).damage;
const critRef = Battle.computeDamage(scA, scB, tackleI, { reflect: true, crit: true }).damage;
t("Reflect 物理半減", withRef <= noRef * 0.65);
t("crit 無視 Reflect", critRef > withRef);
const noLS = Battle.computeDamage(scA, scB, emberI, {}).damage;
const withLS = Battle.computeDamage(scA, scB, emberI, { lightScreen: true }).damage;
t("Light Screen 特殊半減", withLS <= noLS * 0.65);

/* TR-F6: 壁招式開喺自己嗰邊 + 5 回合倒數 */
const scr = BattleState.create([mk(4, 30, ["reflect"])], [mk(1, 30, [])]);
BattleState.executeMove(scr, "p1", 0);
t("Reflect 開喺 p1 側", scr.p1.side.reflect === 5 && scr.p2.side.reflect === 0);
BattleState.executeMove(scr, "p1", 0);
t("重複開壁失敗", scr.log.filter(l => /But it failed/.test(l.msg)).length === 1 && scr.p1.side.reflect === 5);

/* TR-F7: Spikes 分層傷害 + 飛行免疫 */
const spk = BattleState.create([mk(4, 30, ["spikes"]), mk(1, 30, [])], [mk(1, 30, [])]);
BattleState.executeMove(spk, "p1", 0);
BattleState.executeMove(spk, "p1", 0);
t("Spikes 疊到 2 層", spk.p2.side.spikes === 2);
BattleState.switchTo(spk, "p2", 0);
const spkMsgs = BattleState.applyEntryHazards(spk, "p2");
t("2 層 spikes 扣 1/6", spk.p2.team[0].hp === spk.p2.team[0].maxHp - Math.max(1, Math.floor(spk.p2.team[0].maxHp / 6)));
t("出 spikes log", spkMsgs.some(m => /spikes/.test(m)));
/* 飛行免疫 */
const fly = BattleState.create([mk(4, 30, [])], [mk(16, 30, [])]);   /* Pidgey */
fly.p2.side.spikes = 3;
const flyMsgs = BattleState.applyEntryHazards(fly, "p2");
t("飛行屬性免疫 spikes", fly.p2.team[0].hp === fly.p2.team[0].maxHp && flyMsgs.length === 0);

/* TR-F8: Stealth Rock 按岩相性扣血（火 2× 弱岩 → 1/4） */
const sr = BattleState.create([mk(4, 30, [])], [mk(6, 30, [])]);   /* Charizard fire/flying 4× 弱岩 */
sr.p2.side.stealthRock = true;
const srMsgs = BattleState.applyEntryHazards(sr, "p2");
t("Charizard 4× 弱岩食 1/2", sr.p2.team[0].hp === sr.p2.team[0].maxHp - Math.max(1, Math.floor(sr.p2.team[0].maxHp / 2)));
t("出 stones log", srMsgs.some(m => /Pointed stones/.test(m)));

/* TR-F9: Weather Ball 有場時轉屬性＋100 威力 */
const wb = BattleState.create([mk(4, 30, ["weather-ball"])], [mk(1, 30, [])]);
wb.weather = { name: "sun", turns: 5 };
const wbHp0 = wb.p2.team[0].hp;
BattleState.executeMove(wb, "p1", 0);
t("Weather Ball 晴天打出傷害（100 威力火）", wb.p2.team[0].hp < wbHp0);
t("出 super effective（火打草）", wb.log.some(l => /super effective/.test(l.msg)));

/* TR-F10: Blizzard 雹天必中 */
const blz = BattleState.create([mk(4, 30, ["blizzard"])], [mk(1, 30, [])]);
blz.weather = { name: "hail", turns: 5 };
let blzHit = 0;
for (let i = 0; i < 50; i++) {
  const s = BattleState.create([mk(4, 30, ["blizzard"])], [mk(1, 30, [])]);
  s.weather = { name: "hail", turns: 5 };
  BattleState.executeMove(s, "p1", 0);
  if (!s.log.some(l => /missed/.test(l.msg))) blzHit++;
}
t("Blizzard 雹天 50/50 必中", blzHit === 50);

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
