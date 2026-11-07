"use strict";
/* 部署清單（tools/deploy/site-files.json）：GitHub Pages 只發佈 App 需要嘅檔（總計劃 P1.6）。
   - 漏檔 → 正式網址白屏；多咗 → 內部文件公開。兩邊都要測（Review Focus #5）。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { loadConfig, selectFiles } = require("../../tools/deploy/site-files.cjs");

const ROOT = path.join(__dirname, "../..");
/* 本地開發：新檔未 git add 都計（--others --exclude-standard），唔好誤報；部署（build-site.cjs）只用 tracked，
   所以真係漏咗 commit 嘅 runtime 檔，CI 入面個檔根本唔存在，呢個測試照樣會紅、唔會部署。 */
const tracked = execSync("git ls-files -z --cached --others --exclude-standard", { cwd: ROOT }).toString("utf8").split("\0").filter(Boolean);
const site = new Set(selectFiles(tracked, loadConfig()));
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("everything index.html, sw.js and manifest.json reference is deployed", () => {
  const html = read("index.html");
  const refs = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
  const sw = [...read("sw.js").matchAll(/"\.\/([^"$`]+)"/g)].map((m) => m[1]);
  const man = JSON.parse(read("manifest.json"));
  const need = [...refs, ...sw, man.start_url, ...(man.icons || []).map((i) => i.src)]
    .map((u) => String(u).split("?")[0].replace(/^\.\//, ""))
    .filter((u) => u && !/^(https?:|data:|mailto:|javascript:|\/\/)/.test(u));
  assert.deepEqual([...new Set(need)].filter((u) => !site.has(u)), []);
});

test("runtime data the app fetches is deployed (question banks, Pokédex data, image index)", () => {
  for (const f of ["Q_folder/grammar/grammar.csv", "Q_folder/vocab/vocab.csv", "Q_folder/grammar/grammar_images/index.json", "data/pokemon-151.json", "data/moves.json", "data/type-chart.json", "data/abilities.json"]) {
    assert.ok(site.has(f), f);
  }
  assert.ok([...site].some((f) => f.startsWith("Q_folder/vocab/vocab_audio/")), "vocab audio");
  assert.ok([...site].some((f) => f.startsWith("assets/battle/pkmn/")), "battle sprites");
});

test("internal files are never deployed", () => {
  const leaked = [...site].filter((f) =>
    /^(tools|tests|prototype|\.trae|\.cursor|\.github|supabase\/migrations|types|node_modules)\//.test(f) ||
    /^_seed.*\.html$/.test(f) ||
    /\.(md|py|sql|txt)$/i.test(f) ||
    /(^|\/)\.gitkeep$/.test(f) ||
    ["CLAUDE.md", "package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs"].includes(f));
  assert.deepEqual(leaked, []);
});

test("the site is a subset of repo files (tracked or not ignored) and is not empty", () => {
  assert.ok(site.size > 1000);
  for (const f of site) assert.ok(tracked.includes(f), f);
});
