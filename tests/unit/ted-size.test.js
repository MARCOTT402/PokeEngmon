"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadScripts } = require("../helpers/load.js");

const QUIZ_SCRIPTS = [...fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8")
  .matchAll(/<script src="(js\/quiz(?:\.js|\/[^"?]+))\?/g)].map((m) => m[1]);
const loaded = loadScripts(["js/sm2.js", "js/ted.js", ...QUIZ_SCRIPTS], { expose: ["Quiz", "SM2", "TedWorld"] });
const { Quiz, ctx } = loaded;

function el() {
  const classes = new Set();
  return {
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      toggle(c, on) {
        const force = on === undefined ? !classes.has(c) : !!on;
        if (force) classes.add(c); else classes.delete(c);
        return force;
      },
      contains(c) { return classes.has(c); }
    },
    style: {},
    textContent: "",
    hidden: false,
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
    insertBefore() {},
    remove() {}
  };
}

test("school sessions stay at 10; World Class does not reuse that constant", () => {
  const data = fs.readFileSync(path.join(__dirname, "../../js/data.js"), "utf8");
  const session = fs.readFileSync(path.join(__dirname, "../../js/quiz/session.js"), "utf8");
  assert.match(data, /SET_SIZE:\s*10/);
  assert.match(session, /drawMixedSet\(GAME_CONFIG\.SET_SIZE/);
  assert.match(session, /all\.slice\(0,\s*GAME_CONFIG\.SET_SIZE\)/);
  assert.doesNotMatch(session, /TED_LIM_CAP/);
});

test("a short session is not started", async () => {
  let began = false;
  const origFetch = ctx.TedWorld.fetchSession;
  const origBegin = Quiz._begin;
  ctx.TedWorld.fetchSession = async () => ({ ok: false, error: "short", expected: 100, got: 40, questions: [] });
  Quiz._begin = () => { began = true; };
  try {
    await Quiz.startWorld();
    assert.equal(began, false);
  } finally {
    ctx.TedWorld.fetchSession = origFetch;
    Quiz._begin = origBegin;
    Quiz._tedLoading = false;
  }
});

test("an exact 50 and 100 question payload becomes the session length", async () => {
  const origFetch = ctx.TedWorld.fetchSession;
  const origBegin = Quiz._begin;
  try {
    for (const n of [10, 50, 100]) {
      let began = 0;
      ctx.TedWorld.fetchSession = async () => ({
        ok: true,
        questions: Array.from({ length: n }, (_, i) => ({ id: "ted:" + n + ":" + i }))
      });
      Quiz._begin = (set) => { began = set.length; };
      await Quiz.startWorld();
      assert.equal(began, n);
      Quiz._tedLoading = false;
    }
  } finally {
    ctx.TedWorld.fetchSession = origFetch;
    Quiz._begin = origBegin;
    Quiz._tedLoading = false;
  }
});

function hostFor(segs) {
  const made = [];
  const host = el();
  host.insertBefore = (node) => { made.push(node); };
  host.querySelectorAll = () => made.slice();
  const progress = el();
  const nodes = { "quiz-segs": host, "quiz-progress": progress, "quiz-bar-runner": el() };
  ctx.document.getElementById = (id) => nodes[id] || el();
  ctx.document.createElement = () => el();
  return { host, progress, made, segs };
}

test("progress count and dense bar follow 10, 50 and 100", () => {
  Quiz.seenQids = new Set(["done"]);
  Quiz.mode = "ted";
  for (const n of [10, 50, 100]) {
    Quiz.total = n;
    Quiz.segs = Array.from({ length: n }, () => ({ state: "", re: false }));
    const ui = hostFor();
    Quiz._updateProgress();
    assert.equal(ui.progress.textContent, "1 / " + n);
    assert.equal(ui.progress.classList.contains("is-count"), n > 10);
    assert.equal(ui.host.classList.contains("is-long"), n > 10);
    assert.equal(ui.made.length, n);
  }
  Quiz.mode = null;
  Quiz.total = 100;
  Quiz.segs = Array.from({ length: 10 }, () => ({ state: "", re: false }));
  const school = hostFor();
  Quiz._updateProgress();
  assert.equal(school.host.classList.contains("is-long"), false);
  assert.equal(school.progress.classList.contains("is-count"), false);
});

function armSet(n) {
  const set = Array.from({ length: n }, (_, i) => ({
    id: "ted:size:" + n + ":" + i,
    source: "ted",
    type: "sentence",
    topic: "TED",
    sentence: "Say ___ now.",
    answer: "word" + i
  }));
  Quiz.mode = "ted";
  Quiz.set = set;
  Quiz.total = n;
  Quiz.queue = set.map((q) => ({ q, requeued: false, dueAt: 0 }));
  Quiz.seenQids = new Set();
  Quiz.answers = new Map();
  Quiz.cells = [{ value: "word0", primary: "word0", hintLevel: 0, input: { disabled: false } }];
  Quiz.answered = false;
  Quiz.segs = set.map((q) => ({ key: Quiz._key(q), re: false, state: "" }));
  Quiz._curQuestionStart = Date.now();
  Quiz._curWrong = 0;
  Quiz.combo = 4;
  Quiz.wrongTries = 0;
  Quiz.bestCombo = 0;
  Quiz._speakCompleted = () => {};
  Quiz._showCompletedNote = () => {};
  Quiz._isJunior = () => false;
  Quiz._updateProgress = () => {};
  Quiz._popSeg = () => {};
  Quiz._syncCheckBtn = () => {};
  Quiz._setAction = () => {};
  Quiz._renderChip = () => {};
  Quiz._applyGhost = () => {};
  Quiz._vibrate = () => {};
  ctx.document.getElementById = () => el();
  return set;
}

test("hinted questions requeue inside 50 and 100 question sets, except the final card", () => {
  for (const n of [50, 100]) {
    const set = armSet(n);
    const first = set[0];
    Quiz._answerFor(first).hintCount = 1;
    Quiz.cells[0].hintLevel = 1;
    Quiz._complete();
    assert.equal(Quiz.queue.length, n + 1);
    assert.equal(Quiz.queue[n].q, first);
    assert.equal(Quiz.queue[n].requeued, true);
    assert.equal(Quiz.seenQids.has(Quiz._key(first)), false);
    assert.equal(Quiz.segs.length, n + 1);
    assert.equal(Quiz.segs[n].re, true);
    assert.equal(Quiz.combo, 0);

    armSet(n);
    Quiz.queue = [Quiz.queue[0]];
    Quiz._answerFor(Quiz.queue[0].q).hintCount = 2;
    Quiz.cells[0].hintLevel = 2;
    Quiz._complete();
    assert.equal(Quiz.queue.length, 1);
    assert.equal(Quiz.seenQids.has(Quiz._key(Quiz.queue[0].q)), true);
  }
});
