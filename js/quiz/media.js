/* ============================================================
   PokeEngmon - Quiz：題目媒體（字卡、圖片、預載、讀音）
   由 js/quiz.js 拆出（總計劃 P2.5；Rule 116）。同 js/quiz.js 共用同一個 Quiz 物件：
   Object.assign 只係將方法掛返上去，this／Quiz.xxx 用法完全唔變。
   載入次序：js/quiz.js 之後（index.html）。
   ============================================================ */

Object.assign(Quiz, {
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

  /* 預載下一題（Rule 102）：圖片同錄音喺答緊呢題嘅時候背景載，撳 Next 即刻出、即刻有聲。
     只預載 queue[1]（答錯會 push 返隊尾，唔使預載晒成 set）；失敗唔理，render 嗰陣照舊再載 */
  _preloadNext() {
    const nx = this.queue[1] && this.queue[1].q;
    if (!nx) return;
    setTimeout(() => {
      try {
        const audio = window.CaptureScene && CaptureScene.audio;
        if (nx.type === "word") {
          if (nx.image) { const im = new Image(); im.decoding = "async"; im.src = nx.image; }
          if (audio && audio.preloadWord && typeof wordAudioURL === "function") audio.preloadWord(wordAudioURL(nx.word));
        } else if (nx.no && typeof findQuestionImage === "function") {
          findQuestionImage(nx.no).then(url => { if (url) { const im = new Image(); im.decoding = "async"; im.src = url; } }).catch(() => {});
        }
        if (nx.source === "ted" && nx.hasAudio && nx.audioUrl && audio && audio.preloadWord) audio.preloadWord(nx.audioUrl);
      } catch (e) { /* 預載不可以影響答題 */ }
    }, 400);
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

  /* 圖片題播放：slow=true → 系統語音 0.5x（錄音冇慢速版）；播放中 🔊 掣有聲波動畫 */
  playWordAudio(slow) {
    const cur = (this.queue[0] && this.queue[0].q) || null;
    if (!cur || cur.type !== "word") return;
    const status = document.getElementById("quiz-word-status");
    const btn = document.getElementById(slow ? "btn-word-slow" : "btn-word-say");
    const token = (this._playToken = (this._playToken || 0) + 1);
    const setPlaying = (on) => {
      if (token !== this._playToken && on) return;
      ["btn-word-say", "btn-word-slow"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("playing", on && el === btn);
      });
    };
    const done = () => { if (token === this._playToken) setPlaying(false); };
    status.className = "word-status";
    status.textContent = "";
    setPlaying(true);

    if (slow && window.speechSynthesis) {
      try {
        const u = new SpeechSynthesisUtterance(String(cur.word || ""));
        u.lang = "en-US";
        u.rate = 0.5;
        const prefs = (typeof loadAudioPrefs === "function") ? loadAudioPrefs() : null;
        if (prefs && prefs.voice != null) u.volume = Math.max(0, Math.min(1, Number(prefs.voice)));
        u.onend = done; u.onerror = done;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        setTimeout(done, 4000);
      } catch (e) { done(); }
      this._focusCurrent();
      return;
    }

    const audio = window.CaptureScene && CaptureScene.audio;
    if (!audio) { done(); status.textContent = "🔇 Audio unavailable"; status.className = "word-status missing"; return; }
    if (audio.ensure) audio.ensure();
    const url = wordAudioURL(cur.word);
    audio.playWord(url, (usedSpeech) => {
      if (usedSpeech) {
        status.textContent = "System voice";
        status.className = "word-status speech";
      } else {
        done();
        status.textContent = "🔇 No recording yet for \"" + cur.word + "\"";
        status.className = "word-status missing";
      }
    }, { onEnd: done });
    setTimeout(done, 5000);   /* 保險：callback 冇返都會停動畫 */
    /* 播完音頻／按語音鍵後，浮標返去輸入格 */
    this._focusCurrent();
  },

  /* 中文、講題、筆記只用 textContent。講題空白就不顯示，不補假標題。 */
  _renderTedMeta(q) {
    const zh = document.getElementById("quiz-zh");
    const talk = document.getElementById("quiz-talk");
    const note = document.getElementById("quiz-note");
    const isTed = !!(q && q.source === "ted");
    if (zh) {
      const text = isTed ? String(q.zh || "").trim() : "";
      zh.textContent = text;
      zh.hidden = !text;
    }
    if (talk) {
      const text = isTed ? String(q.talkTitle || "").trim() : "";
      talk.textContent = text;
      talk.hidden = !text;
    }
    if (note) {
      note.textContent = "";
      note.hidden = true;
    }
  },

  _showCompletedNote(q) {
    const note = document.getElementById("quiz-note");
    if (!note) return;
    const text = q && q.source === "ted" ? String(q.note || "").trim() : "";
    note.textContent = text;
    note.hidden = !text;
  },

  /* 把第一個 ___ 換成答案，得到完整英文句。 */
  _fullSentence(q) {
    if (!q) return "";
    if (q.type === "word") return String(q.word || "").trim();
    if (globalThis.TedWorld && TedWorld.fullSentence) return TedWorld.fullSentence(q);
    const sentence = String(q.sentence || "");
    const answer = String(q.answer || "");
    if (sentence.indexOf("___") < 0) return sentence.trim();
    return sentence.replace(/_{3,}/, answer).trim();
  },

  stopSpeech() {
    this._speakToken = (this._speakToken || 0) + 1;
    try {
      const audio = window.CaptureScene && CaptureScene.audio;
      if (audio && audio.stopVoice) audio.stopVoice();
      else if (window.speechSynthesis) speechSynthesis.cancel();
    } catch (e) {}
  },

  /* 答完後朗讀完整英文句。有預先產生的 MP3 就走 WebAudio，否則或失敗時改 en-US 系統語音。
     句子題出題時不播提示音。 */
  _speakCompleted(q) {
    if (!q) return;
    const token = (this._speakToken = (this._speakToken || 0) + 1);
    const alive = () => token === this._speakToken;
    if (q.type === "word") {
      try {
        const audio = window.CaptureScene && CaptureScene.audio;
        if (audio && audio.stopVoice) audio.stopVoice();
      } catch (e) {}
      this.playWordAudio();
      return;
    }
    const full = this._fullSentence(q);
    if (!full) return;
    const prefs = (typeof loadAudioPrefs === "function") ? loadAudioPrefs() : null;
    const voice = prefs && prefs.voice != null ? Number(prefs.voice) : 1;
    if (!(voice > 0)) {
      this.stopSpeech();
      return;
    }
    try { if (window.CaptureScene && CaptureScene.primeAudio) CaptureScene.primeAudio(); } catch (e) {}
    const audio = window.CaptureScene && CaptureScene.audio;
    const url = (q.hasAudio && q.audioUrl) ? q.audioUrl : "";
    if (audio && audio.playSentence) {
      audio.playSentence(url, full, { alive });
      return;
    }
    try {
      if (!window.speechSynthesis || !alive()) return;
      const u = new SpeechSynthesisUtterance(full);
      u.lang = "en-US";
      u.rate = 0.9;
      u.volume = Math.max(0, Math.min(1, voice));
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
  },

  /* 答完後 🔊：圖片單字題播錄音；句子題朗讀完整句子（MP3 優先）。 */
  pronounce() {
    const cur = (this.queue[0] && this.queue[0].q) || null;
    if (!cur) return;
    if (cur.type === "word") { this.playWordAudio(); return; }
    this._speakCompleted(cur);
  }
});
