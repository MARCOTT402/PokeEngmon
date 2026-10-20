/* ============================================================
   PokeEngmon - 錯題視覺化解釋
   句子顯示 + 關鍵詞黃底 + 空位淺藍 + SVG 彎曲箭咀 + 短解釋
   ============================================================ */

const Explain = {
  /**
   * 在 container 內渲染一個錯題解釋卡
   * @param {HTMLElement} container
   * @param {object} q  題目物件（QUESTION_BANK 項目）
   * @param {string|null} chosen  學生揀錯嘅選項（null 則只顯示答案）
   */
  render(container, q, chosen) {
    const card = document.createElement("div");
    card.className = "explain-card";

    /* --- 句子（含高亮 + SVG 箭咀） --- */
    const sentBox = document.createElement("div");
    sentBox.className = "explain-sentence-wrap";
    const sent = document.createElement("div");
    sent.className = "explain-sentence";
    sent.innerHTML = this._buildSentenceHTML(q);
    sentBox.appendChild(sent);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("explain-svg");
    sentBox.appendChild(svg);

    card.appendChild(sentBox);

    /* --- 對錯摘要 --- */
    const answerLine = document.createElement("div");
    answerLine.className = "explain-answer-line";
    answerLine.innerHTML =
      (chosen ? `<span class="explain-wrong">你答咗：${escapeHTML(chosen)}</span>` : "") +
      `<span class="explain-right">答案：${escapeHTML(q.answer)}</span>`;
    card.appendChild(answerLine);

    /* --- 短解釋（冇提示就唔顯示） --- */
    if (q.explain && q.explain.hint) {
      const hint = document.createElement("div");
      hint.className = "explain-hint";
      hint.textContent = "💡 " + q.explain.hint;
      card.appendChild(hint);
    }

    container.appendChild(card);

    /* 等版面排好先畫箭咀 */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._drawArrow(sentBox, sent, svg));
    });
    window.addEventListener("resize", () => this._drawArrow(sentBox, sent, svg));
  },

  /* 句子 HTML：___ → 藍色空位；keyword → 黃色底（不分大小寫） */
  _buildSentenceHTML(q) {
    let html = escapeHTML(q.sentence);
    html = html.replace(/___/, `<span class="ex-blank">&nbsp;___&nbsp;</span>`);
    const kw = q.explain.keyword;
    if (kw) {
      const esc = escapeHTML(kw);
      const lower = html.toLowerCase();
      const idx = lower.indexOf(esc.toLowerCase());
      if (idx !== -1) {
        html = html.slice(0, idx) +
          `<span class="ex-keyword">` + html.slice(idx, idx + esc.length) + `</span>` +
          html.slice(idx + esc.length);
      }
    }
    return html;
  },

  /* 由關鍵詞畫彎曲箭咀去空位 */
  _drawArrow(wrap, sent, svg) {
    const kw = sent.querySelector(".ex-keyword");
    const blank = sent.querySelector(".ex-blank");
    if (!kw || !blank) { svg.innerHTML = ""; return; }

    const wRect = wrap.getBoundingClientRect();
    const k = kw.getBoundingClientRect();
    const b = blank.getBoundingClientRect();

    const x1 = k.left + k.width / 2 - wRect.left;
    const y1 = k.top - wRect.top - 3;
    const x2 = b.left + b.width / 2 - wRect.left;
    const y2 = b.top - wRect.top - 3;

    const w = wRect.width, h = wRect.height;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.width = w + "px";
    svg.style.height = h + "px";

    const peak = Math.min(y1, y2) - 26;   // 箭咀拱頂
    const midX = (x1 + x2) / 2;
    const path = `M ${x1} ${y1} C ${x1} ${peak}, ${x2} ${peak}, ${x2} ${y2}`;

    svg.innerHTML =
      `<defs>
         <marker id="arrow-head" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
           <polygon points="0 0, 7 3.5, 0 7" fill="#ff8a00"/>
         </marker>
       </defs>
       <path d="${path}" fill="none" stroke="#ff8a00" stroke-width="4"
             stroke-linecap="round" marker-end="url(#arrow-head)"
             stroke-dasharray="600" stroke-dashoffset="600">
         <animate attributeName="stroke-dashoffset" from="600" to="0" dur="0.7s" fill="freeze"/>
       </path>`;
  }
};

/* HTML escape（全域小工具） */
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
