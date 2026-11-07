"use strict";
/* @ts-check ratchet：types/ts-check-files.json 列明邊啲檔已經開型別檢查。
   - 清單入面嘅檔，第一行一定要係 `// @ts-check`（唔准靜靜拎走）。
   - 新加 `// @ts-check` 嘅檔要同時加入清單，令清單只會增加。
   型別錯誤本身由 `npm run typecheck`（tsc）負責；呢個測試只保證覆蓋範圍唔會倒退。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const listed = JSON.parse(fs.readFileSync(path.join(ROOT, "types/ts-check-files.json"), "utf8"));
const hasHeader = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^﻿/, "").startsWith("// @ts-check");

const walk = (d) => fs.readdirSync(d).flatMap((f) => {
  const p = path.join(d, f);
  return fs.statSync(p).isDirectory() ? walk(p) : [p];
});

test("every file listed in types/ts-check-files.json still starts with // @ts-check", () => {
  const missing = listed.filter((f) => !fs.existsSync(path.join(ROOT, f)) || !hasHeader(f));
  assert.deepEqual(missing, [], "these files lost their // @ts-check header (the list may only grow)");
});

test("every js file with // @ts-check is listed (so the ratchet tracks it)", () => {
  const actual = walk(path.join(ROOT, "js")).filter((p) => p.endsWith(".js"))
    .map((p) => path.relative(ROOT, p).split(path.sep).join("/")).filter(hasHeader);
  const unlisted = actual.filter((f) => !listed.includes(f));
  assert.deepEqual(unlisted, [], "add these to types/ts-check-files.json");
});

test("the list is sorted and has no duplicates", () => {
  assert.deepEqual(listed, [...new Set(listed)].sort());
});
