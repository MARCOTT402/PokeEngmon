"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadScripts } = require("../helpers/load.js");

const QUIZ_SCRIPTS = [...fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8")
  .matchAll(/<script src="(js\/quiz(?:\.js|\/[^"?]+))\?/g)].map((m) => m[1]);
const { Quiz } = loadScripts(["js/ted.js", ...QUIZ_SCRIPTS], { expose: ["Quiz"] });

function arm(answer) {
  const q = { type: "sentence", topic: "Articles", sentence: "Say ___ now.", answer, accept: [] };
  Quiz.answered = false;
  Quiz.queue = [{ q, requeued: false, dueAt: 0 }];
  Quiz.answers = new Map();
  Quiz.cells = Quiz._buildCells(q);
  Quiz.cells.forEach((c) => {
    c.textEl = { textContent: "" };
    c.input = { value: "", disabled: false, focus() {} };
  });
  Quiz.currentCell = 0;
  Quiz.combo = 4;
  return q;
}

test("single blank still walks L1 then L2 and marks the question", () => {
  const q = arm("healthy");
  Quiz.hint();
  assert.equal(Quiz.cells[0].hintLevel, 1);
  assert.equal(Quiz._focusedHintBadge().text, "1/2");
  assert.equal(Quiz._focusedHintBadge().disabled, false);
  assert.equal(Quiz.combo, 0);
  Quiz.combo = 3;
  Quiz.hint();
  assert.equal(Quiz.cells[0].hintLevel, 2);
  assert.equal(Quiz.cells[0].ghost, "healthy");
  assert.equal(Quiz._focusedHintBadge().text, "2/2");
  assert.equal(Quiz._focusedHintBadge().disabled, true);
  assert.equal(Quiz._answerFor(q).hintCount, 2);
  assert.equal(Quiz._questionUsedHint(), true);
  assert.equal(Quiz.combo, 0);
});

test("one cell at L2 does not block L1 or L2 on another cell", () => {
  const q = arm("for granted");
  assert.equal(Quiz.cells.length, 2);
  Quiz.hint();
  Quiz.hint();
  assert.equal(Quiz.cells[0].hintLevel, 2);
  assert.equal(Quiz._focusedHintBadge().disabled, true);

  Quiz.currentCell = 1;
  Quiz._paintHintBadge();
  assert.equal(Quiz.cells[1].hintLevel, 0);
  assert.equal(Quiz._focusedHintBadge().text, "");
  assert.equal(Quiz._focusedHintBadge().disabled, false);

  Quiz.hint();
  assert.equal(Quiz.cells[1].hintLevel, 1);
  assert.equal(Quiz.cells[0].hintLevel, 2);
  assert.equal(Quiz._focusedHintBadge().text, "1/2");
  assert.equal(Quiz._focusedHintBadge().disabled, false);
  assert.equal(Quiz._answerFor(q).hintCount, 2);
  assert.equal(Quiz._questionUsedHint(), true);

  Quiz.hint();
  assert.equal(Quiz.cells[1].hintLevel, 2);
  assert.equal(Quiz.cells[1].hintLetters, 0);
  assert.equal(Quiz._focusedHintBadge().text, "2/2");
  assert.equal(Quiz.cells[0].hintLevel, 2);
});

test("full sentence inserts the answer once", () => {
  assert.equal(Quiz._fullSentence({ sentence: "Drink ___ water.", answer: "cold" }), "Drink cold water.");
  assert.equal(Quiz._fullSentence({ type: "word", word: "cat" }), "cat");
});

test("touch keyboard still follows pointer: coarse", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../js/quiz/keyboard.js"), "utf8");
  assert.match(src, /pointer:\s*coarse/);
  assert.equal(typeof Quiz._isTouchDevice, "function");
});
