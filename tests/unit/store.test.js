"use strict";
/* js/store.js（總計劃 P2.1）：Store.get／select／update／subscribe 包住 storage.js。
   - 舊 code 直接改 loadState() 再 saveState() 都會通知訂閱者（唔使即刻改 91 處 call site）。
   - 同一輪多次 save 合併做一次通知；只比較有人訂閱嘅頂層欄位。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const KEY = "pokeengmon_state_v1";
const load = () => loadScripts(
  ["js/core/guard.js", "js/gens-data.js", "js/data.js", "js/pokemon.js", "js/storage.js", "js/store.js"],
  { expose: ["Store", "loadState", "saveState", "flushState"] }
);
const tick = () => new Promise((r) => setTimeout(r, 0));   /* 等 microtask 批次通知 */

test("get() returns the live state object; select() reads one top-level key", () => {
  const { Store, loadState } = load();
  assert.equal(Store.get(), loadState());
  assert.equal(Store.select("diamonds"), loadState().diamonds);
});

test("update(fn) mutates, returns fn's result and persists through saveState batching", async () => {
  const { Store, flushState, ctx } = load();
  const r = Store.update((st) => { st.diamonds = 42; return "ok"; });
  assert.equal(r, "ok");
  assert.equal(Store.select("diamonds"), 42);
  flushState();
  assert.equal(JSON.parse(ctx.localStorage.getItem(KEY)).diamonds, 42);
});

test("update(fn, { now: true }) writes to localStorage immediately", () => {
  const { Store, ctx } = load();
  Store.update((st) => { st.playerName = "Ash"; }, { now: true });
  assert.equal(JSON.parse(ctx.localStorage.getItem(KEY)).playerName, "Ash");
});

test("subscribe(key) fires once with the new value when that key changes", async () => {
  const { Store } = load();
  const seen = [];
  Store.subscribe("diamonds", (v) => seen.push(v));
  Store.update((st) => { st.diamonds = 7; });
  await tick();
  assert.deepEqual(seen, [7]);
});

test("subscriber is not called when a different key changes", async () => {
  const { Store } = load();
  let calls = 0;
  Store.subscribe("diamonds", () => calls++);
  Store.update((st) => { st.playerName = "Misty"; });
  await tick();
  assert.equal(calls, 0);
});

test("legacy code (mutate loadState() + saveState()) also notifies subscribers", async () => {
  const { Store, loadState, saveState } = load();
  const seen = [];
  Store.subscribe("bestStreak", (v) => seen.push(v));
  loadState().bestStreak = 9; saveState();
  await tick();
  assert.deepEqual(seen, [9]);
});

test("in-place changes inside nested objects are detected (entries array)", async () => {
  const { Store } = load();
  let calls = 0;
  Store.subscribe("entries", () => calls++);
  Store.update((st) => { st.entries.push({ uid: "x", chainKey: "bulbasaur", exp: 0 }); });
  await tick();
  assert.equal(calls, 1);
});

test("several saves in the same tick produce one notification with the final value", async () => {
  const { Store } = load();
  const seen = [];
  Store.subscribe("diamonds", (v) => seen.push(v));
  Store.update((st) => { st.diamonds = 1; });
  Store.update((st) => { st.diamonds = 2; });
  Store.update((st) => { st.diamonds = 3; });
  await tick();
  assert.deepEqual(seen, [3]);
});

test("unsubscribe stops notifications", async () => {
  const { Store } = load();
  let calls = 0;
  const off = Store.subscribe("diamonds", () => calls++);
  off();
  Store.update((st) => { st.diamonds = 99; });
  await tick();
  assert.equal(calls, 0);
});

test("a throwing subscriber does not stop the others", async () => {
  const { Store } = load();
  let ok = 0;
  Store.subscribe("diamonds", () => { throw new Error("boom"); });
  Store.subscribe("diamonds", () => ok++);
  Store.update((st) => { st.diamonds = 5; });
  await tick();
  assert.equal(ok, 1);
});

test('subscribe("*") fires once per save batch', async () => {
  const { Store } = load();
  let calls = 0;
  Store.subscribe("*", () => calls++);
  Store.update((st) => { st.diamonds = 1; });
  Store.update((st) => { st.playerName = "Brock"; });
  await tick();
  assert.equal(calls, 1);
});
