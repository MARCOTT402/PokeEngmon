/* ============================================================
   PokeEngmon - Quiz：對答案同完成一題（答案變體、錯誤閃動、SM-2 記錄、讚賞）
   由 js/quiz.js 拆出（總計劃 P2.5；Rule 116）。同 js/quiz.js 共用同一個 Quiz 物件：
   Object.assign 只係將方法掛返上去，this／Quiz.xxx 用法完全唔變。
   載入次序：js/quiz.js 之後（index.html）。
   ============================================================ */

Object.assign(Quiz, {
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
    /* 未輸入就撳 Enter／Check：唔當答錯（空答案格除外） */
    if (!val && !c.empty) { this._focusCurrent(); return; }

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
      c.tries = (Number(c.tries) || 0) + 1;
      const step = c.tries;
      /* 小學生所有答錯都閃紅，但第 1 次不扣 EF。提示階梯跟目前這一格。 */
      this._flashWrong();
      this._vibrate(50);
      this.wrongTries = (this.wrongTries || 0) + 1;
      this._setCombo(0);
      const juniorMsg = ["Almost! Try once more 💪", "Here's a little help ↑", "Keep going — you can do it!", "Copy the grey letters ↑"];
      this._setAction("bad", "✕", juniorMsg[Math.min(step, 4) - 1], "");
      if (c.cellEl) c.cellEl.classList.add("badc");
      if (step === 1) {
        /* 第 1 次錯：閃紅但不扣 EF，再試一次 */
        this._focusCurrent();
      } else if (step === 2) {
        /* 第 2 次錯：這一格出 L1 */
        const ans = this._norm(c.primary);
        const v = this._norm(c.value);
        const isPrefix = v.length <= ans.length && ans.indexOf(v) === 0;
        if (v && !isPrefix) this._clearCell(c);
        this._showL1(c, v && isPrefix ? v.length : 0);
      } else if (step === 3) {
        /* 第 3 次錯：再給一次機會，不出新提示 */
        this._focusCurrent();
      } else {
        /* 第 4 次或以後錯：這一格出 L2，之後答對會重排 */
        this._showL2(c);
      }
      return;
    }

    /* 標準模式：錯誤只扣 EF，不重排、不清題、不寫 history（唔顯示答案，畀用戶再試） */
    this._flashWrong();
    this._vibrate(50);
    this.wrongTries = (this.wrongTries || 0) + 1;
    this._setCombo(0);
    const tries = (this._curWrong = (this._curWrong || 0) + 1);
    this._setAction("bad", "✕", tries >= 2 ? "Still not right — need a hint?" : "Not quite — try again",
      "Check the spelling and the sentence around the blank.");
    if (c.cellEl) c.cellEl.classList.add("badc");
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
    try {
      const audio = window.CaptureScene && CaptureScene.audio;
      if (audio && audio.correct) audio.correct();
    } catch (e) { /* audio unavailable */ }

    const item = this.queue[0];
    const q = item.q;
    const a = this._answerFor(q);
    const usedHint = this._questionUsedHint ? this._questionUsedHint() : a.hintCount > 0;
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
      /* 小學生 Q 值映射（按第幾次答啱）：
         submission 1/2 啱 → q=5
         submission 3 啱（L1 用過）→ q=4
         submission 4 啱 → q=3
         L2 後啱 → q=0
         attemptCount = 答錯次數，第 N 次答啱時 attemptCount = N-1 */
      if (a.hintCount >= 2) qScore = 0;
      else if (a.attemptCount >= 3) qScore = 3;
      else if (a.hintCount === 1) qScore = 4;
      else qScore = 5;
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
    document.getElementById("btn-quiz-next").classList.remove("hidden");
    document.getElementById("quiz-toolbar-before").classList.add("hidden");
    document.getElementById("quiz-toolbar-after").classList.remove("hidden");
    const cardEl = document.getElementById("quiz-card");
    if (cardEl) { cardEl.classList.remove("bad"); cardEl.classList.add("win"); }
    /* App 鍵盤保留：右下鍵變 Next（_syncCheckBtn） */

    /* 分段進度：當前格填色；重排 → 尾加一格虛線 */
    const segIdx = (this.segs || []).findIndex(sg => sg.key === this._key(q) && !sg.state);
    if (segIdx >= 0) this.segs[segIdx].state = (usedHint || requeued) ? "hint" : "ok";
    if (requeued) this.segs.push({ key: this._key(q), re: true, state: "" });

    /* Combo：無提示、今題無答錯先 +1（純視覺） */
    const cleanTry = !usedHint && !this._curWrong && !(junior && a.attemptCount > 0);
    let comboMsg = "";
    if (cleanTry) {
      this._setCombo((this.combo || 0) + 1, true);
      comboMsg = ({ 3: "3 in a row! 🔥", 5: "5 in a row — on fire!", 10: "Perfect streak!" })[this.combo] || "";
    } else {
      this._setCombo(0);
    }

    /* 回饋文字：沿用原有字眼；下次複習時間放副標 */
    let title;
    if (forceComplete) {
      title = "That word was tricky — let's try again tomorrow! You've got this! 🌟";
    } else if (junior) {
      if (qScore >= 5) title = comboMsg || this._praise();
      else if (qScore >= 4) title = "Good try! You got it with a little hint.";
      else if (qScore >= 3) title = "Nice effort! Keep practicing.";
      else title = "No worries — let's try this one again soon.";
    } else {
      title = usedHint ? "Correct — hint used." : (comboMsg || this._praise());
    }
    const nextLabel = requeued ? "Review in 5 minutes"
      : forceComplete ? "Review in 1 day"
      : this._nextReviewLabel(card.interval_days);
    const kind = (usedHint || requeued || forceComplete || (junior && qScore < 5)) ? "hinted" : "ok";
    this._setAction(kind, "✓", title, (requeued ? "↻ " : "📅 ") + nextLabel);
    this._vibrate(comboMsg ? [10, 30, 10] : 15);

    /* Chip：重排維持「Review in 5 minutes」原字眼；強制完結顯示明日再試 */
    this._renderChip(q, nextLabel);

    this._showCompletedNote(q);
    this._speakCompleted(q);

    this._updateProgress();
    if (segIdx >= 0) this._popSeg(segIdx);
    this._syncCheckBtn();
    /* 焦點交俾 Continue（實體鍵盤 Enter 由全域 handler 處理） */
    try { document.getElementById("btn-quiz-next").focus({ preventScroll: true }); } catch (e) {}
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
  }
});
