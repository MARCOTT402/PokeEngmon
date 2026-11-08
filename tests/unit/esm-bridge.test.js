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
/* Object.defineProperties(globalThis, { NAME: { get: () => NAME, … } })：會被重新賦值嘅 let 用呢個 */
function getterBridged(sf) {
  const out = new Set();
  for (const s of sf.statements) {
    const e = ts.isExpressionStatement(s) && s.expression;
    if (e && ts.isCallExpression(e) && e.expression.getText() === "Object.defineProperties" && e.arguments[0] && e.arguments[0].getText() === "globalThis") {
      const obj = e.arguments[1];
      if (obj && ts.isObjectLiteralExpression(obj)) obj.properties.forEach((p) => {
        const d = ts.isPropertyAssignment(p) && p.initializer;
        const hasGet = d && ts.isObjectLiteralExpression(d) && d.properties.some((q) => q.name && q.name.getText() === "get");
        if (hasGet) out.add(p.name.getText());
      });
    }
  }
  return out;
}
/* 自己檔入面喺宣告之後再賦值嘅 let／var */
function reassignedLets(sf) {
  const lets = new Set();
  for (const s of sf.statements) if (ts.isVariableStatement(s) && !(s.declarationList.flags & ts.NodeFlags.Const)) s.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && lets.add(d.name.text));
  const out = new Set();
  (function walk(n) {
    if (ts.isBinaryExpression(n) && ts.isIdentifier(n.left) && lets.has(n.left.text) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) out.add(n.left.text);
    ts.forEachChild(n, walk);
  })(sf);
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

test("every js/ script except core/guard.js loads as an ES module (P2.3 done)", () => {
  assert.deepEqual(classic, ["js/core/guard.js"], "new or leftover classic scripts — load them with type=\"module\" (Rule 119)");
  assert.ok(modules.length > 70);
  assert.equal(tags[0].file, "js/core/guard.js", "Guard must stay the first script (Rule 94)");
});

for (const f of modules) {
  test(`${f}: every name other scripts use is bridged to globalThis`, () => {
    const sf = parse(f);
    const names = topNames(sf), br = bridged(sf), gb = getterBridged(sf), re = reassignedLets(sf);
    const used = new Set(usesOf(names, f).map((u) => u.name));
    assert.deepEqual([...used].filter((n) => !br.has(n) && !gb.has(n)), [], "used elsewhere but not bridged to globalThis");
    assert.deepEqual([...br, ...gb].filter((n) => !names.has(n)), [], "bridged name not declared at top level");
    /* Object.assign 只係抄一次值：之後 MOVES = … 呢類重新賦值，其他檔睇唔到 → 一定要用 getter */
    assert.deepEqual([...used].filter((n) => re.has(n) && !gb.has(n)), [], "reassigned let used elsewhere must be a getter (Object.defineProperties)");
  });

  test(`${f}: no classic script touches it at load time (modules run after all classic scripts)`, () => {
    const sf = parse(f);
    const early = usesOf(topNames(sf), f).filter((u) => !u.inFn && classic.includes(u.file));
    assert.deepEqual(early.map((u) => `${u.file}:${u.line} ${u.name}`), []);
  });

  /* module 之間按 index.html 次序執行：排喺前面嘅 module 載入時唔可以用後面 module 嘅名
     （例如 care.js 載入時 `typeof BattleState !== "undefined"` 會靜靜雞變 false，樹果就冇註冊） */
  test(`${f}: no earlier module touches it at load time`, () => {
    const sf = parse(f);
    const me = tags.findIndex((t) => t.file === f);
    const early = usesOf(topNames(sf), f).filter((u) => !u.inFn && modules.includes(u.file) && tags.findIndex((t) => t.file === u.file) < me);
    assert.deepEqual(early.map((u) => `${u.file}:${u.line} ${u.name}`), []);
  });

  /* module 入面 document.currentScript 係 null：用嚟計相對路徑（例如 audio.js 搵 capture.js）會靜靜雞錯 */
  test(`${f}: does not rely on document.currentScript (null in modules)`, () => {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(!/document\.currentScript/.test(src), "use document.querySelector('script[src*=\"…\"]') instead");
  });

  test(`${f}: no import/export yet (tests and prototypes still load it as a classic script)`, () => {
    const sf = parse(f);
    assert.deepEqual(sf.statements.filter((s) => ts.isImportDeclaration(s) || ts.isExportDeclaration(s) || ts.isExportAssignment(s) ||
      (s.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)).map((s) => s.getText().slice(0, 40)), []);
  });
}
