"use strict";
/* 數值／升級／屬性相剋 characterization tests（snapshot 數值 = 2026-11-07 現行為） */
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

let P;
before(async () => {
  P = loadScripts(["js/core/guard.js", "js/gens-data.js", "js/data.js", "js/pokemon.js"], {
    expose: ["loadPokemonDex", "calcStats", "expAtLevel", "levelFromExp", "typeMultiplier", "randomIvs", "dexOf"]
  });
  await P.loadPokemonDex();
});

const IV31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

test("dex data loads from data/*.json", () => {
  assert.equal(P.dexOf(25).types[0], "electric");
});

test("calcStats snapshot: Pikachu Lv50, IV 31, EV 0, Hardy", () => {
  assert.deepEqual({ ...P.calcStats(25, 50, IV31, {}, "hardy") },
    { hp: 110, atk: 75, def: 60, spa: 70, spd: 70, spe: 110 });
});

test("calcStats unknown species → null", () => {
  assert.equal(P.calcStats(99999, 50, IV31, {}, "hardy"), null);
});

test("expAtLevel snapshot (Pikachu, medium-fast = n³)", () => {
  assert.equal(P.expAtLevel(25, 1), 0);
  assert.equal(P.expAtLevel(25, 50), 125000);
  assert.equal(P.expAtLevel(25, 99), 970299);
});

test("level cap is 99: expAtLevel(100) == expAtLevel(99), huge exp → 99", () => {
  assert.equal(P.expAtLevel(25, 100), P.expAtLevel(25, 99));
  assert.equal(P.levelFromExp(25, 1e9), 99);
});

test("expAtLevel is strictly increasing 1→99", () => {
  for (let lv = 2; lv <= 99; lv++) assert.ok(P.expAtLevel(25, lv) > P.expAtLevel(25, lv - 1), "lv " + lv);
});

test("levelFromExp(expAtLevel(n)) === n", () => {
  for (const n of [1, 2, 16, 50, 98, 99]) assert.equal(P.levelFromExp(25, P.expAtLevel(25, n)), n);
});

test("levelFromExp: one exp short stays at the lower level", () => {
  assert.equal(P.levelFromExp(25, P.expAtLevel(25, 50) - 1), 49);
});

test("typeMultiplier: immunity, super effective, dual-type stacking", () => {
  assert.equal(P.typeMultiplier("ground", ["flying"]), 0);
  assert.equal(P.typeMultiplier("water", ["fire"]), 2);
  assert.equal(P.typeMultiplier("electric", ["water", "flying"]), 4);
  assert.equal(P.typeMultiplier("nonsense", ["water"]), 1);
});

test("randomIvs: six stats, each integer 0–31", () => {
  for (let i = 0; i < 50; i++) {
    const iv = P.randomIvs();
    assert.deepEqual(Object.keys(iv).sort(), ["atk", "def", "hp", "spa", "spd", "spe"]);
    for (const v of Object.values(iv)) assert.ok(Number.isInteger(v) && v >= 0 && v <= 31);
  }
});
