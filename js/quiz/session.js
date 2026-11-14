/* ============================================================
   PokeEngmon - Quiz：一組題目嘅流程（開始、道館、出題、下一題、離開、完成）
   由 js/quiz.js 拆出（總計劃 P2.5；Rule 116）。同 js/quiz.js 共用同一個 Quiz 物件：
   Object.assign 只係將方法掛返上去，this／Quiz.xxx 用法完全唔變。
   載入次序：js/quiz.js 之後（index.html）。
   ============================================================ */

Object.assign(Quiz, {
  /* topics: 揀咗嘅題型（空陣列＝全部）；圖片單字題會混合抽 */
  start(topics) {
    this.mode = null;
    this.gymMilestone = 0;
    const set = drawMixedSet(GAME_CONFIG.SET_SIZE, topics);
    /* 題庫載唔到（網絡問題）→ 話用戶知＋Retry，唔好扮「All caught up」（Rule 94） */
    if (set.length === 0 && typeof questionBankFailed === "function" && questionBankFailed()) {
      App.showModal(`
        <div class="confirm-box">
          <p>📡 <b>Couldn't load questions</b><br>
            <small>Please check your connection and try again.</small></p>
          <div class="confirm-row">
            <button id="qload-retry" class="btn-big btn-primary">Retry</button>
            <button id="qload-cancel" class="btn-big">Later</button>
          </div>
        </div>`, true);
      document.getElementById("qload-cancel").onclick = () => App.closeModal();
      const retry = document.getElementById("qload-retry");
      retry.onclick = () => {
        const work = async () => {
          await Promise.all([loadSiteQuestions(), loadPictureWords()]);
          App.closeModal();
          if (questionBankFailed()) { App.toast("Connection problem — please try again."); return; }
          if (App.renderSetup) App.renderSetup();
          this.start(topics);
        };
        if (window.Guard) Guard.busy(retry, work, "qload-retry"); else work();
      };
      return;
    }
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

  /* World Class：有上限的 get_ted_session。失敗留在選題頁，不進入空白答題。 */
  async startWorld() {
    if (this._tedLoading) return;
    this._tedLoading = true;
    const btn = document.getElementById("btn-setup-start");
    if (btn) { btn.disabled = true; btn.textContent = "載入中…"; }
    if (window.App && App.setTedStatus) App.setTedStatus("loading");
    try {
      if (!globalThis.TedWorld) {
        if (window.App && App.setTedStatus) App.setTedStatus("error", { error: "config", detail: "TedWorld unavailable" });
        return;
      }
      const pref = TedWorld.loadPref();
      const query = TedWorld.sessionQuery(pref);
      const result = await TedWorld.fetchSession(query);
      if (!result.ok) {
        if (window.App && App.setTedStatus) {
          App.setTedStatus(result.error === "short" ? "short" : "error", result);
        }
        return;
      }
      if (result.empty || !result.questions.length) {
        if (window.App && App.setTedStatus) App.setTedStatus("empty");
        return;
      }
      TedWorld.remember(result.questions);
      if (window.App && App.setTedStatus) App.setTedStatus("");
      this.mode = "ted";
      this.gymMilestone = 0;
      this._begin(result.questions);
    } catch (e) {
      if (window.App && App.setTedStatus) {
        App.setTedStatus("error", { error: (e && e.kind) || "network", detail: e && e.message });
      }
    } finally {
      this._tedLoading = false;
      if (window.App && App._setupTrack === "world" && App._renderWorldSetup && document.getElementById("view-quiz-setup") && document.getElementById("view-quiz-setup").classList.contains("active")) {
        App._renderWorldSetup();
      }
    }
  },

  _begin(set) {
    /* 一 set 做完就係捕捉場景：而家開始背景載 three.js（Rule 103），做完題已經載好 */
    try { if (window.CaptureScene && CaptureScene.preload) CaptureScene.preload(1500); } catch (e) {}
    this.set = set;
    this.total = set.length;
    this.queue = set.map(q => ({ q, requeued: false, dueAt: 0 }));
    this.seenQids = new Set();
    this.answers = new Map();
    this.cells = [];
    this.currentCell = 0;
    this.answered = false;
    this.startTime = Date.now();
    this.segs = set.map(q => ({ key: this._key(q), re: false, state: "" }));
    this.wrongTries = 0;
    this.bestCombo = 0;
    this._setCombo(0);
    const segHost = document.getElementById("quiz-segs");
    if (segHost) segHost.querySelectorAll(".qs-seg").forEach(e => e.remove());
    App.showView("view-quiz");
    this._renderQuestion();
  },

  /* ---------- 題目 key ---------- */
  _key(q) {
    if (q && q.source === "ted" && q.id) return String(q.id);
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

  /* ---------- 渲染 ---------- */
  _renderQuestion() {
    const item = this.queue[0];
    if (!item) { this.finish(); return; }
    const q = item.q;

    this.stopSpeech();
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
    this._curWrong = 0;

    this._updateProgress();

    /* 題目卡只顯示英文句子；圖片題保留 word card */
    const wordCard = document.getElementById("quiz-word-card");
    const isWord = q.type === "word";
    const cardEl = document.getElementById("quiz-card");
    /* 圖片題版面（圖片自動縮放，輸入格永遠喺畫面內） */
    const viewEl = document.getElementById("view-quiz");
    if (viewEl) viewEl.classList.toggle("is-word", isWord);
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
      document.getElementById("quiz-word-status").textContent = "";
      document.getElementById("quiz-word-status").className = "word-status";
      this._autoPlayWord(wordToken);
    } else {
      wordCard.classList.remove("show");
      wordCard.classList.remove("correct", "wrong");
    }

    /* 圖片（句子題專用）*/
    this._renderImage(q);
    this._renderTedMeta(q);
    this._preloadNext();

    /* 空格格數＝第一個答案寫法嘅字數 */
    this.cells = this._buildCells(q);
    this._renderCells(q);

    /* 題型 chip + 指示語 */
    const typeChip = document.getElementById("quiz-type-chip");
    if (typeChip) {
      typeChip.textContent = q && q.source === "ted"
        ? ("World Class · " + (q.cefr || "") + " Lv." + (q.level || "")).replace(/\s+/g, " ").trim()
        : (isWord ? "Picture word" : (q.topic || q.unit || q.category || ""));
    }
    const prompt = document.getElementById("quiz-prompt");
    if (prompt) {
      prompt.textContent = item.requeued ? "Let's try this one again"
        : isWord ? "Type what you hear"
        : this.cells.length > 1 ? "Fill in the blanks" : "Fill in the blank";
    }
    cardEl.classList.remove("win");

    /* 工具列／確認 */
    document.getElementById("quiz-toolbar-before").classList.remove("hidden");
    document.getElementById("quiz-toolbar-after").classList.add("hidden");
    document.getElementById("btn-quiz-check").classList.remove("hidden");
    document.getElementById("btn-quiz-next").classList.add("hidden");
    this._setAction("");
    const hintBtn = document.getElementById("btn-quiz-hint");
    if (hintBtn) hintBtn.disabled = false;
    const hintCount = document.getElementById("quiz-hint-count");
    if (hintCount) hintCount.hidden = true;
    const kb = document.getElementById("quiz-keyboard");
    if (kb) kb.classList.remove("kb-collapsed");
    const scroller = document.getElementById("quiz-scroll");
    if (scroller) scroller.scrollTop = 0;

    /* Chip：未答前顯示實際經過時間 */
    this._renderChip(q, null);

    /* 小學生低 EF → 精靈球捕捉模式 */
    this._setupCatchMode(q);
    /* 觸控裝置固定顯示 App 鍵盤（捕捉模式除外；桌面隱藏） */
    this._syncKeyboard();

    this._focusCurrent();
    this._syncCheckBtn();
    requestAnimationFrame(() => {
      const cur = this.cells[this.currentCell];
      if (cur && cur.cellEl && cur.cellEl.scrollIntoView) {
        try { cur.cellEl.scrollIntoView({ block: "nearest" }); } catch (e) {}
      }
    });
  },

  next() {
    if (!this.answered) return;
    this.stopSpeech();
    this.queue.shift();
    this.answered = false;
    if (this.queue.length === 0) { this.finish(); return; }
    this._renderQuestion();
  },

  quit() {
    this.stopSpeech();
    this.queue = [];
    this.set = [];
    this.cells = [];
    this.answered = true;
    App.renderHome();
    App.showView("view-home");
  },

  /* ---------- 結算 ---------- */
  finish() {
    this._stopPhysics();
    this._physBalls = [];
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
    if (this.mode === "ted" && globalThis.TedWorld && TedWorld.noteResult) {
      try { TedWorld.noteResult(score, this.total); } catch (e) {}
    }
    const data = {
      results,
      score,
      total: this.total,
      duration: Math.floor((Date.now() - this.startTime) / 1000),
      mode: this.mode || null,
      gymMilestone: this.gymMilestone || 0,
      /* 結算 v2 統計（純顯示用） */
      bestCombo: this.bestCombo || 0,
      wrongTries: this.wrongTries || 0,
      hintCount: results.filter(r => r.hint).length
    };
    App.onQuizFinished(data);
  }
});
