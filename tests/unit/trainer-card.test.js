"use strict";
/* Battle menu 訓練員卡：打 AI 唔開揀隊頁，用 My Team 頭 N 隻健康嘅（spec 20261108-trainer-level §5） */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const load = () => {
  const BattleUI = { _: {} };
  loadScripts(["js/battle/ui/trainer-card.js"], { globals: { BattleUI } });
  return BattleUI._;
};
const E = (uid, faint) => ({ uid, faint: !!faint });
const isFaint = (e) => e.faint;
const uids = (list) => [...list].map((e) => e.uid);   /* vm 跨 realm array：spread 先比得 deepEqual */

test("pickLineup: My Team order, skips fainted, stops at n", () => {
  const B = load();
  const entries = [E("a"), E("b", true), E("c"), E("d")];
  assert.deepEqual(uids(B.pickLineup(entries, ["a", "b", "c", "d"], 2, isFaint)), ["a", "c"]);
  assert.deepEqual(uids(B.pickLineup(entries, ["d", "a"], 6, isFaint)), ["d", "a"]);
});

test("pickLineup: uid no longer owned is skipped; empty team → []", () => {
  const B = load();
  const entries = [E("a"), E("c")];
  assert.deepEqual(uids(B.pickLineup(entries, ["gone", "a", "c"], 3, isFaint)), ["a", "c"]);
  assert.deepEqual(uids(B.pickLineup(entries, [], 3, isFaint)), []);
  assert.deepEqual(uids(B.pickLineup(entries, null, 3, isFaint)), []);
});

test("pickLineup: all fainted → []", () => {
  const B = load();
  assert.deepEqual(uids(B.pickLineup([E("a", true), E("b", true)], ["a", "b"], 2, isFaint)), []);
});
