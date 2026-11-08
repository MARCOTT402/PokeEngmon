"use strict";
/* js/scene/gacha-fx.js（扭蛋重做 Task 1.3）：精靈球 SVG（上下兩半同一幅畫，開球可以分開飛）。
   粒子同 DOM 部分喺瀏覽器驗收。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const load = () => loadScripts(["js/scene/gacha-fx.js"], { expose: ["GachaFX"] }).GachaFX;

test("ballSVG crops the same drawing into a top and a bottom half", () => {
  const F = load();
  assert.match(F.ballSVG("great", "top"), /viewBox="-55 -55 110 55"/);
  assert.match(F.ballSVG("great", "bot"), /viewBox="-55 0 110 55"/);
});

test("each ball type paints its own cap colour", () => {
  const F = load();
  assert.match(F.ballSVG("great", "top"), /#2f7fe0/);
  assert.match(F.ballSVG("ultra", "top"), /#22252e/);
  assert.match(F.ballSVG("master", "top"), /#7b3fb0/);
});

test("every ball carries three crack paths for the tap-to-open phase", () => {
  const F = load();
  const svg = F.ballSVG("ultra", "top");
  for (const c of ["c1", "c2", "c3"]) assert.match(svg, new RegExp(`class="crk ${c}"`));
});

test("cracks are stroked in the ball's rarity colour via --rc", () => {
  const F = load();
  assert.match(F.ballSVG("master", "bot"), /stroke="var\(--rc\)"/);
});
