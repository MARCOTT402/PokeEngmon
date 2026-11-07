/* 生成 tests/fixtures/state-old.json：用 git 舊版（79f9378，2026-10-29）storage.js 嘅 defaultState()
   模擬「舊用戶存檔」，加兩隻 entry（等級進化鏈＋石進化鏈）。冇任何真實用戶資料。
   用法：node tools/make-old-state-fixture.mjs */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { loadScripts } = require("../tests/helpers/load.js");
const OLD = "79f9378";

const { ctx } = loadScripts(["js/core/guard.js", "js/gens-data.js", "js/data.js", "js/pokemon.js"]);
vm.runInContext(execSync(`git show ${OLD}:js/storage.js`, { encoding: "utf8" }), ctx);
const st = vm.runInContext("defaultState()", ctx);

/* 舊版 entry 形狀：冇 ability／heldItem／favorite／pet；exp 用字串（舊版曾經咁存） */
st.entries = [
  { uid: "old-1", chainKey: "bulbasaur", exp: "4000", ivs: { hp: 20, atk: 10, def: 31, spa: 5, spd: 0, spe: 15 }, evs: {}, evPoints: 2, candies: 1, dupes: 3, stage: 1, ownedSpecies: [1], obtainedAt: "2026-10-20T00:00:00.000Z" },
  { uid: "old-2", chainKey: "eevee", exp: 120, ivs: {}, evs: {}, evPoints: 0, candies: 0, dupes: 0, stage: 1, ownedSpecies: [133], obtainedAt: "2026-10-21T00:00:00.000Z" }
];
st.activeUid = "old-1";

mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("tests/fixtures/state-old.json", JSON.stringify(st, null, 2) + "\n");
console.log("wrote tests/fixtures/state-old.json from", OLD, "keys:", Object.keys(st).length);
