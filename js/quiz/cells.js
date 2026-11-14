/* ============================================================
   PokeEngmon - Quiz：逐字格（建格、量闊度、輸入、轉綠、清格）
   由 js/quiz.js 拆出（總計劃 P2.5；Rule 116）。同 js/quiz.js 共用同一個 Quiz 物件：
   Object.assign 只係將方法掛返上去，this／Quiz.xxx 用法完全唔變。
   載入次序：js/quiz.js 之後（index.html）。
   ============================================================ */

Object.assign(Quiz, {
  /* 空格資料：primary 答案 split 空白；accept 只有同字數先納入逐格比對 */
  _buildCells(q) {
    const primaryRaw = q.type === "word" ? String(q.word || "") : String(q.answer || "");
    const trimmed = primaryRaw.trim();
    const tokens = trimmed ? trimmed.split(/\s+/) : [];
    if (tokens.length === 0) tokens.push("");   // 空答案 → 1 格留空

    const variants = (q.type === "word" ? [] : (q.accept || [])).map(v => String(v).trim()).filter(Boolean);

    return tokens.map((t, i) => {
      const accepted = new Set([this._norm(t)]);
      variants.forEach(v => {
        const parts = v.split(/\s+/);
        if (parts.length === tokens.length && parts[i]) accepted.add(this._norm(parts[i]));
      });
      return {
        primary: t,
        tokens: [...accepted],
        value: "",
        green: false,
        ghost: "",
        empty: t === "",
        hintLevel: 0,
        hintLetters: 0,
        tries: 0,
        cellEl: null,
        textEl: null,
        ghostEl: null,
        input: null
      };
    });
  },

  _renderCells(q) {
    const host = document.getElementById("quiz-sentence");
    host.innerHTML = "";

    if (q.type !== "word" && q.sentence) {
      host.classList.remove("word-blank-line");
      const idx = q.sentence.indexOf("___");
      const pre = idx >= 0 ? q.sentence.slice(0, idx) : q.sentence;
      const post = idx >= 0 ? q.sentence.slice(idx + 3) : "";
      if (pre) host.appendChild(document.createTextNode(pre));
      this.cells.forEach((c, i) => host.appendChild(this._makeCell(c, i)));
      if (post) host.appendChild(document.createTextNode(post));
    } else {
      /* 圖片單字題：卡身只放空格 */
      host.classList.add("word-blank-line");
      this.cells.forEach((c, i) => host.appendChild(this._makeCell(c, i)));
    }

    /* 格寬＝答案文字實際寬度，令用戶可以從寬度推算要填幾長 */
    this.cells.forEach(c => {
      c.baseWidth = this._isHardTed()
        ? this._oneLetterWidth()
        : (c.empty ? 92 : Math.max(40, Math.ceil(this._measureText(c.primary)) + 20));
      this._syncCellWidth(c, "");
    });
  },

  /* 用隱藏探針量度文字實際寬度（同 qb-text 同字型） */
  _measureText(text) {
    const host = document.getElementById("quiz-sentence") || document.body;
    const probe = document.createElement("span");
    probe.className = "qb-text";
    probe.textContent = String(text || "");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre";
    host.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  },

  _isHardTed() {
    return this.mode === "ted" && this._tedPlay === "hard";
  },

  /* 困難：所有空格一開始同闊，只夠一個字母，不按答案長短分開。 */
  _oneLetterWidth() {
    return Math.max(40, Math.ceil(this._measureText("n")) + 20);
  },

  /* 容易的開頭字母。3 個字母以上兩個；1 或 2 個字母只給第一個。 */
  _easyLead(word) {
    if (globalThis.TedWorld && TedWorld.easyLead) return TedWorld.easyLead(word);
    const s = String(word || "");
    if (!s) return "";
    return s.length <= 2 ? s.slice(0, 1) : s.slice(0, 2);
  },

  /* 預填開頭，不觸發答對、不計提示。 */
  _seedEasyCells() {
    (this.cells || []).forEach(c => {
      if (!c || c.empty) return;
      const lead = this._easyLead(c.primary);
      c.value = lead;
      if (c.input) c.input.value = lead;
      if (c.textEl) c.textEl.textContent = lead;
      c.ghost = "";
      this._applyGhost(c);
      this._syncCellWidth(c, lead);
    });
    const a = this.queue && this.queue[0] ? this._answerFor(this.queue[0].q) : null;
    if (a) a.hintCount = 0;
  },

  /* 格寬：最少要容納已輸入文字；超出答案長度時自動加寬。
     困難模式只跟已輸入文字，提示 ghost 不參與闊度。 */
  _syncCellWidth(c, typed) {
    if (!c || !c.cellEl) return;
    const typedStr = typed == null ? (c.value || "") : String(typed);
    const hard = this._isHardTed();
    const text = hard ? typedStr : typedStr + (c.ghost || "");
    const pad = 20;
    const need = text ? Math.ceil(this._measureText(text)) + pad : 0;
    const one = hard ? this._oneLetterWidth() : 0;
    const min = hard ? one : (c.empty ? 92 : 40);
    const base = hard ? one : (c.baseWidth || 0);
    const target = Math.max(min, base, need);
    c.cellEl.style.width = target + "px";
  },

  _makeCell(c, i) {
    const span = document.createElement("span");
    span.className = "qb-cell" + (c.empty ? " empty-answer" : "");
    span.dataset.i = String(i);

    const ghost = document.createElement("span");
    ghost.className = "qb-ghost";
    const text = document.createElement("span");
    text.className = "qb-text";
    const input = document.createElement("input");
    input.className = "qb-input";
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.autocorrect = "off";
    input.spellcheck = false;
    input.dataset.i = String(i);
    /* 觸控裝置：抑制系統鍵盤，改用 App 自帶鍵盤（桌面保持實體鍵盤輸入） */
    if (this._isTouchDevice()) {
      input.inputMode = "none";
      input.enterKeyHint = "done";
    }

    span.appendChild(text);
    span.appendChild(ghost);
    span.appendChild(input);

    c.cellEl = span;
    c.ghostEl = ghost;
    c.textEl = text;
    c.input = input;

    input.addEventListener("input", () => this._onInput(i));
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (this.answered) this.next();
      else this.check();
    });
    input.addEventListener("focus", () => {
      /* 只准焦點落喺當前格 */
      if (i !== this.currentCell) this._focusCurrent();
    });
    span.addEventListener("click", () => this._focusCurrent());

    return span;
  },

  _focusCurrent() {
    if (this.answered) return;
    this.cells.forEach((c, i) => {
      if (c.input) c.input.disabled = (i !== this.currentCell) || c.green;
    });
    const c = this.cells[this.currentCell];
    if (!c || !c.input || c.input.disabled) return;
    const go = () => { try { c.input.focus({ preventScroll: true }); } catch (e) { try { c.input.focus(); } catch (e2) {} } };
    go();
    requestAnimationFrame(() => { go(); setTimeout(go, 50); });
  },

  /* ---------- 輸入 / 提示 ---------- */
  /* 比對用：去頭尾空白、細階、合併空格；彎／修飾撇號（’ ‘ ʼ，系統鍵盤「智慧型標點」會打出）當直撇號 '（Rule 112）。
     逐個字元替換，長度唔變（提示前綴同小學生 ghost 用 index 比對）。 */
  _norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ").replace(/[\u2018\u2019\u02BC]/g, "'");
  },

  _cellMatch(c, val) {
    return c.tokens.indexOf(val) >= 0;
  },

  _applyGhost(c) {
    if (!c.ghostEl) return;
    c.ghostEl.textContent = c.ghost || "";
    /* ghost 可以接喺已輸入文字之後（L1 提示下一組字母） */
    c.ghostEl.style.display = c.ghost ? "" : "none";
  },

  _onInput(i) {
    if (this.answered) return;
    const c = this.cells[i];
    if (!c) return;

    c.value = c.input.value;
    c.textEl.textContent = c.value;
    /* 一打字就收返紅色「再試」回饋 */
    this._clearBadState();

    const val = this._norm(c.value);
    /* 打任何字（含退格）都收起全部答案框的提示。已用過的 L1／L2 進度不重置。 */
    if (this._dismissVisibleHints) this._dismissVisibleHints();
    /* 打多過答案長度 → 格自動加寬 */
    this._syncCellWidth(c, c.value);

    if (val !== "" && this._cellMatch(c, val)) this._greenCell(i);
    this._syncCheckBtn();
  },

  _greenCell(i) {
    const c = this.cells[i];
    if (!c || c.green) return;
    c.green = true;
    c.cellEl.classList.add("good");
    if (c.input) c.input.disabled = true;

    const next = this.cells.findIndex(x => !x.green);
    if (next === -1) {
      this._complete();
    } else {
      this.currentCell = next;
      this._vibrate(8);
      this._focusCurrent();
      if (this._paintHintBadge) this._paintHintBadge();
    }
    this._syncCheckBtn();
  },

  /* 震動（提示 ghost 仍在 / 錯誤）*/
  _vibrate(ms) { haptic(ms || 40); },

  /* 提示字母數：仲要輸入 5 個或以下 → 1 個；6 個或以上 → 2 個 */
  _hintCount(rest) {
    return rest <= 5 ? 1 : 2;
  },

  _clearCell(c) {
    c.value = "";
    c.ghost = "";
    if (c.input) c.input.value = "";
    c.textEl.textContent = "";
    this._applyGhost(c);
  }
});
