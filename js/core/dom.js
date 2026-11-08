// @ts-check
/* ============================================================
   PokeEngmon - 共用 DOM 小工具（全域）
   - escapeHTML：全 App 唯一嘅 HTML escape。任何用戶／server 字串（訓練員名、好友名、自訂題、題目句子）
     砌入 innerHTML／屬性之前都要經佢，而且只可以 escape 一次。
   - haptic：震動回饋；唔支援或者被瀏覽器擋（未有用戶手勢）都唔會 throw。
   喺 guard.js 之後、所有模組之前載入（index.html），所以任何檔都可以直接用。
   ============================================================ */

const _HTML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHTML(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => _HTML_ESC[c]);
}

function haptic(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 唔支援／未有用戶手勢 */ }
}

/* ES module 過渡期（總計劃 P2.3；Rule 119）：index.html 用 type="module" 載入，頂層名唔會自動變全域 → 明確掛上 globalThis，classic script 照用 */
Object.assign(globalThis, { escapeHTML, haptic });
