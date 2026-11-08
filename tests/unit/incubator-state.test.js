"use strict";
/* js/incubator/incubator.js（扭蛋重做 Task 3.2）：孵化器狀態同同步。
   - 匿名：本地扣 💎3／擲／加題／孵／丟棄。
   - 登入：一律等 RPC；RPC 失敗 → 本地鑽同蛋完全唔變（plan Review Focus 1）。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const FILES = ["js/core/guard.js", "js/gens-data.js", "js/data.js", "js/pokemon.js", "js/storage.js", "js/store.js",
  "js/incubator/rules.js", "js/incubator/incubator.js"];

function load(globals = {}) {
  const got = [];
  const Gacha = {
    _applyLocalPull(key, rarity) { got.push({ key, rarity }); return { rarity, chainKey: key, entry: {}, isDupe: false, candyGain: 0 }; },
    _applyServerPull(r) { got.push({ server: r }); return { rarity: r.rarity, chainKey: r.chain_key, entry: r.entry, isDupe: !!r.is_dupe, candyGain: 0 }; }
  };
  const out = loadScripts(FILES, { expose: ["Incubator", "loadState", "saveState"], globals: { Gacha, ...globals } });
  return { ...out, got };
}
const builtIn = (n) => Array.from({ length: n }, (_, i) => ({ qid: "q" + i, correct: true }));

test("anon claim: 300 💎 → 297 and an egg in slot 0", async () => {
  const { Incubator, loadState } = load();
  loadState().diamonds = 300;
  const r = await Incubator.claim();
  assert.equal(r.slot, 0);
  assert.equal(loadState().diamonds, 297);
  assert.ok(Incubator.state().eggs[0]);
  assert.equal(Incubator.state().eggs[0].progress, 0);
});

test("anon second claim with Slot 2 locked → incubator_full, diamonds unchanged", async () => {
  const { Incubator, loadState } = load();
  loadState().diamonds = 300;
  await Incubator.claim();
  const r = await Incubator.claim();
  assert.equal(r.error, "incubator_full");
  assert.equal(loadState().diamonds, 297);
});

test("anon claim with 2 💎 → not_enough_diamonds", async () => {
  const { Incubator, loadState } = load();
  loadState().diamonds = 2;
  const r = await Incubator.claim();
  assert.equal(r.error, "not_enough_diamonds");
  assert.equal(loadState().diamonds, 2);
  assert.equal(Incubator.state().eggs[0], null);
});

test("anon addRound: 10 built-in correct → progress 10; custom questions don't count", async () => {
  const { Incubator, loadState } = load();
  loadState().diamonds = 30;
  loadState().customQuestions = [{ id: "c1" }];
  await Incubator.claim();
  await Incubator.addRound({ results: [...builtIn(10), { qid: "c1", correct: true }, { qid: "x", correct: false }] });
  assert.equal(Incubator.state().eggs[0].progress, 10);
});

test("anon addRound reports a slot only on the round it fills; the egg stays until hatched", async () => {
  const { Incubator, loadState } = load();
  loadState().incubator = { eggs: [{ rarity: "normal", need: 30, progress: 25, seen: 25 }, null], s2: { ever: false, on: false, last: 0 } };
  assert.deepEqual([...await Incubator.addRound({ results: builtIn(10) })], [0]);
  assert.equal(Incubator.state().eggs[0].progress, 30);
  assert.deepEqual([...await Incubator.addRound({ results: builtIn(10) })], []);
  assert.deepEqual([...Incubator.readySlots()], [0]);
});

test("anon discard: a ready egg can't be discarded; an unfinished one can", async () => {
  const { Incubator, loadState } = load();
  loadState().incubator = { eggs: [{ rarity: "rare", need: 80, progress: 80, seen: 0 }, null], s2: { ever: false, on: false, last: 0 } };
  assert.equal(await Incubator.discard(0), false);
  assert.ok(Incubator.state().eggs[0]);
  loadState().incubator.eggs[0].progress = 40;
  assert.equal(await Incubator.discard(0), true);
  assert.equal(Incubator.state().eggs[0], null);
});

test("anon hatch: not ready → null; ready → pokemon of the egg's rarity and the slot empties", async () => {
  const { Incubator, loadState, got } = load();
  loadState().incubator = { eggs: [{ rarity: "epic", need: 140, progress: 100, seen: 0 }, null], s2: { ever: false, on: false, last: 0 } };
  assert.equal(await Incubator.hatch(0), null);
  loadState().incubator.eggs[0].progress = 140;
  const r = await Incubator.hatch(0);
  assert.equal(r.rarity, "epic");
  assert.equal(got[0].rarity, "epic");
  assert.equal(Incubator.state().eggs[0], null);
});

test("logged-in claim with a failed RPC → { error: 'network' }, local diamonds and eggs untouched", async () => {
  const SupabaseAuth = { isLoggedIn: () => true, claimEgg: () => Promise.reject(new Error("net")) };
  const { Incubator, loadState } = load({ SupabaseAuth });
  loadState().diamonds = 300;
  const r = await Incubator.claim();
  assert.equal(r.error, "network");
  assert.equal(loadState().diamonds, 300);
  assert.deepEqual([...loadState().incubator.eggs], [null, null]);
});

test("logged-in claim adopts the server balance and egg; business errors pass through", async () => {
  let reply = { slot: 0, rarity: "legend", need: 200, balance: 97 };
  const SupabaseAuth = { isLoggedIn: () => true, claimEgg: async () => reply };
  const { Incubator, loadState } = load({ SupabaseAuth });
  loadState().diamonds = 100;
  const r = await Incubator.claim();
  assert.equal(r.rarity, "legend");
  assert.equal(loadState().diamonds, 97);
  assert.equal(loadState().incubator.eggs[0].need, 200);
  reply = { error: "incubator_full" };
  assert.equal((await Incubator.claim()).error, "incubator_full");
  assert.equal(loadState().diamonds, 97);
});

test("logged-in addRound adopts server progress and ready slots; failed RPC leaves local progress", async () => {
  let fail = false;
  const SupabaseAuth = {
    isLoggedIn: () => true,
    incubatorAdd: async (n) => (fail ? null : {
      eggs: [{ slot: 0, rarity: "normal", need: 30, progress: 30 }, null],
      slot2: { ever: false, on: false, last: 2 }, streak: 2, ready: [0], n
    })
  };
  const { Incubator, loadState } = load({ SupabaseAuth });
  loadState().incubator = { eggs: [{ rarity: "normal", need: 30, progress: 20, seen: 20 }, null], s2: { ever: false, on: false, last: 0 } };
  assert.deepEqual([...await Incubator.addRound({ results: builtIn(10) })], [0]);
  assert.equal(loadState().incubator.eggs[0].progress, 30);
  assert.equal(loadState().incubator.eggs[0].seen, 20);   /* 同一隻蛋：保留 seen（頁面逐格亮起） */
  fail = true;
  loadState().incubator.eggs[0].progress = 25;
  assert.deepEqual([...await Incubator.addRound({ results: builtIn(10) })], []);
  assert.equal(loadState().incubator.eggs[0].progress, 25);
});
