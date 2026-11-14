// @ts-check
/* ============================================================
   PokeEngmon Guard — 全域錯誤邊界（stability-performance plan §2）
   ------------------------------------------------------------
   - 第一個載入嘅 script（喺 supabase-config.js 之前），唔依賴任何其他模組
   - window error／unhandledrejection／<script> 載入失敗 → ErrorLog（本地 ring buffer）＋上報 Supabase
   - 致命（開機失敗）→ #fatal-screen（index.html 內聯樣式，CSS 載唔到都顯示到）
   - 答題／捕捉／對戰中出錯 → #guard-recover 卡：Continue／Back to Home（保證唔會卡死喺鎖住嘅畫面）
   - Helpers：safe／safeAsync／busy／num／clamp／posDim／safeJSON
   Rule 94（pokeengmon-workflow）
   ============================================================ */
(function () {
  "use strict";

  const LOG_KEY = "pokeengmon_errlog_v1";       /* 本地 ring buffer（最近 50 筆） */
  const PEND_KEY = "pokeengmon_errlog_pending_v1"; /* 未上報（離線／失敗）排隊 */
  const MAX_LOG = 50;
  const MAX_PENDING = 30;
  const DEDUPE_MS = 60 * 1000;
  const TOAST_GAP_MS = 10 * 1000;
  const RECOVER_GAP_MS = 30 * 1000;
  const TOAST_MSG = "Something went wrong — please try again.";

  /* Safari 多指縮放會發 gesture*。只擋這類事件，不聽 touchmove，單指捲動不受影響。
     iOS「輔助使用 > 縮放」與部分瀏覽器選單縮放無法由網頁關掉。 */
  function blockGestureZoom(e) {
    if (e.cancelable) e.preventDefault();
  }
  document.addEventListener("gesturestart", blockGestureZoom, { passive: false });
  document.addEventListener("gesturechange", blockGestureZoom, { passive: false });

  const version = (() => {
    try {
      const s = document.currentScript && /** @type {HTMLScriptElement} */ (document.currentScript).src;
      const m = s && s.match(/[?&]v=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : "dev";
    } catch (e) { return "dev"; }
  })();

  /* ---------- 數值／JSON helpers（防 NaN／undefined） ---------- */
  function num(v, fallback) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }
  function clamp(v, min, max, fallback) {
    const n = num(v, fallback === undefined ? min : fallback);
    return Math.min(max, Math.max(min, n));
  }
  /* 幾何尺寸：必須 > 0，否則 fallback（避免除 0／scale(0)） */
  function posDim(v, fallback) {
    const n = num(v, NaN);
    return n > 0 ? n : (fallback === undefined ? 1 : fallback);
  }
  function safeJSON(raw, fallback) {
    if (raw === null || raw === undefined || raw === "") return fallback;
    try {
      const v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) { return fallback; }
  }

  /* ---------- localStorage（全部包 try：私密模式／quota 滿都唔可以 throw） ---------- */
  function lsGet(k, fb) { try { return safeJSON(localStorage.getItem(k), fb); } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- ErrorLog ---------- */
  const _recent = new Map();   /* message → 上次記錄時間（去重） */
  let _lastToast = 0;
  let _lastRecover = 0;

  function currentView() {
    try {
      const v = document.querySelector(".view.active:not(#view-home)") || document.querySelector(".view.active");
      return v ? v.id : "";
    } catch (e) { return ""; }
  }
  function shortUA() {
    try {
      const ua = navigator.userAgent || "";
      const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : "other";
      const br = /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "other";
      const pwa = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || /** @type {any} */ (navigator).standalone ? " pwa" : "";
      return `${os} ${br}${pwa} ${innerWidth}x${innerHeight}`.slice(0, 120);
    } catch (e) { return ""; }
  }

  function normalize(err) {
    if (err instanceof Error || (err && typeof err === "object" && ("message" in err || "stack" in err))) {
      return {
        name: String(err.name || "Error"),
        message: String(err.message || err.name || "Unknown error"),
        stack: String(err.stack || "")
      };
    }
    if (err && typeof err === "object") {
      let s = ""; try { s = JSON.stringify(err); } catch (e) { s = String(err); }
      return { name: "Object", message: s, stack: "" };
    }
    return { name: typeof err, message: String(err), stack: "" };
  }

  /* 唔值得報／唔係我哋 code 嘅錯 */
  function isNoise(n, kind) {
    const m = n.message || "";
    if (/ResizeObserver loop/.test(m)) return true;
    if (/chrome-extension:|moz-extension:|safari-extension:/.test(n.stack + m)) return true;
    if (kind === "rejection" && /^(NotAllowedError|AbortError)$/.test(n.name)) return true; /* audio.play 被擋／fetch 取消 */
    if (/play\(\) (request|failed)|user didn't interact/i.test(m)) return true;
    return false;
  }
  /* 只記錄，唔彈 toast（例如 DOMException 類、跨域 Script error） */
  function isQuiet(n) {
    /* NetError：Net 層已經按類型彈過 toast（Rule 96），呢度唔再彈 */
    return /^(NotSupportedError|NotFoundError|SecurityError|QuotaExceededError|NetError)$/.test(n.name) || n.message === "Script error.";
  }

  function report(err, ctx) {
    ctx = ctx || {};
    const kind = ctx.kind || "error";
    let n;
    try { n = normalize(err); } catch (e) { n = { name: "Error", message: "unserializable", stack: "" }; }
    if (isNoise(n, kind)) return null;
    const key = kind + "|" + n.message;
    const now = Date.now();
    if (_recent.has(key) && now - _recent.get(key) < DEDUPE_MS) return null;
    _recent.set(key, now);
    if (_recent.size > 100) _recent.delete(_recent.keys().next().value);

    const entry = {
      t: now,
      v: version,
      view: currentView(),
      kind,
      where: String(ctx.where || "").slice(0, 60),
      msg: (n.name && n.name !== "Error" ? n.name + ": " : "") + n.message.slice(0, 300),
      stack: n.stack.split("\n").slice(0, 6).join("\n").slice(0, 1000),
      ua: shortUA()
    };
    const log = lsGet(LOG_KEY, []);
    log.push(entry);
    lsSet(LOG_KEY, Array.isArray(log) ? log.slice(-MAX_LOG) : [entry]);
    try { console.warn("[Guard]", kind, entry.where || "", entry.msg); } catch (e) {}
    queueUpload(entry);

    if (!ctx.silent && !isQuiet(n)) {
      /* 鎖住畫面（答題／捕捉／對戰）＋程式錯（同步 throw，或 async 嘅 TypeError 類）→ 恢復卡，確保可以返主頁 */
      const progErr = kind === "error" || /^(TypeError|ReferenceError|RangeError|SyntaxError)$/.test(n.name);
      if (progErr && isLockedScreen()) showRecover();
      else if (ctx.toast !== false) toast(TOAST_MSG);
    }
    return entry;
  }

  function toast(msg) {
    const now = Date.now();
    if (now - _lastToast < TOAST_GAP_MS) return;
    _lastToast = now;
    try {
      if (window.App && typeof App.toast === "function") { App.toast(msg); return; }
      const t = document.getElementById("toast");
      if (t) { t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }
    } catch (e) {}
  }

  /* ---------- 上報 Supabase（log_client_error RPC；有限流，server 再限流） ---------- */
  let _uploadTimer = null;
  let _uploading = false;
  function queueUpload(entry) {
    const pend = lsGet(PEND_KEY, []);
    const list = Array.isArray(pend) ? pend : [];
    list.push(entry);
    lsSet(PEND_KEY, list.slice(-MAX_PENDING));
    scheduleUpload(4000);
  }
  function scheduleUpload(ms) {
    if (_uploadTimer) return;
    _uploadTimer = setTimeout(() => { _uploadTimer = null; flushUploads(); }, ms);
  }
  function deviceId() {
    try {
      const st = safeJSON(localStorage.getItem("pokeengmon_state_v1"), null);
      return st && st.device_id ? String(st.device_id).slice(0, 64) : "";
    } catch (e) { return ""; }
  }
  async function flushUploads(useKeepalive) {
    if (_uploading) return;
    const cfg = window.SUPABASE_CONFIG;
    if (!cfg || !cfg.restUrl || !cfg.anonKey) return;
    if (navigator.onLine === false) return;
    if (!/^https?:/.test(location.protocol)) return;
    /* 本地開發唔好污染正式 client_errors；要測上報先設 localStorage pokeengmon_errlog_force_upload=1 */
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$|\.test$/.test(location.hostname);
    if (isLocal) { let force = null; try { force = localStorage.getItem("pokeengmon_errlog_force_upload"); } catch (e) {} if (force !== "1") return; }
    const pend = lsGet(PEND_KEY, []);
    if (!Array.isArray(pend) || !pend.length) return;
    _uploading = true;
    const batch = pend.slice(0, 10);
    let token = cfg.anonKey;
    try { if (window.SupabaseAuth && SupabaseAuth.currentToken) token = SupabaseAuth.currentToken() || token; } catch (e) {}
    let ok = false;
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
      const res = await fetch(cfg.restUrl + "/rpc/log_client_errors", {
        method: "POST",
        headers: { apikey: cfg.anonKey, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ p_device_id: deviceId(), p_rows: batch }),
        keepalive: !!useKeepalive,
        signal: ctrl ? ctrl.signal : undefined
      });
      if (timer) clearTimeout(timer);
      /* 2xx＝收咗；4xx（例如被限流、RPC 未部署）＝唔再重試呢批，免得無限排隊 */
      ok = res.ok || (res.status >= 400 && res.status < 500);
    } catch (e) { ok = false; }
    _uploading = false;
    if (ok) {
      const rest = lsGet(PEND_KEY, []);
      lsSet(PEND_KEY, Array.isArray(rest) ? rest.slice(batch.length) : []);
      if (Array.isArray(rest) && rest.length > batch.length) scheduleUpload(2000);
    }
  }
  window.addEventListener("online", () => scheduleUpload(1500));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushUploads(true);
  });

  /* ---------- 鎖住畫面（答題／捕捉／對戰）恢復卡 ---------- */
  function isLockedScreen() {
    try {
      if (window.App && App._frameLocked) return true;
      return !!document.querySelector("#view-quiz.active, #view-capture.active, #view-battle.active");
    } catch (e) { return false; }
  }
  function showRecover() {
    const now = Date.now();
    if (now - _lastRecover < RECOVER_GAP_MS) return;
    _lastRecover = now;
    const card = document.getElementById("guard-recover");
    if (!card) { toast(TOAST_MSG); return; }
    card.hidden = false;
  }
  function hideRecover() {
    const card = document.getElementById("guard-recover");
    if (card) card.hidden = true;
  }
  /* 返主頁：showView 本身壞咗都要行得通（手動拆 class＋解鎖） */
  function goHome() {
    hideRecover();
    /* BattleLand／Quiz 係 top-level const（唔喺 window），要用 typeof 判斷 */
    try { if (typeof BattleLand !== "undefined" && BattleLand.isActive && BattleLand.isActive()) BattleLand.exit(); } catch (e) {}
    try { if (typeof Quiz !== "undefined" && Quiz._stopPhysics) Quiz._stopPhysics(); } catch (e) {}
    try {
      App.showView("view-home");
      if (App.renderHome) App.renderHome();
      return;
    } catch (e) { report(e, { where: "goHome", silent: true }); }
    try {
      document.querySelectorAll(".view.active").forEach(v => v.classList.remove("active"));
      const home = document.getElementById("view-home");
      if (home) home.classList.add("active");
      document.body.classList.remove("capture-mode");
      if (window.App && App._setFrameLock) App._setFrameLock(false);
      if (window.App && App._setSettleLock) App._setSettleLock(false);
    } catch (e) { location.reload(); }
  }

  /* ---------- 致命錯誤畫面 ---------- */
  let _fatalShown = false;
  function fatal(reason, err) {
    if (err) report(err, { kind: "boot", where: reason, silent: true });
    if (_fatalShown) return;
    _fatalShown = true;
    const el = document.getElementById("fatal-screen");
    const ld = document.getElementById("loading-screen");
    if (ld) ld.remove();
    if (!el) { try { alert("System busy — please refresh the page."); } catch (e) {} return; }
    el.hidden = false;
    try { /** @type {HTMLElement} */ (el.querySelector("#fatal-retry")).focus(); } catch (e) {}
  }
  /* 修復：清 Service Worker＋Cache Storage（唔掂 localStorage 存檔），再 reload */
  async function repair() {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => {})));
      }
    } catch (e) {}
    try {
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
      }
    } catch (e) {}
    location.reload();
  }

  /* ---------- 包裝 helpers ---------- */
  function safe(where, fn, fallback) {
    try { return fn(); }
    catch (e) { report(e, { where }); return fallback; }
  }
  async function safeAsync(where, fn, fallback) {
    try { return await fn(); }
    catch (e) { report(e, { where, kind: "rejection" }); return fallback; }
  }
  /* async 掣：disable → await → finally 一定 re-enable；出錯 toast（修 S9） */
  /* 完成後還原「撳之前」嘅 disabled 狀態（唔係硬設 false）；handler 入面唔好再用 btn.disabled 判斷重複撳 */
  async function busy(btn, fn, where) {
    if (btn && btn.dataset && btn.dataset.guardBusy === "1") return undefined;
    const prev = btn ? !!btn.disabled : false;
    if (btn) { btn.dataset.guardBusy = "1"; btn.disabled = true; btn.setAttribute("aria-busy", "true"); }
    try { return await fn(); }
    catch (e) {
      _lastToast = 0; /* 用戶主動撳掣出錯一定要見到提示 */
      report(e, { where: where || (btn && btn.id) || "busy", kind: "rejection" });
      return undefined;
    } finally {
      if (btn) { delete btn.dataset.guardBusy; btn.disabled = prev; btn.removeAttribute("aria-busy"); }
    }
  }
  /* onclick 包裝：currentTarget 係掣就 busy 鎖住；係容器（事件委派）就只捕錯 */
  function asyncClick(fn, where) {
    return function (ev) {
      const t = ev && ev.currentTarget;
      const btn = t && (t.tagName === "BUTTON" || t.tagName === "INPUT") ? t : null;
      return busy(btn, () => fn.call(this, ev), where);
    };
  }

  /* ---------- 冪等 GET：timeout＋重試（核心資料檔用；POST／RPC 唔好用，防重複寫入） ---------- */
  async function fetchGet(url, init, opt) {
    opt = opt || {};
    const tries = Math.max(1, opt.tries || 3);
    const timeout = opt.timeout || 15000;
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, i === 1 ? 500 : 1500));
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
      try {
        const res = await fetch(url, Object.assign({}, init || {}, ctrl ? { signal: ctrl.signal } : {}));
        if (timer) clearTimeout(timer);
        if (res.ok) return res;
        lastErr = new Error("HTTP " + res.status + " " + url);
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break; /* 404 重試都冇用 */
      } catch (e) {
        if (timer) clearTimeout(timer);
        lastErr = e && e.name === "AbortError" ? new Error("Timeout " + url) : e;
      }
    }
    throw lastErr || new Error("fetch failed " + url);
  }

  /* ---------- 全域監聽 ---------- */
  const _failedScripts = [];
  window.addEventListener("error", (e) => {
    const t = /** @type {any} */ (e && e.target);
    /* 資源載入失敗（capture 階段先收到）：只理 <script>；圖片 404 由各自 onerror 處理 */
    if (t && t !== window && t.tagName) {
      if (t.tagName === "SCRIPT") {
        const src = String(t.src || "").replace(location.origin, "");
        _failedScripts.push(src);
        report(new Error("Script failed to load: " + src), { kind: "boot", where: "script", silent: true });
      }
      return;
    }
    report(e.error || new Error(e.message || "Script error."), { kind: "error", where: e.filename ? String(e.filename).replace(location.origin, "") + ":" + e.lineno : "" });
  }, true);
  window.addEventListener("unhandledrejection", (e) => {
    report(e.reason, { kind: "rejection" });
  });

  /* 核心 script 冇載到（App／題庫函數唔存在）→ 致命畫面 */
  window.addEventListener("load", () => {
    setTimeout(() => {
      const missing = typeof window.App === "undefined" || typeof window.loadSiteQuestions !== "function";
      if (missing) fatal("core-missing", new Error("Core scripts missing: " + (_failedScripts.join(", ") || "unknown")));
    }, 0);
  });

  /* 兜底畫面／恢復卡嘅掣（DOM 喺 index.html，script 喺 head 之後先有元素 → DOMContentLoaded 先綁） */
  document.addEventListener("DOMContentLoaded", () => {
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener("click", fn); };
    on("fatal-retry", () => location.reload());
    on("fatal-repair", () => repair());
    on("guard-recover-continue", () => hideRecover());
    on("guard-recover-home", () => goHome());
  });

  window.Guard = {
    version, report, fatal, repair, goHome, safe, safeAsync, busy, asyncClick, toast, fetchGet,
    num, clamp, posDim, safeJSON,
    log: () => lsGet(LOG_KEY, []),
    clearLog: () => { lsSet(LOG_KEY, []); lsSet(PEND_KEY, []); },
    flush: () => flushUploads(false)
  };
})();
