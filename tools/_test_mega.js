/* 背包第 4c 段：Mega 進化（node tools/_test_mega.js） */
const fs = require("fs"), vm = require("vm");
const ctx = { console, Math, Date, JSON, require, window: {} };
vm.createContext(ctx);
vm.runInContext(["js/gens-data.js", "js/data.js", "js/pokemon.js", "js/mega-data.js", "js/battle/rng.js", "js/battle/engine.js", "js/battle/state.js"]
  .map(p => fs.readFileSync(p, "utf8")).join("\n;\n"), ctx);
vm.runInContext(`POKEMON_DEX = ${fs.readFileSync("data/pokemon-151.json")}; MOVES = ${JSON.stringify(JSON.parse(fs.readFileSync("data/moves.json")).moves)}; TYPE_CHART = ${JSON.stringify(JSON.parse(fs.readFileSync("data/type-chart.json")).chart)}; ABILITIES = ${fs.readFileSync("data/abilities.json")};`, ctx);
const { Battle, BattleState, MEGA_STONES } = vm.runInContext("({Battle, BattleState, MEGA_STONES})", ctx);
let fail = 0; const T = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fail++; };
const mk = o => Object.assign({ uid: "u", chainKey: "charmander", dexId: 4, level: 50, ivs: {}, evs: {}, nature: "hardy", moves: ["dragon-claw", "scratch"], ability: "blaze" }, o);
const foe = () => [{ uid: "f", chainKey: "bulbasaur", dexId: 1, level: 50, ivs: {}, evs: {}, nature: "hardy", moves: ["tackle"], ability: "overgrow" }];
const has = (st, re) => st.log.some(l => re.test(l.msg));

/* 資料 */
const keys = Object.keys(MEGA_STONES);
T("70 Mega stones (Gen 1–5 species)", keys.length === 70 && keys.every(k => MEGA_STONES[k].dexId <= 649));
T("Charizard has X and Y", MEGA_STONES["charizardite-x"].dexId === 6 && MEGA_STONES["charizardite-y"].dexId === 6);
T("every form has sprite key + 6 stats + types", keys.every(k => { const m = MEGA_STONES[k]; return /^\d+-mega(-[xyz])?$/.test(m.spriteKey) && Object.keys(m.baseStats).length === 6 && m.types.length >= 1; }));
T("no Rayquaza (no Mega Stone)", !keys.some(k => MEGA_STONES[k].dexId === 384));

/* 條件：對應物種 + 攜帶 */
let st = BattleState.create([mk({ heldItem: "charizardite-x" })], foe(), { seed: 2 });
let p = st.p1.team[0];
T("Lv.50 Charmander chain = Charizard holding the stone", p.dexId === 6 && p.held === "charizardite-x");
T("canMega with matching stone", BattleState.canMega(st, "p1") === true);
T("no stone -> can't", BattleState.canMega(BattleState.create([mk({})], foe(), { seed: 2 }), "p1") === false);
T("wrong species -> can't", BattleState.canMega(BattleState.create([mk({ heldItem: "venusaurite" })], foe(), { seed: 2 }), "p1") === false);
T("Charmeleon (not Charizard) -> can't", BattleState.canMega(BattleState.create([mk({ stage: 2, heldItem: "charizardite-x" })], foe(), { seed: 2 }), "p1") === false);
T("held Mega Stone is not eaten as a berry", BattleState.checkHeld(st, p) === false && p.held === "charizardite-x");

/* 進化：屬性、特性、能力值、HP 唔變 */
const before = Object.assign({}, p.stats), hp0 = p.hp, maxHp0 = p.maxHp;
T("megaEvolve", BattleState.megaEvolve(st, "p1", "your") === true);
T("types -> Fire/Dragon", p.types.join("/") === "fire/dragon");
T("ability -> Tough Claws", p.ability === "tough-claws");
T("Attack up, HP unchanged", p.stats.atk > before.atk && p.stats.hp === before.hp && p.hp === hp0 && p.maxHp === maxHp0);
T("sprite key + name kept", p.megaSprite === "6-mega-x" && p.name === "Charizard" && p.megaName === "Mega Charizard X");
T("battle text", has(st, /Charizard's Charizardite X is reacting to your Key Stone!/) && has(st, /Charizard has Mega Evolved into Mega Charizard X!/));
T("can't Mega twice", BattleState.canMega(st, "p1") === false && BattleState.megaEvolve(st, "p1", "your") === false);

/* 每場每位訓練家一次：第二隻 Charizard 都唔得 */
st = BattleState.create([mk({ heldItem: "charizardite-x" }), mk({ uid: "u2", heldItem: "charizardite-y" })], foe(), { seed: 2 });
BattleState.megaEvolve(st, "p1", "your");
st.turn = 1; BattleState.switchTo(st, "p1", 1);
T("once per battle per trainer", BattleState.canMega(st, "p1") === false);
T("Mega form stays after switching out", st.p1.team[0].mega === "charizardite-x" && st.p1.team[0].types.includes("dragon"));
T("foe side still can (separate)", st.p2.megaUsed !== true);

/* 傷害用 Mega 屬性：Dragon Claw Mega 前冇 STAB、Mega 後有 */
const dmg = mega => {
  const s = BattleState.create([mk({ heldItem: "charizardite-x" })], foe(), { seed: 9 });
  if (mega) BattleState.megaEvolve(s, "p1", "your");
  const a = s.p1.team[0], d = s.p2.team[0]; let tot = 0;
  for (let i = 0; i < 200; i++) tot += Battle.computeDamage(a, d, ctx.moveInfo("dragon-claw"), {}).damage;
  return tot / 200;
};
const d0 = dmg(false), d1 = dmg(true);
T(`Dragon Claw gets STAB + higher Attack after Mega (${d0.toFixed(1)} -> ${d1.toFixed(1)})`, d1 > d0 * 1.5);

/* PvP 一致性 */
const sim = () => {
  const s = BattleState.create([mk({ heldItem: "charizardite-y" })], foe(), { seed: 33 });
  BattleState.megaEvolve(s, "p1", "your");
  for (let i = 1; i <= 6 && !BattleState.checkFinished(s); i++) { s.turn = i; BattleState.executeMove(s, "p1", 0); BattleState.executeMove(s, "p2", 0); }
  return s.log.map(l => l.msg).join("|");
};
T("PvP: identical logs", sim() === sim());

console.log(fail ? `${fail} FAIL` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
