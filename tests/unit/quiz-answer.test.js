"use strict";
/* 答案比對 characterization tests（Review Focus #4）：記錄現行為，重構唔可以改變判對／判錯 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("../helpers/load.js");

/* Quiz 方法分喺 js/quiz/*.js（P2.5）：跟 index.html 次序載入主檔＋全部 mixin */
const QUIZ_SCRIPTS = [...require("fs").readFileSync(require("path").join(__dirname, "../../index.html"), "utf8")
  .matchAll(/<script src="(js\/quiz(?:\.js|\/[^"?]+))\?/g)].map((m) => m[1]);
const { Quiz } = loadScripts(QUIZ_SCRIPTS, { expose: ["Quiz"] });
/* vm context 嘅 Array 同 Node 唔同 realm → 先 JSON clone 先 deepEqual */
const plain = (v) => JSON.parse(JSON.stringify(v));
const tokensOf = (q) => plain(Quiz._buildCells(q).map((c) => [...c.tokens].sort()));

test("_norm: trim, lowercase, collapse inner whitespace", () => {
  assert.equal(Quiz._norm("  Went   Home "), "went home");
  assert.equal(Quiz._norm(null), "");
  assert.equal(Quiz._norm(undefined), "");
});

test("_norm treats curly / modifier apostrophes (’ ‘ ʼ) as a straight ' (smart punctuation)", () => {
  assert.equal(Quiz._norm("don’t"), "don't");
  assert.equal(Quiz._norm("‘tis"), "'tis");
  assert.equal(Quiz._norm("Isnʼt"), "isn't");
  assert.equal(Quiz._norm("don't"), "don't");
});

test("a curly-apostrophe input matches a straight-apostrophe answer and vice versa", () => {
  const [straight] = Quiz._buildCells({ answer: "don't" });
  assert.equal(Quiz._cellMatch(straight, Quiz._norm("Don’t")), true);
  const [curly] = Quiz._buildCells({ answer: "don’t" });
  assert.deepEqual(plain([...curly.tokens]), ["don't"]);
  assert.equal(Quiz._cellMatch(curly, Quiz._norm("don't")), true);
  assert.deepEqual([...Quiz._fullAnswerVariants({ answer: "It’s", accept: ["it is"] })], ["it's", "it is"]);
});

test("apostrophe normalisation keeps string length (hint prefix / junior ghost compare by index)", () => {
  assert.equal(Quiz._norm("we’re").length, "we're".length);
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
