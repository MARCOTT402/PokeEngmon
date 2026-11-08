// @ts-check
/* ============================================================
   PokeEngmon - Store（總計劃 P2.1；Rule 115）
   包住 js/storage.js 嘅本地存檔，畀新 code 一個統一入口：
     Store.get()                 → 成個 state（同 loadState() 同一個物件）
     Store.select("diamonds")    → 讀一個頂層欄位
     Store.update(st => { … })   → 改完自動 saveState()（照用 150ms 合併寫入，Rule 102）；
                                   { now: true } 即刻落 localStorage
     Store.subscribe("diamonds", (value, state) => …) → 個欄位變咗就通知；回傳 unsubscribe
     Store.subscribe("*", fn)    → 每次存檔批次都通知一次
   規則：
   - 舊 code 直接改 loadState() 再 saveState() 一樣會觸發通知（storage.js saveState 會叫 Store._changed）。
     所以唔使一次過改晒 91 處 call site；新 code 用 Store，舊 code 改到先順手換。
   - 同一輪（同步 code）入面幾多次 save 都只會通知一次，攞到最後嘅值。
   - 只會比較有人訂閱嘅頂層欄位（JSON 簽名），冇訂閱就零成本。
   - 訂閱者 throw 唔會影響其他訂閱者（經 Guard.report）。
   載入次序：storage.js 之後。
   ============================================================ */

const Store = (() => {
  /** @type {Map<string, Set<Function>>} */
  const subs = new Map();
  /** @type {Map<string, string>} 頂層欄位 → 上次通知時嘅 JSON 簽名 */
  const sigs = new Map();
  let pending = false;

  /** @param {unknown} v */
  const sig = (v) => { try { return JSON.stringify(v) ?? "undefined"; } catch (e) { return String(Math.random()); } };

  /** @param {Function} fn @param {unknown[]} args */
  function safeCall(fn, args) {
    try { fn(...args); } catch (e) {
      try { if (window.Guard) Guard.report(e, { where: "Store.subscribe", silent: true }); } catch (x) { /* ignore */ }
    }
  }

  function flush() {
    pending = false;
    const st = loadState();
    for (const [key, set] of subs) {
      if (!set.size) continue;
      if (key === "*") { [...set].forEach((fn) => safeCall(fn, [st, st])); continue; }
      const now = sig(st[key]);
      if (now === sigs.get(key)) continue;
      sigs.set(key, now);
      [...set].forEach((fn) => safeCall(fn, [st[key], st]));
    }
  }

  return {
    get() { return loadState(); },

    /** @param {string} key */
    select(key) { return loadState()[key]; },

    /**
     * @template T
     * @param {(state: any) => T} fn
     * @param {{ now?: boolean }} [opt]
     * @returns {T}
     */
    update(fn, opt) {
      const result = fn(loadState());
      saveState(opt);
      return result;
    },

    /**
     * @param {string} key  頂層欄位名，或者 "*"
     * @param {(value: any, state: any) => void} fn
     * @returns {() => void} unsubscribe
     */
    subscribe(key, fn) {
      if (!subs.has(key)) subs.set(key, new Set());
      /** @type {Set<Function>} */ (subs.get(key)).add(fn);
      if (key !== "*" && !sigs.has(key)) sigs.set(key, sig(loadState()[key]));
      return () => { const s = subs.get(key); if (s) s.delete(fn); };
    },

    /** storage.js saveState() 每次都會叫：同一輪合併做一次通知 */
    _changed() {
      if (pending || !subs.size) return;
      pending = true;
      queueMicrotask(flush);
    }
  };
})();

/* ES module 過渡期（總計劃 P2.3；Rule 119）：index.html 用 type="module" 載入，頂層名唔會自動變全域 → 明確掛上 globalThis，classic script 照用 */
Object.assign(globalThis, { Store });
