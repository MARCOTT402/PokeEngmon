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

test("first hint is still L1 on the focused blank", () => {
  const q = arm("healthy");
  Quiz.hint();
  assert.equal(Quiz.cells[0].hintLevel, 1);
  assert.equal(Quiz.cells[0].ghost, "he");
  assert.equal(Quiz.cells[0].value, "");
  assert.equal(Quiz._focusedHintBadge().text, "1/2");
  assert.equal(Quiz._focusedHintBadge().disabled, false);
  assert.equal(Quiz.combo, 0);
  assert.equal(Quiz._answerFor(q).hintCount, 1);
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
