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

    /* 自動聚焦（手提裝置會彈鍵盤） */
    setTimeout(() => input.focus(), 300);
  },

  /* 記憶光芒：SRS 複習題（stage 0.5/1/2/7/14/30 到期）先會發光
     彩色呼吸光芒 + 拍檔小頭像 + 文字提醒；答對呢類題 EXP ×1.5 */
  _renderMemoryLight(q) {
    const rec = srsRecord(q);
    this._curMemory = rec && rec.stage > 0 ? rec.stage : 0;
    const memEl = document.getElementById("quiz-memory");
    const card = document.getElementById("quiz-card");
    if (this._curMemory > 0) {
      const labels = { 0.5: "20 minutes", 1: "1 day", 2: "2 days", 7: "7 days", 14: "14 days", 30: "30 days" };
      const entry = getActiveEntry();
      let spriteHTML = "";
      let textHTML;
      if (entry) {
        const dexId = entryCurrentSpecies(entry)[0];
        spriteHTML = `<img class="quiz-memory-sprite" src="${animatedURL(dexId)}" alt="partner" onerror="this.onerror=null;this.src='${artworkURL(dexId)}'">`;
        textHTML = `<b>${escapeHTML(entryCurrentSpecies(entry)[1])}</b> remembers this ${labels[this._curMemory] || "some time"} ago!<br><small>Time to refresh your brain! (Bonus XP ×1.5)</small>`;
      } else {
        textHTML = `✨ Time to refresh your brain!<br><small>Bonus XP ×1.5 for this one!</small>`;
      }
      memEl.innerHTML = spriteHTML + `<div class="quiz-memory-text">${textHTML}</div>`;
      memEl.classList.add("show");
      card.classList.add("memory-glow");
      document.getElementById("quiz-word-card").classList.add("memory-glow");
    } else {
      memEl.classList.remove("show");
      card.classList.remove("memory-glow");
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
    audio.playWord(url, () => {
      /* 載入失敗（未生成語音）→ 明確提示，唔會靜靜當冇事 */
      status.textContent = "🔇 No recording yet for \"" + q.word + "\"";
      status.className = "word-status missing";
    });
  },

  submit() {
    if (this.locked) return;
    const input = document.getElementById("quiz-answer");
    const text = input.value;
    this.locked = true;
    const q = this.set[this.idx];
    const correct = this._isCorrect(q, text);
    this.results.push({ qid: q.id, chosen: text.trim(), correct, topic: q.topic, memory: this._curMemory > 0 });
    /* 記憶曲線（隱藏）：答對即時升級；答錯唔即刻清零 —
       延後到回合尾 Power Up Zone 全部改錯完成後先統一重置 stage_0 */
    if (correct) updateSrs(q, true);

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
    } else {
      const right = q.type === "word" ? q.word : q.answer;
      fb.textContent = right ? `The answer is "${right}"` : `The answer is "(blank)"`;
      fb.className = "quiz-feedback bad";
    }

    setTimeout(() => {
      this.idx++;
      if (this.idx < this.set.length) this._renderQuestion();
      else this.finish();
    }, correct ? 900 : 2000);   // 答錯停耐少少，等佢睇清楚答案
  },

  finish() {
    clearInterval(this.timerId);
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
