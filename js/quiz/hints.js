/* ============================================================
   PokeEngmon - Quiz：提示（L1／L2、初級鬼影字）
   由 js/quiz.js 拆出（總計劃 P2.5；Rule 116）。同 js/quiz.js 共用同一個 Quiz 物件：
   Object.assign 只係將方法掛返上去，this／Quiz.xxx 用法完全唔變。
   載入次序：js/quiz.js 之後（index.html）。
   ============================================================ */

Object.assign(Quiz, {
  /* 小學生模式：生成「提示字母 + 分開嘅下劃線」ghost
     prefixLen: 已正確輸入嘅前綴長度
     hintLetters: L1 揭示咗嘅字母數量（固定，唔會隨輸入增加）；0 = L2 模式
     每個字母嘅底線分開顯示（用空格隔開），等用戶可以數到有幾多個字母 */
  _juniorGhost(c, prefixLen, hintLetters) {
    const ans = String(c.primary || "");
    const len = ans.length;
    const start = Math.min(prefixLen, len);
    let ghost = "";
    if (hintLetters > 0) {
      /* L1：只顯示最初揭示嗰幾個字母嘅剩餘部分，之後全部係底線 */
      const revealed = Math.min(hintLetters, len);
      if (start < revealed) {
        ghost = ans.slice(start, revealed);
      }
      const underscoreCount = Math.max(0, len - Math.max(start, revealed));
      if (underscoreCount > 0) {
        ghost = (ghost ? ghost + " " : "") + Array(underscoreCount).fill("_").join(" ");
      }
    } else {
      /* L2 後：只顯示剩餘下劃線，每個字母分開 */
      const underscoreCount = Math.max(0, len - start);
      if (underscoreCount > 0) ghost = Array(underscoreCount).fill("_").join(" ");
    }
    return ghost;
  },

  /* L1：揭示前 k 個字母（固定數量，唔會隨輸入增加）
     小學生模式：提示字母 + 分開嘅下劃線 */
  _showL1(c, prefixLen) {
    const ans = String(c.primary || "");
    const a = this._answerFor(this.queue[0] && this.queue[0].q);
    if (a) {
      a.hintLetters = this._hintCount(Math.max(0, ans.length)); /* 固定揭示字母數 */
    }
    if (this._isJunior()) {
      c.ghost = this._juniorGhost(c, prefixLen, a ? a.hintLetters : 0);
    } else {
      const rest = Math.max(0, ans.length - prefixLen);
      const k = this._hintCount(rest);
      c.ghost = ans.slice(prefixLen, prefixLen + k);
    }
    this._applyGhost(c);
    this._syncCellWidth(c, c.value);
    this._focusCurrent();
  },

  /* L2：清空該格，直接顯示整個答案做提示
     小學生模式：顯示整個答案，但一輸入就變成下劃線（hintLetters=0）*/
  _showL2(c) {
    const a = this._answerFor(this.queue[0] && this.queue[0].q);
    if (a) a.hintLetters = 0;
    this._clearCell(c);
    c.ghost = String(c.primary || "");
    this._applyGhost(c);
    this._syncCellWidth(c, "");
    this._focusCurrent();
  },

  hint() {
    if (this.answered) return;
    const item = this.queue[0];
    if (!item) return;
    const a = this._answerFor(item.q);
    const c = this.cells[this.currentCell];
    if (!c) return;

    /* 精靈球捕捉模式：L1 拿走一個錯球；再按一次 L2 正確球變大師球 */
    if (this._isCatchMode() && this._physBalls && this._physBalls.length) {
      const usedCatch = Number(a.hintCount) || 0;
      if (usedCatch >= 1) {
        a.hintCount = 2;
        this._catchL2();
      } else {
        a.hintCount = 1;
        this._catchL1();
      }
      this._hintUI(a.hintCount);
      return;
    }

    if (c.empty) { this._vibrate(20); return; }

    /* 同一條題用過一次提示之後，再按一律當第 2 次 → 直接出 L2 */
    const used = Number(a.hintCount) || 0;
    if (used >= 1) {
      a.hintCount = 2;
      this._showL2(c);
      this._hintUI(2);
      return;
    }

    /* 第 1 次：L1；已輸入唔係正確前綴就先清空 */
    a.hintCount = 1;
    const ans = this._norm(c.primary);
    const val = this._norm(c.value);
    const isPrefix = val.length <= ans.length && ans.indexOf(val) === 0;
    if (val && !isPrefix) this._clearCell(c);
    this._showL1(c, val && isPrefix ? val.length : 0);
    this._hintUI(1);
  },

  /* 提示後：底部黃色說明 + 計數 + combo 歸零（同一題用過提示會重排） */
  _hintUI(level) {
    const cnt = document.getElementById("quiz-hint-count");
    if (cnt) { cnt.hidden = false; cnt.textContent = level >= 2 ? "2/2" : "1/2"; }
    const btn = document.getElementById("btn-quiz-hint");
    if (btn) btn.disabled = level >= 2;
    this.cells.forEach(x => { if (x.cellEl) x.cellEl.classList.remove("badc"); });
    this._setCombo(0);
    const catchMode = this._isCatchMode();
    this._setAction("hinted", "💡",
      level >= 2 ? (catchMode ? "Grab the Master Ball!" : "Here's the full answer") : (catchMode ? "One wrong ball is gone" : "Here's a head start"),
      this.queue.length > 1 ? "This one will come back later in the set." : "");
    this._syncCheckBtn();
  }
});
