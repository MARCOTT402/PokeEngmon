"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.chdir(require("path").join(__dirname, "../.."));   /* data／js 路徑以 repo root 為準 */
/* SM-2 解析快取 + buildSession 行為測試（Rule 7／77／93）
   用法：npm test（tests/unit/sm2_cache.test.js） */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};
const ctx = { window: {}, localStorage, console, Date, Math, JSON };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/sm2.js"), "utf8"), ctx);
const SM2 = ctx.SM2;


const ok = (cond, name) => { test(String(name), () => assert.ok(cond, String(name))); };

const CARDS = "pokeengmon_sm2_cards_v2";
const qs = [];
for (let i = 0; i < 1380; i++) qs.push({ topic: "T" + (i % 3), sentence: "s" + i + " ___", answer: "a" + i });
ctx.questionTopicKey = q => q.topic;

/* 1. 全新用戶：buildSession 唔會寫入成個 pool 嘅卡 */
let set = SM2.buildSession(qs, null, 10);
ok(set.length === 10, "fresh set size 10");
ok(!store.has(CARDS) || Object.keys(JSON.parse(store.get(CARDS))).length === 0, "buildSession creates no cards");

/* 2. 已有 1,380 張卡：一半未到期 → 永遠唔抽（Rule 7） */
const now = Date.now();
const cards = {};
qs.forEach((q, i) => {
  const id = `${q.topic}\u0001${q.sentence}\u0001${q.answer}`;
  cards[id] = { card_id: id, next_review_at: i % 2 ? now + 86400000 : now - 1000, repetition: 1, updated_at: 1 };
});
store.set(CARDS, JSON.stringify(cards));
let t0 = Date.now();
for (let r = 0; r < 50; r++) set = SM2.buildSession(qs, null, 10);
const ms = (Date.now() - t0) / 50;
ok(ms < 20, "buildSession with 1380 cards fast (" + ms.toFixed(1) + "ms avg)");
let notDue = 0;
for (let r = 0; r < 200; r++) SM2.buildSession(qs, null, 10).forEach(q => { if (Number(q.sentence.slice(1)) % 2) notDue++; });
ok(notDue === 0, "Rule 7: never draws not-due cards");

/* 3. Rule 77：多 topic 比例接近 pool 比例（每 topic 約 1/3） */
const cnt = { T0: 0, T1: 0, T2: 0 };
for (let r = 0; r < 600; r++) SM2.buildSession(qs, new Set(["T0", "T1", "T2"]), 10).forEach(q => cnt[q.topic]++);
const tot = cnt.T0 + cnt.T1 + cnt.T2;
ok(Object.values(cnt).every(c => Math.abs(c / tot - 1 / 3) < 0.05), "Rule 77 distribution " + JSON.stringify(cnt));

/* 4. topic 篩選 */
ok(SM2.buildSession(qs, new Set(["T1"]), 10).every(q => q.topic === "T1"), "topic filter");

/* 5. 外部直接寫 localStorage（模擬 Sync.pull）→ 快取自動失效 */
const anyId = Object.keys(cards)[0];
const pulled = { ...cards, [anyId]: { ...cards[anyId], ease_factor: 9.9 } };
store.set(CARDS, JSON.stringify(pulled));
ok(SM2.listAll().find(c => c.card_id === anyId).ease_factor === 9.9, "external write invalidates cache");

/* 6. reset（removeItem）→ 冇卡 */
store.delete(CARDS);
ok(SM2.listAll().length === 0, "removeItem clears cache");

/* 7. getOrCreateCard + upsertCard 寫返 localStorage */
const c = SM2.getOrCreateCard(qs[0]);
ok(JSON.parse(store.get(CARDS))[c._key], "getOrCreateCard persists");
SM2.upsertCard({ ...c, repetition: 3 });
ok(JSON.parse(store.get(CARDS))[c._key].repetition === 3, "upsertCard persists");
ok(SM2.getOrCreateCard(qs[0]).repetition === 3, "read-after-write");

/* 8. listAll 回傳 copy：改咗唔污染快取 */
SM2.listAll()[0].repetition = 99;
ok(SM2.getOrCreateCard(qs[0]).repetition === 3, "listAll returns copies");

/* 9. 壞 JSON → 空，唔 throw */
store.set(CARDS, "{bad");
let threw = false; try { SM2.buildSession(qs, null, 10); SM2.listAll(); } catch (e) { threw = true; }
ok(!threw, "corrupt cards JSON does not throw");

/* 10. history append + 2000 上限 */
store.delete("pokeengmon_sm2_history_v2");
for (let i = 0; i < 2005; i++) SM2.appendHistory({ card_id: "x", ts: i + 1 });
const h = SM2.listHistory();
ok(h.length === 2000 && h[h.length - 1].ts === 2005, "history capped at 2000");
ok(SM2.mergeHistory([{ card_id: "y", ts: 99999 }]) === 1 && SM2.listHistory().length === 2000, "mergeHistory dedupe + cap");