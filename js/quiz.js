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

  /* topics: 揀咗嘅題型（空陣列＝全部）；圖片單字題會混合抽 */
  start(topics) {
    this.set = drawMixedSet(GAME_CONFIG.SET_SIZE, topics);
    if (this.set.length === 0) {
      App.toast("No questions available yet — try again later!");
      return;
    }
    this.idx = 0;
    this.results = [];
    this.startTime = Date.now();
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

    /* 題目圖片（image_file/<編號>.png）；冇圖片就收起個窗 */
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
    document.getElementById("btn-quiz-continue").classList.add("hidden");
    document.getElementById("btn-quiz-hint").disabled = false;

    /* 句子題先自動聚焦彈鍵盤；圖片單字題要「睇圖→聽聲→先打字」，唔好遮住圖片 */
    if (q.type !== "word") {
      setTimeout(() => input.focus(), 300);
    }
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

  submit() {
    if (this.locked) return;
    const input = document.getElementById("quiz-answer");
    const text = input.value;
    this.locked = true;
    const q = this.set[this.idx];
    const target = q.type === "word" ? q.word : q.answer;
    const response_ms = Date.now() - (this._curQuestionStart || Date.now());

    /* SM-2 完整評分（Levenshtein + 過早提交保護 + 動態時間期望 + Q 值）*/
    const judge = SM2.computeQ(text || "", target || "", response_ms);
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
      /* 額外資料 */
      _sm2: { q_score: judge.q, reason: judge.reason, dist: judge.dist, response_ms, target }
    });

    input.disabled = true;
    document.getElementById("btn-quiz-submit").disabled = true;
    input.classList.add(correct ? "correct" : "wrong");

    /* 對錯音效 */
    if (window.CaptureScene && CaptureScene.audio) {
      if (correct) CaptureScene.audio.correct();
      else CaptureScene.audio.wrong();
    }

    const fb = document.getElementById("quiz-feedback");
    if (correct) {
      fb.textContent = ["Well done!", "Correct!", "Nice!", "Excellent!"][Math.floor(Math.random() * 4)];
      fb.className = "quiz-feedback good";
    } else if (judge.reason === "premature_submit") {
      fb.textContent = "You stopped halfway — go back and finish the whole word.";
      fb.className = "quiz-feedback bad";
    } else if (judge.reason === "soft_fail_typo") {
      fb.textContent = `Almost! One tiny typo — fix it in the Power Up Zone.`;
      fb.className = "quiz-feedback warn";
    } else {
      fb.textContent = target ? `The answer is "${target}"` : `The answer is "(blank)"`;
      fb.className = "quiz-feedback bad";
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

    /* SM-2：空答案 = 完全唔識 → Q 值自然最低 */
    const judge = SM2.computeQ("", target || "", response_ms);
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
      _sm2: { q_score: judge.q, reason: judge.reason, dist: judge.dist, response_ms, target }
    });

    const fb = document.getElementById("quiz-feedback");
    fb.textContent = target ? `Skipped — the answer is "${target}"` : `Skipped — the answer is "(blank)"`;
    fb.className = "quiz-feedback bad";
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
      this.locked = true;
      this._onContinue = null;
      App.closeModal();
      App.renderHome();
      App.showView("view-home");
    };
    document.getElementById("quiz-quit-no").onclick = () => App.closeModal();
  },

  /* ---------- 前進：答對自動快跳；答錯手動 Continue ---------- */
  _advance(correct) {
    const go = () => {
      this.idx++;
      if (this.idx < this.set.length) this._renderQuestion();
      else this.finish();
    };
    if (correct) {
      setTimeout(go, 650);
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
    this._onContinue = null;   /* 防止殘留狀態喺之後誤觸 Continue */
    document.getElementById("quiz-bar").style.width = "100%";
    const score = this.results.filter(r => r.correct).length;
    const duration = this._elapsedSec();
    App.onQuizFinished({
      ts: Date.now(),
      duration,
      score,
      total: this.set.length,
      results: this.results.map(r => ({ qid: r.qid, chosen: r.chosen, correct: r.correct, memory: !!r.memory }))
    });
  }
};
