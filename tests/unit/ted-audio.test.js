"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

function boot() {
  const speaks = [];
  const started = [];
  class FakeAC {
    constructor() {
      this.state = "running";
      this.destination = {};
      this.sampleRate = 8000;
    }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
    createBufferSource() {
      const src = {
        connect() {},
        disconnect() {},
        start() { started.push(src); },
        stop() { src.stopped = true; }
      };
      return src;
    }
    decodeAudioData(ab) { return Promise.resolve({ bytes: ab.byteLength }); }
    resume() { this.state = "running"; return Promise.resolve(); }
  }
  function Utterance(text) { this.text = text; this.lang = ""; this.rate = 1; this.volume = 1; }
  const synth = {
    cancelled: 0,
    cancel() { this.cancelled += 1; },
    speak(u) { speaks.push(u); },
    getVoices() { return [{ lang: "en-US", name: "Test" }]; }
  };
  const loaded = loadScripts(["js/audio.js"], {
    globals: { AudioContext: FakeAC, speechSynthesis: synth, SpeechSynthesisUtterance: Utterance }
  });
  return { audio: loaded.ctx.CaptureScene.audio, speaks, started, ctx: loaded.ctx };
}

async function flush() {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

test("muted voice does not fetch or speak", async () => {
  const { audio, speaks, ctx } = boot();
  let fetched = 0;
  ctx.fetch = () => { fetched += 1; return Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }); };
  audio.setVoiceScale(0);
  audio.playSentence("https://cdn.example/a.mp3", "Drink cold water.");
  await flush();
  assert.equal(fetched, 0);
  assert.equal(speaks.length, 0);
});

test("no MP3 falls back to en-US speech of the full sentence", async () => {
  const { audio, speaks } = boot();
  audio.setVoiceScale(1);
  audio.playSentence("", "Drink cold water.");
  await flush();
  assert.equal(speaks.length, 1);
  assert.equal(speaks[0].text, "Drink cold water.");
  assert.equal(speaks[0].lang, "en-US");
});

test("MP3 plays through WebAudio and does not also speak", async () => {
  const { audio, speaks, started, ctx } = boot();
  audio.setVoiceScale(1);
  ctx.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  audio.playSentence("https://cdn.example/ok.mp3", "Drink cold water.");
  await flush();
  assert.equal(started.length, 1);
  assert.equal(speaks.length, 0);
});

test("fetch failure falls back to speech", async () => {
  const { audio, speaks, started, ctx } = boot();
  audio.setVoiceScale(1);
  ctx.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  audio.playSentence("https://cdn.example/missing.mp3", "Full sentence please.");
  await flush();
  assert.equal(started.length, 0);
  assert.equal(speaks.length, 1);
  assert.equal(speaks[0].text, "Full sentence please.");
});

test("a newer sentence cancels the previous fetch and utterance", async () => {
  const { audio, speaks, started, ctx } = boot();
  audio.setVoiceScale(1);
  const pending = [];
  ctx.fetch = () => new Promise((resolve) => pending.push(resolve));
  audio.playSentence("https://cdn.example/a.mp3", "First sentence.", { alive: () => true });
  audio.playSentence("https://cdn.example/b.mp3", "Second sentence.", { alive: () => true });
  pending[0]({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  await flush();
  assert.equal(started.length, 0);
  assert.equal(speaks.length, 0);
  pending[1]({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });
  await flush();
  assert.equal(started.length, 0);
  assert.equal(speaks.length, 1);
  assert.equal(speaks[0].text, "Second sentence.");
});

test("alive() false after fetch does not start audio or speech", async () => {
  const { audio, speaks, started, ctx } = boot();
  audio.setVoiceScale(1);
  let alive = true;
  let resolveFetch;
  ctx.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });
  audio.playSentence("https://cdn.example/a.mp3", "Stay quiet", { alive: () => alive });
  alive = false;
  resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  await flush();
  assert.equal(started.length, 0);
  assert.equal(speaks.length, 0);
});
