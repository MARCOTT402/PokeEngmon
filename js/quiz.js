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

  /* topics: 揀咗嘅題型（空陣列＝全部） */
  start(topics) {
    this.set = drawQuestionSet(GAME_CONFIG.SET_SIZE, topics);
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

    /* 記憶光芒：呢題係記憶曲線到期嘅複習題（stage > 0）→ 金色光芒 + 拍檔提醒 */
    this._renderMemoryLight(q);

    /* 題目圖片（image_file/<編號>.png）；冇圖片就收起個窗 */
    this._renderImage(q);

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
     拍檔提醒：「[Pokémon] remembers this X ago!」答對呢類題 EXP ×1.5 */
  _renderMemoryLight(q) {
    const rec = srsRecord(q);
    this._curMemory = rec && rec.stage > 0 ? rec.stage : 0;
    const memEl = document.getElementById("quiz-memory");
    const card = document.getElementById("quiz-card");
    if (this._curMemory > 0) {
      const labels = { 0.5: "20 minutes", 1: "1 day", 2: "2 days", 7: "7 days", 14: "14 days", 30: "30 days" };
      const entry = getActiveEntry();
      const name = entry ? entryCurrentSpecies(entry)[1] : null;
      memEl.innerHTML = name
        ? `✨ <b>${escapeHTML(name)}</b> remembers this ${labels[this._curMemory] || "some time"} ago!<br><small>Time to refresh your brain! (Bonus XP ×1.5)</small>`
        : `✨ Time to refresh your brain!<br><small>Bonus XP ×1.5 for this one!</small>`;
      memEl.classList.add("show");
      card.classList.add("memory-glow");
    } else {
      memEl.classList.remove("show");
      card.classList.remove("memory-glow");
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

  /* 比對答案：trim + 不分大小寫；accept 列表都接受；答案留空＝要留空 */
  _isCorrect(q, text) {
    const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, " ");
    const mine = norm(text);
    if (mine === norm(q.answer)) return true;
    return (q.accept || []).some(a => norm(a) === mine);
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
      fb.textContent = q.answer ? `The answer is "${q.answer}"` : `The answer is "(blank)"`;
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
