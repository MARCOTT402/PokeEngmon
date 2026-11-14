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
  assert.deepEqual(plain(TedWorld.sessionQuery({ level: 4, ability: 4, mode: "level" })), {
    min_lv: 4, max_lv: 4, lim: 10, prefer_audio: true
  });
  assert.deepEqual(plain(TedWorld.sessionQuery({ level: 8, ability: 3, mode: "band" })), {
    min_lv: 6, max_lv: 10, lim: 10, prefer_audio: true
  });
  assert.deepEqual(plain(TedWorld.sessionQuery({ level: 1, ability: 1, mode: "adaptive" })), {
    min_lv: 1, max_lv: 2, lim: 10, prefer_audio: true
  });
  assert.deepEqual(plain(TedWorld.sessionQuery({ level: 30, ability: 30, mode: "adaptive" })), {
    min_lv: 29, max_lv: 30, lim: 10, prefer_audio: true
  });
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

test("fetchSession maps usable rows, drops rows without a cloze, and caps lim", async () => {
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
  assert.equal(sent.lim, 30);
  assert.equal(sent.prefer_audio, true);
  assert.equal(sent.min_lv, 1);
  assert.equal(result.ok, true);
  assert.equal(result.empty, false);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].id, "ted:1");
  assert.equal(result.questions[0].zh, "甲");
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
