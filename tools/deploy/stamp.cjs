"use strict";
/* 每次 deploy 嘅獨一無二版本標記（Rule 120）。
   問題：refactor／docs／chore 唔會出新版本，但 deploy job 每次 push 都發佈 → 檔案變咗、`?v=` 同 SW 快取名唔變。
   SW 對 `?v=<SW 版本>` 嘅檔係 cache-first；sw.js 冇變就唔會裝新 SW → 回訪用戶用新 index.html 配舊 JS（例如舊 dom.js 冇 bridge → escapeHTML 未定義）。
   做法：_site 入面將 sw.js 快取名同 index.html 全部 `?v=` 由 `<version>` 改做 `<version>-<id>`（id = commit SHA 頭 7 位）。
   - sw.js 每次 deploy 都唔同 → 一定裝新 SW、activate 時刪舊快取；
   - 過渡期舊 SW 見到新 `?v=` 對唔上自己版本 → 行 network-first，唔會攞到舊檔。 */

function stampBuild({ sw, index }, version, id) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`bad version "${version}"`);
  if (!/^[0-9a-z]{4,40}$/i.test(id)) throw new Error(`bad build id "${id}"`);
  const tag = `${version}-${id}`;
  const cacheLine = `const CACHE_NAME = "pokeengmon-${version}";`;
  const swCount = sw.split(cacheLine).length - 1;
  if (swCount !== 1) throw new Error(`sw.js: expected 1 × ${cacheLine}, found ${swCount}`);
  const q = `?v=${version}`;
  /* 只換完整嘅版本號（後面唔可以再接數字或者 .／- ，避免 1.71.2 撞到 1.71.20） */
  const re = new RegExp(q.replace(/[.?]/g, "\\$&") + "(?![\\d.-])", "g");
  const n = (index.match(re) || []).length;
  if (!n) throw new Error(`index.html: no ${q} found`);
  return {
    sw: sw.replace(cacheLine, `const CACHE_NAME = "pokeengmon-${tag}";`),
    index: index.replace(re, `?v=${tag}`),
    tag,
    count: n,
  };
}

module.exports = { stampBuild };
