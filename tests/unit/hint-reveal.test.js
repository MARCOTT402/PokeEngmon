"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadScripts } = require("../helpers/load.js");

const QUIZ_SCRIPTS = [...fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8")
  .matchAll(/<script src="(js\/quiz(?:\.js|\/[^"?]+))\?/g)].map((m) => m[1]);
const { Quiz, ctx } = loadScripts(["js/ted.js", ...QUIZ_SCRIPTS], { expose: ["Quiz"] });
ctx.Event = function Event() {};

function arm(answer) {
  const q = { type: "sentence", topic: "Articles", sentence: "Say ___ now.", answer, accept: [] };
  Quiz.answered = false;
  Quiz.queue = [{ q, requeued: false, dueAt: 0 }];
  Quiz.answers = new Map();
  Quiz.cells = Quiz._buildCells(q);
  Quiz.cells.forEach((c) => {
    c.textEl = { textContent: "" };
    c.input = {
      value: "",
      disabled: false,
      focus() {},
      dispatchEvent() { Quiz._onInput(Quiz.cells.indexOf(c)); }
    };
  });
  Quiz.currentCell = 0;
  Quiz.combo = 4;
  Quiz._isJunior = () => false;
  return q;
}

function assertGhosts(list) {
  assert.equal(Quiz.cells.length, list.length);
  list.forEach((g, i) => assert.equal(Quiz.cells[i].ghost, g));
}

test("press 1 is L1, press 2 is full L2 on every blank, later presses repeat it", () => {
  const q = arm("for granted");
  Quiz.hint();
  assertGhosts(["f", ""]);
  assert.equal(Quiz.cells[0].value, "");
  assert.equal(Quiz.cells[1].value, "");
  assert.equal(Quiz._answerFor(q).hintCount, 1);
  assert.equal(Quiz.combo, 0);

  Quiz.combo = 5;
  Quiz.hint();
  assertGhosts(["for", "granted"]);
  assert.equal(Quiz.cells[0].value, "");
  assert.equal(Quiz.cells[1].value, "");
  assert.equal(Quiz._answerFor(q).hintCount, 2);
  assert.equal(Quiz._focusedHintBadge().text, "2/2");
  assert.equal(Quiz._focusedHintBadge().disabled, false);
  assert.equal(Quiz.combo, 0);

  Quiz.currentCell = 1;
  Quiz._paintHintBadge();
  Quiz.hint();
  Quiz.hint();
  assertGhosts(["for", "granted"]);
  assert.equal(Quiz._focusedHintBadge().text, "2/2");
  assert.equal(Quiz._answerFor(q).hintCount, 2);
});

test("typing hides every hint, and the next press is still full L2", () => {
  const q = arm("for granted");
  Quiz.hint();
  Quiz.hint();
  assertGhosts(["for", "granted"]);

  Quiz.cells[0].input.value = "x";
  Quiz._onInput(0);
  assertGhosts(["", ""]);
  assert.equal(Quiz.cells[0].value, "x");
  assert.equal(Quiz.cells[1].value, "");
  assert.equal(Quiz._answerFor(q).hintCount, 2);
  assert.equal(Quiz._focusedHintBadge().text, "2/2");

  Quiz.currentCell = 1;
  Quiz.hint();
  assertGhosts(["for", "granted"]);
  assert.equal(Quiz.cells[0].value, "x");

  Quiz.cells[1].input.value = "g";
  Quiz._onInput(1);
  assertGhosts(["", ""]);
  assert.equal(Quiz.cells[1].value, "g");

  Quiz.hint();
  assert.equal(Quiz.cells[0].ghost, "for");
  assert.equal(Quiz.cells[1].ghost, "ranted");
  assert.equal(Quiz.cells[0].value, "x");
  assert.equal(Quiz.cells[1].value, "g");
  assert.equal(Quiz._answerFor(q).hintCount, 2);
});

test("on-screen keyboard insert also dismisses hints without resetting L2", () => {
  const q = arm("healthy");
  Quiz.hint();
  Quiz.hint();
  assert.equal(Quiz.cells[0].ghost, "healthy");
  Quiz._kbInsert("z");
  assert.equal(Quiz.cells[0].ghost, "");
  assert.equal(Quiz.cells[0].value, "z");
  assert.equal(Quiz._answerFor(q).hintCount, 2);
  Quiz.hint();
  assert.equal(Quiz.cells[0].ghost, "healthy");
  assert.equal(Quiz.cells[0].value, "z");
});

test("a correct prefix stays, and a finished blank is not rewritten", () => {
  const q = arm("for granted");
  Quiz.cells[0].value = "for";
  Quiz.cells[0].input.value = "for";
  Quiz.cells[0].green = true;
  Quiz.cells[1].value = "gr";
  Quiz.cells[1].input.value = "gr";
  Quiz.currentCell = 1;
  Quiz.hint();
  assert.equal(Quiz.cells[1].ghost, "a");
  assert.equal(Quiz.cells[1].value, "gr");
  Quiz.hint();
  assert.equal(Quiz.cells[0].value, "for");
  assert.equal(Quiz.cells[0].ghost, "");
  assert.equal(Quiz.cells[1].value, "gr");
  assert.equal(Quiz.cells[1].ghost, "anted");
  assert.equal(Quiz._answerFor(q).hintCount, 2);
});

test("typing between L1 and L2 does not replay L1", () => {
  arm("healthy");
  Quiz.hint();
  assert.equal(Quiz.cells[0].ghost, "he");
  Quiz.cells[0].input.value = "h";
  Quiz._onInput(0);
  assert.equal(Quiz.cells[0].ghost, "");
  Quiz.hint();
  assert.equal(Quiz.cells[0].ghost, "ealthy");
  assert.equal(Quiz.cells[0].value, "h");
  assert.equal(Quiz._answerFor(Quiz.queue[0].q).hintCount, 2);
});
