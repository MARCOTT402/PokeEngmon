/* ============================================================
   PokeEngmon - 錯題視覺化解釋
   句子顯示 + 關鍵詞黃底 + 空位淺藍 + SVG 彎曲箭咀 + 短解釋
   ============================================================ */

const Explain = {
  /**
   * 在 container 內渲染一個錯題解釋卡
   * @param {HTMLElement} container
   * @param {object} q  題目物件（句子題／圖片題通用）
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
      (chosen ? `<span class="explain-wrong">You answered: ${escapeHTML(chosen)}</span>` : "") +
      `<span class="explain-right">Answer: ${escapeHTML(q.answer) || "(blank)"}</span>`;
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

  /* 關鍵詞解析：可用 / 分隔多個；每個尾部嘅 (註解) 會被忽略 */
  _keywords(q) {
    const kw = q.explain && q.explain.keyword;
    if (!kw) return [];
    return String(kw).split("/")
      .map(s => s.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim())
      .filter(Boolean);
  },

  /* 句子 HTML：___ → 藍色空位；關鍵詞（可多個）→ 黃色底（不分大小寫） */
  _buildSentenceHTML(q) {
    let html = escapeHTML(q.sentence);
    html = html.replace(/___/, "\u0001");
    const kws = this._keywords(q);
    if (kws.length) {
      const lower = html.toLowerCase();
      const ranges = [];
      kws.forEach(k => {
        const esc = escapeHTML(k);          /* 與句子同一套 escape 先比對到（撇號等） */
        const i = lower.indexOf(esc.toLowerCase());
        if (i !== -1 && !ranges.some(([s, e]) => i < e && s < i + esc.length)) {
          ranges.push([i, i + esc.length]);
        }
      });
      ranges.sort((a, b) => a[0] - b[0]);
      for (let i = ranges.length - 1; i >= 0; i--) {
        const [s, e] = ranges[i];
        html = html.slice(0, s) +
          `<span class="ex-keyword">` + html.slice(s, e) + `</span>` +
          html.slice(e);
      }
    }
    return html.replace(/\u0001/, `<span class="ex-blank">&nbsp;___&nbsp;</span>`);
  },

  /* 揀最接近目標 x 嘅文字 fragment：關鍵詞換行嗰陣 getBoundingClientRect 會俾成舖 union rect，起點會指錯位 */
  _nearestFragment(el, targetX) {
    const rects = [...el.getClientRects()];
    if (rects.length <= 1) return el.getBoundingClientRect();
    let best = rects[0], bestD = Infinity;
    rects.forEach(r => {
      const d = Math.abs(r.left + r.width / 2 - targetX);
      if (d < bestD) { bestD = d; best = r; }
    });
    return best;
  },

  /* 由每個關鍵詞畫彎曲箭咀去空位（多個關鍵詞 → 多條箭咀） */
  _drawArrow(wrap, sent, svg) {
    const blank = sent.querySelector(".ex-blank");
    const kws = [...sent.querySelectorAll(".ex-keyword")];
    if (!blank || kws.length === 0) { svg.innerHTML = ""; return; }

    const wRect = wrap.getBoundingClientRect();
    const b = blank.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const y2 = b.top - wRect.top - 3;

    const paths = kws.map((kw, i) => {
      const k = this._nearestFragment(kw, bx);
      const x1 = k.left + k.width / 2 - wRect.left;
      const y1 = k.top - wRect.top - 3;
      /* 多條箭咀喺空位度散開啲，唔會疊埋一齊 */
      const lx = b.left + b.width / 2 - wRect.left + (i - (kws.length - 1) / 2) * 10;
      const peak = Math.min(y1, y2) - 26;
      const path = `M ${x1} ${y1} C ${x1} ${peak}, ${lx} ${peak}, ${lx} ${y2}`;
      return `<path d="${path}" fill="none" stroke="#ff8a00" stroke-width="4"
               stroke-linecap="round" marker-end="url(#arrow-head)"
               stroke-dasharray="600" stroke-dashoffset="600">
         <animate attributeName="stroke-dashoffset" from="600" to="0"
                  dur="0.7s" begin="${(i * 0.12).toFixed(2)}s" fill="freeze"/>
       </path>`;
    }).join("");

    const w = wRect.width, h = wRect.height;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.width = w + "px";
    svg.style.height = h + "px";

    svg.innerHTML =
      `<defs>
         <marker id="arrow-head" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
           <polygon points="0 0, 7 3.5, 0 7" fill="#ff8a00"/>
         </marker>
       </defs>` + paths;
  }
};

/* HTML escape（全域小工具） */
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
