"use strict";
/* js/scene/dragonite-rig.js（扭蛋重做 Task 1.2）：快龍分層 rig 嘅純函數部分。
   - bez：cubic bezier（飛行路線）；depthFilter：空氣透視（遠 = 矇、暗、淡）。
   make() 要 DOM＋GSAP，喺瀏覽器驗收（Rule 114）。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const load = () => loadScripts(["js/scene/dragonite-rig.js"], { expose: ["DragoniteRig"] }).DragoniteRig;
const P = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }];

test("bez hits both end points", () => {
  const R = load();
  assert.deepEqual(JSON.parse(JSON.stringify(R.bez(P, 0))), { x: 0, y: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(R.bez(P, 1))), { x: 100, y: 0 });
});

test("bez midpoint of a symmetric curve is centred", () => {
  const R = load();
  const m = R.bez(P, 0.5);
  assert.equal(m.x, 50);
  assert.equal(m.y, 75);
});

test("depthFilter: far away is blurred, dark and desaturated", () => {
  const R = load();
  const f = R.depthFilter(0);
  assert.match(f, /blur\(1\.80px\)/);
  assert.match(f, /brightness\(0\.50\)/);
  assert.match(f, /saturate\(0\.55\)/);
});

test("depthFilter: close up is sharp and full colour with a stronger shadow", () => {
  const R = load();
  const f = R.depthFilter(1);
  assert.match(f, /blur\(0\.00px\)/);
  assert.match(f, /brightness\(1\.00\)/);
  assert.match(f, /drop-shadow\(0 16px 18px/);
});

test("joint pivots match the layered art", () => {
  const R = load();
  assert.deepEqual(JSON.parse(JSON.stringify(R.PIVOT)), { wing: "53.9% 35%", tail: "71% 72.4%", arm: "22.7% 39.8%" });
});
