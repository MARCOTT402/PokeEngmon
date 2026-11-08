"use strict";
/* ES module 過渡期（總計劃 P2.3；Rule 119）：index.html 入面 type="module" 嘅 script
   - 頂層名唔會自動變全域：凡係其他 script 用到嘅名，一定要喺 Object.assign(globalThis, { … }) 公開；
   - module 會 defer（喺全部 classic script 之後先執行）：classic script 唔可以喺載入時（function 外面）用佢哋；
   - 暫時唔准 import／export：tests 同 tools/prototype 仲係用 classic 方式載入呢啲檔。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { ROOT } = require("../helpers/load.js");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const tags = [...html.matchAll(/<script src="(js\/[^"?]+)\?[^"]*"([^>]*)><\/script>/g)].map((m) => ({ file: m[1], module: /type="module"/.test(m[2]) }));
const modules = tags.filter((t) => t.module).map((t) => t.file);
const classic = tags.filter((t) => !t.module).map((t) => t.file);
const parse = (f) => ts.createSourceFile(f, fs.readFileSync(path.join(ROOT, f), "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

function topNames(sf) {
  const out = new Set();
  for (const s of sf.statements) {
    if (ts.isVariableStatement(s)) s.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && out.add(d.name.text));
    else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name) out.add(s.name.text);
  }
  return out;
}
function bridged(sf) {
  const out = new Set();
  for (const s of sf.statements) {
    const e = ts.isExpressionStatement(s) && s.expression;
    if (e && ts.isCallExpression(e) && e.expression.getText() === "Object.assign" && e.arguments[0] && e.arguments[0].getText() === "globalThis") {
      const obj = e.arguments[1];
      if (obj && ts.isObjectLiteralExpression(obj)) obj.properties.forEach((p) => out.add(p.name.getText()));
    }
  }
  return out;
}
function isIIFE(fn) {
  if (!(ts.isFunctionExpression(fn) || ts.isArrowFunction(fn))) return false;
  let p = fn.parent; while (p && ts.isParenthesizedExpression(p)) p = p.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  let callee = p.expression; while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
  return callee === fn;
}
/* 其他檔用到嘅識別字（唔計 property 名、唔計自己檔頂層有同名宣告嘅檔）；inFn = 喺 function 入面 */
function usesOf(names, file) {
  const out = [];
  for (const t of tags) {
    if (t.file === file) continue;
    const sf = parse(t.file); const own = topNames(sf);
    (function walk(n) {
      if (ts.isIdentifier(n) && names.has(n.text) && !own.has(n.text)) {
        const p = n.parent;
        const isProp = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isMethodDeclaration(p) && p.name === n);
        if (!isProp) {
          /* 載入時會執行 = 唔喺任何 function 入面，或者只喺即時執行嘅 IIFE 入面（例如 const BagUI = (() => { const esc = escapeHTML; … })()） */
          let inFn = false;
          for (let q = n.parent; q; q = q.parent) if (ts.isFunctionLike(q) && !isIIFE(q)) { inFn = true; break; }
          out.push({ file: t.file, name: n.text, inFn, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 });
        }
      }
      ts.forEachChild(n, walk);
    })(sf);
  }
  return out;
}

test("index.html has at least the first batch of ES modules", () => {
  for (const f of ["js/core/dom.js", "js/core/html.js", "js/battle/rng.js", "js/mega-data.js", "js/dex-sort.js", "js/store.js"]) assert.ok(modules.includes(f), f);
  assert.equal(classic[0], "js/core/guard.js", "Guard must stay the first classic script (Rule 94)");
});

for (const f of modules) {
  test(`${f}: every name other scripts use is bridged to globalThis`, () => {
    const sf = parse(f);
    const names = topNames(sf), br = bridged(sf);
    const used = new Set(usesOf(names, f).map((u) => u.name));
    assert.deepEqual([...used].filter((n) => !br.has(n)), [], "used elsewhere but not in Object.assign(globalThis, …)");
    assert.deepEqual([...br].filter((n) => !names.has(n)), [], "bridged name not declared at top level");
  });

  test(`${f}: no classic script touches it at load time (modules run after all classic scripts)`, () => {
    const sf = parse(f);
    const early = usesOf(topNames(sf), f).filter((u) => !u.inFn && classic.includes(u.file));
    assert.deepEqual(early.map((u) => `${u.file}:${u.line} ${u.name}`), []);
  });

  test(`${f}: no import/export yet (tests and prototypes still load it as a classic script)`, () => {
    const sf = parse(f);
    assert.deepEqual(sf.statements.filter((s) => ts.isImportDeclaration(s) || ts.isExportDeclaration(s) || ts.isExportAssignment(s) ||
      (s.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)).map((s) => s.getText().slice(0, 40)), []);
  });
}
