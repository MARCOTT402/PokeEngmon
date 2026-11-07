"use strict";
/* 揀出要發佈去 GitHub Pages 嘅檔（純函數，CI 同 tests/unit/deploy-manifest.test.js 共用）。 */
const fs = require("fs");
const path = require("path");

const CONFIG = path.join(__dirname, "site-files.json");

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG, "utf8"));
}

/**
 * @param {string[]} files  repo 相對路徑（用 / 分隔），通常係 `git ls-files` 嘅結果
 * @param {{ include: string[], excludeSuffixes: string[] }} config
 * @returns {string[]} 排好序
 */
function selectFiles(files, config) {
  const inc = config.include;
  const exc = (config.excludeSuffixes || []).map((s) => s.toLowerCase());
  return files
    .map((f) => f.split(path.sep).join("/"))
    .filter((f) => inc.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)))
    .filter((f) => !exc.some((s) => f.toLowerCase().endsWith(s)))
    .sort();
}

module.exports = { loadConfig, selectFiles };
