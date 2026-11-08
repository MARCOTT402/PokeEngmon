"use strict";
/* js/incubator/rules.js（扭蛋重做 Task 3.1）：孵化器純規則（spec .trae/specs/20261107-gacha-redesign.md §10 孵化器 v4）
   - Claim 💎3；機率 Common 30／Rare 40／Epic 20／Legendary 10；題數 30／80／140／200。
   - Slot 2：未解鎖過 → streak 7 日；之後斷咗 → 3 日再解；有蛋而 streak 斷 = 凍結（唔計題、唔跌）。
   - 1 題答啱（clean）內置題同時計落所有開住、未滿嘅蛋；customQuestions 唔計。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const load = () => loadScripts(["js/incubator/rules.js"], { expose: ["IncubatorRules"] }).IncubatorRules;
const plain = (o) => JSON.parse(JSON.stringify(o));
const S2 = (ever, on, last) => ({ ever, on, last });

test("constants match the v4 economy", () => {
  const R = load();
  assert.deepEqual(plain(R.NEED), { normal: 30, rare: 80, epic: 140, legend: 200 });
  assert.equal(R.CLAIM_COST, 3);
  assert.equal(R.SLOT2_FIRST, 7);
  assert.equal(R.SLOT2_AGAIN, 3);
  assert.deepEqual(plain(R.HATCH_LV), { normal: 0, rare: 2, epic: 3, legend: 4 });
});

test("rollRarity uses 30 / 40 / 20 / 10 cumulative bands", () => {
  const R = load();
  assert.equal(R.rollRarity(() => 0.29), "normal");
  assert.equal(R.rollRarity(() => 0.31), "rare");
  assert.equal(R.rollRarity(() => 0.71), "epic");
  assert.equal(R.rollRarity(() => 0.95), "legend");
});

test("makeEgg sets need from rarity and starts empty", () => {
  const R = load();
  assert.deepEqual(plain(R.makeEgg("legend")), { rarity: "legend", need: 200, progress: 0, seen: 0 });
});

test("syncSlot2: first unlock needs a 7-day streak", () => {
  const R = load();
  assert.equal(R.syncSlot2(S2(false, false, 0), 6).on, false);
  const s = plain(R.syncSlot2(S2(false, false, 6), 7));
  assert.deepEqual(s, { ever: true, on: true, last: 7 });
});

test("syncSlot2: stays open while the streak keeps growing", () => {
  const R = load();
  assert.equal(R.syncSlot2(S2(true, true, 7), 12).on, true);
});

test("syncSlot2: a smaller streak means it broke, and re-unlock then needs 3 days", () => {
  const R = load();
  const broke = R.syncSlot2(S2(true, true, 12), 0);
  assert.equal(broke.on, false);
  assert.equal(R.syncSlot2(plain(broke), 2).on, false);
  assert.equal(R.syncSlot2(S2(true, false, 2), 3).on, true);
});

test("syncSlot2 returns a new object and leaves the input untouched", () => {
  const R = load();
  const before = S2(false, false, 6);
  const after = R.syncSlot2(before, 7);
  assert.notEqual(after, before);
  assert.deepEqual(plain(before), { ever: false, on: false, last: 6 });
});

test("slotState: slot 0 is always open; slot 1 is open / frozen / locked", () => {
  const R = load();
  const egg = R.makeEgg("rare");
  assert.equal(R.slotState(0, [null, null], S2(false, false, 0)), "open");
  assert.equal(R.slotState(1, [null, null], S2(true, true, 9)), "open");
  assert.equal(R.slotState(1, [null, egg], S2(true, false, 0)), "frozen");
  assert.equal(R.slotState(1, [null, null], S2(true, false, 0)), "locked");
});

test("freeSlot prefers slot 0, then an unlocked empty slot 1, else null", () => {
  const R = load();
  const egg = R.makeEgg("rare");
  assert.equal(R.freeSlot([null, null], S2(false, false, 0)), 0);
  assert.equal(R.freeSlot([egg, null], S2(true, true, 8)), 1);
  assert.equal(R.freeSlot([egg, null], S2(false, false, 3)), null);
  assert.equal(R.freeSlot([egg, egg], S2(true, true, 8)), null);
});

test("builtInCorrect counts clean answers that are not custom questions", () => {
  const R = load();
  const results = [{ qid: "q1", correct: true }, { qid: "c1", correct: true }, { qid: "q2", correct: false }];
  assert.equal(R.builtInCorrect(results, new Set(["c1"])), 1);
});

test("builtInCorrect is 0 when there are no per-question results", () => {
  const R = load();
  assert.equal(R.builtInCorrect([], new Set()), 0);
  assert.equal(R.builtInCorrect(undefined, new Set()), 0);
});

test("applyRound adds the same answers to both open eggs", () => {
  const R = load();
  const out = R.applyRound([R.makeEgg("rare"), R.makeEgg("epic")], S2(true, true, 9), 10);
  assert.deepEqual(plain(out.eggs).map((e) => e.progress), [10, 10]);
});

test("applyRound skips a frozen slot 1 and keeps its progress", () => {
  const R = load();
  const frozen = Object.assign(R.makeEgg("epic"), { progress: 40 });
  const out = R.applyRound([R.makeEgg("rare"), frozen], S2(true, false, 0), 10);
  assert.equal(out.eggs[0].progress, 10);
  assert.equal(out.eggs[1].progress, 40);
});

test("applyRound caps at need and reports only eggs that became ready this round", () => {
  const R = load();
  const nearly = Object.assign(R.makeEgg("normal"), { progress: 25 });
  const done = Object.assign(R.makeEgg("normal"), { progress: 30 });
  const out = R.applyRound([nearly, done], S2(true, true, 9), 10);
  assert.equal(out.eggs[0].progress, 30);
  assert.equal(out.eggs[1].progress, 30);
  assert.deepEqual(plain(out.ready), [0]);
});

test("applyRound never removes an egg and does not mutate its input", () => {
  const R = load();
  const eggs = [Object.assign(R.makeEgg("normal"), { progress: 25 }), null];
  const out = R.applyRound(eggs, S2(false, false, 0), 10);
  assert.ok(out.eggs[0]);
  assert.equal(out.eggs[1], null);
  assert.equal(eggs[0].progress, 25);
});

test("stageOf splits progress into 5 heat stages", () => {
  const R = load();
  assert.equal(R.stageOf(49, 200), 0);
  assert.equal(R.stageOf(50, 200), 1);
  assert.equal(R.stageOf(100, 200), 2);
  assert.equal(R.stageOf(150, 200), 3);
  assert.equal(R.stageOf(200, 200), 4);
});

test("perSeg: one ring segment per answer up to 30, then one per 5", () => {
  const R = load();
  assert.equal(R.perSeg(30), 1);
  assert.equal(R.perSeg(80), 5);
  assert.equal(R.perSeg(200), 5);
});
