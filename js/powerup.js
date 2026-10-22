/* ============================================================
   PokeEngmon - ⚡ Power Up Zone（回合尾改錯）
   第 10 題完成後，錯題唔直接結算：入呢度重做至全對先完成回合
   三階腳架：
     第 1 次改錯仍錯 → 唔俾答案，只俾 Hint（關鍵詞 Highlight + 提示 + 首字母）
     第 2 次仍錯     → 顯示詳細解析（關鍵詞箭咀 + 答案），要求重做到啱
   所有錯題改啱後，先統一將錯題 SRS stage 清零，再跳入 WARNING 捕捉頁
   ============================================================ */

const PowerUp = {
  queue: [],        // [{ q, chosen }] 本回合做錯嘅題
  idx: 0,
  attempts: 0,      // 當前題目改錯失敗次數
  locked: false,
  onDone: null,

  start(wrongList, onDone) {
    this.queue = wrongList;
    this.idx = 0;
    this.onDone = onDone;
    App.showView("view-powerup");
    this._render();
  },

  _render() {
    const item = this.queue[this.idx];
    this.attempts = 0;
    this.locked = false;

    document.getElementById("powerup-progress").textContent = `${this.idx + 1} / ${this.queue.length}`;
    document.getElementById("powerup-bar").style.width = `${(this.idx / this.queue.length) * 100}%`;

    /* 句子（同做題畫面一樣，空位藍色） */
    document.getElementById("powerup-sentence").innerHTML =
      escapeHTML(item.q.sentence).replace(/___/, `<span class="quiz-blank">&nbsp;___&nbsp;</span>`);

    /* 清返 Hint / 詳細解析 */
    const hint = document.getElementById("powerup-hint");
    hint.innerHTML = "";
    hint.className = "powerup-hint";
    document.getElementById("powerup-explain").innerHTML = "";

    const input = document.getElementById("powerup-answer");
    input.value = "";
    input.disabled = false;
    input.className = "quiz-answer-input";
    document.getElementById("btn-powerup-submit").disabled = false;

    const fb = document.getElementById("powerup-feedback");
    fb.textContent = "";
    fb.className = "quiz-feedback";

    setTimeout(() => input.focus(), 300);
  },

  /* 比對答案：同 Quiz 同一套規則（trim + 不分大小寫 + accept 列表） */
  _isCorrect(q, text) {
    const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, " ");
    const mine = norm(text);
    if (mine === norm(q.answer)) return true;
    return (q.accept || []).some(a => norm(a) === mine);
  },

  submit() {
    if (this.locked) return;
    const item = this.queue[this.idx];
    const q = item.q;
    const input = document.getElementById("powerup-answer");
    const text = input.value;
    const fb = document.getElementById("powerup-feedback");

    /* ---------- 改啱 → 下一題 ---------- */
    if (this._isCorrect(q, text)) {
      this.locked = true;
      input.disabled = true;
      document.getElementById("btn-powerup-submit").disabled = true;
      input.classList.add("correct");
      if (window.CaptureScene && CaptureScene.audio) CaptureScene.audio.correct();
      fb.textContent = ["Fixed! ⚡", "Powered up! ⚡", "Got it this time! ⚡"][Math.floor(Math.random() * 3)];
      fb.className = "quiz-feedback good";
      setTimeout(() => {
        this.idx++;
        if (this.idx < this.queue.length) this._render();
        else this._complete();
      }, 900);
      return;
    }

    /* ---------- 改錯 → 三階腳架 ---------- */
    this.attempts++;
    if (window.CaptureScene && CaptureScene.audio) CaptureScene.audio.wrong();
    input.value = "";
    input.classList.remove("shake");
    void input.offsetWidth;   // 重播 shake 動畫
    input.classList.add("shake");

    if (this.attempts === 1) {
      /* 第一階：唔俾答案 — 關鍵詞 Highlight + 提示 + 答案首字母 */
      fb.textContent = "Not quite — here's a hint! 💡";
      fb.className = "quiz-feedback bad";
      document.getElementById("powerup-sentence").innerHTML = Explain._buildSentenceHTML(q);
      const parts = [];
      if (q.explain && q.explain.hint) parts.push(`💡 ${escapeHTML(q.explain.hint)}`);
      if (q.answer) {
        parts.push(`Starts with <b>${escapeHTML(q.answer[0].toUpperCase())}</b>… (${q.answer.length} letter${q.answer.length > 1 ? "s" : ""})`);
      } else {
        parts.push(`Maybe <b>no word</b> is needed here?`);
      }
      const hint = document.getElementById("powerup-hint");
      hint.innerHTML = parts.join("<br>");
      hint.className = "powerup-hint show";
    } else {
      /* 第二階：Confirm 答錯 — 詳細解析（關鍵詞箭咀 + 答案），要求重做到啱 */
      fb.textContent = "Study the explanation, then type the correct answer.";
      fb.className = "quiz-feedback bad";
      const box = document.getElementById("powerup-explain");
      box.innerHTML = "";
      Explain.render(box, q, text.trim() || null);
    }
  },

  /* 全部錯題改啱 → 統一將錯題 SRS stage 清零（延後清零時機）→ WARNING 捕捉頁 */
  _complete() {
    this.queue.forEach(item => updateSrs(item.q, false));
    document.getElementById("powerup-bar").style.width = "100%";
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
  }
};
