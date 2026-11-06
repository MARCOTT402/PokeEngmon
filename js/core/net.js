/* ============================================================
   PokeEngmon Net — 統一網絡層（stability-performance plan §3.1；Rule 96）
   ------------------------------------------------------------
   - Net.request(url, init, opt)：AbortController timeout、離線即刻 fail、錯誤分類
     opt.timeout（ms，預設 12000）／opt.quiet（唔彈 toast）／opt.where（記錄用）
     成功回傳原生 Response（status 由 caller 自己處理 → 唔改現有 code 嘅分支）
     失敗 throw NetError（.kind = offline｜timeout｜network；message 以 "Network" 開頭，
     app.js _authError 會對應成「Can't reach the server…」）
   - 5xx 都算網絡問題（彈 toast），4xx 係業務錯誤，唔彈
   - toast：同類 20 秒內一次；離線中唔逐個 request 彈（離線／返回線上各彈一次）
   - 唔做自動重試：POST／RPC 重試會重複發獎勵（Rule 5）；GET 重試用 Guard.fetchGet
   ============================================================ */
(function () {
  "use strict";

  const MSG = {
    timeout: "Connection problem — please try again.",
    network: "Connection problem — please try again.",
    server: "Server is busy — please try again soon.",
    offline: "You're offline — progress is saved on this device.",
    online: "Back online."
  };
  const GAP_MS = 20 * 1000;
  const _last = {};

  class NetError extends Error {
    constructor(kind, message, status) {
      super(message);
      this.name = "NetError";
      this.kind = kind;
      this.status = status || 0;
    }
  }

  function isOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function toast(kind) {
    const now = Date.now();
    if (_last[kind] && now - _last[kind] < GAP_MS) return;
    _last[kind] = now;
    if (document.visibilityState === "hidden") return;
    try {
      if (window.App && typeof App.toast === "function") App.toast(MSG[kind] || MSG.network);
    } catch (e) {}
  }

  function notify(kind, detail, quiet) {
    try { document.dispatchEvent(new CustomEvent("pe:net-error", { detail: Object.assign({ kind }, detail || {}) })); } catch (e) {}
    if (!quiet && !isOffline()) toast(kind);
  }

  async function request(url, init, opt) {
    init = init || {};
    opt = opt || {};
    const timeout = opt.timeout || 12000;
    const where = opt.where || String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0].slice(0, 60);
    if (isOffline()) {
      notify("offline", { where }, true);
      throw new NetError("offline", "Network offline: " + where);
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timedOut = false;
    const timer = ctrl ? setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout) : null;
    /* caller 自己有 signal（例如離開畫面取消）→ 一齊聽 */
    if (ctrl && init.signal) {
      if (init.signal.aborted) ctrl.abort();
      else init.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    let res;
    try {
      res = await fetch(url, Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {}));
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        notify("timeout", { where }, opt.quiet);
        throw new NetError("timeout", "Network timeout after " + Math.round(timeout / 1000) + "s: " + where);
      }
      if (e && e.name === "AbortError") throw e;           /* caller 主動取消：照原樣拋，唔當網絡錯 */
      const kind = isOffline() ? "offline" : "network";
      notify(kind, { where }, opt.quiet);
      throw new NetError(kind, "Network error: " + where + (e && e.message ? " (" + e.message + ")" : ""));
    }
    if (timer) clearTimeout(timer);
    if (res.status >= 500) notify("server", { where, status: res.status }, opt.quiet);
    return res;
  }

  /* 離線 pill（#net-offline，index.html；Rule 98）：離線期間常駐右上角，返回線上收起 */
  function syncPill() {
    const el = document.getElementById("net-offline");
    if (el) el.hidden = !isOffline();
  }
  window.addEventListener("offline", () => { _last.online = 0; syncPill(); toast("offline"); });
  window.addEventListener("online", () => { _last.offline = 0; syncPill(); toast("online"); });
  document.addEventListener("DOMContentLoaded", syncPill);

  window.Net = { request, NetError, isOffline, notify, syncPill, MSG };
})();
