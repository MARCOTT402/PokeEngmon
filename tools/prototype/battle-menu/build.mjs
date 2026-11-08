// 由真 index.html 生成Battle menu trainer card prototype 頁：tools/prototype/battle-menu-app.html
// 用法：node tools/prototype/battle-menu/build.mjs   （index.html 有改就再跑一次）
// 做法：<base href="../../"> 令所有真 app 資源照舊載入；<head> 最前插 early.js（localStorage namespace、停 SW）；
//       </body> 前插 proto.css／proto.js（battle menu trainer card、略過揀隊頁）。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
let html = readFileSync(join(root, "index.html"), "utf8").replace(/^﻿+/, "");

const headIdx = html.search(/<head[^>]*>/i);
if (headIdx < 0) throw new Error("no <head>");
const headEnd = html.indexOf(">", headIdx) + 1;
html = html.slice(0, headEnd) +
  '\n  <base href="../../">\n  <script src="tools/prototype/battle-menu/early.js"></script>' +
  html.slice(headEnd);

html = html.replace(/<title>[^<]*<\/title>/i, "<title>Battle Menu Trainer Card — Prototype (real app)</title>");

const bodyEnd = html.lastIndexOf("</body>");
if (bodyEnd < 0) throw new Error("no </body>");
const v = Date.now();   /* cache-busting：改完 css／js 再 build 一次就一定攞到新版 */
html = html.slice(0, bodyEnd) +
  '  <!-- ===== Battle menu prototype（唔部署） ===== -->\n' +
  `  <link rel="stylesheet" href="tools/prototype/battle-menu/proto.css?v=${v}">\n` +
  `  <script src="tools/prototype/battle-menu/proto.js?v=${v}"></script>\n` +
  html.slice(bodyEnd);

writeFileSync(join(root, "tools", "prototype", "battle-menu-app.html"), html);
console.log("wrote tools/prototype/battle-menu-app.html");
