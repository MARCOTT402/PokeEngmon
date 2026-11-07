"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.chdir(require("path").join(__dirname, "../.."));   /* data／js 路徑以 repo root 為準 */
/* Sync queue 持久化／backoff／毒批丟棄 + 存檔損壞備份 測試（Rule 98）
   用法：npm test（tests/unit/sync_queue.test.js） */
const fs = require("fs");
const path = require("path");
const vm = require("vm");


const ok = (c, name) => { test(String(name), () => assert.ok(c, String(name))); };
const tick = (ms) => new Promise(r => setTimeout(r, ms));

function makeEnv(store) {
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size; }
  };
  const listeners = {};
  const docListeners = {};
  const timers = [];
  const ctx = {
    console: { log() {}, warn() {}, info() {}, error() {} },
    localStorage, JSON, Math, Date, Promise, Object, Array, Number, String, Error,
    navigator: { onLine: true },
    document: { visibilityState: "visible", addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); } },
    setTimeout: (f, ms) => { const id = timers.push({ f, ms }); return id; },
    clearTimeout: () => {},
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    SUPABASE_CONFIG: { restUrl: "https://x/rest/v1", anonKey: "anon" },
    calls: [],
    respond: () => ({ ok: true, status: 201, json: async () => [], text: async () => "" })
  };
  ctx.window = ctx;
  ctx.SupabaseAuth = {
    user: { id: "acc-1" },
    currentUser() { return this.user; },
    isEnabled: () => true,
    authedFetch: async (u, o) => { ctx.calls.push({ u, o }); return ctx.respond(u, o); }
  };
  ctx.loadState = () => ({ device_id: "dev" });
  ctx._timers = timers;
  ctx._listeners = listeners;
  ctx._docListeners = docListeners;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/sync.js"), "utf8"), ctx);
  return ctx;
}

(async () => {
  const store = new Map();
  const QK = "pokeengmon_sync_queue_v1";

  /* 1. queue 會寫入 localStorage；同一張卡去重 */
  let env = makeEnv(store);
  env.Sync.queueUpsert({ card_id: "c1", repetition: 1, updated_at: 1 });
  env.Sync.queueUpsert({ card_id: "c1", repetition: 2, updated_at: 2 });
  env.Sync.queueHistory({ card_id: "c1", ts: 100, q_score: 5 });
  let q = JSON.parse(store.get(QK));
  ok(q.cards.length === 1 && q.cards[0].repetition === 2, "dedupe card keeps newest");
  ok(q.history.length === 1, "history persisted");

  /* 2. 「殺 App」再開：queue 仲喺度，並且會排程補送 */
  env = makeEnv(store);
  ok(env.Sync.pendingCount().cards === 1 && env.Sync.pendingCount().history === 1, "queue restored after reload");
  ok(env._timers.some(t => t.ms === 3000), "restored queue schedules flush");

  /* 3. 離線唔送 */
  env.navigator.onLine = false;
  await env.Sync.flush();
  ok(env.calls.length === 0, "offline: no request");
  env.navigator.onLine = true;

  /* 4. 失敗 → backoff 加長，queue 保留 */
  env.respond = () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "busy" });
  await env.Sync.flush();
  ok(env.Sync.pendingCount().cards === 1 && env.Sync.pendingCount().failures === 1, "5xx keeps queue, failures=1");
  const delays = env._timers.map(t => t.ms);
  ok(delays.includes(2000), "backoff 2s after first failure (" + delays.join(",") + ")");
  await env.Sync.flush();
  ok(env.Sync.pendingCount().failures === 2 && env._timers.map(t => t.ms).includes(4000), "backoff 4s after second failure");

  /* 5. 成功 → 清空、failures 歸零、localStorage 清走 */
  env.respond = () => ({ ok: true, status: 201, json: async () => [], text: async () => "" });
  await env.Sync.flush();
  ok(env.Sync.pendingCount().cards === 0 && env.Sync.pendingCount().history === 0 && env.Sync.pendingCount().failures === 0, "success clears queue");
  ok(!store.has(QK), "storage key removed when empty");

  /* 6. 4xx 毒批：丟棄，唔無限重試 */
  env.Sync.queueUpsert({ card_id: "bad", updated_at: 3 });
  env.respond = () => ({ ok: false, status: 400, json: async () => ({}), text: async () => "bad row" });
  await env.Sync.flush();
  ok(env.Sync.pendingCount().cards === 0 && env.Sync.pendingCount().failures === 0, "400 batch dropped");

  /* 7. 401 唔當毒批（authedFetch 已經 refresh 過；保留等下次） */
  env.Sync.queueUpsert({ card_id: "c401", updated_at: 4 });
  env.respond = () => ({ ok: false, status: 401, json: async () => ({}), text: async () => "jwt" });
  await env.Sync.flush();
  ok(env.Sync.pendingCount().cards === 1, "401 keeps queue");

  /* 8. 換咗帳戶：舊帳戶嘅行唔會用新帳戶送 */
  env.respond = () => ({ ok: true, status: 201, json: async () => [], text: async () => "" });
  env.SupabaseAuth.user = { id: "acc-2" };
  env.calls.length = 0;
  await env.Sync.flush();
  ok(env.calls.length === 0 && env.Sync.pendingCount().cards === 1, "other account rows not sent");
  env.SupabaseAuth.user = { id: "acc-1" };
  await env.Sync.flush();
  ok(env.Sync.pendingCount().cards === 0, "original account flushes its rows");

  /* 9. 頁面隱藏 → keepalive 送 */
  env.Sync.queueHistory({ card_id: "k", ts: 5 });
  env.calls.length = 0;
  env.document.visibilityState = "hidden";
  env._docListeners.visibilitychange.forEach(f => f());
  await tick(5);
  ok(env.calls.length === 1 && env.calls[0].o.keepalive === true, "hidden → keepalive flush");

  /* 10. clearQueue 清埋 storage */
  env.Sync.queueUpsert({ card_id: "z", updated_at: 6 });
  env.Sync.clearQueue();
  ok(!store.has(QK) && env.Sync.pendingCount().cards === 0, "clearQueue clears storage");

  /* ---------- 存檔損壞：先備份再重設 ---------- */
  const sstore = new Map([["pokeengmon_state_v1", "{broken json"]]);
  const sctx = {
    console, JSON, Math, Date, Object, Array, Number, String, Error, Set, Map, RegExp,
    localStorage: {
      getItem: k => (sstore.has(k) ? sstore.get(k) : null),
      setItem: (k, v) => sstore.set(k, String(v)),
      removeItem: k => sstore.delete(k)
    },
    setTimeout: () => 0, crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000000" }
  };
  sctx.window = sctx;
  sctx.Guard = { report: () => { sctx.reported = (sctx.reported || 0) + 1; } };
  vm.createContext(sctx);
  /* Object.keys(localStorage) 喺真瀏覽器列 key；vm 版本用 store 模擬 */
  Object.defineProperty(sctx.localStorage, "__keys", { value: () => [...sstore.keys()] });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/storage.js"), "utf8").replace(
    "Object.keys(localStorage)", "localStorage.__keys()"), sctx);
  const st = vm.runInContext("loadState()", sctx);
  const backups = [...sstore.keys()].filter(k => k.startsWith("pokeengmon_state_corrupt_"));
  ok(backups.length === 1 && sstore.get(backups[0]) === "{broken json", "corrupt state backed up verbatim");
  ok(st && typeof st === "object" && sctx.__stateRecovered === true && sctx.reported === 1, "default state + flagged + reported");

})();
