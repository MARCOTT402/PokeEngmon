"use strict";
/* 答案比對 characterization tests（Review Focus #4）：記錄現行為，重構唔可以改變判對／判錯 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

const { Quiz } = loadScripts(["js/quiz.js"], { expose: ["Quiz"] });
/* vm context 嘅 Array 同 Node 唔同 realm → 先 JSON clone 先 deepEqual */
const plain = (v) => JSON.parse(JSON.stringify(v));
const tokensOf = (q) => plain(Quiz._buildCells(q).map((c) => [...c.tokens].sort()));

test("_norm: trim, lowercase, collapse inner whitespace", () => {
  assert.equal(Quiz._norm("  Went   Home "), "went home");
  assert.equal(Quiz._norm(null), "");
  assert.equal(Quiz._norm(undefined), "");
});

test("_norm keeps curly apostrophe as-is (KNOWN: ’ ≠ ')", () => {
  assert.notEqual(Quiz._norm("don’t"), Quiz._norm("don't"));
});

test("_buildCells: one cell per answer word; accepted token is lowercase", () => {
  const cells = Quiz._buildCells({ answer: "Has Been", sentence: "He ___ here." });
  assert.equal(cells.length, 2);
  assert.deepEqual(plain(cells.map((c) => c.primary)), ["Has", "Been"]);
  assert.deepEqual(tokensOf({ answer: "Has Been" }), [["has"], ["been"]]);
});

test("_buildCells: accept variants with same word count add per-cell tokens", () => {
  assert.deepEqual(tokensOf({ answer: "is not", accept: ["isn't there", "is n't"] }), [["is", "isn't"], ["n't", "not", "there"]]);
});

test("_buildCells: accept variants with different word count are ignored per cell", () => {
  assert.deepEqual(tokensOf({ answer: "is not", accept: ["isn't"] }), [["is"], ["not"]]);
});

test("_buildCells: empty answer → one empty cell", () => {
  const cells = Quiz._buildCells({ answer: "   " });
  assert.equal(cells.length, 1);
  assert.equal(cells[0].empty, true);
});

test("_buildCells: word questions use q.word and ignore accept", () => {
  assert.deepEqual(tokensOf({ type: "word", word: "Apple", accept: ["apples"] }), [["apple"]]);
});

test("_cellMatch compares against normalised tokens", () => {
  const [c] = Quiz._buildCells({ answer: "Went" });
  assert.equal(Quiz._cellMatch(c, Quiz._norm(" WENT ")), true);
  assert.equal(Quiz._cellMatch(c, Quiz._norm("go")), false);
});

test("_fullAnswerVariants: primary + accept, normalised, blanks dropped", () => {
  assert.deepEqual([...Quiz._fullAnswerVariants({ answer: " Is Not ", accept: ["Isn't", ""] })], ["is not", "isn't"]);
  assert.deepEqual([...Quiz._fullAnswerVariants({ type: "word", word: "Cat", accept: ["cats"] })], ["cat", "cats"]);
});
