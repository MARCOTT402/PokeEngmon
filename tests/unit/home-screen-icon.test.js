"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function pngSize(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test("installed home screen name is PokéEng without renaming the site title or favicon", () => {
  const html = read("index.html");
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.name, "PokéEng");
  assert.equal(manifest.short_name, "PokéEng");
  assert.match(html, /apple-mobile-web-app-title" content="PokéEng"/);
  assert.match(html, /<title>The PokéEngmon Trainer \| PokeEngmon<\/title>/);
  assert.match(html, /rel="icon" href="icons\/icon-192\.png"/);
  assert.match(html, /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/);
  assert.equal(html.includes("POKÉDEX OF ANOMALIES"), true);
});

test("home-screen icons are separate Poké Ball rasters at the declared sizes", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const srcs = manifest.icons.map((i) => i.src);
  assert.deepEqual(srcs, [
    "icons/home-icon-192.png",
    "icons/home-icon-512.png",
    "icons/home-icon-192.png",
    "icons/home-icon-512.png"
  ]);
  assert.equal(pngSize("icons/home-icon-192.png").w, 192);
  assert.equal(pngSize("icons/home-icon-512.png").w, 512);
  assert.equal(pngSize("icons/apple-touch-icon.png").w, 180);
  assert.equal(pngSize("icons/home-icon-192.png").h, 192);
  assert.equal(pngSize("icons/home-icon-512.png").h, 512);
  assert.equal(pngSize("icons/apple-touch-icon.png").h, 180);
  const fav = fs.readFileSync(path.join(root, "icons/icon-192.png"));
  const home = fs.readFileSync(path.join(root, "icons/home-icon-192.png"));
  assert.notEqual(fav.equals(home), true);
});
