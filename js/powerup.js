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
  fixedCount: 0,    // 本回合成功改啱嘅題數（供慶祝 pop 顯示）
  EXP_PER_FIX: 5,   // 每改啱一題嘅小獎勵（懲罰 → 補救有回報）
  locked: false,
  onDone: null,

  start(wrongList, onDone) {
    this.queue = wrongList;
    this.idx = 0;
    this.fixedCount = 0;
    this.onDone = onDone;
    App.showView("view-powerup");
    this._render();
  },

  /* 退出 Power Up Zone：放棄本回合，彈 confirm 警告 */
  quit() {
    if (this.locked) return;
    App.showModal(`
      <div class="confirm-box">
        <p>Quit Power Up Zone?<br><small>Your fixes so far will be lost — this round won't be completed.</small></p>
        <div class="confirm-row">
          <button id="pu-quit-yes" class="btn-big btn-danger">Quit</button>
          <button id="pu-quit-no" class="btn-big btn-plain">Keep Fixing</button>
        </div>
      </div>`, true);
    document.getElementById("pu-quit-yes").onclick = () => {
      this.locked = true;
      this.onDone = null;
      App.closeModal();
      App.renderHome();
      App.showView("view-home");
    };
    document.getElementById("pu-quit-no").onclick = () => App.closeModal();
  },

  _render() {
    const item = this.queue[this.idx];
    this.attempts = 0;
    this.locked = false;
    item.startTs = Date.now();   /* 記錄本題開始時間（供 computeQ response_ms 用）*/

    document.getElementById("powerup-progress").textContent = `${this.idx + 1} / ${this.queue.length}`;
    document.getElementById("powerup-bar").style.width = `${(this.idx / this.queue.length) * 100}%`;

    /* 題目內容：句子題顯示句子；圖片單字題顯示圖片（點圖再聽一次） */
    if (item.q.type === "word") {
      document.getElementById("powerup-sentence").innerHTML =
        `<img class="powerup-word-image" src="${item.q.image}" alt="Tap to listen">`;
      this._playWord(item.q);
    } else {
      document.getElementById("powerup-sentence").innerHTML =
        escapeHTML(item.q.sentence).replace(/___/, `<span class="quiz-blank">&nbsp;___&nbsp;</span>`);
    }

    /* 清返 Hint / 詳細解析 */
    const hint = document.getElementById("powerup-hint");
    hint.innerHTML = "";
    hint.className = "powerup-hint";

    /* 圖片單字題：點圖可以再聽一次 */
    const sentEl = document.getElementById("powerup-sentence");
    sentEl.onclick = item.q.type === "word" ? () => this._playWord(item.q) : null;
    document.getElementById("powerup-explain").innerHTML = "";

    const input = document.getElementById("powerup-answer");
    input.value = "";
    input.disabled = false;
    input.className = "quiz-answer-input";
    document.getElementById("btn-powerup-submit").disabled = false;

    const fb = document.getElementById("powerup-feedback");
    fb.textContent = "";
    fb.className = "quiz-feedback";

    /* 圖片單字題唔自動彈鍵盤（會遮住圖片），句子題先自動聚焦 */
    if (item.q.type !== "word") setTimeout(() => input.focus(), 300);
  },

  /* 播圖片單字題嘅語音 */
  _playWord(q) {
    const audio = window.CaptureScene && CaptureScene.audio;
    if (audio) audio.playWord(wordAudioURL(q.word));
  },

  /* SM-2 評分：Dist=0 先算清除（唔係只 exact match 嘅 _isCorrect）*/
  _judge(q, text, response_ms) {
    const target = q.type === "word" ? q.word : q.answer;
    return SM2.computeQ(text || "", target || "", response_ms || 0);
  },

  submit() {
    if (this.locked) return;
    const item = this.queue[this.idx];
    const q = item.q;
    const input = document.getElementById("powerup-answer");
    const text = input.value;
    const fb = document.getElementById("powerup-feedback");
    const response_ms = Date.now() - (item.startTs || Date.now());
    const judge = this._judge(q, text, response_ms);

    /* ---------- Dist=0 → 清除 + 更新 SM-2 卡片 ---------- */
    if (judge.dist === 0) {
      this.locked = true;
      input.disabled = true;
      document.getElementById("btn-powerup-submit").disabled = true;
      input.classList.add("correct");
      if (window.CaptureScene && CaptureScene.audio) CaptureScene.audio.correct();
      fb.textContent = ["Fixed! ⚡", "Powered up! ⚡", "Got it this time! ⚡"][Math.floor(Math.random() * 3)];
      fb.className = "quiz-feedback good";

      /* 更新 SM-2 卡片（呢個係 post-PowerUp 最終狀態）*/
      const card = SM2.getOrCreateCard(q);
      const updated = SM2.updateCard(card, judge.q, response_ms);
      updated.ease_factor = SM2.computeEF(card.ease_factor, judge.reason);
      SM2.upsertCard(updated);
      SM2.appendHistory({
        device_id: (loadState && loadState().device_id) || "unknown",
        card_id: card.card_id,
        ts: Date.now(),
        q_score: judge.q,
        response_ms,
        levenshtein_distance: 0,
        is_typo: false
      });

      /* 改啱小獎勵：浮字 +EXP（爽感即時回饋） */
      this.fixedCount++;
      this._expFloat();

      setTimeout(() => {
        this.idx++;
        if (this.idx < this.queue.length) this._render();
        else this._complete();
      }, 900);
      return;
    }

    /* ---------- Dist>=1 → 保留喺錯題池，三階腳架 ---------- */
    this.attempts++;
    if (window.CaptureScene && CaptureScene.audio) CaptureScene.audio.wrong();
    input.value = "";
    input.classList.remove("shake");
    void input.offsetWidth;
    input.classList.add("shake");

    const target = q.type === "word" ? q.word : q.answer;
    if (this.attempts === 1) {
      /* 第一階：唔俾答案 — 關鍵詞 Highlight + 提示 + 首字母 + 字母數 + 差距字母數 */
      fb.textContent = judge.reason === "soft_fail_typo"
        ? `You were only off by ${judge.dist} character${judge.dist !== 1 ? "s" : ""} — fix that one! 💡`
        : "Not quite — here's a hint! 💡";
      fb.className = "quiz-feedback bad";
      if (q.type !== "word") {
        document.getElementById("powerup-sentence").innerHTML = Explain._buildSentenceHTML(q);
      }
      const parts = [];
      if (q.explain && q.explain.hint) parts.push(`💡 ${escapeHTML(q.explain.hint)}`);
      if (target) {
        parts.push(`Starts with <b>${escapeHTML(target[0].toUpperCase())}</b>… (${target.length} letter${target.length > 1 ? "s" : ""})`);
      } else {
        parts.push(`Maybe <b>no word</b> is needed here?`);
      }
      parts.push(`Your answer was off by <b>${judge.dist}</b> character${judge.dist !== 1 ? "s" : ""}.`);
      const hint = document.getElementById("powerup-hint");
      hint.innerHTML = parts.join("<br>");
      hint.className = "powerup-hint show";
    } else {
      /* 第二階：顯示完整答案 + 逐字母揭示 + 關鍵詞箭咀 */
      fb.textContent = "Study the explanation, then type the correct answer.";
      fb.className = "quiz-feedback bad";
      const box = document.getElementById("powerup-explain");
      box.innerHTML = "";
      if (q.type === "word") {
        const letters = String(q.word).split("").map(ch => `<span class="word-letter">${escapeHTML(ch)}</span>`).join("");
        box.innerHTML = `
          <div class="explain-card">
            <div class="explain-answer-line"><span class="explain-right">Answer: ${escapeHTML(q.word)}</span></div>
            <div class="word-letters">${letters}</div>
          </div>`;
      } else {
        Explain.render(box, q, text.trim() || null);
      }
    }
  },

  /* 改啱獎勵：畫面浮 +EXP，同時實際入帳（拍檔優先，冇拍檔存 pending） */
  _expFloat() {
    const amount = this.EXP_PER_FIX;
    const input = document.getElementById("powerup-answer");
    const r = input.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "pu-float";
    el.textContent = `+${amount} EXP ⚡`;
    el.style.left = (r.left + r.width / 2 - 45) + "px";
    el.style.top = (r.top - 6) + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);

    try {
      const st = loadState();
      const entry = getActiveEntry();
      if (entry) {
        const res = addEntryExp(entry, amount);
        if (res && res.levelsGained > 0) {
          App.toast(`${entryCurrentSpecies(entry)[1]} reached Lv.${entry.level}!`);
        }
        if (res && res.evolvedTo) this._evolvedThisRun = true;
      } else {
        st.pendingExp = (st.pendingExp || 0) + amount;
      }
      saveState();
    } catch (e) { console.warn("[PowerUp] exp award failed:", e); }
  },

  /* 全部錯題 Dist=0 清除 → 慶祝 pop → 直接進 WARNING 捕捉頁
     （每張卡已喺 submit() 入面 Dist=0 時即時 upsert，唔再統一清零）*/
  _complete() {
    document.getElementById("powerup-bar").style.width = "100%";
    const totalFixed = this.fixedCount;
    const totalExp = totalFixed * this.EXP_PER_FIX;
    const cb = this.onDone;
    this.onDone = null;

    /* v99：server 權威入帳 —— per-fix 已即時本地入咗俾 UI，
       呢度一次過 batch RPC 上雲（失敗下次 pull 還原） */
    const entry = getActiveEntry();
    if (entry && totalExp > 0 && window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
      SupabaseAuth.addEntryExp(entry.uid, totalExp);
      if (this._evolvedThisRun && entry.branch != null && window.Sync && Sync.isEnabled()) {
        Sync.patchEntry(entry.uid, { branch: entry.branch });
      }
    }
    this._evolvedThisRun = false;

    /* 慶祝全屏 pop：改錯完成嘅爽感時刻（1.8 秒後自動進捕捉） */
    const overlay = document.createElement("div");
    overlay.className = "pu-complete";
    overlay.innerHTML = `
      <div class="pu-complete-card">
        <div class="pu-big">⚡ ALL FIXED!</div>
        <div class="pu-sub">You powered up ${totalFixed} question${totalFixed !== 1 ? "s" : ""}</div>
        <div class="pu-exp">+${totalExp} EXP earned</div>
      </div>`;
    document.body.appendChild(overlay);

    /* 星爆粒子 */
    for (let i = 0; i < 14; i++) {
      const dot = document.createElement("i");
      dot.className = "pu-burst";
      const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const dist = 90 + Math.random() * 90;
      dot.style.background = ["#ffcb05", "#ff7043", "#66bb6a", "#42a5f5", "#ab47bc"][i % 5];
      overlay.querySelector(".pu-complete-card").appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.transition = "transform .9s ease-out, opacity .9s ease-out";
        dot.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) scale(.4)`;
        dot.style.opacity = "0";
      });
    }

    if (window.CaptureScene && CaptureScene.audio) CaptureScene.audio.correct();
    setTimeout(() => {
      overlay.remove();
      if (cb) cb();
    }, 1800);
  }
};
