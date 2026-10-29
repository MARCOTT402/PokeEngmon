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
      this.answers.set(k, { hintCount: 0, hintEver: false, clean: false, chosen: "" });
    }
    return this.answers.get(k);
  },

  /* ---------- 進度 ---------- */
  _updateProgress() {
    const shown = this.answered
      ? this.seenQids.size
      : Math.min(this.total, this.seenQids.size + 1);
    document.getElementById("quiz-progress").textContent = `${shown} / ${this.total}`;
    document.getElementById("quiz-bar").style.width = `${this.total ? (this.seenQids.size / this.total) * 100 : 0}%`;
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
    cardEl.classList.remove("memory-glow");
    cardEl.style.display = "";

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

    span.appendChild(ghost);
    span.appendChild(text);
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
    c.ghostEl.style.display = (c.ghost && !c.value) ? "" : "none";
  },

  _onInput(i) {
    if (this.answered) return;
    const c = this.cells[i];
    if (!c) return;

    c.value = c.input.value;
    c.textEl.textContent = c.value;

    /* 打字後 ghost 消失 */
    if (c.value.length > 0 && c.ghost) {
      c.ghost = "";
      this._applyGhost(c);
    }
    /* 清走 ✓ 錯誤嘅紅狀態 */
    c.cellEl.classList.remove("bad");
    const bang = c.cellEl.querySelector(".qb-bang");
    if (bang) bang.remove();

    const val = this._norm(c.value);
    if (val !== "" && this._cellMatch(c, val)) this._greenCell(i);
  },

  _greenCell(i) {
    const c = this.cells[i];
    if (!c || c.green) return;
    c.green = true;
    c.cellEl.classList.add("good");
    c.cellEl.classList.remove("bad");
    const bang = c.cellEl.querySelector(".qb-bang");
    if (bang) bang.remove();
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

  hint() {
    if (this.answered) return;
    const item = this.queue[0];
    if (!item) return;
    const a = this._answerFor(item.q);
    const c = this.cells[this.currentCell];
    if (!c) return;

    if (c.empty) { this._vibrate(20); return; }

    if (a.hintCount === 0) {
      /* L1：首兩個字母 */
      a.hintCount = 1;
      c.ghost = c.primary.slice(0, 2);
      this._applyGhost(c);
      return;
    }

    /* ghost 仍然顯示 → 只震一下 */
    if (c.ghost && !c.value) {
      this._vibrate(30);
      return;
    }

    /* ghost 已消失 → 重出 L2，並清空該格 */
    a.hintCount = 2;
    c.ghost = c.primary;
    c.value = "";
    if (c.input) c.input.value = "";
    c.textEl.textContent = "";
    c.cellEl.classList.remove("bad");
    const bang = c.cellEl.querySelector(".qb-bang");
    if (bang) bang.remove();
    this._applyGhost(c);
    this._focusCurrent();
  },

  /* 完整答案變體（處理 accept 同 primary 字數不同嘅情況，例如 were not / weren't）*/
  _fullAnswerVariants(q) {
    const raw = q.type === "word"
      ? [q.word || ""].concat(q.accept || [])
      : [q.answer || ""].concat(q.accept || []);
    return raw.map(v => this._norm(v)).filter(Boolean);
  },

  /* ✓ 確認（保留）：不符 → 紅驚嘆號 + 微紅底 + EF −0.14 */
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
        x.cellEl.classList.remove("bad");
        if (x.input) x.input.disabled = true;
      });
      this._complete();
      return;
    }

    /* 錯誤：只扣 EF，不重排、不清題、不寫 history */
    c.cellEl.classList.add("bad");
    if (!c.cellEl.querySelector(".qb-bang")) {
      const bang = document.createElement("span");
      bang.className = "qb-bang";
      bang.textContent = "!";
      c.cellEl.appendChild(bang);
    }
    this._vibrate(50);

    const card = SM2.applyCheckFail(this._curCard || SM2.getOrCreateCard(item.q));
    this._curCard = SM2.upsertCard(card);
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

    let card = SM2.getOrCreateCard(q);
    card = usedHint ? SM2.applyHint(card, a.hintCount, now) : SM2.applyClean(card, now);
    this._curCard = SM2.upsertCard(card);

    SM2.appendHistory({
      card_id: card.card_id,
      ts: now,
      q_score: usedHint ? SM2.HINT_Q : SM2.CLEAN_Q,
      response_ms: responseMs,
      levenshtein_distance: 0,
      is_typo: false
    });

    a.hintEver = a.hintEver || usedHint;
    if (!usedHint) a.clean = true;
    if (!a.chosen) a.chosen = this._joinedAnswer();
    this.seenQids.add(this._key(q));

    /* 用提示 → 排入重排佇列（最後一題豁免，保證回合終止）*/
    let requeued = false;
    if (usedHint && this.queue.length > 1) {
      this.queue.push({ q, requeued: true, dueAt: now + 5 * 60 * 1000 });
      requeued = true;
    }

    /* UI：鎖格、換工具列 */
    this.cells.forEach(c => {
      if (c.input) c.input.disabled = true;
      this._applyGhost(c);
    });
    document.getElementById("btn-quiz-check").classList.add("hidden");
    document.getElementById("quiz-toolbar-before").classList.add("hidden");
    document.getElementById("quiz-toolbar-after").classList.remove("hidden");

    const fb = document.getElementById("quiz-feedback");
    fb.textContent = usedHint ? "Correct — hint used." : this._praise();
    fb.className = "quiz-feedback good";

    /* Chip：重排維持「Review in 5 minutes」原字眼 */
    if (requeued) {
      this._renderChip(q, "Review in 5 minutes");
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
  _renderChip(q, nextText) {
    const el = document.getElementById("quiz-chip");
    if (!el) return;
    if (nextText) {
      el.textContent = nextText;
      el.classList.add("show", "next");
      return;
    }
    el.classList.remove("next");
    const card = this._curCard || SM2.getOrCreateCard(q);
    const last = SM2.lastReviewedMs(card);
    if (!last || last <= 0) {
      el.textContent = "";
      el.classList.remove("show");
      return;
    }
    const span = SM2.formatSpan(Date.now() - last);
    el.textContent = `Last practised ${span.value} ${span.unit}${span.value === 1 ? "" : "s"} ago`;
    el.classList.add("show");
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
    document.getElementById("quiz-settings-close").onclick = () => App.closeModal();
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
