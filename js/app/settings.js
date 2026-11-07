/* ============================================================
   PokeEngmon - App：設定（設定彈窗、音量、BGM、動畫速度、遺忘曲線）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  /* ---------- 設定 ---------- */
  openSettings() {
    /* 文案按登入狀態切換（有雲端同步就唔好嚇用戶話「只存本機」） */
    const loggedIn = !!(window.SupabaseAuth && SupabaseAuth.isLoggedIn());
    const saveNote = loggedIn
      ? `<p class="settings-sub">✅ Cloud sync is on — your progress follows your account.</p>`
      : `<p class="settings-sub">Your progress is saved in this browser only. Sign in (🔐) to back up to the cloud.</p>`;
    const prefs = (typeof loadAudioPrefs === "function") ? loadAudioPrefs() : { bgm: 1, sfx: 1, voice: 1 };
    const bgmPct = Math.round(prefs.bgm * 100);
    const sfxPct = Math.round(prefs.sfx * 100);
    const voicePct = Math.round((prefs.voice == null ? 1 : prefs.voice) * 100);
    const curMode = (typeof getCurveMode === "function") ? getCurveMode() : "standard";
    const modeOpts = [
      { v: "standard", label: "📘 Standard", desc: "Balanced review for most learners" },
      { v: "junior", label: "🧒 Junior", desc: "Gentle curve with extra attempts & hints" },
      { v: "teen", label: "🎓 Teen", desc: "Steadier pace for secondary learners" },
      { v: "adult", label: "🧑 Adult", desc: "Longer intervals for faster recall" }
    ];
    const modeHtml = modeOpts.map(o => `
      <label class="curve-mode-opt${o.v === curMode ? " active" : ""}">
        <input type="radio" name="curveMode" value="${o.v}" ${o.v === curMode ? "checked" : ""}>
        <span class="cm-label">${o.label}</span>
        <small class="cm-desc">${o.desc}</small>
      </label>`).join("");
    this.showModal(`
      <div class="settings-box">
        <h3 class="settings-title">⚙️ Settings</h3>
        ${saveNote}
        <div class="settings-audio">
          <label class="settings-vol">
            <span class="settings-vol-label">Music <b id="set-bgm-pct">${bgmPct}%</b></span>
            <input id="set-bgm" type="range" min="0" max="100" step="1" value="${bgmPct}" aria-label="Music volume">
          </label>
          <label class="settings-vol">
            <span class="settings-vol-label">Sound Effects <b id="set-sfx-pct">${sfxPct}%</b></span>
            <input id="set-sfx" type="range" min="0" max="100" step="1" value="${sfxPct}" aria-label="Sound effects volume">
          </label>
          <label class="settings-vol">
            <span class="settings-vol-label">Voice <b id="set-voice-pct">${voicePct}%</b></span>
            <input id="set-voice" type="range" min="0" max="100" step="1" value="${voicePct}" aria-label="Voice volume">
          </label>
        </div>
        <div class="curve-mode-section">
          <p class="settings-sub" style="text-align:left;margin:0">📈 Forgetting Curve Mode</p>
          <div class="curve-mode-grid">${modeHtml}</div>
        </div>
        <button id="btn-add-sentence" class="btn-big btn-secondary">✏️ Add sentence question</button>
        <button id="btn-add-picture" class="btn-big btn-secondary">🖼️ Add picture question</button>
        <button id="btn-import-csv2" class="btn-big btn-secondary">📥 Import CSV Questions</button>
        <button id="btn-view-my-q" class="btn-big btn-secondary">📋 View my questions</button>
        <button id="btn-parent-guide" class="guide-link">📖 How to create your own questions</button>
        <button id="btn-reset-progress" class="reset-link danger">🗑 Reset Progress</button>
        <small class="settings-note">App version: ${APP_VERSION} (auto-updates)</small>
      </div>`);
    if (this._sfxPreviewTimer) { clearTimeout(this._sfxPreviewTimer); this._sfxPreviewTimer = null; }
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
      const pctEl = document.getElementById(`set-${which}-pct`);
      if (pctEl) pctEl.textContent = `${Math.round(v * 100)}%`;
    };
    const bgmEl = document.getElementById("set-bgm");
    const sfxEl = document.getElementById("set-sfx");
    const voiceEl = document.getElementById("set-voice");
    bgmEl.oninput = () => applyAudio("bgm", +bgmEl.value);
    voiceEl.oninput = () => applyAudio("voice", +voiceEl.value);
    sfxEl.oninput = () => {
      applyAudio("sfx", +sfxEl.value);
      /* debounce：停拖 ~180ms 先播一段短音效作 reference */
      if (this._sfxPreviewTimer) clearTimeout(this._sfxPreviewTimer);
      this._sfxPreviewTimer = setTimeout(() => {
        this._sfxPreviewTimer = null;
        const audio = window.CaptureScene && CaptureScene.audio;
        if (audio && audio.previewSfx) audio.previewSfx("assets/battle/sfx/select.wav", 0.5);
      }, 180);
    };
    document.getElementById("btn-add-sentence").onclick = () => this.openAddSentence();
    document.getElementById("btn-add-picture").onclick = () => this.openAddPicture();
    document.getElementById("btn-import-csv2").onclick = () => this.openImport();
    document.getElementById("btn-view-my-q").onclick = () => this.openMyQuestions();
    document.getElementById("btn-parent-guide").onclick = () => this.openParentGuide();
    document.getElementById("btn-reset-progress").onclick = () => this._confirmReset();
    /* 遺忘曲線模式切換 */
    document.querySelectorAll('input[name="curveMode"]').forEach(r => {
      r.onchange = () => {
        if (typeof setCurveMode === "function") setCurveMode(r.value);
        document.querySelectorAll(".curve-mode-opt").forEach(l => l.classList.remove("active"));
        r.closest(".curve-mode-opt").classList.add("active");
        try { if (window.Sync && Sync.pushState) Sync.pushState(); } catch (e) {}
        App.toast(`Curve mode: ${r.value}`);
      };
    });
  },
  /* Setting sheet 內嘅音量滑桿（同舊 openSettings 同一套 prefs） */
  _syncAudioSliders() {
    const prefs = (typeof loadAudioPrefs === "function") ? loadAudioPrefs() : { bgm: 1, sfx: 1, voice: 1 };
    const bgm = document.getElementById("sheet-bgm");
    const sfx = document.getElementById("sheet-sfx");
    const voice = document.getElementById("sheet-voice");
    if (!bgm || !sfx || !voice) return;
    bgm.value = Math.round(prefs.bgm * 100);
    sfx.value = Math.round(prefs.sfx * 100);
    voice.value = Math.round((prefs.voice == null ? 1 : prefs.voice) * 100);
    document.getElementById("sheet-bgm-pct").textContent = bgm.value + "%";
    document.getElementById("sheet-sfx-pct").textContent = sfx.value + "%";
    document.getElementById("sheet-voice-pct").textContent = voice.value + "%";
    bgm.oninput = () => this._applyAudioVol("bgm", +bgm.value);
    sfx.oninput = () => this._applyAudioVol("sfx", +sfx.value);
    voice.oninput = () => this._applyAudioVol("voice", +voice.value);
  },
  _applyAudioVol(which, pct) {
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
    const pctEl = document.getElementById(`sheet-${which}-pct`);
    if (pctEl) pctEl.textContent = Math.round(v * 100) + "%";
  },
  /* Home sheet：背景音樂選擇（state.bgmTrack；登入咗就 PATCH user_account.bgm_track） */
  _syncBgmTrack() {
    const seg = document.getElementById("sheet-bgm-track");
    if (!seg || typeof getBgmTrack !== "function") return;
    const cur = getBgmTrack();
    seg.querySelectorAll('input[name="bgmTrackSheet"]').forEach(r => {
      r.checked = r.value === cur;
      r.onchange = () => {
        if (!r.checked) return;
        const id = setBgmTrack(r.value);
        const audio = window.CaptureScene && CaptureScene.audio;
        if (audio && audio.switchTownTrack) audio.switchTownTrack();
        try { if (window.Sync && Sync.patchAccount) Sync.patchAccount({ bgm_track: id }); } catch (e) {}
        this.toast(`Music: ${BGM_TRACKS[id].label}`);
      };
    });
  },
  /* Home sheet：動畫倍速（捕捉／扭蛋／進化；只存本機，見 js/anim-speed.js） */
  _syncAnimSpeed() {
    const seg = document.getElementById("sheet-anim-speed");
    if (!seg || !window.AnimSpeed) return;
    const cur = AnimSpeed.get();
    seg.querySelectorAll('input[name="animSpeedSheet"]').forEach(r => {
      r.checked = Number(r.value) === cur;
      r.onchange = () => {
        if (!r.checked) return;
        const v = AnimSpeed.set(r.value);
        this.toast(`Animation speed: ${v}×`);
      };
    });
  },
  /* Home sheet：遺忘曲線模式（同舊 settings modal 共用同一套 storage 與 Sync） */
  _syncCurveMode() {
    const grid = document.getElementById("sheet-curve-grid");
    if (!grid) return;
    const cur = (typeof getCurveMode === "function") ? getCurveMode() : "standard";
    grid.querySelectorAll('input[name="curveModeSheet"]').forEach(r => {
      const isCur = r.value === cur;
      r.checked = isCur;
      r.closest(".curve-mode-opt").classList.toggle("active", isCur);
      r.onchange = () => {
        if (typeof setCurveMode === "function") setCurveMode(r.value);
        grid.querySelectorAll(".curve-mode-opt").forEach(l => l.classList.remove("active"));
        r.closest(".curve-mode-opt").classList.add("active");
        try { if (window.Sync && Sync.pushState) Sync.pushState(); } catch (e) {}
        this.toast(`Curve mode: ${r.value}`);
      };
    });
  }
});
