"use strict";
/* 將要發佈嘅檔 copy 去 _site/（冇 build step，原檔照搬）。CI deploy job 用；本地可以用嚟預覽正式網址會有乜。
   用法：node tools/deploy/build-site.cjs [outDir]   （預設 _site） */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { loadConfig, selectFiles } = require("./site-files.cjs");

const ROOT = path.join(__dirname, "../..");
const OUT = path.resolve(ROOT, process.argv[2] || "_site");

const tracked = execSync("git ls-files -z", { cwd: ROOT }).toString("utf8").split("\0").filter(Boolean);
const files = selectFiles(tracked, loadConfig());

fs.rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
for (const f of files) {
  const dst = path.join(OUT, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), dst);
  bytes += fs.statSync(dst).size;
}
console.log(`site: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB → ${path.relative(ROOT, OUT) || OUT}`);
