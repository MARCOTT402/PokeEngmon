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

/* 每次 deploy 嘅獨一無二版本標記（Rule 120）：sw.js 快取名＋index.html 全部 ?v= 加 commit id */
const { stampBuild } = require("./stamp.cjs");
const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const id = (process.env.GITHUB_SHA || execSync("git rev-parse HEAD", { cwd: ROOT }).toString()).trim().slice(0, 7);
const swPath = path.join(OUT, "sw.js"), indexPath = path.join(OUT, "index.html");
const stamped = stampBuild({ sw: fs.readFileSync(swPath, "utf8"), index: fs.readFileSync(indexPath, "utf8") }, version, id);
fs.writeFileSync(swPath, stamped.sw);
fs.writeFileSync(indexPath, stamped.index);
console.log(`stamped build ${stamped.tag}: sw.js cache name + ${stamped.count} ?v= in index.html`);
