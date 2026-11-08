// 由真 index.html 生成孵化器 prototype 頁：tools/prototype/incubator-app.html
// 用法：node tools/prototype/incubator/build.mjs   （index.html 有改就再跑一次）
// 做法：<base href="../../"> 令所有真 app 資源照舊載入；<head> 最前插 early.js（localStorage namespace、停 SW）；
//       </body> 前插 incubator.css／incubator.js（植入 Battle 捲頁入口、扭蛋 display window 入口、孵化器頁、結算孵蛋）。
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
  '\n  <base href="../../">\n  <script src="tools/prototype/incubator/early.js"></script>' +
  html.slice(headEnd);

html = html.replace(/<title>[^<]*<\/title>/i, "<title>Incubator — Prototype (real app)</title>");

const bodyEnd = html.lastIndexOf("</body>");
if (bodyEnd < 0) throw new Error("no </body>");
const v = Date.now();   /* cache-busting：改完 css／js 再 build 一次就一定攞到新版 */
html = html.slice(0, bodyEnd) +
  '  <!-- ===== Incubator prototype（唔部署） ===== -->\n' +
  `  <link rel="stylesheet" href="tools/prototype/incubator/incubator.css?v=${v}">\n` +
  `  <script src="tools/prototype/incubator/incubator.js?v=${v}"></script>\n` +
  html.slice(bodyEnd);

writeFileSync(join(root, "tools", "prototype", "incubator-app.html"), html);
console.log("wrote tools/prototype/incubator-app.html");
