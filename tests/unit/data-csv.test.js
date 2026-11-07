"use strict";
/* 題庫 CSV 解析 characterization tests */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadScripts, ROOT } = require("../helpers/load.js");

const D = loadScripts(["js/core/guard.js", "js/gens-data.js", "js/data.js"], {
  expose: ["parseCSV", "questionsFromCSV", "normalizeQuestion"]
});
const plain = (v) => JSON.parse(JSON.stringify(v));

test("parseCSV: quoted comma, escaped quote, CRLF, BOM, trailing blank line", () => {
  const rows = plain(D.parseCSV('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n\r\n'));
  assert.deepEqual(rows[0], ["a", "b, c", 'say "hi"']);
  assert.deepEqual(rows[1], ["1", "2", "3"]);
  assert.equal(rows.filter((r) => r.some((c) => c !== "")).length, 2);
});

test("questionsFromCSV: real grammar bank → one question per data row", () => {
  const text = fs.readFileSync(path.join(ROOT, "Q_folder/grammar/grammar.csv"), "utf8");
  const dataRows = plain(D.parseCSV(text)).slice(1).filter((r) => r.some((c) => c.trim()));
  const { questions, skipped } = D.questionsFromCSV(text);
  assert.equal(questions.length + skipped, dataRows.length);
  assert.equal(skipped, 0);
  const q = questions[0];
  assert.equal(q.category, "Grammar");
  assert.equal(q.answer, "an");
  assert.ok(q.sentence.includes("___"));
});

test("questionsFromCSV: 9-column header with one row", () => {
  const csv = "編號,大類,單元,題型,難度,句子,答案,關鍵詞,提示\n00009,Grammar,Tenses,Past,2,She ___ home.,went,home,past of go\n";
  const { questions } = D.questionsFromCSV(csv);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].unit, "Tenses");
  assert.equal(String(questions[0].level), "2");
});

test("normalizeQuestion fills defaults and keeps existing values", () => {
  assert.deepEqual(plain(D.normalizeQuestion({ type: "word" })), { type: "word", category: "Vocab", unit: "Dictation", level: 1, no: "" });
  assert.deepEqual(plain(D.normalizeQuestion({ type: "fill", course: "Articles" })), { type: "fill", course: "Articles", category: "Grammar", unit: "Articles", level: 1, no: "" });
  assert.equal(D.normalizeQuestion({ level: 3 }).level, 3);
});
