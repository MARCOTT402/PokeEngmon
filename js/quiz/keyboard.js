/* ============================================================
   PokeEngmon - Quiz：App 內置鍵盤（觸控裝置、快打；Rule 107）
   由 js/quiz.js 拆出（總計劃 P2.5；Rule 116）。同 js/quiz.js 共用同一個 Quiz 物件：
   Object.assign 只係將方法掛返上去，this／Quiz.xxx 用法完全唔變。
   載入次序：js/quiz.js 之後（index.html）。
   ============================================================ */

Object.assign(Quiz, {
  /* ============ App 自帶虛擬鍵盤（觸控裝置專用） ============
     規則：觸控裝置（手機／平板）固定顯示；桌面（實體鍵盤）完全隱藏。 */
  _isTouchDevice() {
    try { return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); }
    catch (e) { return false; }
  },

  _buildKeyboard() {
    const host = document.getElementById("quiz-keyboard");
    if (!host || host.dataset.built) return;
    host.dataset.built = "3";
    /* 版面（用戶指定）：
       頂部工具列：左＝查看提示、右＝語音模式
       3 行 QWERTY；第 3 行左 ' 、右 ⌫；底行 123 ／ space ／ ✓ Submit（答完變 Next） */
    const LETTERS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    const mk = (label, cls, data) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "qk-key" + (cls ? " " + cls : "");
      b.textContent = label;
      Object.keys(data || {}).forEach(k => { b.dataset[k] = data[k]; });
      return b;
    };
    const spacer = () => { const sp = document.createElement("span"); sp.className = "qk-spacer"; return sp; };

    const tools = document.createElement("div");
    tools.className = "qk-tools";
    tools.innerHTML = `
      <button type="button" class="qk-tool" id="qk-hint" data-kb="hint">
        <span class="qk-tool-ic" aria-hidden="true">?</span><span class="qk-tool-lb">Hint</span>
        <span class="qt-count" id="qk-hint-count" hidden></span>
      </button>
      <span class="qk-tools-gap"></span>
      <button type="button" class="qk-tool" id="qk-voice" data-kb="voice" disabled title="Voice mode — coming soon">
        <svg class="qk-tool-mic" viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        <span class="qk-tool-lb">Voice mode</span>
      </button>`;
    host.appendChild(tools);

    LETTERS.forEach((row, ri) => {
      const r = document.createElement("div");
      r.className = "qk-row";
      if (ri === 1) r.appendChild(spacer());
      if (ri === 2) r.appendChild(mk("'", "qk-fn qk-side", { ch: "'", alt: "1" }));
      [...row].forEach(ch => r.appendChild(mk(ch, "", { ch })));
      if (ri === 1) r.appendChild(spacer());
      if (ri === 2) {
        const back = mk("⌫", "qk-fn qk-side", { kb: "back" });
        back.setAttribute("aria-label", "Delete");
        r.appendChild(back);
      }
      host.appendChild(r);
    });
    const last = document.createElement("div");
    last.className = "qk-row qk-row-last";
    const num = mk("123", "qk-fn qk-wide", { kb: "num" });
    num.setAttribute("aria-label", "Numbers");
    const go = mk("", "qk-fn qk-wide qk-go", { kb: "go" });
    go.id = "qk-go";
    go.innerHTML = `<span class="qk-go-ic" aria-hidden="true">✓</span><span class="qk-go-lb">Submit</span>`;
    last.append(num, mk("space", "qk-space", { ch: " " }), go);
    host.appendChild(last);

    /* 123 ↔ ABC：第一行換數字；第 3 行左鍵 ' ↔ - */
    const toggleNum = () => {
      const on = host.dataset.num !== "1";
      host.dataset.num = on ? "1" : "";
      const firstRow = host.querySelectorAll(".qk-row")[0].querySelectorAll(".qk-key");
      firstRow.forEach((k, i) => {
        const ch = on ? "1234567890"[i] : LETTERS[0][i];
        k.dataset.ch = ch;
        k.textContent = ch;
      });
      const alt = host.querySelector('[data-alt="1"]');
      if (alt) { alt.dataset.ch = on ? "-" : "'"; alt.textContent = alt.dataset.ch; }
      num.textContent = on ? "ABC" : "123";
    };

    /* 按鍵動作。字母／⌫／123 喺 pointerdown 即時生效（Rule 107）：
       快打時兩隻手指重疊，第二隻係非 primary pointer → 瀏覽器唔發 click，甚至連第一隻嘅 click 都取消，
       靠 click 會成串食字。Submit／Hint 等「放手先算」（同一 pointer 喺同一粒鍵放手），防誤觸。 */
    const run = (key) => {
      const kb = key.dataset.kb;
      if (kb === "num") { toggleNum(); return; }
      if (kb === "go") { if (this.answered) this.next(); else this.check(); return; }
      if (kb === "hint") { this.hint(); return; }
      if (kb === "voice") return;
      if (this.answered) return;
      if (kb === "back") this._kbBackspace();
      else this._kbInsert(key.dataset.ch || "");
      this._focusCurrent();
    };
    const onRelease = (key) => key.dataset.kb === "go" || key.classList.contains("qk-tool");
    const pending = new Map();   /* pointerId → 放手先算嘅鍵 */

    /* pointerdown preventDefault：保留輸入格焦點，亦阻止系統鍵盤彈出；字母鍵出放大預覽 */
    const clearKey = (k) => {
      k.classList.remove("down");
      const bub = k.querySelector(".qk-bubble");
      if (bub) bub.remove();
    };
    const clearDown = () => host.querySelectorAll(".down").forEach(clearKey);
    host.addEventListener("pointerdown", (e) => {
      const key = e.target.closest(".qk-key, .qk-tool");
      if (!key) return;
      e.preventDefault();
      if (e.button > 0) return;
      clearDown();
      if (key.disabled) return;
      key.classList.add("down");
      if (key.dataset.ch && key.dataset.ch !== " " && !key.classList.contains("qk-fn")) {
        const bub = document.createElement("span");
        bub.className = "qk-bubble";
        bub.textContent = key.dataset.ch;
        key.appendChild(bub);
      }
      this._vibrate(5);
      if (onRelease(key)) pending.set(e.pointerId, key);
      else run(key);
    });
    host.addEventListener("pointerup", (e) => {
      const key = pending.get(e.pointerId);
      pending.delete(e.pointerId);
      clearDown();
      const under = e.target && e.target.closest ? e.target.closest(".qk-key, .qk-tool") : null;
      if (key && under === key && !key.disabled) run(key);
    });
    host.addEventListener("pointercancel", (e) => { pending.delete(e.pointerId); clearDown(); });
    host.addEventListener("pointerleave", clearDown);
    /* click 只處理鍵盤／輔助技術觸發（detail === 0，例如 Tab 到鍵再撳 Enter）；指標觸發已喺 pointer 事件做咗 */
    host.addEventListener("click", (e) => {
      const key = e.target.closest(".qk-key, .qk-tool");
      if (!key || key.disabled || e.detail !== 0) return;
      run(key);
    });
  },

  /* 只喺觸控裝置顯示；捕捉模式（精靈球）唔需要鍵盤 */
  _syncKeyboard() {
    const host = document.getElementById("quiz-keyboard");
    if (!host) return;
    const view = document.getElementById("view-quiz");
    if (!this._isTouchDevice() || this._isCatchMode()) {
      host.hidden = true;
      if (view) view.classList.remove("kb-on");
      return;
    }
    this._buildKeyboard();
    host.hidden = false;
    if (view) view.classList.add("kb-on");
  },

  _kbInsert(ch) {
    const c = this.cells[this.currentCell];
    if (!c || !c.input || c.input.disabled || !ch) return;
    c.input.value = (c.input.value || "") + ch;
    c.input.dispatchEvent(new Event("input", { bubbles: true }));
  },

  _kbBackspace() {
    const c = this.cells[this.currentCell];
    if (!c || !c.input || c.input.disabled) return;
    c.input.value = (c.input.value || "").slice(0, -1);
    c.input.dispatchEvent(new Event("input", { bubbles: true }));
  }
});
