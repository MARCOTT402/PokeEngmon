"use strict";
/* 圖鑑／隊伍／Partner Care 共用排序 characterization tests */
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

let S;
before(async () => {
  S = loadScripts(["js/core/guard.js", "js/gens-data.js", "js/data.js", "js/pokemon.js", "js/dex-sort.js"], {
    expose: ["DEXSORT", "loadPokemonDex", "dexOf"]
  });
  await S.loadPokemonDex();
});

const ITEMS = () => [{ dexId: 25, level: 10 }, { dexId: 1, level: 30 }, { dexId: 4, level: 10 }, { dexId: 7, level: 5 }];
const ids = (list) => list.map((x) => x.dexId);
const get = (x) => x;

test("default direction: text sorts asc, numeric sorts desc", () => {
  assert.equal(S.DEXSORT.defaultDir("no"), "asc");
  assert.equal(S.DEXSORT.defaultDir("name"), "asc");
  assert.equal(S.DEXSORT.defaultDir("atk"), "desc");
});

test("sort by No. asc / desc", () => {
  assert.deepEqual(ids(S.DEXSORT.sortList(ITEMS(), "no", "asc", get)), [1, 4, 7, 25]);
  assert.deepEqual(ids(S.DEXSORT.sortList(ITEMS(), "no", "desc", get)), [25, 7, 4, 1]);
});

test("sort by name asc (Bulbasaur, Charmander, Pikachu, Squirtle)", () => {
  assert.deepEqual(ids(S.DEXSORT.sortList(ITEMS(), "name", "asc", get)), [1, 4, 25, 7]);
});

test("sort by level desc; ties fall back to dex No. ascending (stable)", () => {
  assert.deepEqual(ids(S.DEXSORT.sortList(ITEMS(), "level", "desc", get)), [1, 4, 25, 7]);
  assert.deepEqual(ids(S.DEXSORT.sortList(ITEMS(), "level", "asc", get)), [7, 4, 25, 1]);
});

test("sort by every base stat follows dex base stats", () => {
  for (const k of ["hp", "atk", "def", "spa", "spd", "spe"]) {
    const out = S.DEXSORT.sortList(ITEMS(), k, "desc", get);
    const vals = out.map((x) => S.dexOf(x.dexId).baseStats[k]);
    for (let i = 1; i < vals.length; i++) assert.ok(vals[i - 1] >= vals[i], k);
  }
});

test("load(): bad saved prefs fall back to No. asc", () => {
  S.ctx.localStorage.setItem("t-sort", "{bad");
  assert.deepEqual({ ...S.DEXSORT.load("t-sort") }, { sort: "no", dir: "asc" });
  S.ctx.localStorage.setItem("t-sort", JSON.stringify({ sort: "atk", dir: "sideways" }));
  assert.deepEqual({ ...S.DEXSORT.load("t-sort") }, { sort: "atk", dir: "desc" });
});
