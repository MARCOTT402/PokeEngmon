/* 搵 css/style.css 入面「冇人用」嘅 rule：rule 嘅每個 selector 都引用咗至少一個
   喺 js/**、index.html 完全冇出現過嘅 class／id → 列做 dead。
   - 動態拼接（例如 `rarity-${r}`、"status-" + k）：如果 class 以某個喺 JS 出現過嘅「前綴-」開頭，列做 dynamic（要人手確認，唔會自動刪）。
   - @keyframes：名喺 css／js 都冇被 animation 用到 → dead。
   用法：node tools/audit/unused-css.mjs [--json out.json] */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const css = readFileSync("css/style.css", "utf8");
const srcFiles = [...walk("js").filter((f) => f.endsWith(".js")), "index.html"];
const src = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n");

/* 出現喺 source 嘅「字」：class／id 名可以喺 class="a b"、classList.add("a")、querySelector(".a #b") 等 */
const words = new Set(src.match(/[A-Za-z_][\w-]*/g));
/* 動態前綴：`foo-${`、`z${`、"lb-top" + rank、'foo-' + …（前綴唔一定有連字號：`lb-top${n}`、`z${i}`）
   字串入面緊接 ${ 或者引號 + 嘅最後一個字 = 前綴；以呢個前綴開頭嘅 class 一律當 dynamic（寧願漏刪，唔好錯刪） */
const dynPrefixes = new Set([...src.matchAll(/([A-Za-z_][\w-]*)(?:\$\{|["'`]\s*\+)/g)].map((m) => m[1]));

/* 粗略 parse：逐個 rule（處理 @media／@supports 一層嵌套、@keyframes 整段） */
const rules = [];
const keyframes = [];
let i = 0;
const lineOf = (pos) => css.slice(0, pos).split("\n").length;
function parseBlock(start, end, inAt) {
  let p = start;
  while (p < end) {
    const open = css.indexOf("{", p);
    if (open < 0 || open >= end) break;
    const head = css.slice(p, open).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    let depth = 1, q = open + 1;
    while (q < css.length && depth) { if (css[q] === "{") depth++; else if (css[q] === "}") depth--; q++; }
    if (/^@keyframes/.test(head)) keyframes.push({ name: head.split(/\s+/)[1], line: lineOf(open), start: p, end: q });
    else if (/^@(media|supports|container|layer)/.test(head)) parseBlock(open + 1, q - 1, head);
    else if (!head.startsWith("@")) rules.push({ selectors: head.split(",").map((s) => s.trim()), line: lineOf(open), at: inAt || "", start: p, end: q });
    p = q;
  }
}
parseBlock(0, css.length, "");

const tokensOf = (sel) => [...sel.matchAll(/[.#]([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
const status = (name) => {
  if (words.has(name)) return "used";
  if ([...dynPrefixes].some((pre) => name.startsWith(pre))) return "dynamic";
  return "dead";
};
const out = { dead: [], dynamic: [], keyframesDead: [] };
for (const r of rules) {
  const perSel = r.selectors.map((s) => {
    const toks = tokensOf(s);
    if (!toks.length) return "used";            /* 純元素／:root 等 */
    const st = toks.map(status);
    if (st.includes("dead")) return "dead";
    if (st.includes("dynamic")) return "dynamic";
    return "used";
  });
  if (perSel.every((s) => s === "dead")) out.dead.push({ line: r.line, at: r.at, selector: r.selectors.join(", ") });
  else if (perSel.every((s) => s !== "used")) out.dynamic.push({ line: r.line, at: r.at, selector: r.selectors.join(", ") });
}
const animUse = css + "\n" + src;
for (const k of keyframes) {
  const n = (animUse.match(new RegExp(`\\b${k.name.replace(/[-]/g, "\\-")}\\b`, "g")) || []).length;
  if (n <= 1) out.keyframesDead.push({ line: k.line, name: k.name });
}
console.log(`rules: ${rules.length}  dead: ${out.dead.length}  dynamic(人手確認): ${out.dynamic.length}  dead @keyframes: ${out.keyframesDead.length}`);
const ji = process.argv.indexOf("--json");
if (ji > 0) writeFileSync(process.argv[ji + 1], JSON.stringify(out, null, 2));
else {
  for (const d of out.dead) console.log(`DEAD  L${d.line}${d.at ? " [" + d.at.slice(0, 40) + "]" : ""}  ${d.selector.slice(0, 110)}`);
  for (const d of out.dynamic) console.log(`DYN   L${d.line}  ${d.selector.slice(0, 110)}`);
  for (const k of out.keyframesDead) console.log(`KF    L${k.line}  @keyframes ${k.name}`);
}
