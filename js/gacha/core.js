/* ============================================================
   PokeEngmon - Gacha：開關、計時器、寶石同掣狀態、稀有度、共用小工具
   由 js/gacha.js 拆出（總計劃 P2.5；Rule 116）。同 js/gacha.js 共用同一個 Gacha 物件：
   Object.assign 只係將方法掛返上去，this／Gacha.xxx 用法完全唔變。
   載入次序：js/gacha.js 之後（index.html）。
   ============================================================ */

Object.assign(Gacha, {
  open(mode) {
    this.mode = mode;
    this._townStopped = false;   /* 開場會即刻再停，避免 abort 先恢復再停嘅閃爍 */
    this.abort();      // 清走上次殘留；未結算就補結算，唔會「食咗鑽但冇派寵」
    App.openGachaSheet();
    this._bindLobby();     /* v2：1×／10× 大掣＋大堂快龍 rig（取代拉手杆／按住充能） */
    this._resetStage();
    this._refreshControls();
    /* 扭蛋係全屏演出：入場即收城鎮 BGM，避免同音效疊聲 */
    const audio = this._audio();
    if (audio) {
      audio.stopTownBGM(400);
      this._townStopped = true;
    }
  },

  /* 中斷當前流程：跳過演出，但經濟交易照樣落地 */
  abort() {
    const flow = this._flow;
    this._flowId++;
    this._s2seq++;          /* 作廢進行中嘅快龍空投演出 */
    this._clearTimers();
    this._spdEnd();
    this._flow = null;
    this.busy = false;

    if (flow && !flow.settled) {
      /* 未結算 → 背景補做，避免中途離開導致扣鑽但冇寵物 */
      const pending = flow.multi ? this._settleMulti(flow) : this._settleResult(flow);
      pending.then(() => {
        this._refreshControls();
        App.renderHome();
      }).catch(() => {});
    }

    this._resetStage();
    this._refreshControls();
    this._restoreTownBGM();
    /* 任何離開路徑（包括下巴 Home 掣）都要補返進化揭示 */
    const evolves = (this._pendingEvolves || []).slice();
    this._pendingEvolves = [];
    const evo = this._pendingEvolve;
    this._pendingEvolve = null;
    if (evo) evolves.unshift(evo);
    this._flushEvolves(evolves);
  },
  /* 離開扭蛋（任何路徑）都要還原城鎮 BGM */
  _restoreTownBGM() {
    if (!this._townStopped) return;
    this._townStopped = false;
    const audio = this._audio();
    if (audio) audio.startTownBGM();
  },

  /* 所有流程 timeout 都經呢個 wrapper 記錄，中斷時一次過清走 */
  _setT(fn, ms) {
    /* 動畫倍速：放手拉 arm 後（_spdBegin）先生效；拉 arm／充電嘅計時 _spd = 1 */
    const id = setTimeout(fn, ms / (this._spd || 1));
    this._timers.push(id);
    return id;
  },

  /* 動畫倍速（Settings → Animation speed）：放手後開始，結果卡／中斷／執場還原 */
  _spdBegin() {
    this._spd = window.AnimSpeed ? AnimSpeed.begin("gacha") : 1;
  },
  _spdEnd() {
    if (window.AnimSpeed) AnimSpeed.end("gacha");
    this._spd = 1;
    if (this._sceneB && window.AnimSpeed) AnimSpeed.badge(this._sceneB, 1);
  },

  _clearTimers() {
    this._timers.forEach(id => clearTimeout(id));
    this._timers = [];
  },

  /* 頁面內唔再重複顯示餘額（status bar 已有）：結算後直接更新 bezel 數字 */
  _updateDiamondDisplay() {
    const st = loadState();
    const el = document.getElementById("topbar-diamonds");
    if (el) el.textContent = st.diamonds;
  },

  _canPull() {
    const st = loadState();
    return st.diamonds >= GAME_CONFIG.RARE_PULL_COST;
  },

  _canMultiPull() {
    const st = loadState();
    return st.diamonds >= GAME_CONFIG.MULTI_PULL_COST;
  },

  _refreshControls() {
    this._updateDiamondDisplay();
    const afford = this._canPull();
    const affordMulti = this._canMultiPull();
    /* v2：大掣永遠顯示價錢；唔夠鑽就變灰（撳落會提示去答題賺） */
    const b1 = document.getElementById("btn-gacha-1"), b10 = document.getElementById("btn-gacha-10");
    if (b1) b1.classList.toggle("poor", !afford);
    if (b10) b10.classList.toggle("poor", !affordMulti);
    if (this.phase === "idle") this._prompt(afford ? "" : "Not enough gems — earn more in quizzes!");
  },

  /* ---------- 機率 ---------- */
  rollRarity(mode) {
    const odds = GAME_CONFIG.PULL_ODDS[mode];
    let r = Math.random();
    for (const [rar, p] of Object.entries(odds)) {
      if (r < p) return rar;
      r -= p;
    }
    return "normal";
  },

  pickChain(rarity) {
    const st = loadState();
    const list = pullablePool(st.unlockedGen || 1, rarity);
    if (!list || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  },

  /* ---------- UI helpers ---------- */
  _prompt(text) {
    const el = document.getElementById("gacha-prompt");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("show", !!text);
    if (!text) el.classList.remove("almost");
  },

  _haptic(pattern) { haptic(pattern); },

  _audio() {
    return (window.CaptureScene && CaptureScene.audio) ? CaptureScene.audio : null;
  },

  _rm() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  _gsap() {
    return window.gsap || null;
  },


  /* dev hook（只限 localhost）：覆寫視覺稀有度方便驗收，經濟結果不變 */
  _visualRarity(s) {
    const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (local && window.__gachaForceRarity && GACHA_BALL[window.__gachaForceRarity]) {
      return window.__gachaForceRarity;
    }
    return s.rarity;
  }
});
