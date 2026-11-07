// @ts-check
/* ============================================================
   PokeEngmon - html`` tagged template（全域；Rule 111）
   用法：
     Html.render(el, html`<li class="row">${name}<small>${note}</small></li>`);
     const rows = list.map(x => html`<li>${x.name}</li>`);   // 陣列直接放入 ${rows}
     html`<div>${Html.raw(trustedMarkup)}</div>`              // 明確標記可信 HTML 先唔 escape
   規則：
   - 字串 → escapeHTML（js/core/dom.js，全 App 唯一嘅 escape）；數字照出；null／undefined／false → 空。
   - html`` 嘅結果係 SafeHTML，放入另一個 html`` 唔會再 escape（唔會雙重 escape）。
   - 屬性值一定要加引號：value="${x}"。escape 擋唔到 href="javascript:…"，URL 要自己檢查。
   - 函數入面已經有局部變數叫 html 嘅（例如 let html = ""），會遮住呢個 tag；嗰度照舊用 escapeHTML。
   新 code 一律用；舊 innerHTML 改到先順手換，唔做大搬遷。
   ============================================================ */

/** 已經安全（escape 過或者明確可信）嘅 HTML 字串 */
class SafeHTML {
  /** @param {string} value */
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function _htmlPart(v) {
  if (v instanceof SafeHTML) return v.value;
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.map(_htmlPart).join("");
  return escapeHTML(v);
}

/**
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {SafeHTML}
 */
function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += _htmlPart(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}

const Html = {
  /** 明確標記可信 HTML（唔會 escape）：只用喺自己砌、冇用戶／server 字串嘅 markup
   * @param {string} markup */
  raw(markup) { return new SafeHTML(String(markup == null ? "" : markup)); },

  /** @param {unknown} v */
  isSafe(v) { return v instanceof SafeHTML; },

  /** 將 html`` 結果寫入元素；傳普通字串會當純文字 escape。元素唔存在就乜都唔做。
   * @template {{ innerHTML: string } | null | undefined} T
   * @param {T} el
   * @param {unknown} tpl
   * @returns {T} */
  render(el, tpl) {
    if (el) el.innerHTML = _htmlPart(tpl);
    return el;
  }
};
