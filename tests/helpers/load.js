"use strict";
/* 單元測試共用 loader：喺全新 vm context 跑 App 嘅 global script（冇 build step、冇 module）。
   - 每次 call 都係新 context → 模組級快取（例如 storage.js 嘅 _state）唔會喺測試之間互相污染。
   - fetch 由 repo 讀檔（data/*.json、Q_folder/*.csv），唔使開 server。
   - 頂層 const／let 唔會掛上 global，所以用 opts.expose 指定要攞返出嚟嘅名。
   用法：const { SM2, ctx } = loadScripts(["js/sm2.js"], { expose: ["SM2"] }); */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "../..");

/* localStorage 替身：Object.keys(localStorage) 要列出已存 key（storage.js _backupCorruptState 靠佢清舊備份） */
function makeLocalStorage(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  const api = {
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    _map: map
  };
  return new Proxy(api, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: (t, k) => (map.has(k) ? { value: map.get(k), enumerable: true, configurable: true } : undefined),
    get: (t, k) => (k in api ? api[k] : (map.has(k) ? map.get(k) : undefined))
  });
}

/* fetch 替身：相對 URL → repo 檔案（去 ?query），搵唔到回 404 */
function makeFetch() {
  return async (url) => {
    const rel = String(url).replace(/^\.?\//, "").split(/[?#]/)[0];
    const file = path.join(ROOT, rel);
    if (/^[a-z]+:/i.test(String(url)) || !file.startsWith(ROOT) || !fs.existsSync(file)) {
      return { ok: false, status: 404, json: async () => { throw new Error("404 " + url); }, text: async () => "" };
    }
    const body = fs.readFileSync(file, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
  };
}

function makeDocument() {
  const noop = () => {};
  const el = () => null;
  return {
    readyState: "complete",
    getElementById: el, querySelector: el, querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    createElement: () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, appendChild: noop, addEventListener: noop }),
    documentElement: { dataset: {}, style: { setProperty: noop }, classList: { add: noop, remove: noop, toggle: noop } },
    body: { appendChild: noop, classList: { add: noop, remove: noop, toggle: noop } },
    visibilityState: "visible"
  };
}

/**
 * @param {string[]} files  repo 相對路徑，按次序執行
 * @param {{ expose?: string[], localStorage?: Record<string,string>, globals?: object }} [opts]
 * @returns {{ ctx: object, [name: string]: any }}
 */
/* App 入面有 setInterval／debounce setTimeout（Guard 上報、saveState 合併寫入）；
   unref 咗先唔會令測試 process 吊住唔完 */
const unref = (h) => { if (h && typeof h.unref === "function") h.unref(); return h; };

function loadScripts(files, opts = {}) {
  const ctx = {
    console, Date, Math, JSON, Promise, URL, URLSearchParams, structuredClone,
    setTimeout: (fn, ms, ...a) => unref(setTimeout(fn, ms, ...a)),
    setInterval: (fn, ms, ...a) => unref(setInterval(fn, ms, ...a)),
    clearTimeout, clearInterval, queueMicrotask,
    localStorage: makeLocalStorage(opts.localStorage),
    fetch: makeFetch(),
    document: makeDocument(),
    navigator: { onLine: true, userAgent: "node-test" },
    location: { hostname: "localhost", href: "http://localhost/", search: "", hash: "", pathname: "/" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
    ...(opts.globals || {})
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    const file = path.join(ROOT, f);
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  }
  const names = (opts.expose || []).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  const exposed = names.length
    ? vm.runInContext(`({ ${names.map((n) => `${n}: typeof ${n} === "undefined" ? undefined : ${n}`).join(", ")} })`, ctx)
    : {};
  return { ctx, ...exposed };
}

module.exports = { loadScripts, makeLocalStorage, makeFetch, ROOT };
