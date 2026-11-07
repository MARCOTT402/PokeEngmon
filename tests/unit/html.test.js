"use strict";
/* js/core/html.js：html`` tagged template（自動 escape）、Html.raw()、Html.render()（Review Focus #3：唔可以雙重 escape、唔可以漏 escape） */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const load = () => loadScripts(["js/core/dom.js", "js/core/html.js"], { expose: ["html", "Html"] });
const s = (v) => String(v);

test("interpolated strings are escaped (XSS)", () => {
  const { html } = load();
  const name = `<img src=x onerror="alert(1)">`;
  assert.equal(s(html`<b>${name}</b>`), "<b>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</b>");
});

test("attribute values are escaped, including single quotes", () => {
  const { html } = load();
  assert.equal(s(html`<input value="${`a"b'c&`}">`), `<input value="a&quot;b&#39;c&amp;">`);
});

test("numbers are kept; null, undefined and false render as nothing; true renders as text", () => {
  const { html } = load();
  assert.equal(s(html`${0}|${12.5}|${null}|${undefined}|${false}|${true}`), "0|12.5||||true");
});

test("nested html`` results are not escaped twice", () => {
  const { html } = load();
  const inner = html`<i>${"a & b"}</i>`;
  assert.equal(s(html`<p>${inner}</p>`), "<p><i>a &amp; b</i></p>");
});

test("arrays are joined with no separator and each item is escaped or kept if safe", () => {
  const { html } = load();
  const items = ["<x>", "y"].map((t) => html`<li>${t}</li>`);
  assert.equal(s(html`<ul>${items}</ul>`), "<ul><li>&lt;x&gt;</li><li>y</li></ul>");
  assert.equal(s(html`${["<a>", 1, null, html`<b></b>`]}`), "&lt;a&gt;1<b></b>");
});

test("Html.raw marks trusted markup that is inserted as-is", () => {
  const { html, Html } = load();
  assert.equal(s(html`<div>${Html.raw("<br>")}</div>`), "<div><br></div>");
  assert.equal(Html.isSafe(Html.raw("x")), true);
  assert.equal(Html.isSafe("x"), false);
});

test("Html.render sets innerHTML from a template, and escapes a plain string", () => {
  const { html, Html } = load();
  const el = { innerHTML: "" };
  assert.equal(Html.render(el, html`<b>${"<i>"}</b>`), el);
  assert.equal(el.innerHTML, "<b>&lt;i&gt;</b>");
  Html.render(el, "<script>x</script>");
  assert.equal(el.innerHTML, "&lt;script&gt;x&lt;/script&gt;");
});

test("Html.render tolerates a missing element", () => {
  const { html, Html } = load();
  assert.equal(Html.render(null, html`<b></b>`), null);
});
