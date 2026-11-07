/* 核對 z-index token 化冇改到任何數值（Rule 110）：
   - 讀 git 某個版本（預設 HEAD）同 working tree 嘅 css/style.css，按出現次序列出每條 rule 嘅 (selector, z-index)。
   - 兩邊嘅 var(--z-*) 各自用自己 :root 定義嘅數值代入，逐條比較，要完全一樣。
   - 另外檢查：所有用到嘅 --z-* 都有定義、所有定義都有人用、全域層（>= 100，局部層白名單除外）唔准再寫字面值。
   用法：node tools/audit/check-z-tokens.mjs [gitRef]   （exit 1 = 有問題；乾淨 tree 對 HEAD 一定係 exit 0）
   邏輯喺 compareZ()，tests/unit/z-tokens.test.js 有直接測。 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* 局部層：喺自己嘅 stacking context 入面，數值大過 100 都唔算全域層 */
export const LOCAL_OK = [".catch-ball.grabbed"];

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

export function zList(css) {
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

export function rootTokens(css) {
  const tokens = {};
  for (const m of strip(css).matchAll(/--(z-[\w-]+)\s*:\s*(-?\d+)\s*;/g)) tokens[m[1]] = Number(m[2]);
  return tokens;
}

/** 將一個 z-index 值（數字或者 var(--z-x[, fallback])）用指定 token 表解析做數字；解析唔到 → NaN */
export function resolveZ(v, tokens) {
  const t = v.match(/^var\(\s*--(z-[\w-]+)\s*(?:,\s*(-?\d+))?\s*\)$/);
  if (t) return t[1] in tokens ? tokens[t[1]] : (t[2] !== undefined ? Number(t[2]) : NaN);
  return Number(v);
}

/** @returns {{ problems: string[], count: number, tokens: number, tokenised: number }} */
export function compareZ(beforeCss, afterCss) {
  const tb = rootTokens(beforeCss), ta = rootTokens(afterCss);
  const a = zList(beforeCss), b = zList(afterCss);
  const problems = [];
  if (a.length !== b.length) problems.push(`z-index declarations: ${a.length} before vs ${b.length} after`);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const va = resolveZ(a[i].val, tb), vb = resolveZ(b[i].val, ta);
    if (a[i].sel !== b[i].sel || va !== vb || Number.isNaN(vb)) {
      problems.push(`#${i} L${b[i].line} ${b[i].sel.slice(0, 60)}: ${a[i].val} (= ${va}) → ${b[i].val} (= ${vb})`);
    }
  }
  const used = new Set(b.map((x) => x.val.match(/--(z-[\w-]+)/)?.[1]).filter(Boolean));
  for (const u of used) if (!(u in ta)) problems.push(`--${u} used but not defined in :root`);
  for (const t of Object.keys(ta)) if (!used.has(t)) problems.push(`--${t} defined but never used`);
  for (const x of b) {
    const n = Number(x.val);
    if (Number.isFinite(n) && n >= 100 && !LOCAL_OK.includes(x.sel)) problems.push(`L${x.line} ${x.sel.slice(0, 60)}: global layer ${n} should use a --z-* token`);
  }
  return { problems, count: b.length, tokens: Object.keys(ta).length, tokenised: b.filter((x) => x.val.startsWith("var(")).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ref = process.argv[2] || "HEAD";
  const before = execSync(`git show ${ref}:css/style.css`, { encoding: "utf8", maxBuffer: 1 << 26 });
  const after = readFileSync("css/style.css", "utf8");
  const r = compareZ(before, after);
  console.log(`z-index rules: ${r.count}; tokens: ${r.tokens}; tokenised: ${r.tokenised}`);
  if (r.problems.length) { console.log(r.problems.join("\n")); process.exit(1); }
  console.log("OK: every z-index resolves to the same value as " + ref);
}
