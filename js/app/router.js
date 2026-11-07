/* ============================================================
   PokeEngmon - App：路由同畫面鎖（showView、frame／settle lock、wide 左欄鎖）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  /* ---------- 路由 ---------- */
  showView(id) {
    /* 如果目前有 fixed overlay view（Friends/Leaderboard/Battle Menu），
       且目標係 view-home，先加 exit 動畫 class，OVERLAY_EXIT_MS（200ms，舊 400ms）後再切 active（Rule 100） */
    const fixedExitTargets = ["view-home"]; /* 邊啲 target 觸發 fixed overlay exit */
    const fixedOverlayActive = document.querySelector(
      "#view-friends.active, #view-leaderboard.active, #view-battle-menu.active"
    );
    const needsFixedExit = fixedOverlayActive && fixedExitTargets.includes(id);

    /* 切頁前關閉所有 home sheets + reset sheet switching state
       （binder 嘅 close→open timer 可能喺切 view 後仍然 fire → bump token cancel 之） */
    App._sheetSwitching = false;
    App._sheetSwitchToken = (App._sheetSwitchToken || 0) + 1;  /* cancel pending open timers */

    if (needsFixedExit) {
      fixedOverlayActive.classList.add("fixed-overlay-exit");
      /* 等 exit 動畫（OVERLAY_EXIT_MS，舊 400ms）跑完先真正切 view。
         唔可以即刻切：overlay 嘅定位／display 全部掛喺 .active，冇咗 .active 就即刻消失冇動畫 */
      setTimeout(() => {
        fixedOverlayActive.classList.remove("fixed-overlay-exit");
        this._doShowView(id);
      }, this.OVERLAY_EXIT_MS);
      return; /* 即時 return，延遲執行 */
    }
    this._doShowView(id);
  },

  /* 真正嘅切 view 邏輯（由 showView 或 exit animation timeout 後 call）*/
  _doShowView(id) {
    if (document.getElementById("view-home").classList.contains("active")) {
      this._closeAllSheets();
    }
    /* 離開抽獎頁：中斷流程（已結算嘅獎勵唔會漏，只係跳過動畫） */
    const cur = document.querySelector(".view.active");
    if (cur && cur.id === "view-gacha" && id !== "view-gacha" && typeof Gacha !== "undefined") {
      Gacha.abort();
    }
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    /* 選題 / 結算 / Leaderboard / Friends / Battle Menu / 答題 / 捕捉 / 對戰
       係 display window 內嘅 overlay：紅框（view-home shell）要留喺後面 */
    if (id === "view-quiz-setup" || id === "view-settlement" || id === "view-leaderboard" ||
        id === "view-friends" || id === "view-battle-menu" ||
        id === "view-quiz" || id === "view-capture" || id === "view-battle") {
      document.getElementById("view-home").classList.add("active");
    }
    /* 答題 / 捕捉 / 對戰期間鎖住紅框功能鍵（防誤觸） */
    this._setFrameLock(id === "view-quiz" || id === "view-capture" || id === "view-battle");
    /* Gym 結算鎖：返結算（例如由錯題回顧返嚟）仍然要鎖；離開結算即解 */
    this._setSettleLock(id === "view-settlement" && !!this._gymSettleData);
    document.body.classList.toggle("capture-mode", id === "view-capture");
    /* 捕捉 canvas 尺寸跟隨白螢幕區（唔再等 window resize） */
    if (id === "view-capture") {
      requestAnimationFrame(() => {
        try { if (window.CaptureScene && CaptureScene._resize) CaptureScene._resize(); } catch (e) {}
      });
    }
    /* Daily Quests dashboard 喺桌面用闊版面（≥768px 兩欄） */
    const appEl = document.getElementById("app");
    if (appEl) appEl.classList.toggle("app-wide", id === "view-quests");
    /* 離開任務板就停倒數 timer */
    if (id !== "view-quests" && typeof Quests !== "undefined" && Quests.stopTimer) Quests.stopTimer();
    /* wide：返主頁時右欄 Daily Quests 仍然開住 → 重新 render＋開返倒數（上一行已經停咗） */
    if (id === "view-home" && typeof Quests !== "undefined" && Quests.resume &&
        document.querySelector("#sheet-quests.ph-open[data-wide-default]")) Quests.resume();
    this._syncRotateHint(); /* 入／出捕捉要更新手機橫向提示 */
    window.scrollTo(0, 0);
  },

  /* 紅框功能鍵（上框 4 個 stat + 下巴 Home 球）：答題 / 捕捉 / 對戰時全部停用，防誤觸 */
  _setFrameLock(locked) {
    const shell = document.getElementById("pd-shell");
    if (!shell) return;
    this._frameLocked = !!locked;
    shell.classList.toggle("frame-locked", locked);
    ["btn-bezel-streak", "btn-bezel-diamond", "btn-bezel-dex", "btn-bezel-energy", "btn-pd-home"]
      .forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = locked;
        el.setAttribute("aria-disabled", locked ? "true" : "false");
      });
    this._applyPaneLock();
  },
  /* Gym 結算（Rule 44）：badge 判定只喺下巴 Home 做，所以結算期間鎖 bezel＋左欄，下巴 Home 保持可撳 */
  _setSettleLock(locked) {
    const shell = document.getElementById("pd-shell");
    if (!shell) return;
    this._settleLocked = !!locked;
    shell.classList.toggle("settle-locked", !!locked);
    if (!this._frameLocked) {
      ["btn-bezel-streak", "btn-bezel-diamond", "btn-bezel-dex", "btn-bezel-energy"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = !!locked;
        el.setAttribute("aria-disabled", locked ? "true" : "false");
      });
    }
    this._applyPaneLock();
  },
  /* wide 左欄（拍檔卡／CTA／dock）喺 overlay 開住時仍然見到：鎖嘅時候要 inert（滑鼠＋鍵盤都撳唔到）。
     phone／tablet 左欄本身被 overlay 蓋住，inert 冇副作用。 */
  _applyPaneLock() {
    const lock = !!(this._frameLocked || this._settleLocked);
    document.querySelectorAll("#view-home .pd-screen2 > :not(.ph-sheets)").forEach(el => {
      if (lock) el.setAttribute("inert", ""); else el.removeAttribute("inert");
    });
  }
});
