/* 核對 z-index token 化冇改到任何數值：
   - 讀 git 某個版本（預設 HEAD）同 working tree 嘅 css/style.css，按出現次序列出每條 rule 嘅 (selector, z-index)。
   - working tree 入面嘅 var(--z-*) 用 :root 定義嘅數值代入，兩邊逐條比較，要完全一樣。
   - 另外檢查：所有用到嘅 --z-* 都有定義、所有定義都有人用、全域層（>= 100，局部層白名單除外）唔准再寫字面值。
   用法：node tools/audit/check-z-tokens.mjs [gitRef]   （exit 1 = 有問題） */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ref = process.argv[2] || "HEAD";
const before = execSync(`git show ${ref}:css/style.css`, { encoding: "utf8", maxBuffer: 1 << 26 });
const after = readFileSync("css/style.css", "utf8");

/* 局部層：喺自己嘅 stacking context 入面，數值大過 100 都唔算全域層 */
const LOCAL_OK = [".catch-ball.grabbed"];

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
function zList(css) {
  const out = [];
  const src = strip(css);
  const re = /z-index\s*:\s*([^;}\n]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.lastIndexOf("{", m.index);
    const sel = src.slice(src.lastIndexOf("}", open) + 1, open).trim().replace(/\s+/g, " ");
    out.push({ sel, val: m[1].trim().replace(/\s*!important$/, ""), line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}
function rootTokens(css) {
  const tokens = {};
  for (const m of strip(css).matchAll(/--(z-[\w-]+)\s*:\s*(-?\d+)\s*;/g)) tokens[m[1]] = Number(m[2]);
  return tokens;
}

const tokens = rootTokens(after);
const resolve = (v) => {
  const t = v.match(/^var\(\s*--(z-[\w-]+)\s*(?:,\s*(-?\d+))?\s*\)$/);
  if (t) return t[1] in tokens ? tokens[t[1]] : NaN;
  return Number(v);
};
const problems = [];
const a = zList(before), b = zList(after);
if (a.length !== b.length) problems.push(`z-index declarations: ${a.length} before vs ${b.length} after`);
for (let i = 0; i < Math.min(a.length, b.length); i++) {
  const va = Number(a[i].val), vb = resolve(b[i].val);
  if (a[i].sel !== b[i].sel || va !== vb) problems.push(`#${i} L${b[i].line} ${b[i].sel.slice(0, 60)}: ${a[i].val} → ${b[i].val} (= ${vb})`);
}
const used = new Set(b.map((x) => x.val.match(/--(z-[\w-]+)/)?.[1]).filter(Boolean));
for (const u of used) if (!(u in tokens)) problems.push(`--${u} used but not defined in :root`);
for (const t of Object.keys(tokens)) if (!used.has(t)) problems.push(`--${t} defined but never used`);
for (const x of b) {
  const n = Number(x.val);
  if (Number.isFinite(n) && n >= 100 && !LOCAL_OK.includes(x.sel)) problems.push(`L${x.line} ${x.sel.slice(0, 60)}: global layer ${n} should use a --z-* token`);
}
console.log(`z-index rules: ${b.length}; tokens: ${Object.keys(tokens).length}; tokenised: ${b.filter((x) => x.val.startsWith("var(")).length}`);
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log("OK: every z-index resolves to the same value as " + ref);
