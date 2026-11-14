"use strict";
/* 唯讀：匿名 RPC get_ted_session 與一則公開 MP3。不下載整表、不寫入資料。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const config = fs.readFileSync(path.join(__dirname, "../../supabase/supabase-config.js"), "utf8");
const url = (config.match(/url:\s*"([^"]+)"/) || [])[1];
const anonKey = (config.match(/anonKey:\s*"([^"]+)"/) || [])[1];

test("anonymous get_ted_session and one public MP3", async (t) => {
  assert.ok(url && anonKey, "supabase config missing");
  let res;
  try {
    res = await fetch(url + "/rest/v1/rpc/get_ted_session", {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: "Bearer " + anonKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ min_lv: 1, max_lv: 5, lim: 5, prefer_audio: true }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    t.skip("network unavailable: " + (e && e.message));
    return;
  }
  const text = await res.text();
  assert.equal(res.status, 200, text.slice(0, 300));
  const rows = JSON.parse(text);
  assert.ok(Array.isArray(rows), "RPC did not return an array");
  assert.ok(rows.length > 0 && rows.length <= 5, "row count " + rows.length);
  rows.forEach((row) => {
    assert.ok(row.level >= 1 && row.level <= 5, "level " + row.level);
    assert.equal(row.cefr, "A1");
    assert.ok(String(row.sentence || "").includes("___"));
    assert.ok(String(row.answer || "").trim());
    assert.equal(typeof row.zh, "string");
    assert.ok(Array.isArray(row.accept));
  });
  const audio = rows.find((row) => row.has_audio && row.audio_url);
  assert.ok(audio, "prefer_audio sample had no public mp3");
  assert.match(audio.audio_url, /\/storage\/v1\/object\/public\/ted-audio\/.+\.mp3$/);
  const audioRes = await fetch(audio.audio_url, { signal: AbortSignal.timeout(15000) });
  assert.equal(audioRes.status, 200);
  assert.match(audioRes.headers.get("content-type") || "", /audio\/mpeg/i);
  if (audioRes.body && audioRes.body.cancel) await audioRes.body.cancel();
});

test("get_ted_session returns exactly 10, 50 and 100 rows", async (t) => {
  assert.ok(url && anonKey, "supabase config missing");
  for (const lim of [10, 50, 100]) {
    let res;
    try {
      res = await fetch(url + "/rest/v1/rpc/get_ted_session", {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: "Bearer " + anonKey,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ min_lv: 1, max_lv: 1, lim, prefer_audio: true }),
        signal: AbortSignal.timeout(25000)
      });
    } catch (e) {
      t.skip("network unavailable: " + (e && e.message));
      return;
    }
    const text = await res.text();
    assert.equal(res.status, 200, text.slice(0, 200));
    const rows = JSON.parse(text);
    assert.equal(rows.length, lim, "lim " + lim + " returned " + rows.length);
    rows.forEach((row) => {
      assert.equal(row.level, 1);
      assert.ok(String(row.sentence || "").includes("___"));
    });
  }
});
