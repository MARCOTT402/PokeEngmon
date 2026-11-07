"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.chdir(require("path").join(__dirname, "../.."));   /* data／js 路徑以 repo root 為準 */
/* 狀態系統第一期：戰鬥帶育成 HP／狀態 + 背包藥物 + 過量（npm test（tests/unit/battle_care.test.js）） */
const fs = require("fs"), vm = require("vm");
const ctx = { console, Math, Date, JSON, require, window: {} };
vm.createContext(ctx);
vm.runInContext(["js/gens-data.js", "js/data.js", "js/pokemon.js", "js/battle/rng.js", "js/battle/engine.js", "js/battle/state.js"]
  .map(p => fs.readFileSync(p, "utf8")).join("\n;\n"), ctx);
vm.runInContext(`POKEMON_DEX = ${fs.readFileSync("data/pokemon-151.json")}; MOVES = ${JSON.stringify(JSON.parse(fs.readFileSync("data/moves.json")).moves)}; TYPE_CHART = ${JSON.stringify(JSON.parse(fs.readFileSync("data/type-chart.json")).chart)}; ABILITIES = ${fs.readFileSync("data/abilities.json")};`, ctx);
const { BattleState } = vm.runInContext("({BattleState})", ctx);
const T = (n, c) => { test(String(n), () => assert.ok(c, String(n))); };
const mk = (o) => Object.assign({ uid: "u", chainKey: "bulbasaur", dexId: 1, level: 30, ivs: {}, evs: {}, nature: "hardy", moves: ["tackle"] }, o);
const foe = [mk({ uid: "f" })];

let st = BattleState.create([mk({ battleHp: 500, battleStatus: "brn" })], foe, { seed: 1 });
let p = st.p1.team[0];
T("enters with 50% HP", Math.abs(p.hp / p.maxHp - 0.5) < 0.02);
T("enters burned", p.status === "burn");
st = BattleState.create([mk({ battleHp: 0 })], foe, { seed: 1 }); T("fainted enters at 0", st.p1.team[0].hp === 0);
st = BattleState.create([mk({ battleHp: 1 })], foe, { seed: 1 }); T("1‰ HP shows at least 1", st.p1.team[0].hp === 1);
st = BattleState.create([mk({ battleStatus: "slp" })], foe, { seed: 1 }); T("asleep: 1–3 turns", st.p1.team[0].statusTimer >= 1 && st.p1.team[0].statusTimer <= 3);
st = BattleState.create([mk({ battleStatus: "psn", battlePoison: 2 })], foe, { seed: 1 }); p = st.p1.team[0];
const before = p.hp; BattleState.endTurnResidual(st, "p1"); T("badly poisoned residual = 2 × 1/8", before - p.hp === Math.floor(p.maxHp / 8) * 2);

st = BattleState.create([mk({ battleHp: 400 })], foe, { seed: 1 }); p = st.p1.team[0];
st.turn = 1; BattleState.useItem(st, "p1", "potion", "You");
T("potion +25%", Math.abs(p.hp / p.maxHp - 0.65) < 0.02);
T("battle text", st.log.some(l => l.msg === "You used a Potion!") && st.log.some(l => /recovered \d+ HP!/.test(l.msg)));
st.turn = 2; BattleState.useItem(st, "p1", "potion", "You");
st.turn = 3; BattleState.useItem(st, "p1", "potion", "You");
T("3 meds in 5 turns -> poisoned", p.status === "poison" && !p.severePoison);
st.turn = 4; BattleState.useItem(st, "p1", "potion", "You"); st.turn = 5; BattleState.useItem(st, "p1", "potion", "You"); st.turn = 6; BattleState.useItem(st, "p1", "potion", "You");
T("3 more while poisoned -> badly poisoned", p.severePoison === true);
st.turn = 7; BattleState.useItem(st, "p1", "antidote", "You"); T("antidote cures", p.status === null && !p.severePoison);

st = BattleState.create([mk({ battleStatus: "par" })], foe, { seed: 1 }); p = st.p1.team[0];
const full = p.hp;
st.turn = 1; BattleState.useItem(st, "p1", "potion", "You"); st.turn = 2; BattleState.useItem(st, "p1", "potion", "You"); st.turn = 3; BattleState.useItem(st, "p1", "potion", "You");
T("with paralysis: not overwritten, -25% instead", p.status === "paralyze" && full - p.hp === Math.floor(p.maxHp / 4));

st = BattleState.create([mk({}), mk({ uid: "u2", battleHp: 0 })], foe, { seed: 1 });
T("revive on fainted teammate", BattleState.useItem(st, "p1", "revive", "You", 1) && st.p1.team[1].hp === st.p1.team[1].maxHp);
st.turn = 1; st.p1.team[0].hp = Math.floor(st.p1.team[0].maxHp / 2);
const r = st.p1.team[0];
BattleState.useItem(st, "p1", "potion", "You"); st.turn = 2; BattleState.useItem(st, "p1", "revive", "You", 1); st.turn = 3; BattleState.useItem(st, "p1", "potion", "You");
T("revive doesn't count toward overdose", r.status === null);