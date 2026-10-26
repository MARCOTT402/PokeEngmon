/* ============================================================
   PokeEngmon - 做題流程
   10 題一組 · 計時 · 鍵盤輸入答案 · 即時對錯 → 結算
   ============================================================ */

const Quiz = {
  set: [],
  idx: 0,
  results: [],        // {qid, chosen, correct, topic}
  startTime: 0,
  timerId: null,
  locked: false,
  _advanceTimer: null,

  /* topics: 揀咗嘅題型（空陣列＝全部）；圖片單字題會混合抽 */
  start(topics) {
    this.set = drawMixedSet(GAME_CONFIG.SET_SIZE, topics);
    if (this.set.length === 0) {
      /* 冇到期卡 + 冇新題：toast 太易錯過，用彈窗明確提示（介面文字統一英文） */
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
    /* 唔夠 10 題＝呢個課題範圍今日嘅到期題就快做完，提示玩家擴闊課題 */
    if (this.set.length < GAME_CONFIG.SET_SIZE) {
      App.toast(`Only ${this.set.length} question${this.set.length > 1 ? "s" : ""} left here — pick more courses next round for a full set!`);
    }
    this.idx = 0;
    this.results = [];
    this._hintUsed = new Set();   /* 記低邊啲題撳過 💡 Hint（結算 EXP 分級用） */
    this.startTime = Date.now();
    this._cancelAdvance();   /* 清掉上一個回合殘留嘅自動跳題 timer */
    App.showView("view-quiz");
    clearInterval(this.timerId);
    this.timerId = setInterval(() => this._tickTimer(), 500);
    this._renderQuestion();
  },

  _elapsedSec() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  },

  _tickTimer() {
    const el = document.getElementById("quiz-timer");
    const s = this._elapsedSec();
    el.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  },

  _renderQuestion() {
    const q = this.set[this.idx];
    this.locked = false;

    document.getElementById("quiz-progress").textContent = `${this.idx + 1} / ${this.set.length}`;
    document.getElementById("quiz-bar").style.width = `${(this.idx / this.set.length) * 100}%`;
    /* 答題畫面唔顯示課題／題型，只顯示難度星星 */
    const level = Math.max(1, q.level || 1);
    document.getElementById("quiz-topic").innerHTML =
      `<span class="quiz-level" aria-label="Level ${level}">${"★".repeat(level)}</span>`;

    /* 記憶光芒：呢題係記憶曲線到期嘅複習題（stage > 0）→ 彩色光芒 + 拍檔提醒 */
    this._renderMemoryLight(q);

    /* 題目圖片（Q_folder/questions/questions_images/<編號>.png）；冇圖片就收起個窗 */
    this._renderImage(q);

    /* 圖片單字題：收起句子卡，改出「點圖聽聲」卡 */
    const wordCard = document.getElementById("quiz-word-card");
    if (q.type === "word") {
      document.getElementById("quiz-card").style.display = "none";
      document.getElementById("quiz-image-box").classList.remove("show");
      wordCard.classList.add("show");
      const img = document.getElementById("quiz-word-image");
      img.onerror = () => { img.onerror = null; img.src = "icons/icon-192.png"; };
      img.src = q.image;
      document.getElementById("quiz-word-status").textContent = "🔊 Tap the picture to hear the word";
      document.getElementById("quiz-word-status").className = "word-status";
    } else {
      document.getElementById("quiz-card").style.display = "";
      wordCard.classList.remove("show");
    }

    /* 句子（空位藍色） */
    document.getElementById("quiz-sentence").innerHTML =
      escapeHTML(q.sentence).replace(/___/, `<span class="quiz-blank">&nbsp;___&nbsp;</span>`);

    /* 鍵盤輸入 */
    const input = document.getElementById("quiz-answer");
    input.value = "";
    input.disabled = false;
    input.className = "quiz-answer-input";
    const btn = document.getElementById("btn-quiz-submit");
    btn.disabled = false;

    document.getElementById("quiz-feedback").textContent = "";
    document.getElementById("quiz-feedback").className = "quiz-feedback";
    /* 清除上一題遺留喺圖片卡嘅答題回應狀態 */
    document.getElementById("quiz-word-card").classList.remove("correct", "wrong");
    document.getElementById("btn-quiz-continue").classList.add("hidden");
    document.getElementById("btn-quiz-hint").disabled = false;

    /* 每題（含圖片單字）自動 focus，鍵盤可連續打字／Enter 過題 */
    this._focusAnswer();
  },

  _focusAnswer() {
    const input = document.getElementById("quiz-answer");
    if (!input || input.disabled) return;
    const go = () => { try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} } };
    go();
    requestAnimationFrame(() => { go(); setTimeout(go, 50); });
  },

  /* 記憶光芒：SM-2 卡片 rep>0 且未畢業 → 彩色光芒 + 拍檔提醒 + Bonus XP
     同時記錄本題開始時間（供 computeQ response_ms 用）*/
  _renderMemoryLight(q) {
    const card = SM2.getOrCreateCard(q);
    this._curCard = card;
    this._curQuestionStart = Date.now();
    const memEl = document.getElementById("quiz-memory");
    const cardEl = document.getElementById("quiz-card");
    if (card.repetition > 0 && !card.is_mastered) {
      const entry = getActiveEntry();
      let spriteHTML = "";
      let textHTML;
      if (entry) {
        const dexId = entryCurrentSpecies(entry)[0];
        spriteHTML = `<img class="quiz-memory-sprite" src="${animatedURL(dexId)}" alt="partner" onerror="this.onerror=null;this.src='${artworkURL(dexId)}'">`;
        textHTML = `<b>${escapeHTML(entryCurrentSpecies(entry)[1])}</b> remembers this ${card.interval_days} day${card.interval_days !== 1 ? "s" : ""} ago!<br><small>Bonus XP ×1.5 · Keep it strong!</small>`;
      } else {
        textHTML = `✨ Time to refresh your brain!<br><small>Bonus XP ×1.5 for this one!</small>`;
      }
      memEl.innerHTML = spriteHTML + `<div class="quiz-memory-text">${textHTML}</div>`;
      memEl.classList.add("show");
      cardEl.classList.add("memory-glow");
      document.getElementById("quiz-word-card").classList.add("memory-glow");
    } else {
      memEl.classList.remove("show");
      cardEl.classList.remove("memory-glow");
      document.getElementById("quiz-word-card").classList.remove("memory-glow");
    }
  },

  /* 顯示題目圖片：搵到先開個固定大細嘅窗，搵唔到就收起 */
  _renderImage(q) {
    const box = document.getElementById("quiz-image-box");
    const img = document.getElementById("quiz-image");
    const token = (this._imgToken = (this._imgToken || 0) + 1);
    box.classList.remove("show");
    img.removeAttribute("src");
    if (!q.no) return;
    findQuestionImage(q.no).then(url => {
      if (!url || token !== this._imgToken) return;   // 已經轉咗題就唔好再顯示
      img.src = url;
      box.classList.add("show");
    });
  },

  /* 比對答案：trim + 不分大小寫；accept 列表都接受；答案留空＝要留空
     圖片單字題比對 q.word */
  _isCorrect(q, text) {
    const norm = s => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
    const mine = norm(text);
    const target = q.type === "word" ? q.word : q.answer;
    if (mine === norm(target)) return true;
    return (q.accept || []).some(a => norm(a) === mine);
  },

  /* 圖片單字題：點圖播聲（Web Audio，無限重播，重播會打斷上一段） */
  playWordAudio() {
    const q = this.set[this.idx];
    if (!q || q.type !== "word") return;
    const status = document.getElementById("quiz-word-status");
    const audio = window.CaptureScene && CaptureScene.audio;
    if (!audio) { status.textContent = "🔇 Audio unavailable"; return; }
    audio.ensure();
    const url = wordAudioURL(q.word);
    status.textContent = "🔊 Playing… tap again to replay";
    status.className = "word-status playing";
    audio.playWord(url, (usedSpeech) => {
      if (usedSpeech) {
        /* 正式錄音未生成 → 系統聲頂住（好過靜音） */
        status.textContent = "🔊 Playing (system voice — recording coming soon)";
        status.className = "word-status playing";
      } else {
        status.textContent = "🔇 No recording yet for \"" + q.word + "\"";
        status.className = "word-status missing";
      }
    });
  },

  /* ---------- 統一答題回應（所有題型共用） ----------
     任何題型（句子題 / 圖片單字題 / 日後新增題型）答對答錯都必須經呢個函數，
     唔可以自己另外寫一套回饋，否則玩家會見到唔一致的「回應」。
     kind: "correct" | "warn" | "wrong"
     句子題：輸入框綠/紅 + 對錯音效 + #quiz-feedback 文字
     圖片單字題：喺同一組元素上顯示同一段文字，另外將回應搬上圖片卡
                 （因為圖片題冇句子卡，唔同步就會睇落同句子題唔一樣） */
  _showFeedback(kind, text) {
    const input = document.getElementById("quiz-answer");
    input.classList.remove("correct", "wrong");
    if (kind === "correct") input.classList.add("correct");
    else if (kind === "wrong") input.classList.add("wrong");

    /* 對錯音效 */
    if (window.CaptureScene && CaptureScene.audio) {
      if (kind === "correct") CaptureScene.audio.correct();
      else if (kind === "wrong") CaptureScene.audio.wrong();
    }

    const fb = document.getElementById("quiz-feedback");
    fb.textContent = text;
    fb.className = "quiz-feedback " + (kind === "correct" ? "good" : kind === "warn" ? "warn" : "bad");

    const q = this.set[this.idx];
    if (q && q.type === "word") {
      const status = document.getElementById("quiz-word-status");
      if (status) {
        status.textContent = text;
        status.className = "word-status " + (kind === "correct" ? "good" : kind === "warn" ? "warn" : "bad");
      }
      const card = document.getElementById("quiz-word-card");
      if (card) {
        card.classList.remove("correct", "wrong");
        if (kind === "correct") card.classList.add("correct");
        else if (kind === "wrong") card.classList.add("wrong");
      }
    }
  },

  submit() {
    if (this.locked) return;
    const input = document.getElementById("quiz-answer");
    const text = input.value;
    this.locked = true;
    const q = this.set[this.idx];
    const target = q.type === "word" ? q.word : q.answer;
    const response_ms = Date.now() - (this._curQuestionStart || Date.now());

    /* SM-2 完整評分（Levenshtein + 過早提交保護 + 動態時間期望 + Q 值）
       多個可接受答案（q.accept）一併評分，取最高 Q */
    const targets = q.type === "word" ? [q.word] : [q.answer || "", ...(q.accept || [])];
    const judge = SM2.computeBestQ(text || "", targets, response_ms);
    /* 答對：q >= 3（q=3 答得慢但仍算答對；SM-2 原版設計）*/
    const correct = judge.q >= 3;

    /* 更新 SM-2 卡片 + 寫 history */
    const card = SM2.getOrCreateCard(q);
    const judgeForCard = { ...judge };
    judgeForCard.reason = judge.reason;   /* 保留供 computeEF 用 */
    const updatedCard = SM2.updateCard(card, judge.q, response_ms);
    /* 用 judge.reason 更新 EF（computeEF 根據 reason 決定保護）*/
    updatedCard.ease_factor = SM2.computeEF(card.ease_factor, judge.reason);
    SM2.upsertCard(updatedCard);

    SM2.appendHistory({
      device_id: (loadState && loadState().device_id) || "unknown",
      card_id: card.card_id,
      ts: Date.now(),
      q_score: judge.q,
      response_ms,
      levenshtein_distance: judge.dist,
      is_typo: judge.reason === "soft_fail_typo"
    });

    /* 保留舊 results 結構（供 PowerUpZone + settlement 用），加 SM-2 資料 */
    this.results.push({
      qid: q.id,
      chosen: text.trim(),
      correct,
      topic: q.topic,
      memory: card.repetition > 0 && !card.is_mastered,
      hint: this._hintUsed.has(this.idx),
      /* 額外資料 */
      _sm2: { q_score: judge.q, reason: judge.reason, dist: judge.dist, response_ms, target: judge.target }
    });

    input.disabled = true;
    document.getElementById("btn-quiz-submit").disabled = true;

    /* 統一答題回應：句子題 / 圖片單字題 / 日後新題型一律經 _showFeedback */
    if (correct) {
      this._showFeedback("correct", ["Well done!", "Correct!", "Nice!", "Excellent!"][Math.floor(Math.random() * 4)]);
    } else if (judge.reason === "premature_submit") {
      this._showFeedback("wrong", "You stopped halfway — go back and finish the whole word.");
    } else if (judge.reason === "soft_fail_typo") {
      this._showFeedback("warn", "Almost! One tiny typo — fix it in the Power Up Zone.");
    } else {
      this._showFeedback("wrong", target ? `The answer is "${target}"` : `The answer is "(blank)"`);
    }

    this._advance(correct);
  },

  /* ---------- Hint：顯示首字母 + 字數（免費，edu 優先） ---------- */
  hint() {
    if (this.locked) return;
    const q = this.set[this.idx];
    const target = q.type === "word" ? q.word : q.answer;
    const fb = document.getElementById("quiz-feedback");
    if (!target) {
      fb.textContent = "💡 Maybe no word is needed here — try leaving it blank!";
    } else {
      fb.textContent = `💡 Starts with "${target[0].toUpperCase()}"… (${target.length} letter${target.length > 1 ? "s" : ""})`;
    }
    fb.className = "quiz-feedback warn";
    this._hintUsed.add(this.idx);
    document.getElementById("btn-quiz-hint").disabled = true;
  },

  /* ---------- Skip：當答錯計（入 Power Up Zone） ---------- */
  skip() {
    if (this.locked) return;
    document.getElementById("btn-quiz-hint").disabled = true;
    this.locked = true;
    const q = this.set[this.idx];
    const target = q.type === "word" ? q.word : q.answer;
    const response_ms = Date.now() - (this._curQuestionStart || Date.now());

    /* SM-2：空答案 = 完全唔識 → Q 值自然最低
       零冠詞題（target 為空）唔可以用空字串比空字串，否則會變 dist=0 當答對 */
    const judge = target
      ? SM2.computeQ("", target, response_ms)
      : { q: 1, reason: "hard_fail", dist: 0, lenRatio: 1, premature: false };
    const card = SM2.getOrCreateCard(q);
    const updatedCard = SM2.updateCard(card, judge.q, response_ms);
    updatedCard.ease_factor = SM2.computeEF(card.ease_factor, judge.reason);
    SM2.upsertCard(updatedCard);
    SM2.appendHistory({
      device_id: (loadState && loadState().device_id) || "unknown",
      card_id: card.card_id,
      ts: Date.now(),
      q_score: judge.q,
      response_ms,
      levenshtein_distance: judge.dist,
      is_typo: false
    });

    this.results.push({
      qid: q.id, chosen: "", correct: false, topic: q.topic,
      memory: card.repetition > 0 && !card.is_mastered,
      skipped: true,
      hint: this._hintUsed.has(this.idx),
      _sm2: { q_score: judge.q, reason: judge.reason, dist: judge.dist, response_ms, target }
    });

    this._showFeedback("wrong", target
      ? `Skipped — the answer is "${target}"`
      : `Skipped — the answer is "(blank)"`);
    document.getElementById("quiz-answer").disabled = true;
    document.getElementById("btn-quiz-submit").disabled = true;
    this._advance(false);
  },

  /* ---------- 離開回合（確認彈窗） ---------- */
  quit() {
    App.showModal(`
      <div class="confirm-box">
        <p>Quit this set?<br><small>Progress in this round will be lost.</small></p>
        <div class="confirm-row">
          <button id="quiz-quit-yes" class="btn-big btn-danger">Quit</button>
          <button id="quiz-quit-no" class="btn-big btn-plain">Keep Going</button>
        </div>
      </div>`, true);
    document.getElementById("quiz-quit-yes").onclick = () => {
      clearInterval(this.timerId);
      this._cancelAdvance();   /* 唔好俾答對後嘅 650ms 自動跳題喺退出後仍然執行 */
      this.locked = true;
      this._onContinue = null;
      App.closeModal();
      App.renderHome();
      App.showView("view-home");
    };
    document.getElementById("quiz-quit-no").onclick = () => App.closeModal();
  },

  /* ---------- 前進：答對自動快跳；答錯手動 Continue ---------- */
  _cancelAdvance() {
    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = null;
    }
  },

  _advance(correct) {
    const go = () => {
      this._advanceTimer = null;
      this.idx++;
      if (this.idx < this.set.length) this._renderQuestion();
      else this.finish();
    };
    if (correct) {
      this._advanceTimer = setTimeout(go, 650);
    } else {
      /* 答錯：俾玩家自己睇清楚答案先過（Continue 或 Enter） */
      document.getElementById("btn-quiz-continue").classList.remove("hidden");
      this._onContinue = go;
    }
  },

  _continue() {
    const go = this._onContinue;
    this._onContinue = null;
    document.getElementById("btn-quiz-continue").classList.add("hidden");
    if (go) go();
  },

  finish() {
    clearInterval(this.timerId);
    this._cancelAdvance();
    this._onContinue = null;   /* 防止殘留狀態喺之後誤觸 Continue */
    document.getElementById("quiz-bar").style.width = "100%";
    const score = this.results.filter(r => r.correct).length;
    const duration = this._elapsedSec();
    App.onQuizFinished({
      ts: Date.now(),
      duration,
      score,
      total: this.set.length,
      results: this.results.map(r => ({ qid: r.qid, chosen: r.chosen, correct: r.correct, memory: !!r.memory, hint: !!r.hint }))
    });
  }
};
