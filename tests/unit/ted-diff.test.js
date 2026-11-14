"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadScripts } = require("../helpers/load.js");

const root = path.join(__dirname, "../..");
const QUIZ_SCRIPTS = [...fs.readFileSync(path.join(root, "index.html"), "utf8")
  .matchAll(/<script src="(js\/quiz(?:\.js|\/[^"?]+))\?/g)].map((m) => m[1]);
const { Quiz, SM2, TedWorld, ctx } = loadScripts(
  ["js/sm2.js", "js/ted.js", ...QUIZ_SCRIPTS],
  { expose: ["Quiz", "SM2", "TedWorld"] }
);

const CARDS = "pokeengmon_sm2_cards_v2";
const qTed = {
  source: "ted", id: "ted:phrase", type: "sentence", topic: "TED",
  sentence: "Please ___ ___ ___ ___ ___.", answer: "Take it down a notch"
};

function freshCells(answer) {
  const q = { ...qTed, answer };
  Quiz.mode = "ted";
  Quiz.answered = false;
  Quiz.queue = [{ q, requeued: false, dueAt: 0 }];
  Quiz.answers = new Map();
  Quiz.currentCell = 0;
  Quiz.combo = 3;
  Quiz._measureText = (t) => String(t || "").length * 10;
  Quiz.cells = Quiz._buildCells(q);
  Quiz.cells.forEach((c) => {
    c.textEl = { textContent: "" };
    c.input = { value: "", disabled: false, focus() {} };
    c.cellEl = { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } };
    c.ghostEl = { textContent: "", style: {} };
  });
  return q;
}

test("missing or invalid World Class difficulty stays Normal and is not sent to the session RPC", () => {
  assert.equal(TedWorld.normalizeDiff(undefined), "normal");
  assert.equal(TedWorld.normalizeDiff("容量"), "normal");
  const saved = TedWorld.savePref({ diff: "easy", size: 20 });
  assert.equal(saved.diff, "easy");
  const kept = TedWorld.savePref({ size: 30 });
  assert.equal(kept.diff, "easy");
  assert.equal(kept.size, 30);
  TedWorld.savePref({ diff: "nope" });
  assert.equal(TedWorld.loadPref().diff, "normal");
  const query = TedWorld.sessionQuery();
  assert.equal(query.diff, undefined);
  assert.equal(query.min_lv >= 1, true);
  assert.equal(query.lim, 30);
});

test("Easy leads match Take it down a notch and do not count as a hint", () => {
  assert.equal(TedWorld.easyLead("Take"), "Ta");
  assert.equal(TedWorld.easyLead("it"), "i");
  assert.equal(TedWorld.easyLead("down"), "do");
  assert.equal(TedWorld.easyLead("a"), "a");
  assert.equal(TedWorld.easyLead("notch"), "no");
  assert.equal(TedWorld.easyLead("I"), "I");
  assert.equal(TedWorld.easyLead("cat"), "ca");
  const q = freshCells("Take it down a notch");
  Quiz._tedPlay = "easy";
  Quiz._seedEasyCells();
  assert.equal(Quiz.cells.map((c) => c.value).join(","), "Ta,i,do,a,no");
  assert.equal(Quiz.cells.every((c) => !c.green), true);
  assert.equal(Quiz._answerFor(q).hintCount, 0);
  assert.equal(Quiz.answered, false);
});

test("manual hints still layer on top of Easy leads", () => {
  const q = freshCells("Take it down a notch");
  Quiz._tedPlay = "easy";
  Quiz._seedEasyCells();
  Quiz.hint();
  assert.equal(Quiz.cells[0].value, "Ta");
  assert.equal(Quiz.cells[0].ghost, "k");
  assert.equal(Quiz._answerFor(q).hintCount, 1);
  Quiz.hint();
  assert.equal(Quiz.cells.map((c) => c.value).join(","), "Ta,i,do,a,no");
  assert.equal(Quiz.cells.map((c) => c.ghost).join(","), "ke,t,wn,,tch");
  assert.equal(Quiz._answerFor(q).hintCount, 2);
  Quiz.cells[0].input.value = "Tax";
  Quiz._onInput(0);
  assert.equal(Quiz.cells.every((c) => c.ghost === ""), true);
  assert.equal(Quiz.cells[0].value, "Tax");
  assert.equal(Quiz._answerFor(q).hintCount, 2);
  Quiz.hint();
  assert.equal(Quiz.cells[1].ghost, "t");
  assert.equal(Quiz.cells[4].ghost, "tch");
});

test("Hard boxes start one letter wide, grow and shrink with typing, and ignore the answer and ghosts", () => {
  freshCells("Take it down a notch");
  Quiz._tedPlay = "hard";
  const widths = Quiz.cells.map((c) => {
    Quiz._syncCellWidth(c, "");
    return c.cellEl.style.width;
  });
  assert.equal(new Set(widths).size, 1);
  const slot = widths[0];
  const long = Quiz.cells[0];
  long.ghost = "Take";
  Quiz._syncCellWidth(long, "");
  assert.equal(long.cellEl.style.width, slot);
  Quiz._syncCellWidth(long, "T");
  const one = long.cellEl.style.width;
  Quiz._syncCellWidth(long, "Tak");
  assert.ok(parseInt(long.cellEl.style.width, 10) > parseInt(one, 10));
  Quiz._syncCellWidth(long, "");
  assert.equal(long.cellEl.style.width, slot);
  Quiz.mode = null;
  Quiz._tedPlay = "normal";
  long.baseWidth = Math.max(40, Math.ceil(Quiz._measureText(long.primary)) + 20);
  Quiz._syncCellWidth(long, "");
  assert.ok(parseInt(long.cellEl.style.width, 10) > parseInt(slot, 10));
});

test("Easy, Normal and Hard TED memories stay separate and old cards remain Normal", () => {
  const legacy = "ted\u0001ted:phrase";
  ctx.localStorage.setItem(CARDS, JSON.stringify({
    [legacy]: {
      card_id: legacy, card_type: "sentence", next_review_at: 88000, interval_days: 6,
      ease_factor: 2.7, repetition: 4, lapse_count: 0, is_mastered: false,
      last_review_at: 10, updated_at: 10
    }
  }));
  SM2.setTedPlay("normal");
  const normal = SM2.getOrCreateCard(qTed);
  assert.equal(normal.card_id, legacy);
  assert.equal(normal.repetition, 4);
  assert.equal(normal.next_review_at, 88000);
  SM2.setTedPlay("easy");
  const easy = SM2.getOrCreateCard(qTed);
  assert.equal(easy.card_id, legacy + "\u0001easy");
  assert.equal(easy.repetition, 0);
  const easyDone = SM2.upsertCard(SM2.applyClean(easy, 1000));
  assert.ok(easyDone.next_review_at > 88000 || easyDone.repetition !== 4);
  SM2.setTedPlay("hard");
  const hard = SM2.getOrCreateCard(qTed);
  assert.equal(hard.card_id, legacy + "\u0001hard");
  assert.equal(hard.repetition, 0);
  assert.equal(hard.next_review_at, 0);
  SM2.setTedPlay("normal");
  const normalAgain = SM2.getOrCreateCard(qTed);
  assert.equal(normalAgain.repetition, 4);
  assert.equal(normalAgain.next_review_at, 88000);
  SM2.setTedPlay("easy");
  const school = SM2.getOrCreateCard({ topic: "Articles", sentence: "He ___ here.", answer: "is" });
  assert.equal(school.card_id, "Articles\u0001He ___ here.\u0001is");
  const stored = JSON.parse(ctx.localStorage.getItem(CARDS));
  assert.equal(stored[legacy].repetition, 4);
  assert.equal(stored[legacy + "\u0001easy"].repetition > 0, true);
  assert.equal(stored[legacy + "\u0001hard"].repetition, 0);
});
