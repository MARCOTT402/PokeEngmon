"use strict";
/* js/scene/gacha-tells.js（扭蛋重做 Task 1.1）：快龍空投單抽嘅「預兆路線」純函數。
   規則（spec .trae/specs/20261107-gacha-redesign.md §4 幕 2b／幕 4）：
   - 起始球種 + 升級次數只係演出；最終一定等於 server 結算嘅稀有度（rare→great、epic→ultra、legend→master）。
   - rare 25% tease；epic 55% great→ultra；legend 40% great→ultra→master、40% ultra→master、20% 直接 master＋彩虹拖光。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const load = () => loadScripts(["js/scene/gacha-tells.js"], { expose: ["GachaTells"] }).GachaTells;
const plain = (o) => JSON.parse(JSON.stringify(o));   /* vm 跨 realm（Rule 106） */

test("rare always starts as a Great Ball with no upgrades", () => {
  const T = load();
  const p = plain(T.plan("rare", () => 0.5));
  assert.equal(p.start, "great");
  assert.deepEqual(p.ups, []);
});

test("rare teases only below the 25% roll", () => {
  const T = load();
  assert.equal(T.plan("rare", () => 0.1).tease, true);
  assert.equal(T.plan("rare", () => 0.9).tease, false);
});

test("epic below 55% upgrades great → ultra, otherwise lands as ultra", () => {
  const T = load();
  const low = plain(T.plan("epic", () => 0.1));
  assert.equal(low.start, "great");
  assert.deepEqual(low.ups, ["ultra"]);
  const high = plain(T.plan("epic", () => 0.9));
  assert.equal(high.start, "ultra");
  assert.deepEqual(high.ups, []);
});

test("legend paths: two upgrades, one upgrade, or a direct Master Ball with a rainbow trail", () => {
  const T = load();
  const a = plain(T.plan("legend", () => 0.1));
  assert.equal(a.start, "great");
  assert.deepEqual(a.ups, ["ultra", "master"]);
  const b = plain(T.plan("legend", () => 0.5));
  assert.equal(b.start, "ultra");
  assert.deepEqual(b.ups, ["master"]);
  const c = plain(T.plan("legend", () => 0.9));
  assert.equal(c.start, "master");
  assert.deepEqual(c.ups, []);
  assert.equal(c.trail, "rainbow");
});

test("the last ball always matches the settled rarity (1000 random plans)", () => {
  const T = load();
  const final = { rare: "great", epic: "ultra", legend: "master" };
  for (let i = 0; i < 1000; i++) {
    for (const r of ["rare", "epic", "legend"]) {
      const p = T.plan(r);
      const path = [p.start, ...p.ups];
      assert.equal(path[path.length - 1], final[r], `${r} ended on ${path.join(">")}`);
      assert.ok(["#ffffff", "#ffc93c", "rainbow"].includes(p.trail));
    }
  }
});

test("BALL_COL uses the unified rarity colours", () => {
  const T = load();
  assert.deepEqual(plain(T.BALL_COL), { great: "#4aa8ff", ultra: "#ffc93c", master: "#c77dff" });
});
