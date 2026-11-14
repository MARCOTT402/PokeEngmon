"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const { TedWorld } = loadScripts(["js/ted.js"], { expose: ["TedWorld"] });
const { SM2 } = loadScripts(["js/sm2.js"], { expose: ["SM2"] });

test("mapRow keeps corpus text, blanks talk title, and only keeps a real audio URL", () => {
  const q = TedWorld.mapRow({
    id: "abc",
    cefr: "A1",
    level: 4,
    zh: "<b>每天喝水</b>",
    sentence: "Drink ___ water.",
    answer: "cold",
    accept: ["chilled", "  "],
    talk_title: "",
    note: "cold water = 冷水",
    has_audio: true,
    audio_url: "https://gcfoeaxxeerqixaistaf.supabase.co/storage/v1/object/public/ted-audio/abc.mp3"
  });
  assert.equal(q.id, "ted:abc");
  assert.equal(q.source, "ted");
  assert.equal(q.zh, "<b>每天喝水</b>");
  assert.equal(q.talkTitle, "");
  assert.equal(q.note, "cold water = 冷水");
  assert.deepEqual(q.accept, ["chilled"]);
  assert.equal(q.audioUrl, "https://gcfoeaxxeerqixaistaf.supabase.co/storage/v1/object/public/ted-audio/abc.mp3");
  assert.equal(TedWorld.fullSentence(q), "Drink cold water.");
});

test("missing audio and empty talk title are not invented", () => {
  const q = TedWorld.mapRow({
    id: 7,
    level: 9,
    sentence: "Say ___ please.",
    answer: "hi",
    has_audio: false,
    audio_url: "https://evil.example/x.mp3",
    talk_title: null
  });
  assert.equal(q.hasAudio, false);
  assert.equal(q.audioUrl, "");
  assert.equal(q.talkTitle, "");
  assert.equal(q.cefr, "A2");
  assert.equal(q.level, 9);
});

test("sessionQuery stays inside one level, one band, or a small adaptive window", () => {
  const plain = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(TedWorld.sessionQuery({ level: 4, ability: 4, mode: "level", size: 10 })), {
    min_lv: 4, max_lv: 4, lim: 10, prefer_audio: true
  });
  assert.deepEqual(plain(TedWorld.sessionQuery({ level: 8, ability: 3, mode: "band", size: 50 })), {
    min_lv: 6, max_lv: 10, lim: 50, prefer_audio: true
  });
  assert.deepEqual(plain(TedWorld.sessionQuery({ level: 1, ability: 1, mode: "adaptive", size: 100 })), {
    min_lv: 1, max_lv: 2, lim: 100, prefer_audio: true
  });
  assert.deepEqual(plain(TedWorld.sessionQuery({ level: 30, ability: 30, mode: "adaptive", size: 20 })), {
    min_lv: 29, max_lv: 30, lim: 20, prefer_audio: true
  });
});

test("size selection clamps to 10, 20, ... 100", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(TedWorld.SIZES)), [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(TedWorld.clampSize(10), 10);
  assert.equal(TedWorld.clampSize(50), 50);
  assert.equal(TedWorld.clampSize(100), 100);
  assert.equal(TedWorld.clampSize(0), 10);
  assert.equal(TedWorld.clampSize(7), 10);
  assert.equal(TedWorld.clampSize(15), 20);
  assert.equal(TedWorld.clampSize(101), 100);
  assert.equal(TedWorld.clampSize("nope"), 10);
  assert.equal(TedWorld.clampSize(undefined), 10);
});

test("fetchSession reports HTTP errors and does not return rows", async () => {
  const result = await TedWorld.fetchSession({ min_lv: 1, max_lv: 5, lim: 5, prefer_audio: true }, async () => ({
    ok: false,
    status: 401,
    text: async () => "{\"message\":\"permission denied for function get_ted_session\"}"
  }));
  assert.equal(result.ok, false);
  assert.equal(result.error, "HTTP 401");
  assert.match(result.detail, /permission denied/);
  assert.equal(result.questions.length, 0);
});

test("fetchSession reports offline without throwing", async () => {
  const result = await TedWorld.fetchSession({ min_lv: 1, max_lv: 1, lim: 10 }, async () => {
    const err = new Error("Network offline: rpc/get_ted_session");
    err.kind = "offline";
    throw err;
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "offline");
  assert.match(result.detail, /offline/);
});

function tedRow(i) {
  return { id: i, level: 2, cefr: "A1", sentence: "A ___ b.", answer: "x" + i, accept: [], zh: "甲", has_audio: false };
}

test("fetchSession sends 10, 50 and 100 and keeps that session length", async () => {
  for (const lim of [10, 50, 100]) {
    let sent = null;
    const result = await TedWorld.fetchSession({ min_lv: 1, max_lv: 5, lim }, async (body) => {
      sent = body;
      return { ok: true, json: async () => Array.from({ length: lim }, (_, i) => tedRow(i + 1)) };
    });
    assert.equal(sent.lim, lim);
    assert.equal(result.ok, true);
    assert.equal(result.empty, false);
    assert.equal(result.questions.length, lim);
    assert.equal(result.expected, lim);
    assert.equal(result.got, lim);
  }
});

test("a short RPC payload does not become a shorter session", async () => {
  let sent = null;
  const result = await TedWorld.fetchSession({ min_lv: 1, max_lv: 5, lim: 500 }, async (body) => {
    sent = body;
    return {
      ok: true,
      json: async () => [
        { id: 1, level: 2, cefr: "A1", sentence: "A ___ b.", answer: "x", accept: ["y"], zh: "甲", has_audio: false },
        { id: 2, level: 2, sentence: "no blank here", answer: "x" }
      ]
    };
  });
  assert.equal(sent.lim, 100);
  assert.equal(sent.prefer_audio, true);
  assert.equal(result.ok, false);
  assert.equal(result.error, "short");
  assert.equal(result.expected, 100);
  assert.equal(result.got, 1);
  assert.equal(result.questions.length, 0);
});

test("empty RPC payload is an empty session, not a hang", async () => {
  const result = await TedWorld.fetchSession({ min_lv: 3, max_lv: 3, lim: 10 }, async () => ({
    ok: true,
    json: async () => []
  }));
  assert.equal(result.ok, true);
  assert.equal(result.empty, true);
});

test("remember/recall keeps the mapped question for review", () => {
  const q = TedWorld.mapRow({ id: "z", level: 1, sentence: "A ___ b.", answer: "c", zh: "註解" });
  TedWorld.remember([q]);
  assert.equal(TedWorld.recall("ted:z").zh, "註解");
  assert.equal(TedWorld.recall("missing"), null);
});

test("TED cards use a stable id and other questions keep the old card id", () => {
  const ted = SM2.getOrCreateCard({
    source: "ted", id: "ted:abc", topic: "TED", sentence: "Drink ___ water.", answer: "cold"
  });
  const grammar = SM2.getOrCreateCard({ topic: "Articles", sentence: "He ___ here.", answer: "is" });
  assert.equal(ted.card_id, "ted\u0001ted:abc");
  assert.equal(grammar.card_id, "Articles\u0001He ___ here.\u0001is");
});
