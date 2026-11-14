"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/ted.css"), "utf8");

test("viewport keeps pinch zoom and does not lock the scale", () => {
  const meta = html.match(/<meta name="viewport" content="([^"]+)"/);
  assert.ok(meta, "viewport meta");
  assert.doesNotMatch(meta[1], /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(meta[1], /maximum-scale\s*=\s*1(?:\.0)?\b/);
});

test("double-tap zoom is opted out without disabling pinch or vertical pan", () => {
  assert.match(css, /html\s*\{[^}]*touch-action:\s*manipulation/);
  assert.match(css, /#setup-school,\s*#setup-world\s*\{[^}]*touch-action:\s*pan-y pinch-zoom/);
  assert.doesNotMatch(css, /touch-action:\s*none/);
  assert.doesNotMatch(css, /touchmove[\s\S]{0,80}preventDefault/);
});

test("selection panes are the vertical scrollports", () => {
  assert.match(css, /#setup-school,\s*#setup-world\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /#view-quiz-setup\.active\s*\{[^}]*overflow:\s*hidden/);
});
