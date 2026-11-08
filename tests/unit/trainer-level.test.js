"use strict";
/* Trainer Lv（spec .trae/specs/20261108-trainer-level.md）：升級曲線同 client adopt */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const load = () => loadScripts(["js/core/guard.js", "js/storage.js", "js/trainer-level.js"], {
  expose: ["TrainerLevel", "loadState", "saveState"]
});

test("expToNext: 100 + 20 × (Lv − 1), 0 at Lv100", () => {
  const { TrainerLevel } = load();
  assert.equal(TrainerLevel.MAX_LV, 100);
  assert.equal(TrainerLevel.expToNext(1), 100);
  assert.equal(TrainerLevel.expToNext(2), 120);
  assert.equal(TrainerLevel.expToNext(99), 2060);
  assert.equal(TrainerLevel.expToNext(100), 0);
});

test("levelFromExp: boundaries", () => {
  const { TrainerLevel } = load();
  const L = (e) => ({ ...TrainerLevel.levelFromExp(e) });   /* vm 跨 realm：spread 先比得 deepEqual */
  assert.deepEqual(L(0), { lv: 1, into: 0, need: 100, total: 0 });
  assert.equal(L(99).lv, 1);
  assert.equal(L(99).into, 99);
  assert.deepEqual(L(100), { lv: 2, into: 0, need: 120, total: 100 });
  assert.equal(L(219).lv, 2);
  assert.equal(L(220).lv, 3);
  /* Lv100 門檻 = 99 × 100 + 20 × (0+…+98) = 106,920 */
  assert.equal(L(106919).lv, 99);
  assert.deepEqual(L(106920), { lv: 100, into: 0, need: 0, total: 106920 });
  assert.equal(L(1e9).lv, 100);
});

test("levelFromExp: bad input counts as 0 (Rule 99)", () => {
  const { TrainerLevel } = load();
  for (const bad of [NaN, -5, undefined, null, "abc", Infinity]) {
    const r = TrainerLevel.levelFromExp(bad);
    assert.equal(r.lv, 1, String(bad));
    assert.equal(r.total, 0, String(bad));
  }
});

test("adopt: writes trainerExp, ignores missing data, takes server balance on reward", () => {
  const S = load();
  const st = S.loadState();
  st.diamonds = 5;
  S.TrainerLevel.adopt({ exp: 250, gained: 10, lv: 3, lv_up: false });
  assert.equal(S.loadState().trainerExp, 250);
  assert.equal(S.loadState().diamonds, 5);

  assert.doesNotThrow(() => S.TrainerLevel.adopt(null));
  assert.doesNotThrow(() => S.TrainerLevel.adopt({}));
  assert.doesNotThrow(() => S.TrainerLevel.adopt({ exp: "x" }));
  assert.equal(S.loadState().trainerExp, 250);

  S.TrainerLevel.adopt({ exp: 400, gained: 150, lv: 5, lv_up: true, diamonds_awarded: 10, balance: 77 });
  assert.equal(S.loadState().trainerExp, 400);
  assert.equal(S.loadState().diamonds, 77);
});
