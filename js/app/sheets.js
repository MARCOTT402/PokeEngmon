/* ============================================================
   PokeEngmon - App：主頁 sheet 系統（開關、wide 右欄、sheet 入面掛 view、扭蛋 sheet）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  /* ---------- Home P1 sheet system ---------- */
  _openSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    /* 結算／選題等 display-window overlay 會令 view-home 保持 active；
       只信 active class 會 skip 咗切頁，sheet 就開喺 overlay（z-index 120）後面＝撳掣冇反應。
       所以只要仲有其他 active view，就一定要真正切返 home。 */
    const home = document.getElementById("view-home");
    if (home && home.classList.contains("active") &&
        document.querySelector(".view.active:not(#view-home)")) {
      this.showView("view-home");
    }
    if (id === "sheet-setting") { this._syncAudioSliders(); this._syncBgmTrack(); this._syncCurveMode(); this._syncAnimSpeed(); }
    delete sheet.dataset.wideDefault; /* 用戶主動開 = 唔再係 wide 預設 */
    /* wide：開任何 sheet 都要先收起右欄預設 Daily Quests。
       _closeAllSheets 喺 wide 刻意保留預設 sheet，所以經 fixed overlay（Friends／Leaderboard／Battle Menu）
       嘅原本 410ms 路徑開 sheet 時，唔喺度收就會兩個 sheet 同時開住（Rule 84） */
    document.querySelectorAll("#view-home .ph-sheet[data-wide-default]").forEach(s => {
      if (s === sheet) return;
      s.classList.remove("ph-open");
      delete s.dataset.wideDefault;
      s.hidden = true;
      this._unmountSheetView(s);
    });
    this._unmountSheetView(sheet); /* 上次 full 模式搬咗舊 view 入嚟 → 搬返原位 */
    /* 永遠重置 full 模式 + height style + arrow 方向（確保每次開都由 compact 開始） */
    sheet.classList.remove("ph-sheet-full");
    sheet.style.height = "";
    sheet.style.maxHeight = "";
    sheet.style.transition = "";
    sheet._settleSeq = (sheet._settleSeq || 0) + 1; /* 取消未完成嘅高度磁吸動畫 */
    const arrow = sheet.querySelector(".ph-sheet-expand");
    if (arrow) arrow.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 7.5L10 13.5L16 7.5" stroke="#7d786c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    /* 如果係 Streak sheet，重置 content 為 compact（只顯示 streak） */
    if (id === "sheet-calendar") {
      const container = document.getElementById("sheet-calendar-content");
      if (container) {
        const streak = calcStreak();
        container.innerHTML = `
          <div style="padding:12px; text-align:center;">
            <div style="font-size:36px; font-weight:900; color:#ee1515;">🔥 ${streak}</div>
            <div style="font-size:12px; color:#7d786c; margin-top:4px;">Day streak</div>
          </div>`;
      }
    }

    const parent = document.querySelector("#view-home .ph-sheets");
    const backdrop = parent ? parent.querySelector(".ph-backdrop") : null;
    if (backdrop && backdrop.hidden) {
      backdrop.hidden = false;
      requestAnimationFrame(() => { backdrop.classList.add("ph-open"); });
    } else if (backdrop) {
      backdrop.classList.add("ph-open");
    }
    sheet.hidden = false;
    if (this.layout() === "wide") {
      /* wide 冇 translateY 動畫：即刻 ph-open，下一個 click 嘅 _wideHideSheets 先睇到佢 */
      void sheet.offsetWidth;
      sheet.classList.add("ph-open");
    } else {
      /* rAF 期間如果已經被收起（hidden），唔好補返 ph-open（否則會出現「hidden 但 ph-open」嘅殭屍 sheet） */
      requestAnimationFrame(() => { if (!sheet.hidden) sheet.classList.add("ph-open"); });
    }
  },
  /* ====== Sheet 系統 ======
   * 所有 close 路徑共享同一規則（Rule 31／41／100）：
   *   1. 只 remove ph-open class（transition SHEET_MS 自然播放）
   *   2. SHEET_MS + 30ms 後 _cleanupClosedSheets()
   *   3. cleanup 只收「冇 ph-open」嘅 sheet（hidden + unmount）；開緊嘅一律唔掂。
   *      切換 sheet 而家係同時進行（新 sheet 開緊時舊 sheet 仍要收），所以唔可以再用「有任何 sheet 開住就成個 skip」
   *   4. 絕對唔好 remove class 同時設 hidden（跳過 transform 動畫）
   */
  _cleanupClosedSheets(sheets, keepDefault) {
    const isReal = s => !(keepDefault && s.dataset.wideDefault);
    (sheets || [...document.querySelectorAll("#view-home .ph-sheet")]).forEach(s => {
      if (!s.classList.contains("ph-open") && !s.hidden) {
        s.hidden = true;
        this._unmountSheetView(s);
      }
    });
    const anyOpen = [...document.querySelectorAll("#view-home .ph-sheet.ph-open")].some(isReal);
    if (anyOpen) return;               /* 有合法 sheet 開住：backdrop／wide 預設照留 */
    const bd = document.querySelector("#view-home .ph-backdrop");
    if (bd && !bd.classList.contains("ph-open")) bd.hidden = true;
    this._showWideDefault();           /* wide：右欄唔留空，返 Daily Quests */
  },
  _closeSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    if (id === "sheet-gacha" && typeof Gacha !== "undefined") Gacha.abort();
    delete sheet.dataset.wideDefault;
    sheet.classList.remove("ph-open");
    /* remove 自己後即刻檢查：如果冇其他 sheet 仲開住 → 一併 remove backdrop */
    const anyOpen = document.querySelector("#view-home .ph-sheet.ph-open");
    if (!anyOpen) {
      const bd = document.querySelector("#view-home .ph-backdrop");
      if (bd) bd.classList.remove("ph-open");
    }
    setTimeout(() => {
      /* 雙重 rAF 確保 _openSheet 嘅 rAF ph-open 已跑完 */
      requestAnimationFrame(() => requestAnimationFrame(() => this._cleanupClosedSheets(null, false)));
    }, this.SHEET_MS + 30);
  },
  _closeAllSheets() {
    /* wide：Daily Quests 預設 sheet 係右欄常駐內容，「關晒」唔包佢（切 overlay 返嚟唔會閃空白） */
    const keepDefault = this.layout() === "wide";
    const sheets = [...document.querySelectorAll("#view-home .ph-sheet")]
      .filter(s => !(keepDefault && s.dataset.wideDefault));
    /* 同 _closeSheet 一致：gacha sheet 關閉前要 abort（收埋結算卡／場景 overlay、恢復 BGM） */
    if (typeof Gacha !== "undefined" && document.getElementById("sheet-gacha")?.classList.contains("ph-open")) Gacha.abort();
    sheets.forEach(s => s.classList.remove("ph-open"));
    const bd = document.querySelector("#view-home .ph-backdrop");
    if (bd) bd.classList.remove("ph-open");
    setTimeout(() => {
      /* wide 預設 sheet 開住唔算「新 sheet」；其他已關嘅照樣收（新 sheet 開緊都唔阻） */
      requestAnimationFrame(() => requestAnimationFrame(() => this._cleanupClosedSheets(sheets, keepDefault)));
    }, this.SHEET_MS + 30);
  },

  /* ---------- wide 右欄（Responsive P1 Task 5） ----------
   * 右欄冇其他 sheet 時顯示 Daily Quests（sheet-quests 嘅 full 模式），用 data-wide-default 標記。
   * 一定唔可以經 _openSheet：佢會 showView("view-home")，殺咗正喺右欄嘅 overlay（選題／結算等）。 */
  _showWideDefault() {
    if (this.layout() !== "wide" || App._sheetSwitching) return;
    if (document.querySelector("#view-home .ph-sheet.ph-open")) return;
    const sheet = document.getElementById("sheet-quests");
    if (!sheet || typeof sheet._peFull !== "function") return;
    this._unmountSheetView(sheet);
    sheet.classList.remove("ph-sheet-full");
    sheet.style.height = ""; sheet.style.maxHeight = ""; sheet.style.transition = "";
    sheet.dataset.wideDefault = "1";
    sheet.hidden = false;
    sheet._peFull();
    void sheet.offsetWidth; /* 確保 opacity 淡入有起點（唔靠 rAF：背景分頁唔會 fire） */
    sheet.classList.add("ph-open");
  },
  /* wide：開咗 sheet 之後直接用 full 內容（右欄夠大，唔使 compact／展開箭咀） */
  _wideFull(sheetId) {
    if (this.layout() !== "wide" || !sheetId) return;
    const sheet = document.getElementById(sheetId);
    if (sheet && typeof sheet._peFull === "function") sheet._peFull();
  },
  /* wide：即時收起所有已開 sheet（冇上落動畫，唔使等 430ms），等新 sheet 直接頂上 */
  _wideHideSheets() {
    const gacha = document.getElementById("sheet-gacha");
    if (gacha && gacha.classList.contains("ph-open") && typeof Gacha !== "undefined") Gacha.abort();
    document.querySelectorAll("#view-home .ph-sheet").forEach(s => {
      s.classList.remove("ph-open");
      delete s.dataset.wideDefault;
      s.hidden = true;
      this._unmountSheetView(s);
    });
  },
  /* wide 嘅 binder／dockBinder 路徑。回傳 true = 已處理；false = 行返原本（phone／tablet 或有 fixed overlay）路徑 */
  _wideSwitch(sheetId, openFn, overlayViewId) {
    if (this.layout() !== "wide") return false;
    /* Friends／Leaderboard／Battle Menu 有 400ms exit 動畫＋token 機制（Rule 47／52）：交返原本路徑 */
    const fixedOverlay = document.querySelector("#view-friends.active, #view-leaderboard.active, #view-battle-menu.active");
    if (fixedOverlay) {
      /* 再撳同一個 dock 掣 = 返右欄預設 */
      if (overlayViewId && fixedOverlay.id === overlayViewId) { this.showView("view-home"); return true; }
      return false;
    }
    if (!sheetId) { openFn(); return true; } /* overlay 類（Leaderboard／Friends）：預設 sheet 留喺底，overlay 蓋住右欄 */
    const cur = document.querySelector("#view-home .ph-sheet.ph-open");
    const overlayUp = document.querySelector(".view.active:not(#view-home)");
    if (cur && cur.id === sheetId && !overlayUp) {
      /* toggle：再撳 = 返預設（預設本身就係 sheet-quests 時唔使郁） */
      if (!cur.dataset.wideDefault) this._closeSheet(sheetId);
      return true;
    }
    this._wideHideSheets();
    if (sheetId === "sheet-quests") { this._showWideDefault(); return true; }
    openFn();
    this._wideFull(sheetId);
    return true;
  },
  /* full sheet 模式：暫時將舊 view 頁面嘅 DOM 搬入 sheet body，關閉／收起時搬返原位。
     topIds：呢啲 element 由 compact 到 full 都留在 sheet 頂部（同一個 unit），其餘內容展開時才加入 */
  _mountSheetView(sheetId, viewId, renderFn, variant, topIds) {
    const sheet = document.getElementById(sheetId);
    const view = document.getElementById(viewId);
    if (!sheet || !view) return;
    const body = sheet.querySelector(".ph-sheet-body");
    if (!body) return;
    let host = sheet.querySelector(".sheet-view-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "sheet-view-host" + (variant ? " sheet-view-host--" + variant : "");
      host.dataset.view = viewId;
      host._topIds = topIds || [];
      body.appendChild(host);
      const tops = host._topIds.length
        ? Array.from(view.children).filter(n => host._topIds.includes(n.id))
        : Array.from(view.childNodes);
      host.append(...tops);
    }
    sheet.classList.add("view-mode");
    if (typeof renderFn === "function") renderFn();
  },
  /* 展開：把其餘內容搬到頂部 unit 之下 */
  _expandSheetView(sheet) {
    if (!sheet) return;
    const host = sheet.querySelector(".sheet-view-host");
    if (!host) return;
    const view = document.getElementById(host.dataset.view);
    if (view) host.append(...Array.from(view.childNodes));
  },
  /* 收起：只保留頂部 unit，其餘內容搬返（隱藏嘅）view，避免 compact 狀態可以捲到下面 */
  _collapseSheetView(sheet) {
    if (!sheet) return;
    const host = sheet.querySelector(".sheet-view-host");
    if (!host) return;
    const view = document.getElementById(host.dataset.view);
    const tops = host._topIds || [];
    if (!view) return;
    Array.from(host.childNodes).forEach(n => {
      if (!(n.nodeType === 1 && tops.includes(n.id))) view.appendChild(n);
    });
  },
  _unmountSheetView(sheet) {
    if (!sheet) return;
    sheet.classList.remove("view-mode");
    const host = sheet.querySelector(".sheet-view-host");
    if (!host) return;
    const view = document.getElementById(host.dataset.view);
    /* prepend：收起狀態下 lower 內容仍然喺 view，頂部 unit 要放返最前 */
    if (view) view.prepend(...Array.from(host.childNodes));
    host.remove();
  },
  /* Gacha：由白色螢幕內上邊向下捲出 */
  openGachaSheet() {
    /* 一定要真正切返 view-home：結算等 display-window overlay 會令 view-home 保持 active，
       只靠 active 判斷會跳過切頁，gacha sheet 就會開喺結算 overlay（z-index 120）後面＝撳 Lucky Draw 冇反應 */
    this.showView("view-home");
    this._openSheet("sheet-gacha");
  },
  closeGachaSheet() {
    this._closeSheet("sheet-gacha");
    this.renderHome();
  }
});
