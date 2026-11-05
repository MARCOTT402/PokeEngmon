/* 背包第 4b 段：攜帶樹果自動觸發（node tools/_test_held_berries.js） */
const fs = require("fs"), vm = require("vm");
const ctx = { console, Math, Date, JSON, require, window: {} };
vm.createContext(ctx);
vm.runInContext(["js/gens-data.js", "js/data.js", "js/pokemon.js", "js/battle/rng.js", "js/battle/engine.js", "js/battle/state.js"]
  .map(p => fs.readFileSync(p, "utf8")).join("\n;\n"), ctx);
vm.runInContext(`POKEMON_DEX = ${fs.readFileSync("data/pokemon-151.json")}; MOVES = ${JSON.stringify(JSON.parse(fs.readFileSync("data/moves.json")).moves)}; TYPE_CHART = ${JSON.stringify(JSON.parse(fs.readFileSync("data/type-chart.json")).chart)}; ABILITIES = ${fs.readFileSync("data/abilities.json")};`, ctx);
const { BattleState, natureInfo } = vm.runInContext("({BattleState, natureInfo})", ctx);
let fail = 0; const T = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fail++; };
const mk = o => Object.assign({ uid: "u", chainKey: "bulbasaur", dexId: 1, level: 30, ivs: {}, evs: {}, nature: "hardy", moves: ["tackle"], ability: "chlorophyll" }, o);
const has = (st, re) => st.log.some(l => re.test(l.msg));
/* chainKey 會按等級進化（Lv.30 Bulbasaur = Venusaur），所以只核對「ate its X Berry!」 */
const ate = (st, _name, berry) => has(st, new RegExp(`\\w ate its ${berry} Berry!`));

/* Sitrus：HP ≤ 50% → 回 25%，食完消失 */
let st = BattleState.create([mk({ heldItem: "sitrus-berry" })], [mk({ uid: "f" })], { seed: 3 });
let p = st.p1.team[0];
p.hp = Math.floor(p.maxHp / 2) + 1; BattleState.checkHeld(st, p);
T("sitrus: not above half", p.held === "sitrus-berry");
p.hp = Math.floor(p.maxHp / 2); const h0 = p.hp; BattleState.checkHeld(st, p);
T("sitrus: eaten at half", p.held === null && p.heldUsed === "sitrus-berry" && p.hp === h0 + Math.floor(p.maxHp / 4));
T("sitrus: battle text", ate(st, "\w+", "Sitrus") && has(st, /recovered \d+ HP!/));

/* Oran：+10 */
st = BattleState.create([mk({ heldItem: "oran-berry", battleHp: 300 })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
const o0 = p.hp; BattleState.onSwitchIn(st, "p1").forEach(() => {});
T("oran: entering at 30% triggers on switch-in", p.hp === o0 + 10 && p.held === null);

/* Figy：唔鍾意辣（性格降攻擊）→ 混亂 */
const minusAtk = Object.keys(vm.runInContext("POKEMON_DEX.natures", ctx)).find(n => natureInfo(n).minus === "atk");
st = BattleState.create([mk({ heldItem: "figy-berry", nature: minusAtk })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.hp = Math.floor(p.maxHp / 4); BattleState.checkHeld(st, p);
T("figy: heals 1/3", p.hp === Math.floor(p.maxHp / 4) + Math.floor(p.maxHp / 3));
T("figy: disliked flavor confuses (" + minusAtk + ")", p.volatile.confusion > 0 && has(st, /became confused/));
st = BattleState.create([mk({ heldItem: "figy-berry", nature: "hardy" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.hp = 1; BattleState.checkHeld(st, p); T("figy: neutral nature no confusion", !(p.volatile.confusion > 0));

/* Liechi／Starf／Lansat／Micle */
st = BattleState.create([mk({ heldItem: "liechi-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.hp = 1; BattleState.checkHeld(st, p); T("liechi: Attack +1", p.statStages.atk === 1 && has(st, /Attack rose!/));
st = BattleState.create([mk({ heldItem: "liechi-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.statStages.atk = 6; p.hp = 1; BattleState.checkHeld(st, p); T("liechi: not eaten at +6", p.held === "liechi-berry");
st = BattleState.create([mk({ heldItem: "starf-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.hp = 1; BattleState.checkHeld(st, p); T("starf: some stat +2", Object.values(p.statStages).includes(2) && has(st, /rose sharply/));
st = BattleState.create([mk({ heldItem: "lansat-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.hp = 1; BattleState.checkHeld(st, p); T("lansat: crit +2", p.volatile.critBoost === 2);
BattleState.switchTo(st, "p1", 0); /* 同一隻：唔清 */
st = BattleState.create([mk({ heldItem: "micle-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.hp = 1; BattleState.checkHeld(st, p); T("micle: flag set", p.volatile.micle === true);
st.turn = 1; BattleState.executeMove(st, "p1", 0); T("micle: used up by next move", p.volatile.micle === false);

/* 解狀態：Cheri（中 Thunder Wave 即刻解）、Lum（帶燒傷上場）、Persim（混亂） */
st = BattleState.create([mk({ uid: "a", chainKey: "pikachu", dexId: 25, moves: ["thunder-wave"], ability: "static" })], [mk({ uid: "f", heldItem: "cheri-berry" })], { seed: 5 });
st.turn = 1; BattleState.executeMove(st, "p1", 0);
const foe = st.p2.team[0];
T("cheri: paralysis cured right after", foe.status === null && ate(st, "\w+", "Cheri") && has(st, /cured of paralysis/));
st = BattleState.create([mk({ heldItem: "lum-berry", battleStatus: "brn" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
const msgs = BattleState.onSwitchIn(st, "p1");
T("lum: carried burn cured on entry", p.status === null && msgs.some(m => /ate its Lum Berry/.test(m)) && msgs.some(m => /burn was healed/.test(m)));
st = BattleState.create([mk({ heldItem: "persim-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.volatile.confusion = 3; BattleState.checkHeld(st, p); T("persim: confusion cured", p.volatile.confusion === 0);
st = BattleState.create([mk({ heldItem: "pecha-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
st.turn = 1; BattleState.useItem(st, "p1", "potion", "You"); st.turn = 2; BattleState.useItem(st, "p1", "potion", "You"); st.turn = 3; BattleState.useItem(st, "p1", "potion", "You");
T("pecha: overdose poison cured at once", p.status === null && p.held === null);

/* Leppa：PP 用完 → 回 10 */
st = BattleState.create([mk({ heldItem: "leppa-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.moves[0].pp = 1; st.turn = 1; BattleState.executeMove(st, "p1", 0);
T("leppa: refills to 10 after PP runs out", p.moves[0].pp === Math.min(10, p.moves[0].maxPp) && has(st, /restored PP to Tackle/));

/* 抗性：Occa 擋效果絕佳火招；Chilan 擋一般系 */
const dmgRun = held => {
  const s = BattleState.create([mk({ uid: "c", chainKey: "charmander", dexId: 4, moves: ["ember"], ability: "blaze" })], [mk({ uid: "f", level: 60, heldItem: held })], { seed: 11 });
  s.turn = 1; const t = s.p2.team[0]; const b = t.hp; BattleState.executeMove(s, "p1", 0); return { s, d: b - t.hp, t };
};
const plain = dmgRun(null), occa = dmgRun("occa-berry");
T("occa: halves super-effective fire", occa.d > 0 && Math.abs(occa.d - Math.floor(plain.d / 2)) <= 1 && has(occa.s, /The Occa Berry weakened the damage to \w+!/));
const wrong = dmgRun("passho-berry"); T("passho: ignores fire", wrong.t.held === "passho-berry");
st = BattleState.create([mk({ uid: "a" })], [mk({ uid: "f", level: 60, heldItem: "chilan-berry" })], { seed: 11 });
st.turn = 1; BattleState.executeMove(st, "p1", 0); T("chilan: normal move (not super effective) halved", st.p2.team[0].held === null && has(st, /Chilan Berry weakened/));

/* Jaboca：被物理招打 → 攻方扣 1/8；Kee：被物理招打 → 防禦 +1；Enigma：效果絕佳 → 回 25% */
st = BattleState.create([mk({ uid: "a" })], [mk({ uid: "f", level: 60, heldItem: "jaboca-berry" })], { seed: 11 });
const atk = st.p1.team[0]; st.turn = 1; BattleState.executeMove(st, "p1", 0);
T("jaboca: attacker loses 1/8", atk.maxHp - atk.hp === Math.floor(atk.maxHp / 8) && has(st, /was hurt by \w+'s Jaboca Berry/));
st = BattleState.create([mk({ uid: "a" })], [mk({ uid: "f", level: 60, heldItem: "rowap-berry" })], { seed: 11 });
st.turn = 1; BattleState.executeMove(st, "p1", 0); T("rowap: ignores physical", st.p2.team[0].held === "rowap-berry");
st = BattleState.create([mk({ uid: "a" })], [mk({ uid: "f", level: 60, heldItem: "kee-berry" })], { seed: 11 });
st.turn = 1; BattleState.executeMove(st, "p1", 0); T("kee: Defense +1", st.p2.team[0].statStages.def === 1);
const en = dmgRun("enigma-berry");
T("enigma: heals after super-effective hit", en.t.held === null && has(en.s, /ate its Enigma Berry/) && has(en.s, /recovered \d+ HP/));

/* Custap：HP ≤ 25% + 出招 → 先出手 */
st = BattleState.create([mk({ heldItem: "custap-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
T("custap: not above 25%", BattleState.custapCheck(st, "p1") === false);
p.hp = 1; T("custap: eaten at 25%", BattleState.custapCheck(st, "p1") === true && p.held === null && has(st, /thanks to its Custap Berry/));

/* 回合末：燒傷扣到一半 → Sitrus */
st = BattleState.create([mk({ heldItem: "sitrus-berry", battleStatus: "brn" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.hp = Math.floor(p.maxHp / 2) + 2; BattleState.endTurnResidual(st, "p1"); T("residual burn -> sitrus at end of turn", p.held === null);

/* 暈咗唔食；冇攜帶 = 冇嘢發生 */
st = BattleState.create([mk({ heldItem: "sitrus-berry" })], [mk({ uid: "f" })], { seed: 3 }); p = st.p1.team[0];
p.hp = 0; BattleState.checkHeld(st, p); T("fainted: doesn't eat", p.held === "sitrus-berry");
T("stones aren't battle berries", BattleState.create([mk({ heldItem: "thunder" })], [mk({ uid: "f" })], { seed: 1 }).p1.team[0].held === null);

/* PvP 一致性：同 seed、同行動 → 兩邊 log 完全一樣 */
const sim = () => {
  const s = BattleState.create([mk({ heldItem: "starf-berry", battleHp: 400 }), mk({ uid: "u2", heldItem: "figy-berry", nature: minusAtk })],
    [mk({ uid: "f", heldItem: "sitrus-berry", moves: ["tackle"] })], { seed: 77 });
  for (let i = 1; i <= 8 && !BattleState.checkFinished(s); i++) {
    s.turn = i; BattleState.custapCheck(s, "p1"); BattleState.custapCheck(s, "p2");
    BattleState.executeMove(s, "p2", 0); BattleState.executeMove(s, "p1", 0);
    BattleState.endTurnResidual(s, "p1"); BattleState.endTurnResidual(s, "p2");
  }
  return s.log.map(l => l.msg).join("|");
};
const A = sim(), B = sim();
T("PvP: identical logs on both clients", A === B && /ate its/.test(A));

console.log(fail ? `${fail} FAIL` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
