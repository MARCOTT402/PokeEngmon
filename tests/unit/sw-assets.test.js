"use strict";
/* sw.js precache 清單（ASSETS）唔可以漏 index.html 用到嘅本地檔，否則首次安裝之後離線開 App 會載唔到（Review Focus #5）。
   ASSETS 有部分係由陣列砌出嚟（BATTLE_UI.map 等），所以要真正喺 vm 執行 sw.js 先攞到完整清單。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function swAssets() {
  const ctx = {
    self: { location: { origin: "https://example.test", hostname: "example.test" }, addEventListener() {}, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async () => ({}), match: async () => undefined, keys: async () => [] },
    URL, Request: class {}, Response: class {}, setTimeout, clearTimeout, Promise, fetch: async () => ({})
  };
  vm.createContext(ctx);
  vm.runInContext(read("sw.js") + "\n;this.__assets = ASSETS;", ctx);
  /* vm 入面嘅陣列同 Node 唔同 realm，先 clone（Rule 106） */
  return JSON.parse(JSON.stringify(ctx.__assets)).map((a) => String(a).replace(/^\.\//, "").split("?")[0]).filter(Boolean);
}

/* index.html 入面所有本地 src／href（去 ?v=） */
function indexRefs() {
  return [...new Set([...read("index.html").matchAll(/\b(?:src|href)="([^"#]+)"/g)]
    .map((m) => m[1].split("?")[0])
    .filter((u) => u && !/^(https?:|data:|mailto:|javascript:|\/\/)/.test(u))
    .map((u) => u.replace(/^\.\//, "")))];
}

test("every local file index.html loads is precached by sw.js", () => {
  const assets = new Set(swAssets());
  assert.deepEqual(indexRefs().filter((u) => !assets.has(u)), []);
});

test("every precached file exists on disk", () => {
  assert.deepEqual(swAssets().filter((a) => !fs.existsSync(path.join(ROOT, a))), []);
});

test("manifest.json icons and start_url are precached", () => {
  const m = JSON.parse(read("manifest.json"));
  const assets = new Set(swAssets());
  const need = [m.start_url, ...(m.icons || []).map((i) => i.src)].map((u) => u.replace(/^\.\//, "").split("?")[0]);
  assert.deepEqual(need.filter((u) => !assets.has(u)), []);
});
