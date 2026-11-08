"use strict";
/* 每次 deploy 嘅版本標記（Rule 120）：sw.js 快取名同 index.html 嘅 ?v= 一齊加 commit id，
   否則冇出新版本嘅 deploy 會令回訪用戶用新 index.html 配快取入面嘅舊 JS。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { stampBuild } = require("../../tools/deploy/stamp.cjs");
const { ROOT } = require("../helpers/load.js");

const SW = 'const CACHE_NAME = "pokeengmon-1.71.2";\nconst SW_VERSION = CACHE_NAME.slice("pokeengmon-".length);\n';
const INDEX = '<script src="js/a.js?v=1.71.2"></script><link href="css/s.css?v=1.71.2"><script src="js/b.js?v=1.71.2" type="module"></script>';

test("stamps the SW cache name and every ?v= with the same version-id tag", () => {
  const r = stampBuild({ sw: SW, index: INDEX }, "1.71.2", "88534eb");
  assert.equal(r.tag, "1.71.2-88534eb");
  assert.match(r.sw, /const CACHE_NAME = "pokeengmon-1\.71\.2-88534eb";/);
  assert.equal(r.count, 3);
  assert.equal((r.index.match(/\?v=1\.71\.2-88534eb/g) || []).length, 3);
  assert.ok(!/\?v=1\.71\.2(?!-)/.test(r.index), "no unstamped ?v= left");
});

test("the stamped SW version (CACHE_NAME minus prefix) equals the stamped ?v= — so the versioned route still caches", () => {
  const r = stampBuild({ sw: SW, index: INDEX }, "1.71.2", "abc1234");
  const swVersion = r.sw.match(/pokeengmon-([^"]+)"/)[1];
  const vs = [...new Set([...r.index.matchAll(/\?v=([^"]+)"/g)].map((m) => m[1]))];
  assert.deepEqual(vs, [swVersion]);
});

test("two deploys of the same version get different sw.js bytes (forces a new service worker)", () => {
  const a = stampBuild({ sw: SW, index: INDEX }, "1.71.2", "aaaaaaa").sw;
  const b = stampBuild({ sw: SW, index: INDEX }, "1.71.2", "bbbbbbb").sw;
  assert.notEqual(a, b);
});

test("does not touch a longer version that merely starts with the same digits", () => {
  const r = stampBuild({ sw: SW, index: INDEX + '<img src="x.png?v=1.71.20">' }, "1.71.2", "abc1234");
  assert.match(r.index, /x\.png\?v=1\.71\.20"/);
});

test("fails loudly when the files do not match the version (instead of deploying unstamped)", () => {
  assert.throws(() => stampBuild({ sw: SW, index: INDEX }, "1.72.0", "abc1234"), /sw\.js/);
  assert.throws(() => stampBuild({ sw: SW, index: "<p>no scripts</p>" }, "1.71.2", "abc1234"), /index\.html/);
  assert.throws(() => stampBuild({ sw: SW, index: INDEX }, "1.71.2", "../x"), /build id/);
});

test("repo files agree: package.json version = sw.js CACHE_NAME = every index.html ?v= (stamping can run)", () => {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(stampBuild({ sw, index }, version, "0000000").count > 50);
  assert.deepEqual([...new Set([...index.matchAll(/\?v=([^"'\s>]+)/g)].map((m) => m[1]))], [version]);
});
