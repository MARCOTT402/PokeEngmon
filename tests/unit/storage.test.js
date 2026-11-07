"use strict";
/* 本地存檔 characterization tests：記錄現行為，重構前嘅安全網（Review Focus #1）。
   舊存檔 fixture 由 tools/make-old-state-fixture.mjs 用 git 舊版 defaultState() 生成。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadScripts } = require("../helpers/load.js");

const FILES = ["js/core/guard.js", "js/gens-data.js", "js/data.js", "js/pokemon.js", "js/storage.js"];
const EXPOSE = ["STORAGE_KEY", "loadState", "defaultState", "migrateEntries", "loadPokemonDex", "levelFromExp",
  "entryCurrentSpecies", "addEntryExp", "entryNextEvolution", "canEvolveNow", "calcStreak", "dateKey",
  "localEntryFromServer", "obtainPokemon"];
const KEY = "pokeengmon_state_v1";
const OLD = fs.readFileSync(path.join(__dirname, "../fixtures/state-old.json"), "utf8");

const fresh = (ls) => loadScripts(FILES, { expose: EXPOSE, localStorage: ls });

test("STORAGE_KEY is pokeengmon_state_v1", () => {
  assert.equal(fresh().STORAGE_KEY, KEY);
});

test("empty localStorage → loadState() equals defaultState()", () => {
  const r = fresh();
  assert.deepEqual(JSON.parse(JSON.stringify(r.loadState())), JSON.parse(JSON.stringify(r.defaultState())));
});

test("corrupt JSON → no throw, default state, raw string backed up (Rule 98)", () => {
  const r = fresh({ [KEY]: "{" });
  const st = r.loadState();
  assert.equal(JSON.stringify(st), JSON.stringify(r.defaultState()));
  const backups = Object.keys(r.ctx.localStorage).filter((k) => k.startsWith("pokeengmon_state_corrupt_"));
  assert.equal(backups.length, 1);
  assert.equal(r.ctx.localStorage.getItem(backups[0]), "{");
});

test("old save (79f9378 shape) → after boot migration every entry is usable", async () => {
  const r = fresh({ [KEY]: OLD });
  r.loadState();
  await r.loadPokemonDex();
  r.migrateEntries();
  const st = r.loadState();
  assert.equal(st.entries.length, 2);
  for (const e of st.entries) {
    assert.ok(e.uid && typeof e.uid === "string", "uid");
    assert.ok(Number.isFinite(Number(e.exp)), "exp finite");
    assert.ok(Array.isArray(e.moves) && e.moves.length > 0, "moves re-derived");
    assert.ok(e.nature, "nature filled");
    const dex = r.entryCurrentSpecies(e)[0];
    assert.ok(Number.isInteger(dex) && dex > 0, "species resolvable");
  }
  /* KNOWN: 舊 uid（非 UUID）會被換成新 UUID；activeUid 跟住換 */
  assert.ok(st.entries.some((e) => e.uid === st.activeUid), "activeUid follows uid migration");
});

test("server row: old pet columns (pet_health/pet_updated_at) == new (fullness/fullness_at)", () => {
  const r = fresh();
  const base = { id: "u1", chain_key: "bulbasaur", exp: 0 };
  const a = r.localEntryFromServer({ ...base, pet_health: 40, pet_updated_at: "2026-11-01T00:00:00Z" });
  const b = r.localEntryFromServer({ ...base, fullness: 40, fullness_at: "2026-11-01T00:00:00Z" });
  assert.deepEqual(JSON.parse(JSON.stringify(a.pet)), JSON.parse(JSON.stringify(b.pet)));
  assert.equal(a.pet.health, 40);
  assert.equal(a.pet.updatedAt, "2026-11-01T00:00:00Z");
});

test("server row without pet data → pet is null (never treated as 0)", () => {
  const r = fresh();
  assert.equal(r.localEntryFromServer({ id: "u1", chain_key: "bulbasaur", exp: 0 }).pet, null);
});

test("level evolution: Bulbasaur needs Lv16; canEvolveNow follows level", async () => {
  const r = fresh();
  await r.loadPokemonDex();
  const e = { uid: "x", chainKey: "bulbasaur", exp: 0, stage: 1, ownedSpecies: [1], level: 15 };
  const info = r.entryNextEvolution(e);
  assert.equal(info.target[0], 2);
  assert.equal(info.needLevel, 16);
  assert.equal(r.canEvolveNow(e, info), false);
  e.level = 16;
  assert.equal(r.canEvolveNow(e, info), true);
});

test("fully evolved entry has no next evolution", async () => {
  const r = fresh();
  await r.loadPokemonDex();
  assert.equal(r.entryNextEvolution({ chainKey: "bulbasaur", stage: 3, ownedSpecies: [1, 2, 3] }), null);
});

test("calcStreak: today+yesterday+2 days ago = 3; a gap stops the count", () => {
  const r = fresh();
  const st = r.loadState();
  const day = (n) => r.dateKey(Date.now() - n * 86400000);
  st.practiceDays = { [day(0)]: 1, [day(1)]: 2, [day(2)]: 1, [day(4)]: 1 };
  assert.equal(r.calcStreak(), 3);
});

test("calcStreak: nothing today still counts a streak ending yesterday", () => {
  const r = fresh();
  const st = r.loadState();
  const day = (n) => r.dateKey(Date.now() - n * 86400000);
  st.practiceDays = { [day(1)]: 1, [day(2)]: 1 };
  assert.equal(r.calcStreak(), 2);
});
