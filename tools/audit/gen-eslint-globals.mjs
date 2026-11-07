/* 由 index.html 嘅 <script src> 次序，抽出每個 App script 嘅頂層宣告（const／let／function／class／window.X =），
   寫入 eslint.globals.json，等 ESLint no-undef 識得跨檔 global（冇 module system 嘅代價）。
   `npm run lint` 前自動跑（prelint）。用法：node tools/audit/gen-eslint-globals.mjs */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
  .map((m) => m[1].split("?")[0])
  .filter((s) => !/^(https?:)?\/\//.test(s) && existsSync(s));

const names = new Map();   // name -> first file
const add = (n, f) => { if (!names.has(n)) names.set(n, f); };
for (const f of srcs) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) add(m[1], f);
  for (const m of src.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm)) add(m[1], f);
  for (const m of src.matchAll(/^class\s+([A-Za-z_$][\w$]*)/gm)) add(m[1], f);
  for (const m of src.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) add(m[1], f);
}
/* supabase-config.js 喺 index.html 但唔係 js/；同埋 index.html 內聯 script 設嘅 global */
for (const m of html.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*\|\|\s*\(window\.\1\s*=/g)) add(m[1], "index.html");

const out = Object.fromEntries([...names.keys()].sort().map((n) => [n, "writable"]));
writeFileSync("eslint.globals.json", JSON.stringify(out, null, 2) + "\n");
console.log(`eslint.globals.json: ${names.size} globals from ${srcs.length} scripts`);
