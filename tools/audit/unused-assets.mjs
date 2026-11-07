/* 搵 assets／icons 入面冇被引用嘅檔案（只報告，唔刪）。
   引用來源：js/**、css/**、index.html、manifest.json、sw.js、data/*.json。
   - 路徑或檔名（含／唔含副檔名）喺 source 出現 → used。
   - 所在目錄喺 source 以「目錄/${…}」或「目錄/" +」動態拼接 → dynamic（按 id／名稱載入，唔可以當死檔）。
   用法：node tools/audit/unused-assets.mjs [--dirs assets,icons] */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, extname, dirname } from "node:path";

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const norm = (p) => p.split("\\").join("/");

const srcFiles = [
  ...walk("js").filter((f) => f.endsWith(".js")),
  ...walk("css").filter((f) => f.endsWith(".css")),
  "index.html", "manifest.json", "sw.js",
  ...walk("data").filter((f) => f.endsWith(".json") && statSync(f).size < 5e6)
];
const src = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n");

/* 動態目錄：`assets/battle/pkmn/front/${id}.png`、"assets/types/" + t … */
const dynDirs = new Set([...src.matchAll(/((?:assets|icons)\/[\w./-]*?)\/?(?:\$\{|["'`]\s*\+)/g)].map((m) => m[1].replace(/\/$/, "")));
/* 目錄字面值（`const BASE = "assets/battle/anim/"` 之後再拼接）都當動態 */
for (const m of src.matchAll(/["'`]((?:assets|icons)\/[\w./-]*\/)["'`]/g)) dynDirs.add(m[1].replace(/\/$/, ""));
const isDyn = (rel) => [...dynDirs].some((d) => rel.startsWith(d + "/") || rel.startsWith(d));

const rows = { used: 0, dynamic: 0, dead: [] };
let deadBytes = 0;
for (const dir of arg("dirs", "assets,icons").split(",")) {
  for (const f of walk(dir)) {
    const rel = norm(relative(".", f));
    const name = basename(f), stem = basename(f, extname(f));
    if (src.includes(rel) || src.includes(name) || src.includes(norm(dirname(rel)) + "/" + stem)) { rows.used++; continue; }
    if (isDyn(rel)) { rows.dynamic++; continue; }
    const size = statSync(f).size;
    deadBytes += size;
    rows.dead.push(`${(size / 1024).toFixed(0).padStart(6)} KB  ${rel}`);
  }
}
console.log(`used ${rows.used}  dynamic ${rows.dynamic}  unreferenced ${rows.dead.length} (${(deadBytes / 1048576).toFixed(1)} MB)`);
rows.dead.sort().forEach((l) => console.log(l));
