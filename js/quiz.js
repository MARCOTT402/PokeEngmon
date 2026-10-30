/* ============================================================
   PokeEngmon - 做題流程（v2：句子內逐詞空格）
   10 題一組 · 逐格自動轉綠 · L1/L2 提示 · 同回合重排 · SM-2 v3
   ============================================================ */

const Quiz = {
  set: [],            // 初始題目（固定分母）
  queue: [],          // 工作佇列：{ q, requeued, dueAt }
  total: 0,
  seenQids: new Set(),
  answers: new Map(), // key → { hintCount, hintEver, clean, chosen }
  cells: [],
  currentCell: 0,
  answered: false,
  mode: null,             /* null | "gym" */
  gymMilestone: 0,
  startTime: 0,
  _curCard: null,
  _curQuestionStart: 0,
  _wordToken: 0,
  _imgToken: 0,

  /* topics: 揀咗嘅題型（空陣列＝全部）；圖片單字題會混合抽 */
  start(topics) {
    this.mode = null;
    this.gymMilestone = 0;
    const set = drawMixedSet(GAME_CONFIG.SET_SIZE, topics);
    if (set.length === 0) {
      App.showModal(`
        <div class="confirm-box">
          <p>🎉 <b>All caught up!</b><br>
            <small>You've finished every available question in this topic.<br>
            Reviews unlock as they come due — take a break and come back tomorrow,<br>
            or pick another course to keep training.</small></p>
          <div class="confirm-row">
            <button id="caughtup-ok" class="btn-big btn-primary">OK</button>
          </div>
        </div>`, true);
      document.getElementById("caughtup-ok").onclick = () => App.closeModal();
      return;
    }
    if (set.length < GAME_CONFIG.SET_SIZE) {
      App.toast(`Only ${set.length} question${set.length > 1 ? "s" : ""} left here — pick more courses next round for a full set!`);
    }
    this._begin(set);
  },

  /* Gym：全題庫隨機 10 題 */
  startGym(milestone) {
    const all = (typeof getAllQuestions === "function" ? getAllQuestions() : []).slice();
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = all[i]; all[i] = all[j]; all[j] = t;
    }
    const set = all.slice(0, GAME_CONFIG.SET_SIZE);
    if (set.length === 0) {
      App.toast("No questions available for Gym Challenge.");
      return;
    }
    this.mode = "gym";
    this.gymMilestone = milestone || 0;
    this._begin(set);
  },

  _begin(set) {
    this.set = set;
    this.total = set.length;
    this.queue = set.map(q => ({ q, requeued: false, dueAt: 0 }));
    this.seenQids = new Set();
    this.answers = new Map();
    this.cells = [];
    this.currentCell = 0;
    this.answered = false;
    this.startTime = Date.now();
    App.showView("view-quiz");
    this._renderQuestion();
  },

  /* ---------- 題目 key ---------- */
  _key(q) {
    if (q.type === "word") return "w:" + String(q.word || "").toLowerCase();
    return `${q.no || ""}|${q.sentence || ""}|${q.answer || ""}`;
  },

  _answerFor(q) {
    const k = this._key(q);
    if (!this.answers.has(k)) {
      this.answers.set(k, { hintCount: 0, hintEver: false, clean: false, chosen: "", attemptCount: 0, correctCount: 0 });
    }
    return this.answers.get(k);
  },

  /* 小學生模式？*/
  _isJunior() {
    try { return SM2.getMode() === "junior"; } catch (e) { return false; }
  },

  /* ---------- 進度 ---------- */
  _updateProgress() {
    const shown = this.answered
      ? this.seenQids.size
      : Math.min(this.total, this.seenQids.size + 1);
    document.getElementById("quiz-progress").textContent = `${shown} / ${this.total}`;
    const pct = this.total ? (this.seenQids.size / this.total) * 100 : 0;
    document.getElementById("quiz-bar").style.width = `${pct}%`;
    const star = document.getElementById("quiz-bar-star");
    if (star) star.style.left = `${pct}%`;
  },

  /* ---------- 渲染 ---------- */
  _renderQuestion() {
    const item = this.queue[0];
    if (!item) { this.finish(); return; }
    const q = item.q;

    this.answered = false;
    this.currentCell = 0;
    this._curQuestionStart = Date.now();
    this._curCard = SM2.getOrCreateCard(q);
    const wordToken = (this._wordToken = (this._wordToken || 0) + 1);

    /* 每次出現都係新一次提示計算（hintEver 保留，clean 保留）*/
    const a = this._answerFor(q);
    a.hintCount = 0;
    a.chosen = "";
    a.attemptCount = 0;   /* 每次重現重置 attempt；correctCount 保留用於防循環 */

    this._updateProgress();

    /* 題目卡只顯示英文句子；圖片題保留 word card */
    const wordCard = document.getElementById("quiz-word-card");
    const isWord = q.type === "word";
    const cardEl = document.getElementById("quiz-card");
    const imageBox = document.getElementById("quiz-image-box");

    /* 圖片題：清走上一題殘留嘅句子圖 */
    if (!isWord) {
      imageBox.classList.remove("show");
      document.getElementById("quiz-image").removeAttribute("src");
    }
    cardEl.classList.remove("memory-glow", "bad");
    clearTimeout(this._wrongTimer);
    cardEl.style.display = "";
    this.toggleCardDrawer(false);

    if (isWord) {
      wordCard.classList.add("show");
      const img = document.getElementById("quiz-word-image");
      img.onerror = () => { img.onerror = null; img.src = "icons/icon-192.png"; };
      img.src = q.image;
      document.getElementById("quiz-word-status").textContent = "🔊 Tap the picture to hear the word";
      document.getElementById("quiz-word-status").className = "word-status";
      this._autoPlayWord(wordToken);
    } else {
      wordCard.classList.remove("show");
      wordCard.classList.remove("correct", "wrong");
    }

    /* 圖片（句子題專用）*/
    this._renderImage(q);

    /* 空格格數＝第一個答案寫法嘅字數 */
    this.cells = this._buildCells(q);
    this._renderCells(q);

    /* 工具列／確認 */
    document.getElementById("quiz-toolbar-before").classList.remove("hidden");
    document.getElementById("quiz-toolbar-after").classList.add("hidden");
    document.getElementById("btn-quiz-check").classList.remove("hidden");
    document.getElementById("quiz-feedback").textContent = "";
    document.getElementById("quiz-feedback").className = "quiz-feedback";

    /* Chip：未答前顯示實際經過時間 */
    this._renderChip(q, null);

    /* 小學生低 EF → 精靈球捕捉模式 */
    this._setupCatchMode(q);

    this._focusCurrent();
  },

  /* 空格資料：primary 答案 split 空白；accept 只有同字數先納入逐格比對 */
  _buildCells(q) {
    const primaryRaw = q.type === "word" ? String(q.word || "") : String(q.answer || "");
    const trimmed = primaryRaw.trim();
    const tokens = trimmed ? trimmed.split(/\s+/) : [];
    if (tokens.length === 0) tokens.push("");   // 空答案 → 1 格留空

    const variants = (q.type === "word" ? [] : (q.accept || [])).map(v => String(v).trim()).filter(Boolean);

    return tokens.map((t, i) => {
      const accepted = new Set([t.toLowerCase()]);
      variants.forEach(v => {
        const parts = v.split(/\s+/);
        if (parts.length === tokens.length && parts[i]) accepted.add(parts[i].toLowerCase());
      });
      return {
        primary: t,
        tokens: [...accepted],
        value: "",
        green: false,
        ghost: "",
        empty: t === "",
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
      c.baseWidth = c.empty ? 92 : Math.max(40, Math.ceil(this._measureText(c.primary)) + 20);
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

  /* 格寬：最少要容納已輸入文字；超出答案長度時自動加寬 */
  _syncCellWidth(c, typed) {
    if (!c || !c.cellEl) return;
    const text = (typed == null ? (c.value || "") : String(typed)) + (c.ghost || "");
    const pad = 20;
    const need = text ? Math.ceil(this._measureText(text)) + pad : 0;
    const min = c.empty ? 92 : 40;
    const target = Math.max(min, c.baseWidth || 0, need);
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
  _norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
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

    const junior = this._isJunior();
    const a = this._answerFor(this.queue[0] && this.queue[0].q);
    const ans = this._norm(c.primary);
    const val = this._norm(c.value);

    if (junior) {
      /* 小學生模式：ghost 唔消失，按正確前綴重算
         L1（hintCount===1）：顯示提示字母 + 下劃線
         L2（hintCount>=2）：只顯示下劃線 */
      const isPrefix = val.length <= ans.length && ans.indexOf(val) === 0;
      const prefixLen = isPrefix ? val.length : 0;
      if (a.hintCount >= 2) {
        c.ghost = this._juniorGhost(c, prefixLen, false);
      } else if (a.hintCount === 1) {
        c.ghost = this._juniorGhost(c, prefixLen, true);
      } else {
        c.ghost = "";
      }
      this._applyGhost(c);
    } else {
      /* 打字後 ghost 消失 */
      if (c.ghost) {
        c.ghost = "";
        this._applyGhost(c);
      }
    }
    /* 打多過答案長度 → 格自動加寬 */
    this._syncCellWidth(c, c.value);

    if (val !== "" && this._cellMatch(c, val)) this._greenCell(i);
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
      this._focusCurrent();
    }
  },

  /* 震動（提示 ghost 仍在 / 錯誤）*/
  _vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 40); } catch (e) {}
  },

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
  },

  /* 小學生模式：生成「提示字母 + 下劃線」ghost
     prefixLen: 已正確輸入嘅前綴長度
     showHintLetters: true=L1（顯示提示字母）、false=L2（只顯示下劃線）*/
  _juniorGhost(c, prefixLen, showHintLetters) {
    const ans = String(c.primary || "");
    const len = ans.length;
    const start = Math.min(prefixLen, len);
    let ghost = "";
    if (showHintLetters) {
      const rest = Math.max(0, len - start);
      const k = this._hintCount(rest);
      ghost = ans.slice(start, start + k);
      const underscoreCount = Math.max(0, len - start - k);
      if (underscoreCount > 0) ghost += "_".repeat(underscoreCount);
    } else {
      /* L2 後：只顯示剩餘下劃線，唔顯示提示字母 */
      ghost = "_".repeat(Math.max(0, len - start));
    }
    return ghost;
  },

  /* L1：接住已輸入前綴之後，顯示下一組提示字母（ghost）
     小學生模式：提示字母 + 下劃線 */
  _showL1(c, prefixLen) {
    const ans = String(c.primary || "");
    if (this._isJunior()) {
      c.ghost = this._juniorGhost(c, prefixLen, true);
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
     小學生模式：顯示整個答案，但一輸入就變成下劃線 */
  _showL2(c) {
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

    if (c.empty) { this._vibrate(20); return; }

    /* 同一條題用過一次提示之後，再按一律當第 2 次 → 直接出 L2 */
    const used = Number(a.hintCount) || 0;
    if (used >= 1) {
      a.hintCount = 2;
      this._showL2(c);
      return;
    }

    /* 第 1 次：L1；已輸入唔係正確前綴就先清空 */
    a.hintCount = 1;
    const ans = this._norm(c.primary);
    const val = this._norm(c.value);
    const isPrefix = val.length <= ans.length && ans.indexOf(val) === 0;
    if (val && !isPrefix) this._clearCell(c);
    this._showL1(c, val && isPrefix ? val.length : 0);
  },

  /* ============ 小學生低 EF 精靈球捕捉模式 ============ */
  _catchThreshold: 1.8,

  _isCatchMode() {
    if (!this._isJunior()) return false;
    const ef = Number(this._curCard && this._curCard.ease_factor);
    return ef > 0 && ef < this._catchThreshold;
  },

  _setupCatchMode(q) {
    const area = document.getElementById("quiz-catch-area");
    const ballsHost = document.getElementById("catch-balls");
    if (!area || !ballsHost) return;

    /* 預設隱藏捕捉區，恢復輸入 */
    area.classList.add("hidden");
    ballsHost.innerHTML = "";
    this.cells.forEach(c => {
      if (c.cellEl) c.cellEl.classList.remove("catch-target");
      if (c.input) c.input.disabled = false;
    });
    document.getElementById("quiz-toolbar-before").classList.remove("hidden");
    document.getElementById("btn-quiz-check").classList.remove("hidden");

    if (!this._isCatchMode()) return;

    /* 進入捕捉模式：隱藏鍵盤輸入，顯示精靈球 */
    area.classList.remove("hidden");
    this.cells.forEach(c => {
      if (c.cellEl) c.cellEl.classList.add("catch-target");
      if (c.input) c.input.disabled = true;
    });
    document.getElementById("quiz-toolbar-before").classList.add("hidden");
    document.getElementById("btn-quiz-check").classList.add("hidden");

    const correctAns = this._norm(q.type === "word" ? q.word : q.answer);
    const distractors = this._pickDistractors(q, correctAns, 3);
    const options = [correctAns, ...distractors].sort(() => Math.random() - 0.5);

    options.forEach(ans => {
      const ball = this._makeCatchBall(ans, ans === correctAns);
      ballsHost.appendChild(ball);
    });
  },

  /* 多空格題：答啱一格後，用下一格答案刷新精靈球 */
  _refreshCatchBalls() {
    const ballsHost = document.getElementById("catch-balls");
    const item = this.queue[0];
    if (!ballsHost || !item) return;
    const c = this.cells[this.currentCell];
    if (!c) return;
    const correctAns = this._norm(c.primary);
    const distractors = this._pickDistractors(item.q, correctAns, 3);
    const options = [correctAns, ...distractors].sort(() => Math.random() - 0.5);
    ballsHost.innerHTML = "";
    options.forEach(ans => {
      ballsHost.appendChild(this._makeCatchBall(ans, ans === correctAns));
    });
    /* 移除黃光提示（新一格重新開始）*/
    this.cells.forEach(cc => {
      if (cc.cellEl) cc.cellEl.classList.remove("catch-target");
    });
    if (c.cellEl) c.cellEl.classList.add("catch-target");
  },

  /* 從同課題其他題目抽 3 個唔同嘅錯誤答案做干擾項 */
  _pickDistractors(q, correct, n) {
    const all = (typeof getAllQuestions === "function") ? getAllQuestions() : [];
    const sameTopic = all.filter(x => x && x.topic === q.topic && x !== q);
    const pool = [];
    sameTopic.forEach(x => {
      const a = this._norm(x.type === "word" ? x.word : x.answer);
      if (a && a !== correct && pool.indexOf(a) < 0) pool.push(a);
    });
    /* 唔夠就從全題庫補 */
    if (pool.length < n) {
      all.forEach(x => {
        const a = this._norm(x.type === "word" ? x.word : x.answer);
        if (a && a !== correct && pool.indexOf(a) < 0) pool.push(a);
      });
    }
    /* Fisher-Yates 抽 n 個 */
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  },

  _makeCatchBall(answer, isCorrect) {
    const ball = document.createElement("div");
    ball.className = "catch-ball";
    ball.dataset.answer = answer;
    ball.dataset.correct = isCorrect ? "1" : "0";

    const label = document.createElement("span");
    label.className = "catch-ball-label";
    label.textContent = answer;
    ball.appendChild(label);

    ball.addEventListener("pointerdown", (e) => this._onBallDown(e, ball));
    return ball;
  },

  _onBallDown(e, ball) {
    if (this.answered) return;
    e.preventDefault();
    ball.classList.add("dragging");
    const rect = ball.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    ball.style.position = "fixed";
    ball.style.left = rect.left + "px";
    ball.style.top = rect.top + "px";
    ball.style.width = rect.width + "px";
    ball.style.height = rect.height + "px";

    const onMove = (ev) => {
      ball.style.left = (ev.clientX - offX) + "px";
      ball.style.top = (ev.clientY - offY) + "px";
    };
    const onUp = (ev) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      ball.classList.remove("dragging");
      this._onBallUp(ev, ball);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  },

  _onBallUp(e, ball) {
    /* 還原位置（如果冇命中）*/
    const host = ball.parentElement;
    ball.style.position = "";
    ball.style.left = "";
    ball.style.top = "";
    ball.style.width = "";
    ball.style.height = "";

    /* 偵測是否打中當前空格 */
    const target = this.cells[this.currentCell];
    if (!target || !target.cellEl) return;
    const tr = target.cellEl.getBoundingClientRect();
    const bx = e.clientX, by = e.clientY;
    const hit = bx >= tr.left && bx <= tr.right && by >= tr.top && by <= tr.bottom;

    if (hit) {
      this._catchSubmit(ball.dataset.answer, ball.dataset.correct === "1");
    }
  },

  /* 捕捉模式提交：打中就當 Submit 處理 */
  _catchSubmit(answer, isCorrect) {
    const item = this.queue[0];
    if (!item || this.answered) return;
    const q = item.q;
    const a = this._answerFor(q);

    if (isCorrect) {
      /* 答啱：填入答案 → green → 如有下一格就刷新精靈球 */
      const c = this.cells[this.currentCell];
      if (c) {
        c.value = answer;
        if (c.input) c.input.value = answer;
        if (c.textEl) c.textEl.textContent = answer;
      }
      const prevCell = this.currentCell;
      this._greenCell(this.currentCell);
      /* 仲有下一格 → 用下一格答案重新生成精靈球 */
      if (this.currentCell !== prevCell && !this.answered) {
        this._refreshCatchBalls();
      }
    } else {
      /* 答錯：沿用 junior attempt 邏輯 */
      a.attemptCount++;
      if (a.attemptCount === 2) {
        /* 第 2 次錯：L1 — 正確球發黃光 */
        a.hintCount = 1;
        this._highlightCorrectBall();
      } else if (a.attemptCount >= 4) {
        /* 第 4 次或以後錯：L2 — 正確球發黃光 */
        a.hintCount = 2;
        this._highlightCorrectBall();
      }
      /* 第 1、3 次錯：靜默，畀再試 */
      this._vibrate(50);
    }
  },

  /* L1/L2 提示：將正確球用黃光包住 */
  _highlightCorrectBall() {
    document.querySelectorAll(".catch-ball").forEach(b => {
      if (b.dataset.correct === "1") b.classList.add("hint-glow");
    });
  },

  /* 完整答案變體（處理 accept 同 primary 字數不同嘅情況，例如 were not / weren't）*/
  _fullAnswerVariants(q) {
    const raw = q.type === "word"
      ? [q.word || ""].concat(q.accept || [])
      : [q.answer || ""].concat(q.accept || []);
    return raw.map(v => this._norm(v)).filter(Boolean);
  },

  /* ✓ 確認（保留）：不符 → 紅驚嘆號 + 微紅底 + EF −0.14
     小學生模式：按 attempt 次數決定係畀再試、出 L1、定出 L2 */
  check() {
    if (this.answered) return;
    const item = this.queue[0];
    if (!item) return;
    try { if (window.CaptureScene) { CaptureScene.primeAudio(); CaptureScene.bgmPrime(); } } catch (e) {}

    const c = this.cells[this.currentCell];
    if (!c) return;
    const val = this._norm(c.value);

    if (this._cellMatch(c, val)) {
      this._greenCell(this.currentCell);
      return;
    }

    /* 變體字數不同：逐格比對唔到，但整句拼埋啱 → 當全對 */
    const joined = this._norm(this._joinedAnswer());
    if (joined && this._fullAnswerVariants(item.q).indexOf(joined) >= 0) {
      this.cells.forEach(x => {
        x.green = true;
        x.cellEl.classList.add("good");
        if (x.input) x.input.disabled = true;
      });
      this._complete();
      return;
    }

    const junior = this._isJunior();
    if (junior) {
      const a = this._answerFor(item.q);
      a.attemptCount++;
      if (a.attemptCount === 1) {
        /* 第 1 次錯：當無事發生，畀小朋友再試一次（唔閃紅、唔扣 EF）*/
        this._focusCurrent();
      } else if (a.attemptCount === 2) {
        /* 第 2 次錯：出 L1 引導思考 */
        a.hintCount = 1;
        const ans = this._norm(c.primary);
        const v = this._norm(c.value);
        const isPrefix = v.length <= ans.length && ans.indexOf(v) === 0;
        if (v && !isPrefix) this._clearCell(c);
        this._showL1(c, v && isPrefix ? v.length : 0);
      } else if (a.attemptCount === 3) {
        /* 第 3 次錯：再畀一次機會，唔出新提示 */
        this._focusCurrent();
      } else {
        /* 第 4 次或以後錯：出 L2（顯示完整答案），之後答對會重排 */
        a.hintCount = 2;
        this._showL2(c);
      }
      return;
    }

    /* 標準模式：錯誤只扣 EF，不重排、不清題、不寫 history */
    this._flashWrong();
    this._vibrate(50);
    this._focusCurrent();

    const card = SM2.applyCheckFail(this._curCard || SM2.getOrCreateCard(item.q));
    this._curCard = SM2.upsertCard(card);
  },

  /* 答錯：整個題目框紅底 + 左上角紅色驚嘆號，維持 1 秒後以 0.4s 過渡退回 */
  _flashWrong() {
    try {
      const audio = window.CaptureScene && CaptureScene.audio;
      if (audio && audio.wrong) audio.wrong();
    } catch (e) {}

    const cardEl = document.getElementById("quiz-card");
    if (!cardEl) return;
    if (!cardEl.querySelector(".qb-bang")) {
      const bang = document.createElement("span");
      bang.className = "qb-bang";
      bang.textContent = "!";
      cardEl.appendChild(bang);
    }
    cardEl.classList.remove("bad");
    void cardEl.offsetWidth;   /* 強制 reflow，令連續答錯都重新閃一次 */
    cardEl.classList.add("bad");
    clearTimeout(this._wrongTimer);
    this._wrongTimer = setTimeout(() => cardEl.classList.remove("bad"), 1000);
  },

  /* ---------- 完成 / 下一題 ---------- */
  _complete() {
    if (this.answered) return;
    this.answered = true;

    const item = this.queue[0];
    const q = item.q;
    const a = this._answerFor(q);
    const usedHint = a.hintCount > 0;
    const now = Date.now();
    const responseMs = Math.max(0, now - (this._curQuestionStart || now));

    const junior = this._isJunior();

    /* 防無窮循環：小學生模式累計答啱 3 次（2 輪重排）→ 強制完結 */
    let forceComplete = false;
    if (junior) {
      a.correctCount = (a.correctCount || 0) + 1;
      if (a.correctCount >= 3) {
        forceComplete = true;
      }
    }

    let card = SM2.getOrCreateCard(q);
    let qScore;

    if (junior) {
      /* 小學生 Q 值映射（同時考慮手動提示同自動提示）：
         L2 用過 → q=0；L1 用過 → q=4；
         否則按 attemptCount：0/1→q=5、2→q=4、3→q=3、>=4→q=0 */
      if (a.hintCount >= 2) qScore = 0;
      else if (a.hintCount === 1) qScore = 4;
      else if (a.attemptCount <= 1) qScore = 5;
      else if (a.attemptCount === 2) qScore = 4;
      else if (a.attemptCount === 3) qScore = 3;
      else qScore = 0;
      card = SM2.applyJunior(card, qScore, now);
    } else {
      card = usedHint ? SM2.applyHint(card, a.hintCount, now) : SM2.applyClean(card, now);
      qScore = usedHint ? SM2.HINT_Q : SM2.CLEAN_Q;
    }
    this._curCard = SM2.upsertCard(card);

    SM2.appendHistory({
      card_id: card.card_id,
      ts: now,
      q_score: qScore,
      response_ms: responseMs,
      levenshtein_distance: 0,
      is_typo: false
    });

    a.hintEver = a.hintEver || usedHint;
    if (!usedHint) a.clean = true;
    if (!a.chosen) a.chosen = this._joinedAnswer();

    /* 重排邏輯：
       - 標準：用提示就重排
       - 小學生：q=0（L2 後）先重排；強制完唔重排 */
    let requeued = false;
    if (!forceComplete) {
      if (junior) {
        if (qScore <= 0 && this.queue.length > 1) {
          this.queue.push({ q, requeued: true, dueAt: now + 5 * 60 * 1000 });
          requeued = true;
        }
      } else {
        if (usedHint && this.queue.length > 1) {
          this.queue.push({ q, requeued: true, dueAt: now + 5 * 60 * 1000 });
          requeued = true;
        }
      }
    }

    /* 進度只計真正完成嘅題：重排嘅題要之後答啱先入數；強制完結都計入數 */
    if (!requeued) this.seenQids.add(this._key(q));

    /* UI：鎖格、換工具列 */
    this.cells.forEach(c => {
      if (c.input) c.input.disabled = true;
      this._applyGhost(c);
    });
    document.getElementById("btn-quiz-check").classList.add("hidden");
    document.getElementById("quiz-toolbar-before").classList.add("hidden");
    document.getElementById("quiz-toolbar-after").classList.remove("hidden");

    const fb = document.getElementById("quiz-feedback");
    if (forceComplete) {
      fb.textContent = "That word was tricky — let's try again tomorrow! You've got this! 🌟";
    } else if (junior) {
      if (qScore >= 5) fb.textContent = this._praise();
      else if (qScore >= 4) fb.textContent = "Good try! You got it with a little hint.";
      else if (qScore >= 3) fb.textContent = "Nice effort! Keep practicing.";
      else fb.textContent = "No worries — let's try this one again soon.";
    } else {
      fb.textContent = usedHint ? "Correct — hint used." : this._praise();
    }
    fb.className = "quiz-feedback good";

    /* Chip：重排維持「Review in 5 minutes」原字眼；強制完結顯示明日再試 */
    if (requeued) {
      this._renderChip(q, "Review in 5 minutes");
    } else if (forceComplete) {
      this._renderChip(q, "Review in 1 day");
    } else {
      this._renderChip(q, this._nextReviewLabel(card.interval_days));
    }

    this._updateProgress();
  },

  _joinedAnswer() {
    return this.cells.map(c => c.value).join(" ");
  },

  _praise() {
    const list = ["Well done!", "Nice one!", "Perfect!", "Great job!", "Exactly right!"];
    return list[Math.floor(Math.random() * list.length)];
  },

  _nextReviewLabel(days) {
    const n = Number(days) || 1;
    if (n === 1) return "Review in 1 day";
    const span = SM2.formatSpan(n * 24 * 60 * 60 * 1000);
    return `Review in ${span.value} ${span.unit}${span.value === 1 ? "" : "s"}`;
  },

  next() {
    if (!this.answered) return;
    this.queue.shift();
    this.answered = false;
    if (this.queue.length === 0) { this.finish(); return; }
    this._renderQuestion();
  },

  /* ---------- Chip ---------- */
  /* 未答前：新題 / 上次練習距今時間；答完：下次複習時間。pre → post 有翻轉效果 */
  _renderChip(q, nextText) {
    const el = document.getElementById("quiz-chip");
    if (!el) return;
    clearTimeout(this._chipFlipTimer);

    let text;
    let mode = "";
    if (nextText) {
      text = nextText;
      mode = "next";
    } else {
      const card = this._curCard || SM2.getOrCreateCard(q);
      const last = SM2.lastReviewedMs(card);
      if (!last || last <= 0) {
        text = "New question";
        mode = "fresh";
      } else {
        const span = SM2.formatSpan(Date.now() - last);
        text = `${span.value} ${this._shortUnit(span.unit, span.value)} ago`;
      }
    }

    const wasShown = el.classList.contains("show");
    const changed = wasShown && el.textContent !== text;
    el.classList.remove("flip-out", "flip-in", "next", "fresh");
    if (mode) el.classList.add(mode);
    el.classList.add("show");

    /* 只有答完（pre → post）先翻轉；換題時直接靜態更新 */
    if (nextText && changed) {
      const token = (this._chipToken = (this._chipToken || 0) + 1);
      el.classList.add("flip-out");
      this._chipFlipTimer = setTimeout(() => {
        if (token !== this._chipToken) return;
        el.textContent = text;
        el.classList.remove("flip-out");
        void el.offsetWidth;
        el.classList.add("flip-in");
      }, 160);
      return;
    }

    el.textContent = text;
  },

  _shortUnit(unit, value) {
    if (unit === "minute") return value === 1 ? "min" : "mins";
    if (unit === "hour") return value === 1 ? "hr" : "hrs";
    return value === 1 ? "day" : "days";
  },

  /* ---------- 圖片單字題 ---------- */
  _renderImage(q) {
    const box = document.getElementById("quiz-image-box");
    const img = document.getElementById("quiz-image");
    const token = (this._imgToken = (this._imgToken || 0) + 1);
    box.classList.remove("show");
    img.removeAttribute("src");
    if (!q.no || q.type === "word") return;
    findQuestionImage(q.no).then(url => {
      if (!url || token !== this._imgToken) return;
      img.src = url;
      box.classList.add("show");
    });
  },

  _autoPlayWord(token) {
    const audio = window.CaptureScene && CaptureScene.audio;
    if (!audio) return;
    if (!audio.ctx || audio.ctx.state !== "running") return;
    setTimeout(() => {
      if (token !== this._wordToken) return;
      if (this.answered) return;
      this.playWordAudio();
    }, 350);
  },

  playWordAudio() {
    const cur = (this.queue[0] && this.queue[0].q) || null;
    if (!cur || cur.type !== "word") return;
    const status = document.getElementById("quiz-word-status");
    const audio = window.CaptureScene && CaptureScene.audio;
    if (!audio) { status.textContent = "🔇 Audio unavailable"; return; }
    if (audio.ensure) audio.ensure();
    const url = wordAudioURL(cur.word);
    status.textContent = "🔊 Playing… tap again to replay";
    status.className = "word-status playing";
    audio.playWord(url, (usedSpeech) => {
      if (usedSpeech) {
        status.textContent = "🔊 Playing (system voice — recording coming soon)";
        status.className = "word-status playing";
      } else {
        status.textContent = "🔇 No recording yet for \"" + cur.word + "\"";
        status.className = "word-status missing";
      }
    });
    /* 播完音頻／按語音鍵後，浮標返去輸入格 */
    this._focusCurrent();
  },

  /* ---------- 卡片右下角工具 / 錯誤回報 ---------- */
  toggleCardDrawer(force) {
    const drawer = document.getElementById("quiz-card-drawer");
    const btn = document.getElementById("btn-quiz-more");
    if (!drawer) return;
    const show = typeof force === "boolean" ? force : drawer.classList.contains("hidden");
    drawer.classList.toggle("hidden", !show);
    drawer.classList.toggle("show", show);
    if (btn) {
      btn.classList.toggle("open", show);
      btn.setAttribute("aria-expanded", show ? "true" : "false");
    }
  },

  openReport() {
    const item = this.queue[0];
    if (!item) return;
    const q = item.q;
    const isWord = q.type === "word";
    const answer = isWord ? q.word : q.answer;
    const explain = (q.explain && q.explain.hint) || "";
    const content = isWord
      ? `<img class="report-thumb" src="${escapeHTML(q.image)}" alt="Question picture">`
      : `<div class="report-sentence">${escapeHTML(q.sentence)}</div>`;

    const reasons = [
      { key: "image", label: "Image is wrong" },
      { key: "question", label: "Question is wrong" },
      { key: "answer", label: "Answer is wrong" },
      { key: "audio", label: "Listening audio is wrong" },
      { key: "other", label: "Other" }
    ];
    const chips = reasons
      .map(r => `<button type="button" class="report-chip" data-reason="${r.key}">${r.label}</button>`)
      .join("");

    App.showModal(`
      <div class="report-box" id="report-box">
        <h3>⚠️ Report a problem</h3>
        <div class="report-q">
          <div class="report-q-label">Question</div>
          ${content}
          <div class="report-row"><span>Answer</span><b>${escapeHTML(answer) || "(blank)"}</b></div>
          <div class="report-row"><span>Explanation</span><b>${escapeHTML(explain) || "No explanation provided."}</b></div>
        </div>
        <h4 class="report-ask">What went wrong?</h4>
        <div class="report-chips" id="report-chips">${chips}</div>
        <div class="report-more hidden" id="report-more">
          <textarea id="report-detail" class="report-detail" rows="4"
            placeholder="Tell us more about the problem so we can improve and fix it. Please note: abusive or defamatory language may result in restricted app access."></textarea>
          <div class="confirm-row">
            <button id="report-send" class="btn-big btn-primary" disabled>Send report</button>
            <button id="report-cancel" class="btn-big btn-plain">Cancel</button>
          </div>
        </div>
      </div>`);

    const chipsEl = document.getElementById("report-chips");
    const more = document.getElementById("report-more");
    const send = document.getElementById("report-send");
    const detail = document.getElementById("report-detail");
    const selected = new Set();

    chipsEl.onclick = (e) => {
      const chip = e.target.closest(".report-chip");
      if (!chip) return;
      const key = chip.dataset.reason;
      if (selected.has(key)) {
        selected.delete(key);
        chip.classList.remove("on");
      } else {
        selected.add(key);
        chip.classList.add("on");
      }
      const show = selected.size > 0;
      more.classList.toggle("hidden", !show);
      send.disabled = !show;
      if (show) setTimeout(() => detail.focus(), 120);
    };

    document.getElementById("report-cancel").onclick = () => App.closeModal();

    send.onclick = async () => {
      if (selected.size === 0 || send.disabled) return;
      const report = {
        id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        ts: Date.now(),
        device_id: typeof ensureDeviceId === "function" ? ensureDeviceId() : "",
        qid: q.id || this._key(q),
        type: q.type || "sentence",
        topic: q.topic || "",
        question: isWord ? q.word : q.sentence,
        answer: answer || "",
        reasons: [...selected],
        detail: detail.value.trim()
      };

      let uploaded = false;
      if (window.SupabaseAuth && SupabaseAuth.isEnabled && SupabaseAuth.isEnabled()) {
        send.disabled = true;
        send.textContent = "Sending…";
        uploaded = !!(await SupabaseAuth.submitReport(report));
        send.textContent = "Send report";
      }

      if (!uploaded) {
        /* 離線 / 未設定 Supabase：暫存本機，之後可以補交 */
        try {
          const key = "pokeengmon_reports_v1";
          const list = JSON.parse(localStorage.getItem(key) || "[]");
          list.push(report);
          localStorage.setItem(key, JSON.stringify(list.slice(-200)));
        } catch (e) { /* storage unavailable */ }
      }
      App.closeModal();
      App.toast(uploaded
        ? "Thanks! Your report was sent."
        : "Thanks! Your report has been saved on this device.");
    };
  },

  /* ---------- 設定 / 退出 ---------- */
  openSettings() {
    App.showModal(`
      <div class="confirm-box">
        <p><b>Quiz Settings</b><br><small>Leaving now will lose this set's progress.</small></p>
        <div class="confirm-row">
          <button id="quiz-settings-quit" class="btn-big btn-danger">Quit this set</button>
          <button id="quiz-settings-close" class="btn-big btn-plain">Keep going</button>
        </div>
      </div>`, true);
    document.getElementById("quiz-settings-quit").onclick = () => {
      App.closeModal();
      this.quit();
    };
    document.getElementById("quiz-settings-close").onclick = () => {
      App.closeModal();
      /* Keep going：關窗後浮標返去輸入格，用戶唔使再點一次 */
      setTimeout(() => this._focusCurrent(), 100);
    };
  },

  quit() {
    this.queue = [];
    this.set = [];
    this.cells = [];
    this.answered = true;
    App.renderHome();
    App.showView("view-home");
  },

  /* ---------- 結算 ---------- */
  finish() {
    const results = this.set.map(q => {
      const a = this._answerFor(q);
      return {
        qid: q.id,
        chosen: a.chosen || "",
        correct: !!a.clean,
        hint: !!a.hintEver,
        memory: false,
        topic: q.topic
      };
    });
    const score = results.filter(r => r.correct).length;
    const data = {
      results,
      score,
      total: this.total,
      duration: Math.floor((Date.now() - this.startTime) / 1000),
      mode: this.mode || null,
      gymMilestone: this.gymMilestone || 0
    };
    App.onQuizFinished(data);
  }
};
