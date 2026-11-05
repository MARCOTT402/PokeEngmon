/* Mega 特性（node tools/_test_mega_abilities.js） */
const fs = require("fs"), vm = require("vm");
const ctx = { console, Math, Date, JSON, require, window: {} };
vm.createContext(ctx);
vm.runInContext(["js/gens-data.js", "js/data.js", "js/pokemon.js", "js/mega-data.js", "js/battle/rng.js", "js/battle/engine.js", "js/battle/state.js"]
  .map(p => fs.readFileSync(p, "utf8")).join("\n;\n"), ctx);
vm.runInContext(`POKEMON_DEX = ${fs.readFileSync("data/pokemon-151.json")}; MOVES = ${JSON.stringify(JSON.parse(fs.readFileSync("data/moves.json")).moves)}; TYPE_CHART = ${JSON.stringify(JSON.parse(fs.readFileSync("data/type-chart.json")).chart)}; ABILITIES = ${fs.readFileSync("data/abilities.json")};`, ctx);
const { Battle, BattleState } = vm.runInContext("({Battle, BattleState})", ctx);
let fail = 0; const T = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fail++; };
const mon = o => Object.assign({ uid: "u" + Math.random(), chainKey: "charmander", dexId: 4, level: 50, ivs: {}, evs: {}, nature: "hardy", moves: ["tackle"], ability: "blaze" }, o);
const has = (st, re) => st.log.some(l => re.test(l.msg));
const mk = (a, b, seed) => BattleState.create([mon(a)], [mon(Object.assign({ uid: "f", chainKey: "bulbasaur", dexId: 1, ability: "overgrow" }, b))], { seed: seed || 5 });
const avg = (st, side, slug, n, extra) => {
  const a = BattleState.active(st, side), d = BattleState.active(st, side === "p1" ? "p2" : "p1"); let t = 0;
  for (let i = 0; i < (n || 300); i++) t += Battle.computeDamage(a, d, Object.assign({ slug }, ctx.moveInfo(slug)), Object.assign({ slug }, extra || {})).damage;
  return t / (n || 300);
};
const withAb = (st, side, ab) => { BattleState.active(st, side).ability = ab; return st; };

/* 威力類 */
let st = mk({ moves: ["scratch", "earthquake"] }, {});
let base = avg(st, "p1", "scratch"); withAb(st, "p1", "tough-claws");
T("Tough Claws boosts contact (Scratch)", avg(st, "p1", "scratch") > base * 1.2);
const eq0 = avg(withAb(mk({}, {}), "p1", "blaze"), "p1", "earthquake"), eq1 = avg(withAb(mk({}, {}), "p1", "tough-claws"), "p1", "earthquake");
T("Tough Claws ignores non-contact (Earthquake)", Math.abs(eq1 - eq0) < eq0 * 0.08);
st = mk({}, {}); base = avg(st, "p1", "crunch"); withAb(st, "p1", "strong-jaw");
T("Strong Jaw boosts Crunch", avg(st, "p1", "crunch") > base * 1.35);
st = mk({}, {}); base = avg(st, "p1", "water-pulse"); withAb(st, "p1", "mega-launcher");
T("Mega Launcher boosts Water Pulse", avg(st, "p1", "water-pulse") > base * 1.35);
st = mk({}, {}); base = avg(st, "p1", "night-slash"); withAb(st, "p1", "sharpness");
T("Sharpness boosts Night Slash", avg(st, "p1", "night-slash") > base * 1.35);
st = mk({}, {}); base = avg(st, "p1", "rock-slide", 300, { weather: "sandstorm" }); withAb(st, "p1", "sand-force");
T("Sand Force boosts Rock Slide in sandstorm", avg(st, "p1", "rock-slide", 300, { weather: "sandstorm" }) > base * 1.2);

/* 防守類 */
st = mk({}, { ability: "multiscale" }); const full = avg(st, "p1", "tackle"); BattleState.active(st, "p2").hp -= 1;
T("Multiscale halves damage at full HP", full < avg(st, "p1", "tackle") * 0.6);
st = mk({}, { ability: "overgrow" }); base = avg(st, "p1", "ember"); withAb(st, "p2", "filter");
T("Filter cuts super-effective damage", avg(st, "p1", "ember") < base * 0.8);

/* Scrappy */
st = mk({}, { chainKey: "gastly", dexId: 92, ability: "levitate" });
T("Normal can't hit Ghost normally", avg(st, "p1", "tackle", 20) === 0);
withAb(st, "p1", "scrappy");
T("Scrappy hits Ghost with Normal", avg(st, "p1", "tackle", 20) > 0);

/* -ate：Pixilate 令 Tackle 變妖精，打龍效果絕佳 */
st = mk({ ability: "pixilate", moves: ["tackle"] }, { chainKey: "dratini", dexId: 147, ability: "shed-skin" });
st.turn = 1; BattleState.executeMove(st, "p1", 0);
T("Pixilate: Tackle becomes Fairy (super effective on Dragon)", has(st, /super effective/));

/* 天氣特性 */
st = mk({ ability: "drought" }, {});
let msgs = BattleState.onSwitchIn(st, "p1");
T("Drought sets sun on entry", st.weather && st.weather.name === "sun" && msgs.some(m => /sunlight/.test(m)));
st = mk({ ability: "sand-stream" }, {}); BattleState.onSwitchIn(st, "p1");
T("Sand Stream sets sandstorm", st.weather && st.weather.name === "sandstorm");
st = mk({ ability: "snow-warning" }, {}); BattleState.onSwitchIn(st, "p1");
T("Snow Warning sets hail", st.weather && st.weather.name === "hail");

/* Mega Charizard Y：Mega 時即刻有日照 */
st = BattleState.create([mon({ heldItem: "charizardite-y" })], [mon({ uid: "f", chainKey: "bulbasaur", dexId: 1 })], { seed: 2 });
BattleState.megaEvolve(st, "p1", "your");
T("Mega Charizard Y triggers Drought", st.weather && st.weather.name === "sun" && has(st, /sunlight turned harsh/));

/* Electric Surge */
st = mk({ ability: "electric-surge" }, {}); BattleState.onSwitchIn(st, "p1");
T("Electric Surge sets Electric Terrain", st.terrain && st.terrain.name === "electric");
for (let i = 0; i < 5; i++) BattleState.endTurnField(st);
T("Electric Terrain ends after 5 turns", !st.terrain && has(st, /electricity disappeared/));

/* No Guard：Zap Cannon（50%）必中 */
let hits = 0;
for (let s = 1; s <= 20; s++) { const x = mk({ ability: "no-guard", moves: ["zap-cannon"] }, {}, s); x.turn = 1; BattleState.executeMove(x, "p1", 0); if (!has(x, /missed/)) hits++; }
T("No Guard: never misses", hits === 20);

/* Skill Link：多段招一律最多段 */
st = mk({ ability: "skill-link", moves: ["fury-swipes"] }, { chainKey: "snorlax", dexId: 143, ability: "thick-fat", level: 100 });
st.turn = 1; BattleState.executeMove(st, "p1", 0);
const dmgLines = st.log.filter(l => /took \d+ damage/.test(l.msg)).length;
T(`Skill Link: Fury Swipes hits 5 times (${dmgLines})`, dmgLines === 5 || has(st, /missed/));

/* Parental Bond：打兩次 */
st = mk({ ability: "parental-bond", moves: ["tackle"] }, { chainKey: "snorlax", dexId: 143, ability: "thick-fat", level: 100 }, 8);
st.turn = 1; BattleState.executeMove(st, "p1", 0);
const pb = st.log.filter(l => /took \d+ damage/.test(l.msg)).map(l => +l.msg.match(/took (\d+)/)[1]);
T(`Parental Bond: two hits, second weaker (${pb})`, (pb.length === 2 && pb[1] < pb[0] && has(st, /hit 2 times/)) || has(st, /missed/));

/* Sheer Force：冇附加效果 + 威力加 */
st = mk({}, {}); base = avg(st, "p1", "flamethrower");
const sf = avg(st, "p1", "flamethrower", 300, { sheerForce: true });
T("Sheer Force boosts power x1.3", sf > base * 1.2);
let burns = 0;
for (let s = 1; s <= 40; s++) { const x = mk({ ability: "sheer-force", moves: ["flamethrower"] }, { level: 100 }, s); x.turn = 1; BattleState.executeMove(x, "p1", 0); if (BattleState.active(x, "p2").status === "burn") burns++; }
T("Sheer Force: no burn side effect", burns === 0);

/* Mold Breaker：無視 Levitate */
st = mk({ ability: "mold-breaker", moves: ["earthquake"] }, { chainKey: "gastly", dexId: 92, ability: "levitate" });
st.turn = 1; BattleState.executeMove(st, "p1", 0);
T("Mold Breaker hits Levitate with Earthquake", has(st, /took \d+ damage/) && BattleState.active(st, "p2").ability === "levitate");
msgs = BattleState.onSwitchIn(st, "p1");
T("Mold Breaker announces itself", msgs.some(m => /breaks the mold/.test(m)));

/* Magic Bounce：Growl 反彈 */
st = mk({ moves: ["growl"] }, { ability: "magic-bounce" });
st.turn = 1; BattleState.executeMove(st, "p1", 0);
T("Magic Bounce reflects Growl", has(st, /bounced the Growl back/) && BattleState.active(st, "p1").statStages.atk === -1 && !BattleState.active(st, "p2").statStages.atk);

/* Contrary：Growl 反而升攻 */
st = mk({ moves: ["growl"] }, { ability: "contrary" });
st.turn = 1; BattleState.executeMove(st, "p1", 0);
T("Contrary: Growl raises Attack", BattleState.active(st, "p2").statStages.atk === 1);

/* Intimidate vs Inner Focus / Scrappy */
st = mk({ ability: "intimidate" }, { ability: "inner-focus" });
msgs = BattleState.onSwitchIn(st, "p1");
T("Inner Focus blocks Intimidate", !BattleState.active(st, "p2").statStages.atk && msgs.some(m => /Inner Focus/.test(m)));

/* Trace */
st = mk({ ability: "trace" }, { ability: "intimidate" });
msgs = BattleState.onSwitchIn(st, "p1");
T("Trace copies Intimidate and it fires", BattleState.active(st, "p1").ability === "intimidate" && msgs.some(m => /traced/.test(m)) && BattleState.active(st, "p2").statStages.atk === -1);

/* Prankster */
st = mk({ ability: "prankster" }, {});
T("Prankster: status move priority +1", BattleState.priorityOf(st, "p1", ctx.moveInfo("growl")) === 1 && BattleState.priorityOf(st, "p1", ctx.moveInfo("tackle")) === 0);

/* Shadow Tag */
st = mk({}, { ability: "shadow-tag" });
T("Shadow Tag traps non-Ghost", !!BattleState.trappedBy(st, "p1"));
st = mk({ chainKey: "gastly", dexId: 92, ability: "levitate" }, { ability: "shadow-tag" });
T("Ghost escapes Shadow Tag", !BattleState.trappedBy(st, "p1"));

/* Bad Dreams */
st = mk({}, { ability: "bad-dreams" });
const me = BattleState.active(st, "p1"); me.status = "sleep"; me.statusTimer = 3; const hp0 = me.hp;
BattleState.endTurnResidual(st, "p1");
T("Bad Dreams hurts sleeping foe 1/8", me.hp === hp0 - Math.floor(me.maxHp / 8) && has(st, /Bad Dreams/));

/* Steadfast */
st = mk({ ability: "steadfast", moves: ["tackle"] }, {});
BattleState.active(st, "p1").volatile.flinch = true; st.turn = 1; BattleState.executeMove(st, "p1", 0);
T("Steadfast: flinch raises Speed", BattleState.active(st, "p1").statStages.spe === 1);

/* Innards Out */
st = mk({ moves: ["tackle"], level: 100 }, { ability: "innards-out", level: 5 });
const foeHp = BattleState.active(st, "p2").hp, myHp = BattleState.active(st, "p1").hp;
st.turn = 1; BattleState.executeMove(st, "p1", 0);
T("Innards Out hurts attacker by last HP", BattleState.active(st, "p2").hp === 0 ? BattleState.active(st, "p1").hp === Math.max(0, myHp - foeHp) && has(st, /Innards Out/) : true);

/* Mega Sol：自己出火招當日照 */
const emberTotal = ab => { let t = 0; for (let i = 1; i <= 40; i++) { const x = mk({ ability: ab, moves: ["ember"] }, { chainKey: "snorlax", dexId: 143, ability: "pressure", level: 100 }, i); x.turn = 1; BattleState.executeMove(x, "p1", 0); const l = x.log.find(y => /took \d+/.test(y.msg)); if (l) t += +l.msg.match(/took (\d+)/)[1]; } return t; };
const e0 = emberTotal("pressure"), e1 = emberTotal("mega-sol");
T(`Mega Sol: Fire moves powered as if sunny (${e0} -> ${e1})`, e1 > e0 * 1.3);

/* PvP 一致性：全套特性都唔會令兩邊 log 唔同 */
const sim = () => {
  const s = BattleState.create([mon({ ability: "parental-bond", moves: ["tackle", "fury-swipes"] })], [mon({ uid: "f", chainKey: "bulbasaur", dexId: 1, ability: "magic-bounce", moves: ["growl", "tackle"] })], { seed: 77 });
  for (let i = 1; i <= 6 && !BattleState.checkFinished(s); i++) { s.turn = i; BattleState.executeMove(s, "p1", i % 2); BattleState.executeMove(s, "p2", i % 2); BattleState.endTurnResidual(s, "p1"); BattleState.endTurnResidual(s, "p2"); }
  return s.log.map(l => l.msg).join("|");
};
T("PvP: identical logs", sim() === sim());

console.log(fail ? `${fail} FAIL` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
