"use strict";
/* App 公開介面（總計劃 P2.2，Review Focus #2）：js/app.js 拆成 js/app/*.js mixin（Object.assign(App, {…})）之後，
   - App 嘅成員一個都唔可以少、唔可以多；
   - 每個方法嘅原始碼要同拆檔前一字不差（SHA-1 指紋）——證明只係搬位，冇改到邏輯；
   - 載入次序跟 index.html（所以漏咗 <script> 都會紅）。
   刻意改 App 方法之後：node tests/unit/app-surface.test.js --update 重寫 tests/fixtures/app-surface.json，並喺 commit 講明原因。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadScripts, ROOT } = require("../helpers/load.js");

const FIXTURE = path.join(ROOT, "tests/fixtures/app-surface.json");

/* index.html 入面 App 相關 script（js/app.js 同 js/app/*.js），按出現次序 */
function appScripts() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  return [...html.matchAll(/<script src="(js\/app(?:\.js|\/[\w-]+\.js))\?/g)].map((m) => m[1]);
}

function surface() {
  const { App } = loadScripts(appScripts(), { expose: ["App"] });
  const out = {};
  for (const k of Object.keys(App).sort()) {
    const v = App[k];
    out[k] = typeof v === "function"
      /* 換行統一做 \n：Windows checkout 係 CRLF、CI（Linux）係 LF，唔統一就喺 CI 全部對唔上 */
      ? "fn:" + crypto.createHash("sha1").update(v.toString().replace(/\r\n?/g, "\n")).digest("hex").slice(0, 16)
      : (v === null ? "null" : typeof v) + ":" + JSON.stringify(v ?? null);
  }
  return out;
}

if (process.argv.includes("--update")) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify(surface(), null, 2) + "\n");
  console.log("wrote", path.relative(ROOT, FIXTURE));
} else {
  test("index.html loads js/app.js first, then any js/app/*.js mixins", () => {
    const s = appScripts();
    assert.equal(s[0], "js/app.js");
    assert.ok(s.slice(1).every((f) => f.startsWith("js/app/")));
  });

  test("App has exactly the same members, and every method's source is unchanged", () => {
    const want = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    const got = surface();
    assert.deepEqual(Object.keys(got).filter((k) => !(k in want)), [], "unexpected new members");
    assert.deepEqual(Object.keys(want).filter((k) => !(k in got)), [], "members missing after split (forgot a <script>?)");
    assert.deepEqual(Object.keys(want).filter((k) => want[k] !== got[k]), [], "member source/value changed");
  });
}
