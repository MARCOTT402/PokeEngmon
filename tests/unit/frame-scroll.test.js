"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const ted = fs.readFileSync(path.join(root, "css/ted.css"), "utf8");
const guard = fs.readFileSync(path.join(root, "js/core/guard.js"), "utf8");

function block(source, selector) {
  const i = source.indexOf(selector);
  assert.ok(i >= 0, "missing " + selector);
  const open = source.indexOf("{", i);
  const close = source.indexOf("}", open);
  return source.slice(open, close + 1);
}

test("the document is not a scrollport while the red frame is on screen", () => {
  const html = block(css, "html:has(#view-home.active) {");
  const body = block(css, "html:has(#view-home.active) body {");
  assert.match(html, /overflow:\s*hidden/);
  assert.match(html, /overscroll-behavior:\s*none/);
  assert.match(body, /position:\s*fixed/);
  assert.match(body, /inset:\s*0/);
  assert.match(body, /overflow:\s*hidden/);
  assert.match(body, /overscroll-behavior:\s*none/);
  assert.match(block(css, "html:has(#view-home.active) #app {"), /overflow:\s*hidden/);
  assert.match(block(css, ".pd-shell {"), /position:\s*fixed/);
  assert.match(block(css, ".pd-shell {"), /overscroll-behavior:\s*none/);
});

test("setup panes still scroll inside the display window", () => {
  const panes = block(ted, "#setup-school,\n#setup-world {");
  assert.match(panes, /overflow-y:\s*auto/);
  assert.match(panes, /overscroll-behavior:\s*contain/);
  assert.match(panes, /touch-action:\s*pan-y/);
  assert.match(block(ted, "#view-quiz-setup.active {"), /overflow:\s*hidden/);
  assert.match(block(css, ".quiz-scroll {"), /overflow-y:\s*auto/);
});

test("frame lock does not cancel single-finger touchmove", () => {
  const lock = css.slice(css.indexOf("html:has(#view-home.active)"), css.indexOf(".ph-shell-parent {"));
  assert.doesNotMatch(lock, /touchmove/);
  assert.doesNotMatch(lock, /touch-action:\s*none/);
  assert.doesNotMatch(ted, /touchmove[\s\S]{0,80}preventDefault/);
  assert.doesNotMatch(ted, /touch-action:\s*none/);
  assert.doesNotMatch(guard, /addEventListener\("touchmove"/);
});
