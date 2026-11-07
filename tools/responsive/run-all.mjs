/* 順序跑晒 tools/responsive/test-*.mjs（headless Chrome + CDP）。
   前置：本地 static server http://localhost:8080（.claude/launch.json 嘅 static；測試會開 _seedtest.html）。
   判斷：exit code ≠ 0，或者輸出有以 FAIL 開頭嘅行 → 該檔失敗（部分舊測試只印 FAIL 唔改 exit code）。
   已知例外（spec §13 記錄嘅 known items）唔喺度豁免——失敗照報，由人判斷。
   用法：npm run test:e2e   或   node tools/responsive/run-all.mjs [--only sheets,keys] */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:8080/";
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(",") : null;

try {
  const res = await fetch(BASE + "_seedtest.html", { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
} catch (e) {
  console.error(`✖ ${BASE} 冇回應（${e.message}）。先開本地 static server（Claude：preview_start static）再跑。`);
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => /^test-.*\.mjs$/.test(f))
  .filter((f) => !only || only.some((o) => f === `test-${o}.mjs`)).sort();

/* 部分測試（*-fit、rotate、touch-targets）第一個參數係截圖輸出目錄 → 一律傳一個暫存目錄 */
const OUT = join(tmpdir(), `pe-e2e-${Date.now()}`);
const run = (f) => new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [join(DIR, f), join(OUT, f.replace(/\.mjs$/, ""))], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { out += d; });
  p.on("close", (code) => {
    const fails = out.split(/\r?\n/).filter((l) => /^\s*FAIL\b/.test(l));
    resolve({ f, code, fails, ms: Date.now() - t0, out });
  });
});

const results = [];
for (const f of files) {
  process.stdout.write(`… ${f}`);
  const r = await run(f);
  results.push(r);
  const ok = r.code === 0 && r.fails.length === 0;
  process.stdout.write(`\r${ok ? "✔" : "✖"} ${f}  (${(r.ms / 1000).toFixed(1)}s)\n`);
  if (!ok) {
    if (r.code !== 0 && !r.fails.length) console.log(r.out.split(/\r?\n/).slice(-15).join("\n"));
    r.fails.forEach((l) => console.log("    " + l.trim()));
  }
}
const bad = results.filter((r) => r.code !== 0 || r.fails.length);
console.log(`\n${results.length - bad.length}/${results.length} files passed  (screenshots: ${OUT})`);
process.exit(bad.length ? 1 : 0);
