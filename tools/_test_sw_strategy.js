/* sw.js fetch 策略自測（Rule 102）：node tools/_test_sw_strategy.js
   喺 vm 入面載 sw.js，stub self／caches／fetch，驗 swRoute 分流同 networkFirst 3 秒 timeout。 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log("FAIL:", m); } };

function load(host) {
  const store = new Map();               /* key: url（冇 query 版本都存） */
  const listeners = {};
  let fetchImpl = async () => new Response("net");
  const caches = {
    async match(req, opt) {
      const u = new URL(typeof req === "string" ? req : req.url, `https://${host}/app/`);
      const key = u.href;
      if (store.has(key)) return store.get(key).clone();
      if (opt && opt.ignoreSearch) {
        const bare = u.origin + u.pathname;
        for (const [k, v] of store) if (k.split("?")[0] === bare) return v.clone();
      }
      return undefined;
    },
    async open() { return { put: async (req, res) => { store.set(new URL(req.url || req, `https://${host}/app/`).href, res); } }; },
    async keys() { return []; }
  };
  const ctx = {
    self: { location: { origin: `https://${host}`, hostname: host }, addEventListener: (k, f) => { listeners[k] = f; }, skipWaiting() {}, clients: { claim() {} } },
    caches, URL, Request, Response, setTimeout, clearTimeout, Promise,
    fetch: (...a) => fetchImpl(...a)
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8") + "\n;this.__swRoute = swRoute; this.__ver = SW_VERSION; this.__nf = networkFirst;", ctx);
  return { ctx, store, setFetch: f => { fetchImpl = f; } };
}

const R = (url, o = {}) => ({ url, method: o.method || "GET", mode: o.mode || "cors", destination: o.destination || "" });

(async () => {
  const P = load("marcotong402.github.io");
  const route = P.ctx.__swRoute, V = P.ctx.__ver;
  const O = "https://marcotong402.github.io/app/";
  ok(/^\d+\.\d+\.\d+$/.test(V), "SW_VERSION parsed from CACHE_NAME: " + V);
  ok(route(R(O + "js/app.js?v=" + V, { destination: "script" })) === "versioned", "same-version ?v= → versioned");
  ok(route(R(O + "js/app.js?v=0.0.1", { destination: "script" })) === "network-first", "other version → network-first");
  ok(route(R(O + "js/app.js")) === "network-first", "unversioned js → network-first");
  ok(route(R(O, { mode: "navigate" })) === "page", "navigate → page");
  ok(route(R(O + "index.html?code=abc", { mode: "navigate" })) === "page", "index.html with query → page");
  ok(route(R(O + "assets/bgm/flat-water.mp3")) === "cache-first", "/assets/ → cache-first");
  ok(route(R(O + "Q_folder/grammar/grammar.csv")) === "network-first", "csv → network-first");
  ok(route(R(O + "sw.js")) === "skip", "sw.js skipped");
  ok(route(R("https://gcfoeaxxeerqixaistaf.supabase.co/rest/v1/user_account?select=*")) === "skip", "Supabase REST GET skipped");
  ok(route(R("https://gcfoeaxxeerqixaistaf.supabase.co/rest/v1/rpc/x", { method: "POST" })) === "skip", "POST skipped");
  ok(route(R("https://raw.githubusercontent.com/x/1.png", { destination: "image" })) === "cache-first", "CDN image → cache-first");
  ok(route(R("https://raw.githubusercontent.com/x/data.json")) === "skip", "CDN fetch() json (no destination) skipped");
  ok(route(R("chrome-extension://abc/x.js")) === "skip", "non-http skipped (Rule 10)");

  const D = load("localhost");
  ok(D.ctx.__swRoute(R("https://localhost/app/js/app.js?v=" + D.ctx.__ver)) === "network-first", "localhost: versioned stays network-first");

  /* networkFirst：慢網 3 秒後用 cache */
  P.store.set(O + "index.html", new Response("cached-index"));
  P.setFetch(() => new Promise(r => setTimeout(() => r(new Response("slow-net")), 4500)));
  let t0 = Date.now();
  let res = await P.ctx.__nf(R(O, { mode: "navigate" }), O, "./index.html");
  let dt = Date.now() - t0;
  ok((await res.text()) === "cached-index" && dt >= 2900 && dt < 4000, "slow network → cache after ~3s (" + dt + "ms)");

  /* 快網：直接用網絡 */
  P.setFetch(async () => new Response("fresh"));
  res = await P.ctx.__nf(R(O, { mode: "navigate" }), O, "./index.html");
  ok((await res.text()) === "fresh", "fast network → network response");

  /* 離線：即刻 cache */
  P.setFetch(async () => { throw new TypeError("offline"); });
  t0 = Date.now();
  res = await P.ctx.__nf(R(O + "index.html?x=1", { mode: "navigate" }), O, "./index.html");
  ok((await res.text()) === "cached-index" && Date.now() - t0 < 500, "offline → cache immediately");

  /* 離線＋冇 cache：Response.error，唔好 hang */
  P.setFetch(async () => { throw new TypeError("offline"); });
  res = await P.ctx.__nf(R(O + "data/none.json"), O + "data/none.json");
  ok(res.type === "error", "offline + no cache → network error response (no hang)");

  /* 慢網但冇 cache：等網絡 */
  P.setFetch(() => new Promise(r => setTimeout(() => r(new Response("late")), 3500)));
  res = await P.ctx.__nf(R(O + "data/late.json"), O + "data/late.json");
  ok((await res.text()) === "late", "slow network + no cache → wait for network");

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
