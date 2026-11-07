"use strict";
/* js/core/dom.js：全 App 唯一嘅 HTML escape 同震動 helper（Review Focus #3：唔可以雙重 escape、唔可以漏 escape） */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const load = (globals) => loadScripts(["js/core/dom.js"], { expose: ["escapeHTML", "haptic"], globals });

test("escapeHTML escapes all five HTML-significant characters", () => {
  const { escapeHTML } = load();
  assert.equal(escapeHTML(`Tom & "Jerry" <b>it's</b>`), "Tom &amp; &quot;Jerry&quot; &lt;b&gt;it&#39;s&lt;/b&gt;");
});

test("escapeHTML: null / undefined → empty string (never the text 'null')", () => {
  const { escapeHTML } = load();
  assert.equal(escapeHTML(null), "");
  assert.equal(escapeHTML(undefined), "");
});

test("escapeHTML stringifies numbers and leaves safe text untouched", () => {
  const { escapeHTML } = load();
  assert.equal(escapeHTML(42), "42");
  assert.equal(escapeHTML("Pikachu Lv.5"), "Pikachu Lv.5");
});

test("escapeHTML is not idempotent by design: callers must escape exactly once", () => {
  const { escapeHTML } = load();
  assert.equal(escapeHTML(escapeHTML("&")), "&amp;amp;");
});

test("haptic forwards the pattern to navigator.vibrate", () => {
  const calls = [];
  const { haptic } = load({ navigator: { vibrate: (p) => { calls.push(p); return true; } } });
  haptic([10, 30, 10]);
  haptic(12);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[10, 30, 10], 12]);
});

test("haptic never throws when vibrate is missing or throws", () => {
  assert.doesNotThrow(() => load({ navigator: {} }).haptic(5));
  assert.doesNotThrow(() => load({ navigator: { vibrate: () => { throw new Error("blocked"); } } }).haptic(5));
});
