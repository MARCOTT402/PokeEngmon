"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/ted.css"), "utf8");
const guard = fs.readFileSync(path.join(root, "js/core/guard.js"), "utf8");

test("viewport does not pretend user-scalable=no blocks iOS zoom", () => {
  const meta = html.match(/<meta name="viewport" content="([^"]+)"/);
  assert.ok(meta, "viewport meta");
  assert.doesNotMatch(meta[1], /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(meta[1], /maximum-scale\s*=\s*1(?:\.0)?\b/);
});

test("pinch and double-tap zoom are omitted while vertical pan stays", () => {
  assert.match(css, /html\s*\{[^}]*touch-action:\s*pan-x pan-y\s*;/);
  assert.match(css, /#setup-school,\s*#setup-world\s*\{[^}]*touch-action:\s*pan-y\s*;/);
  assert.doesNotMatch(css, /pinch-zoom/);
  assert.doesNotMatch(css, /touch-action:\s*manipulation/);
  assert.doesNotMatch(css, /touch-action:\s*none/);
  assert.doesNotMatch(css, /touchmove[\s\S]{0,120}preventDefault/);
});

test("Safari multi-touch gesture zoom is cancelled without listening to touchmove", () => {
  assert.match(guard, /addEventListener\("gesturestart"/);
  assert.match(guard, /addEventListener\("gesturechange"/);
  assert.doesNotMatch(guard, /addEventListener\("touchmove"/);
});

test("selection panes are the vertical scrollports", () => {
  assert.match(css, /#setup-school,\s*#setup-world\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /#view-quiz-setup\.active\s*\{[^}]*overflow:\s*hidden/);
});
