"use strict";
/* 大物件分檔嘅公開介面（總計劃 P2.2／P2.5，Review Focus #2）：
   App（js/app.js + js/app/*.js）、Quiz（js/quiz.js + js/quiz/*.js）、Gacha（js/gacha.js + js/gacha/*.js）
   用 Object.assign mixin 拆檔之後：
   - 成員一個都唔可以少、唔可以多；
   - 每個方法嘅原始碼要同拆檔前一字不差（SHA-1 指紋，換行統一做 \n）——證明只係搬位；
   - 載入次序跟 index.html（漏咗 <script> 都會紅）。
   刻意改方法之後：node tests/unit/app-surface.test.js --update 重寫 tests/fixtures/app-surface.json，並喺 commit 講明原因。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadScripts, ROOT } = require("../helpers/load.js");

const FIXTURE = path.join(ROOT, "tests/fixtures/app-surface.json");
/* name：全域物件；main：主檔；dir：mixin 目錄；deps：載入主檔前要有嘅 script（只為咗物件字面值本身） */
const OBJECTS = [
  { name: "App", main: "js/app.js", dir: "js/app/" },
  { name: "Quiz", main: "js/quiz.js", dir: "js/quiz/" },
  { name: "Gacha", main: "js/gacha.js", dir: "js/gacha/" },
];

/* index.html 入面屬於呢個物件嘅 script（主檔＋mixin），按出現次序 */
function scriptsFor(o) {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  return [...html.matchAll(/<script src="([^"?]+)\?/g)].map((m) => m[1])
    .filter((s) => s === o.main || s.startsWith(o.dir));
}

function surface(o) {
  const exp = loadScripts(scriptsFor(o), { expose: [o.name] })[o.name];
  const out = {};
  for (const k of Object.keys(exp).sort()) {
    const v = exp[k];
    /* 換行統一做 \n：Windows checkout 係 CRLF、CI（Linux）係 LF，唔統一就喺 CI 全部對唔上 */
    out[k] = typeof v === "function"
      ? "fn:" + crypto.createHash("sha1").update(v.toString().replace(/\r\n?/g, "\n")).digest("hex").slice(0, 16)
      : (v === null ? "null" : typeof v) + ":" + JSON.stringify(v ?? null);
  }
  return out;
}

if (process.argv.includes("--update")) {
  const all = {};
  for (const o of OBJECTS) all[o.name] = surface(o);
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify(all, null, 2) + "\n");
  console.log("wrote", path.relative(ROOT, FIXTURE), Object.entries(all).map(([k, v]) => `${k}:${Object.keys(v).length}`).join(" "));
} else {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  for (const o of OBJECTS) {
    test(`${o.name}: index.html loads ${o.main} before any ${o.dir}* mixin`, () => {
      const s = scriptsFor(o);
      assert.equal(s[0], o.main);
      assert.ok(s.slice(1).every((f) => f.startsWith(o.dir)));
    });

    test(`${o.name}: same members, and every method's source is unchanged`, () => {
      const want = fixture[o.name];
      assert.ok(want, `fixture has no ${o.name}; run with --update`);
      const got = surface(o);
      assert.deepEqual(Object.keys(got).filter((k) => !(k in want)), [], "unexpected new members");
      assert.deepEqual(Object.keys(want).filter((k) => !(k in got)), [], "members missing (forgot a <script>?)");
      assert.deepEqual(Object.keys(want).filter((k) => want[k] !== got[k]), [], "member source/value changed");
    });
  }
}
