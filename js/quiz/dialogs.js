/* ============================================================
   PokeEngmon - Quiz：答題中嘅彈窗（離開確認、字卡抽屜、回報問題、設定）
   由 js/quiz.js 拆出（總計劃 P2.5；Rule 116）。同 js/quiz.js 共用同一個 Quiz 物件：
   Object.assign 只係將方法掛返上去，this／Quiz.xxx 用法完全唔變。
   載入次序：js/quiz.js 之後（index.html）。
   ============================================================ */

Object.assign(Quiz, {
  /* ✕：確認離開（Esc 仍然開設定） */
  confirmQuit() {
    App.showModal(`
      <div class="confirm-box">
        <p><span style="font-size:2.4rem">🥺</span><br><b>Wait, don't go!</b><br>
          <small>You'll lose this set's progress if you quit now.</small></p>
        <div class="confirm-row">
          <button id="quiz-quit-stay" class="btn-big btn-primary">Keep learning</button>
          <button id="quiz-quit-go" class="btn-big btn-plain">End session</button>
        </div>
      </div>`, true);
    document.getElementById("quiz-quit-stay").onclick = () => {
      App.closeModal();
      setTimeout(() => this._focusCurrent(), 100);
    };
    document.getElementById("quiz-quit-go").onclick = () => {
      App.closeModal();
      this.quit();
    };
  },

  /* ---------- 卡片右下角工具 / 錯誤回報 ---------- */
  toggleCardDrawer(force) {
    const drawer = document.getElementById("quiz-card-drawer");
    const btn = document.getElementById("btn-quiz-more");
    if (!drawer) return;
    const show = typeof force === "boolean" ? force : drawer.classList.contains("hidden");
    drawer.classList.toggle("hidden", !show);
    drawer.classList.toggle("show", show);
    if (btn) {
      btn.classList.toggle("open", show);
      btn.setAttribute("aria-expanded", show ? "true" : "false");
    }
  },

  openReport() {
    const item = this.queue[0];
    if (!item) return;
    const q = item.q;
    const isWord = q.type === "word";
    const answer = isWord ? q.word : q.answer;
    const explain = (q.explain && q.explain.hint) || "";
    const content = isWord
      ? `<img class="report-thumb" src="${escapeHTML(q.image)}" alt="Question picture">`
      : `<div class="report-sentence">${escapeHTML(q.sentence)}</div>`;

    const reasons = [
      { key: "image", label: "Image is wrong" },
      { key: "question", label: "Question is wrong" },
      { key: "answer", label: "Answer is wrong" },
      { key: "audio", label: "Listening audio is wrong" },
      { key: "other", label: "Other" }
    ];
    const chips = reasons
      .map(r => `<button type="button" class="report-chip" data-reason="${r.key}">${r.label}</button>`)
      .join("");

    App.showModal(`
      <div class="report-box" id="report-box">
        <h3>⚠️ Report a problem</h3>
        <div class="report-q">
          <div class="report-q-label">Question</div>
          ${content}
          <div class="report-row"><span>Answer</span><b>${escapeHTML(answer) || "(blank)"}</b></div>
          <div class="report-row"><span>Explanation</span><b>${escapeHTML(explain) || "No explanation provided."}</b></div>
        </div>
        <h4 class="report-ask">What went wrong?</h4>
        <div class="report-chips" id="report-chips">${chips}</div>
        <div class="report-more hidden" id="report-more">
          <textarea id="report-detail" class="report-detail" rows="4"
            placeholder="Tell us more about the problem so we can improve and fix it. Please note: abusive or defamatory language may result in restricted app access."></textarea>
          <div class="confirm-row">
            <button id="report-send" class="btn-big btn-primary" disabled>Send report</button>
            <button id="report-cancel" class="btn-big btn-plain">Cancel</button>
          </div>
        </div>
      </div>`);

    const chipsEl = document.getElementById("report-chips");
    const more = document.getElementById("report-more");
    const send = document.getElementById("report-send");
    const detail = document.getElementById("report-detail");
    const selected = new Set();

    chipsEl.onclick = (e) => {
      const chip = e.target.closest(".report-chip");
      if (!chip) return;
      const key = chip.dataset.reason;
      if (selected.has(key)) {
        selected.delete(key);
        chip.classList.remove("on");
      } else {
        selected.add(key);
        chip.classList.add("on");
      }
      const show = selected.size > 0;
      more.classList.toggle("hidden", !show);
      send.disabled = !show;
      if (show) setTimeout(() => detail.focus(), 120);
    };

    document.getElementById("report-cancel").onclick = () => App.closeModal();

    send.onclick = Guard.asyncClick(async () => {
      /* 重複撳由 Guard.asyncClick 擋（佢撳時已 disable send），唔好再睇 send.disabled（Rule 94） */
      if (selected.size === 0) return;
      const report = {
        id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        ts: Date.now(),
        device_id: typeof ensureDeviceId === "function" ? ensureDeviceId() : "",
        qid: q.id || this._key(q),
        type: q.type || "sentence",
        topic: q.topic || "",
        question: isWord ? q.word : q.sentence,
        answer: answer || "",
        reasons: [...selected],
        detail: detail.value.trim()
      };

      let uploaded = false;
      if (window.SupabaseAuth && SupabaseAuth.isEnabled && SupabaseAuth.isEnabled()) {
        send.disabled = true;
        send.textContent = "Sending…";
        uploaded = !!(await SupabaseAuth.submitReport(report));
        send.textContent = "Send report";
      }

      if (!uploaded) {
        /* 離線 / 未設定 Supabase：暫存本機，之後可以補交 */
        try {
          const key = "pokeengmon_reports_v1";
          const list = JSON.parse(localStorage.getItem(key) || "[]");
          list.push(report);
          localStorage.setItem(key, JSON.stringify(list.slice(-200)));
        } catch (e) { /* storage unavailable */ }
      }
      App.closeModal();
      App.toast(uploaded
        ? "Thanks! Your report was sent."
        : "Thanks! Your report has been saved on this device.");
    }, "report-send");
  },

  /* ---------- 設定 / 退出 ---------- */
  openSettings() {
    const prefs = (typeof loadAudioPrefs === "function") ? loadAudioPrefs() : { bgm: 1, sfx: 1, voice: 1 };
    const bgmPct = Math.round(prefs.bgm * 100);
    const sfxPct = Math.round(prefs.sfx * 100);
    const voicePct = Math.round((prefs.voice == null ? 1 : prefs.voice) * 100);
    App.showModal(`
      <div class="confirm-box">
        <p><b>Quiz Settings</b><br><small>Leaving now will lose this set's progress.</small></p>
        <div class="settings-audio">
          <label class="settings-vol">
            <span class="settings-vol-label">Music <b id="quiz-bgm-pct">${bgmPct}%</b></span>
            <input id="quiz-bgm" type="range" min="0" max="100" step="1" value="${bgmPct}" aria-label="Music volume">
          </label>
          <label class="settings-vol">
            <span class="settings-vol-label">Sound Effects <b id="quiz-sfx-pct">${sfxPct}%</b></span>
            <input id="quiz-sfx" type="range" min="0" max="100" step="1" value="${sfxPct}" aria-label="Sound effects volume">
          </label>
          <label class="settings-vol">
            <span class="settings-vol-label">Voice <b id="quiz-voice-pct">${voicePct}%</b></span>
            <input id="quiz-voice" type="range" min="0" max="100" step="1" value="${voicePct}" aria-label="Voice volume">
          </label>
        </div>
        <div class="confirm-row">
          <button id="quiz-settings-quit" class="btn-big btn-danger">Quit this set</button>
          <button id="quiz-settings-close" class="btn-big btn-plain">Keep going</button>
        </div>
      </div>`, true);
    /* 音量調整：同 Home sheet 一齊寫落 pokeengmon_audio_v1，即時生效 */
    const applyAudio = (which, pct) => {
      const v = Math.max(0, Math.min(100, pct | 0)) / 100;
      const cur = (typeof loadAudioPrefs === "function") ? loadAudioPrefs() : { bgm: 1, sfx: 1, voice: 1 };
      cur[which] = v;
      if (typeof saveAudioPrefs === "function") saveAudioPrefs(cur);
      const audio = window.CaptureScene && CaptureScene.audio;
      if (audio) {
        if (which === "bgm") audio.setBgmScale(v);
        else if (which === "sfx") audio.setSfxScale(v);
        else if (which === "voice" && audio.setVoiceScale) audio.setVoiceScale(v);
      }
      const pctEl = document.getElementById(`quiz-${which}-pct`);
      if (pctEl) pctEl.textContent = `${Math.round(v * 100)}%`;
    };
    const bgmEl = document.getElementById("quiz-bgm");
    const sfxEl = document.getElementById("quiz-sfx");
    const voiceEl = document.getElementById("quiz-voice");
    bgmEl.oninput = () => applyAudio("bgm", +bgmEl.value);
    voiceEl.oninput = () => applyAudio("voice", +voiceEl.value);
    sfxEl.oninput = () => {
      applyAudio("sfx", +sfxEl.value);
      if (this._sfxPreviewTimer) clearTimeout(this._sfxPreviewTimer);
      this._sfxPreviewTimer = setTimeout(() => {
        this._sfxPreviewTimer = null;
        const audio = window.CaptureScene && CaptureScene.audio;
        if (audio && audio.previewSfx) audio.previewSfx("assets/battle/sfx/select.wav", 0.5);
      }, 180);
    };
    document.getElementById("quiz-settings-quit").onclick = () => {
      App.closeModal();
      this.quit();
    };
    document.getElementById("quiz-settings-close").onclick = () => {
      App.closeModal();
      /* Keep going：關窗後浮標返去輸入格，用戶唔使再點一次 */
      setTimeout(() => this._focusCurrent(), 100);
    };
  }
});
