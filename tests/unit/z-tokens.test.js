"use strict";
/* z-index token（Rule 110）：全域層一律用 :root 嘅 --z-*，唔准再寫字面值；toast 一定要喺所有互動層之上（Rule 46）。
   數值有冇被改到，由 tools/audit/check-z-tokens.mjs 同 git 版本比較；呢度只防倒退。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "../../css/style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const LOCAL_OK = [".catch-ball.grabbed"];   /* 局部 stacking context，唔算全域層 */

const tokens = {};
for (const m of css.matchAll(/--(z-[\w-]+)\s*:\s*(-?\d+)\s*;/g)) tokens[m[1]] = Number(m[2]);
const decls = [...css.matchAll(/z-index\s*:\s*([^;}\n]+)/g)].map((m) => {
  const open = css.lastIndexOf("{", m.index);
  return { sel: css.slice(css.lastIndexOf("}", open) + 1, open).trim().replace(/\s+/g, " "), val: m[1].trim() };
});

test("global layers (z-index >= 100) use a --z-* token", () => {
  const literal = decls.filter((d) => Number(d.val) >= 100 && !LOCAL_OK.includes(d.sel)).map((d) => `${d.sel} → ${d.val}`);
  assert.deepEqual(literal, []);
});

test("every var(--z-*) used is defined in :root, and every token is used", () => {
  const used = new Set(decls.map((d) => (d.val.match(/--(z-[\w-]+)/) || [])[1]).filter(Boolean));
  assert.deepEqual([...used].filter((u) => !(u in tokens)), [], "undefined tokens");
  assert.deepEqual(Object.keys(tokens).filter((t) => !used.has(t)), [], "unused tokens");
});

test("toast sits above every interactive layer; only deliberate top layers are higher", () => {
  const above = Object.entries(tokens).filter(([k, v]) => v > tokens["z-toast"]).map(([k]) => k).sort();
  assert.deepEqual(above, ["z-entry-gate", "z-kbd-badges", "z-top"]);
});
