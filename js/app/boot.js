/* ============================================================
   PokeEngmon - App：開機（App.init：載入資料、綁定所有掣、登入、同步）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  /* ---------- 初始化 ----------
     App.init 只負責次序：每一步係一個具名方法（總計劃 P2.2；Rule 116）。
     各步驟之間唯一共用嘅局部變數係 st（loadState() 同一個物件），用參數傳入。 */
  async init() {
    const st = loadState();
    this._bootSession();
    this._bootSheets(st);
    this._bootHomeButtons();
    this._bootLoginState();
    this._bootNavButtons();
    this._bootQuizControls();
    this._bootKeyboardAndClicks();
    this._bootCalendarAndReview();
    await this._bootLoadData();
    this._bootAfterFirstRender(st);
    this._bootClickFeedback();
    this._bootAudio();
    this._bootServiceWorker();
  },

  /* 開機步驟：裝置 ID、SM-2 一次性重算、Supabase 背景 pull */
  _bootSession() {
    ensureDeviceId();   /* 確保匿名裝置 ID 存在（供 SM-2 history + Supabase 用）*/

    /* SM-2 v3 一次性重算：先備份玩家 state，再補 last_review_at／新 interval */
    if (window.SM2 && SM2.migrateV3) {
      try { SM2.migrateV3(); } catch (e) { console.warn("[SM2] migrateV3 failed:", e); }
    }

    /* Supabase pull（背景 async，唔阻塞主流程）*/
    if (window.Sync && Sync.isEnabled()) {
      /* 非阻塞拉雲端進度；有新卡拉返嚟就刷新主畫面 */
      Sync.pull()
        .then(() => this.renderHome())
        .catch(() => {});
    }
  },

  /* 開機步驟：主頁上框 sheet 掣、Quests 預覽、底部展開箭咀、dockbar */
  _bootSheets(st) {
    /* 按鈕（Home P1 dock + sheet 系統） */
    document.getElementById("btn-start-quiz").onclick = () => this.openSetup();

    /* 上框 4 格：全部捲入 top-down sheets
     * 行為：同一按鈕再點一次 → 關閉（toggle）；唔同按鈕 → 先捲回再開新
     * toggleOpenMap: buttonId → sheetId */
    const _toggleOpenMap = {}; /* btnId → sheetId 嘅映射 */

    const binder = (id, sheetId, openFn) => {
      _toggleOpenMap[id] = sheetId;
      const el = document.getElementById(id);
      if (!el) return;
      el.onclick = () => {
        if (App._sheetSwitching) return; /* 捲動中，忽略重複點擊 */
        if (this._wideSwitch(sheetId, openFn)) return; /* wide 右欄：即時切換（Task 5） */

        /* 先 close 任何 position:fixed overlay views（Friends / Leaderboard / Battle Menu）
           呢啲 view 嘅 stacking context 高過 sheet，會蓋住開出嚟嘅 sheet */
        const fixedOverlays = document.querySelectorAll(
          "#view-friends.active, #view-leaderboard.active, #view-battle-menu.active"
        );
        const hasFixedOverlay = fixedOverlays.length > 0;

        const curSheet = document.querySelector("#view-home .ph-sheet.ph-open");
        const isToggle = curSheet && curSheet.id === sheetId;
        if (isToggle && !hasFixedOverlay) {
          /* 同一個 sheet 開住 + 冇 fixed overlay → toggle 關閉 */
          this._closeSheet(sheetId);
          return;
        }
        if (curSheet || hasFixedOverlay) {
          /* 另一個 sheet 開住 OR 有 fixed overlay → 先 close 哂，再開新
             先 showView（佢會 bump token），再 bump 自己嘅 token → 避免 showView 嘅 bump 誤 cancel 自己 */
          if (hasFixedOverlay) this.showView("view-home");
          const token = (App._sheetSwitchToken = (App._sheetSwitchToken || 0) + 1);
          App._sheetSwitching = true;
          this._closeAllSheets();
          setTimeout(() => {
            if (App._sheetSwitchToken !== token) return; /* 真係有外部切 view → cancel */
            App._sheetSwitching = false;
            openFn();
          }, hasFixedOverlay ? App.OVERLAY_EXIT_MS + 20 : App.SHEET_SWAP_MS);
          /* Rule 100：sheet→sheet 同時進行（舊 410ms 串行）；overlay→sheet 要等 overlay exit 完先開，
             否則 showView 延後嘅 _doShowView → _closeAllSheets 會收埋啱啱開嘅 sheet */
        } else {
          /* 冇 sheet 冇 overlay → 直接開 */
          openFn();
        }
      };
    };

    /* Quests sheet：compact 預覽內容 */
    const renderQuestsCompact = () => {
      const container = document.getElementById("sheet-quests-content");
      if (!container) return;
      const st = loadState();
      let energy = 0;
      if (typeof Energy !== "undefined" && Energy.ensure) {
        energy = Number(Energy.ensure(st)?.points) || 0;
      }
      container.innerHTML = `
        <div style="padding:12px; text-align:center;">
          <div style="font-size:32px; font-weight:900; color:#16a34a;">⚡ ${energy}</div>
          <div style="font-size:12px; color:#7d786c; margin-top:4px;">Battle energy available</div>
        </div>`;
    };

    binder("btn-bezel-diamond", "sheet-gacha", () => {
      if (!document.getElementById("view-home").classList.contains("active")) this.showView("view-home");
      this._openSheet("sheet-gacha");
      if (typeof Gacha !== "undefined") Gacha.open("rare");
    });
    binder("btn-bezel-streak", "sheet-calendar", () => {
      this._openSheet("sheet-calendar");
      const container = document.getElementById("sheet-calendar-content");
      if (container) {
        const streak = calcStreak();
        container.innerHTML = `
          <div style="padding:12px; text-align:center;">
            <div style="font-size:36px; font-weight:900; color:#ee1515;">🔥 ${streak}</div>
            <div style="font-size:12px; color:#7d786c; margin-top:4px;">Day streak</div>
          </div>`;
      }
    });
    binder("btn-bezel-dex", "sheet-pokedex", () => {
      this._openSheet("sheet-pokedex");
      /* 頂部 gen hub + 進度由 compact 到 full 都係同一個 unit，下面內容展開時才加入 */
      App._mountSheetView("sheet-pokedex", "view-pokedex", () => {
        if (typeof Pokedex !== "undefined" && Pokedex.mount) Pokedex.mount(true);
      }, null, ["gen-hub", "dex-progress"]);
    });
    binder("btn-bezel-energy", "sheet-quests", () => {
      this._openSheet("sheet-quests");
      renderQuestsCompact();
    });

    /* 底部展開箭咀：tap 切換 compact / full；亦可上下拖曳 sheet 展開／收起
     * 唔跳 view，唔 close sheet，直接喺同一 sheet 內切換內容 */
    const expandArrow = (id, sheetId, renderCompact, renderFull, opts = {}) => {
      const el = document.getElementById(id);
      const sheet = document.getElementById(sheetId);
      if (!el || !sheet) return;

      const ICON_DOWN = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 7.5L10 13.5L16 7.5" stroke="#7d786c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const ICON_UP = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 13.5L10 7.5L16 13.5" stroke="#7d786c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const isFull = () => sheet.classList.contains("ph-sheet-full");
      const setIcon = (full) => { el.innerHTML = full ? ICON_UP : ICON_DOWN; };

      /* 磁吸：height 動畫到目標後再做最後清理（token 防止上一個動畫嘅 timer 補刀） */
      const settleHeight = (targetH, done) => {
        const my = (sheet._settleSeq = (sheet._settleSeq || 0) + 1);
        sheet.style.transition = "height .34s cubic-bezier(.22,1,.36,1)";
        sheet.style.height = targetH + "px";
        sheet.style.maxHeight = "none";
        let finished = false;
        let timer = null;
        const finish = () => {
          if (finished) return;
          finished = true;
          sheet.removeEventListener("transitionend", onEnd);
          clearTimeout(timer);
          if (my !== sheet._settleSeq) return;
          sheet.style.transition = "";
          if (done) done();
        };
        const onEnd = (ev) => { if (ev.target === sheet && ev.propertyName === "height") finish(); };
        sheet.addEventListener("transitionend", onEnd);
        timer = setTimeout(finish, 420);
      };

      const expand = () => {
        const fromH = sheet.getBoundingClientRect().height;
        renderFull();
        sheet.classList.add("ph-sheet-full");
        sheet.style.transition = "none";
        sheet.style.height = "100%";
        sheet.style.maxHeight = "none";
        const targetH = sheet.getBoundingClientRect().height;
        sheet.style.height = fromH + "px";
        void sheet.offsetHeight;
        settleHeight(targetH, () => { sheet.style.height = "100%"; });
        setIcon(true);
      };

      const collapse = () => {
        const fromH = sheet.getBoundingClientRect().height;
        renderCompact();
        sheet.classList.remove("ph-sheet-full");
        sheet.style.transition = "none";
        sheet.style.height = "auto";
        sheet.style.maxHeight = "";
        const targetH = sheet.getBoundingClientRect().height;
        sheet.style.height = fromH + "px";
        void sheet.offsetHeight;
        settleHeight(targetH, () => {
          sheet.style.height = "";
          sheet.style.maxHeight = "";
        });
        setIcon(false);
      };

      const toggle = () => { if (isFull()) collapse(); else expand(); };
      /* wide 右欄：直接入 full 內容（冇高度動畫；CSS 喺 wide 已經令 sheet 填滿右欄） */
      sheet._peFull = () => {
        if (isFull()) return;
        renderFull();
        sheet.classList.add("ph-sheet-full");
        sheet.style.height = ""; sheet.style.maxHeight = ""; sheet.style.transition = "";
        setIcon(true);
      };

      /* tap 切換（拖曳後 suppress，避免誤觸） */
      let suppressClick = false;
      el.onclick = (e) => {
        e.stopPropagation(); /* 防止 bubble 到 document click handler 觸發 _closeAllSheets */
        e.preventDefault();
        if (suppressClick) { suppressClick = false; return; }
        toggle();
      };

      /* 上下拖曳箭咀：向下展開、向上收起（跟 sheet 由頂部拉落嘅方向），放手磁吸到最近狀態 */
      let drag = null;
      if (el._dragAC) el._dragAC.abort();
      const ac = new AbortController();
      el._dragAC = ac;

      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        drag = {
          id: e.pointerId,
          startY: e.clientY,
          startH: sheet.getBoundingClientRect().height,
          full: isFull(),
          maxH: sheet.parentElement ? sheet.parentElement.clientHeight : sheet.getBoundingClientRect().height,
          moved: false
        };
        sheet.style.transition = "none";
        sheet._settleSeq = (sheet._settleSeq || 0) + 1; /* 取消未完成嘅磁吸動畫 */
        try { el.setPointerCapture(e.pointerId); } catch {}
      }, { signal: ac.signal });

      el.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dy = e.clientY - drag.startY; /* 向下為正：sheet 由頂部向下展開，handle 跟手指拉落 */
        if (!drag.moved) {
          if (Math.abs(dy) < 4) return;
          drag.moved = true;
          suppressClick = true;
          /* compact 拖落時即時放出展開內容，避免拉出一片空白 */
          if (!drag.full && opts.onDragStart) opts.onDragStart();
        }
        const minH = drag.full ? 90 : drag.startH;
        const h = Math.max(minH, Math.min(drag.startH + dy, drag.maxH));
        sheet.style.height = h + "px";
        sheet.style.maxHeight = "none";
        if (e.cancelable) e.preventDefault();
      }, { signal: ac.signal, passive: false });

      const endDrag = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag;
        drag = null;
        if (!d.moved) { sheet.style.transition = ""; return; }
        setTimeout(() => { suppressClick = false; }, 350);

        const dy = e.clientY - d.startY;
        const threshold = Math.max(52, d.maxH * 0.14);
        if (!d.full && dy > threshold) { expand(); return; }   /* 向下拉 → 展開 */
        if (d.full && -dy > threshold) { collapse(); return; } /* 向上推 → 收起 */

        /* 未夠力 → 磁吸返原本狀態 */
        if (d.full) {
          settleHeight(d.maxH, () => { sheet.style.height = "100%"; });
        } else {
          if (opts.onDragEnd) opts.onDragEnd(); /* 收起返下面內容 */
          settleHeight(d.startH, () => {
            sheet.style.height = "";
            sheet.style.maxHeight = "";
          });
        }
      };
      el.addEventListener("pointerup", endDrag, { signal: ac.signal });
      el.addEventListener("pointercancel", endDrag, { signal: ac.signal });
    };

    /* Streak sheet：accordion expand — 保留 streak 頂部 + 展開 calendar 下面 */
    expandArrow("btn-calendar-expand", "sheet-calendar",
      /* renderCompact — 只顯示 streak 大數字 */
      () => {
        const container = document.getElementById("sheet-calendar-content");
        if (!container) return;
        const streak = calcStreak();
        container.innerHTML = `
          <div style="padding:12px; text-align:center;">
            <div style="font-size:36px; font-weight:900; color:#ee1515;">🔥 ${streak}</div>
            <div style="font-size:12px; color:#7d786c; margin-top:4px;">Day streak</div>
          </div>`;
      },
      /* renderFull — 保留 streak + calendar 下面（accordion） */
      () => {
        const container = document.getElementById("sheet-calendar-content");
        if (!container) return;
        const streak = calcStreak();
        container.innerHTML = `
          <div style="padding:12px; text-align:center;">
            <div style="font-size:36px; font-weight:900; color:#ee1515;">🔥 ${streak}</div>
            <div style="font-size:12px; color:#7d786c; margin-top:4px;">Day streak</div>
          </div>
          <div class="cal-wrap"></div>`;
        if (typeof Calendar !== "undefined") Calendar.render("#sheet-calendar-content .cal-wrap");
      }
    );

    /* Pokédex / Quests：同 Streak 一樣用底部箭咀展開，full 模式把舊 view 內容搬入 sheet */
    expandArrow("btn-pokedex-expand", "sheet-pokedex",
      () => App._collapseSheetView(document.getElementById("sheet-pokedex")),
      () => App._expandSheetView(document.getElementById("sheet-pokedex")),
      {
        /* 拖曳展開時即刻放出下面內容，唔會拉出一片空白 */
        onDragStart: () => App._expandSheetView(document.getElementById("sheet-pokedex")),
        onDragEnd: () => App._collapseSheetView(document.getElementById("sheet-pokedex"))
      }
    );
    expandArrow("btn-quests-expand", "sheet-quests",
      () => {
        App._unmountSheetView(document.getElementById("sheet-quests"));
        renderQuestsCompact();
      },
      () => {
        App._mountSheetView("sheet-quests", "view-quests", () => {
          if (typeof Quests !== "undefined" && Quests.mount) Quests.mount();
        }, "quests");
      }
    );

    /* 底部 dockbar 按鈕：同樣用「先捲回再執行」+ toggle + token cancel + fixed overlay 處理 */
    const dockBinder = (id, sheetId, fn, overlayViewId) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onclick = () => {
        if (App._sheetSwitching) return;
        if (this._wideSwitch(sheetId, fn, overlayViewId)) return; /* wide 右欄：即時切換（Task 5） */

        /* 檢查 fixed overlay views */
        const fixedOverlays = document.querySelectorAll(
          "#view-friends.active, #view-leaderboard.active, #view-battle-menu.active"
        );
        const hasFixedOverlay = fixedOverlays.length > 0;

        const curSheet = document.querySelector("#view-home .ph-sheet.ph-open");
        const isToggle = curSheet && curSheet.id === sheetId;
        if (isToggle && !hasFixedOverlay) {
          this._closeSheet(sheetId);
          return;
        }
        if (curSheet || hasFixedOverlay) {
          if (hasFixedOverlay) this.showView("view-home");
          const token = (App._sheetSwitchToken = (App._sheetSwitchToken || 0) + 1);
          App._sheetSwitching = true;
          this._closeAllSheets();
          setTimeout(() => {
            if (App._sheetSwitchToken !== token) return;
            App._sheetSwitching = false;
            fn();
          }, hasFixedOverlay ? App.OVERLAY_EXIT_MS + 20 : App.SHEET_SWAP_MS);
          /* Rule 100：sheet→sheet 同時進行（舊 410ms 串行）；overlay→sheet 要等 overlay exit 完先開，
             否則 showView 延後嘅 _doShowView → _closeAllSheets 會收埋啱啱開嘅 sheet */
        } else {
          fn();
        }
      };
    };
    dockBinder("btn-bd-battle", "sheet-battle", () => this._openSheet("sheet-battle"));
    dockBinder("btn-bd-leaderboard", null, () => { if (typeof Leaderboard !== "undefined") Leaderboard.open(); }, "view-leaderboard");
    dockBinder("btn-bd-friends", null, () => { if (typeof Friends !== "undefined") Friends.open(); }, "view-friends");
    dockBinder("btn-bd-setting", "sheet-setting", () => this._openSheet("sheet-setting"));
  },

  /* 開機步驟：主頁各掣（Battle／Setting sheet 內容、TodayStrip、Gym、舊 topbar） */
  _bootHomeButtons() {
    /* Battle sheet 內容按鈕 */
    document.getElementById("btn-home-battle").onclick = () => {
      this._closeSheet("sheet-battle");
      if (typeof BattleUI !== "undefined") BattleUI.openMenu();
    };
    /* 背包（橫向）：由 Battle sheet 入 */
    const bagBtn = document.getElementById("btn-home-bag");
    if (bagBtn) bagBtn.onclick = () => {
      this._closeSheet("sheet-battle");
      if (typeof BagUI !== "undefined") BagUI.open({ from: "home" });
    };

    /* Setting sheet 內容按鈕 */
    document.getElementById("btn-name-edit").onclick = () => { this._closeSheet("sheet-setting"); this.openRename(); };
    document.getElementById("btn-login").onclick = () => { this._closeSheet("sheet-setting"); this.openLoginHub(); };
    document.getElementById("btn-import-sheet").onclick = () => { this._closeSheet("sheet-setting"); this.openImport(); };
    document.getElementById("btn-myq-sheet").onclick = () => { this._closeSheet("sheet-setting"); this.openMyQuestions(); };
    document.getElementById("btn-disclaimer").onclick = () => { this._closeSheet("sheet-setting"); this.openDisclaimer(); };
    const kbdHelpBtn = document.getElementById("btn-kbd-help");
    if (kbdHelpBtn) kbdHelpBtn.onclick = () => { this._closeSheet("sheet-setting"); if (window.Keys) Keys.showHelp(); };

    /* TodayStrip 按鈕 */
    const todayQuestsBtn = document.getElementById("btn-home-quests");
    if (todayQuestsBtn) todayQuestsBtn.onclick = () => { if (typeof Quests !== "undefined") Quests.open(); };

    /* Quest badge 更新 */
    if (typeof Quests !== "undefined" && Quests.refreshBadge) Quests.refreshBadge();
    if (typeof BattleUI !== "undefined") BattleUI.bind();

    /* Gym challenge（保留 id 俾 Gym.refreshHomeUI 寫內容） */
    const gymBtn = document.getElementById("btn-gym-challenge");
    if (gymBtn) gymBtn.onclick = () => { if (typeof Gym !== "undefined") Gym.startChallenge(); };

    /* 舊 topbar 按鈕（已隱藏，但保留綁定防 null） */
    const topFriendsBtn = document.getElementById("btn-top-friends");
    if (topFriendsBtn) topFriendsBtn.onclick = () => { if (typeof Friends !== "undefined") Friends.open(); };
    const topQuestsBtn = document.getElementById("btn-top-quests");
    if (topQuestsBtn) topQuestsBtn.onclick = () => { if (typeof Quests !== "undefined") Quests.open(); };
    const homePokedexBtn = document.getElementById("btn-home-pokedex");
    if (homePokedexBtn) homePokedexBtn.onclick = () => Pokedex.open();
    const topDiamondBtn = document.getElementById("btn-top-diamond");
    if (topDiamondBtn) topDiamondBtn.onclick = () => Gacha.open("rare");
    const settingsBtn = document.getElementById("btn-settings");
    if (settingsBtn) settingsBtn.onclick = () => this.openSettings();
    const battleMenuFriends = document.getElementById("battle-menu-friends");
    if (battleMenuFriends) battleMenuFriends.onclick = () => { if (typeof Friends !== "undefined") Friends.open(); };
  },

  /* 開機步驟：登入狀態／OAuth 失敗提示 */
  _bootLoginState() {
    /* OAuth redirect 返嚟時 SupabaseAuth.init() 已經 parse hash → save session。
       呢度只同步更新登入 UI；雲端合併（migrate / import / pull / overwrite 確認窗）
       全部延後到首屏出咗、loading 收走之後才跑 —— 見 _postLogin。 */
    if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
      this._markLoggedIn();
      this._needPostLogin = true;
    } else if (window.__oauthError) {
      /* OAuth 失敗 → 明確話俾用戶知，唔好靜靜地乜都冇發生 */
      console.warn("[OAuth] ❌", window.__oauthError);
      this.toast("❌ Google sign-in failed: " + window.__oauthError);
      window.__oauthError = null;
    }
  },

  /* 開機步驟：扭蛋、錯題回顧、圖鑑／日曆返回、下巴精靈球 Home 鍵 */
  _bootNavButtons() {
    /* btn-top-pull hidden since v48 — skip binding */
    document.getElementById("btn-pull-rare").onclick = () => Gacha.open("rare");
    document.getElementById("btn-review").onclick = () => this.showReview();
    if (typeof Pokedex !== "undefined" && Pokedex._setDexBackMode) Pokedex._setDexBackMode("grid");
    else {
      document.getElementById("btn-dex-back").onclick = () => { this.renderHome(); this.showView("view-home"); };
    }
    document.getElementById("btn-cal-back").onclick = () => { this.renderHome(); this.showView("view-home"); };
    /* 下巴精靈球 = Home 鍵：任何畫面一撳返主頁；順手收埋對戰 BGM、恢復城鎮音樂
       Gym 模式：結算頁離開（包括呢粒掣）時判 badge（Hint／錯題已計入 results） */
    /* 下巴 Home 球外觀 40px（< 44px 觸控標準），又有 overflow:hidden 唔可以用 ::after 擴大：
       撳中下巴、而且喺球中心左右 24px 內 → 當撳咗球（disabled 時 click() 本身冇效，frame lock 照樣生效） */
    const chin = document.querySelector(".pd-chin");
    if (chin && !chin._homeHitBound) {
      chin._homeHitBound = true;
      chin.addEventListener("click", (e) => {
        const ball = document.getElementById("btn-pd-home");
        if (!ball || e.target !== chin) return;
        const b = ball.getBoundingClientRect();
        if (Math.abs(e.clientX - (b.left + b.width / 2)) <= 24) ball.click();
      });
    }
    document.getElementById("btn-pd-home").onclick = () => {
      if (this._gymSettleData && typeof Gym !== "undefined") {
        const d = this._gymSettleData;
        this._gymSettleData = null;
        Quiz.mode = null;
        Gym.conclude(d);
        return;
      }
      try {
        const audio = window.CaptureScene && CaptureScene.audio;
        if (audio) { audio.stopBGM(300); audio.startTownBGM(); }
      } catch (e) {}
      this.renderHome(); this.showView("view-home");
    };
    document.getElementById("btn-review-back").onclick = () => {
      /* 由結算入嚟 → 返結算；由日曆入嚟 → 返主頁 */
      if (this._reviewFrom === "calendar") { this.showView("view-home"); }
      else this.showView("view-settlement");
      this._reviewFrom = null;
    };
  },

  /* 開機步驟：選題、答題（確認／提示／下一題／設定）、結算 Continue、圖片題聽聲 */
  _bootQuizControls() {
    /* 題型選擇畫面 */
    document.getElementById("btn-setup-start").onclick = () => Quiz.start([...this.selectedTopics]);
    document.getElementById("btn-topic-all").onclick = () => {
      this.selectedTopics = new Set(this._allTopicKeys());
      this.renderSetup();
    };
    document.getElementById("btn-topic-none").onclick = () => {
      this.selectedTopics = new Set();
      this.renderSetup();
    };

    /* 做題：✓ 確認 / Hint / 下一題 / 齒輪設定 */
    document.getElementById("btn-quiz-check").onclick = () => Quiz.check();
    document.getElementById("btn-quiz-hint").onclick = () => Quiz.hint();
    document.getElementById("btn-quiz-next").onclick = () => Quiz.next();
    document.getElementById("btn-quiz-settings").onclick = () => Quiz.openSettings();
    document.getElementById("btn-quiz-exit").onclick = () => Quiz.confirmQuit();
    document.getElementById("btn-quiz-replay").onclick = () => {
      if (window.CaptureScene) { window.CaptureScene.primeAudio(); }
      Quiz.pronounce();
    };
    /* 結算 Continue：同下巴精靈球同一出口（Gym conclude 掛喺 btn-pd-home，Rule 44） */
    document.getElementById("btn-settle-continue").onclick = () => document.getElementById("btn-pd-home").click();
    document.getElementById("btn-quiz-more").onclick = () => Quiz.toggleCardDrawer();
    document.getElementById("btn-report-issue").onclick = () => Quiz.openReport();
    /* 圖片單字題：點圖聽聲（可無限重播） */
    document.getElementById("btn-word-say").onclick = () => {
      if (window.CaptureScene) { window.CaptureScene.primeAudio(); window.CaptureScene.bgmPrime(); }
      Quiz.playWordAudio();
    };
    document.getElementById("btn-word-slow").onclick = () => Quiz.playWordAudio(true);
    document.getElementById("quiz-word-image-btn").onclick = () => {
      if (window.CaptureScene) { window.CaptureScene.primeAudio(); window.CaptureScene.bgmPrime(); }
      Quiz.playWordAudio();
    };
  },

  /* 開機步驟：Enter／Esc／Ctrl+P／Ctrl+H、sheet 外面點擊收埋 */
  _bootKeyboardAndClicks() {
    /* 答完後 Enter 亦可按 Next（輸入格已 disable，唔會再觸發 submit）*/
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      /* 結算頁：Enter = Continue（冇 modal 開住先算） */
      const sv = document.getElementById("view-settlement");
      if (sv && sv.classList.contains("active") && !e.repeat && !document.querySelector(".modal-backdrop")) {
        const t = e.target;
        if (!(t && t.closest && t.closest("button, input, textarea, select"))) {
          e.preventDefault();
          document.getElementById("btn-settle-continue").click();
        }
        return;
      }
      const qv = document.getElementById("view-quiz");
      if (!qv || !qv.classList.contains("active")) return;
      /* 焦點喺某粒掣上（方向鍵揀咗，js/keys.js）：Enter 撳嗰粒，唔好用下面嘅預設 */
      const onBtn = !!(e.target && e.target.closest && e.target.closest("#modal-root button"));
      /* ✕ 確認窗開住：Enter = Keep learning */
      const stayBtn = document.getElementById("quiz-quit-stay");
      if (stayBtn) { if (onBtn) return; e.preventDefault(); stayBtn.click(); return; }
      /* 設定彈窗開住：Enter = 確認 Quit this set（經按鈕，會一併關窗） */
      const quitBtn = document.getElementById("quiz-settings-quit");
      if (quitBtn && onBtn) return;
      if (quitBtn) {
        e.preventDefault();
        quitBtn.click();
        return;
      }
      /* 錯誤回報彈窗開住：Enter 只可以 Ctrl/Cmd+Enter 送出，唔好跳下一題 */
      if (document.getElementById("report-box")) {
        if ((e.ctrlKey || e.metaKey) && document.getElementById("report-send")) {
          e.preventDefault();
          document.getElementById("report-send").click();
        }
        return;
      }
      if (Quiz.answered) { e.preventDefault(); Quiz.next(); }
    });

    /* Esc：答題頁開設定；設定彈窗開住時 Esc = Keep going */
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      /* Home P1 sheet 優先：任何 ph-sheet 開住 → 先關。
         wide 嘅 Daily Quests 預設 sheet 長開，唔計（否則答題時 Esc 會變咗關 sheet，開唔到答題設定） */
      const openSheets = [...document.querySelectorAll("#view-home .ph-sheet.ph-open")]
        .filter(s => !s.dataset.wideDefault);
      if (openSheets.length) {
        e.preventDefault();
        App._closeAllSheets();
        return;
      }
      /* wide：右欄 overlay（選題／結算／Friends／Leaderboard／Battle Menu）Esc = 返主頁。
         經下巴 Home 掣行：Gym 結算 badge 判定（Rule 44）同 frame lock（disabled）照樣生效。
         有 modal／彈窗開住就唔處理（Esc 唔好穿過 modal 關後面嘅頁）。 */
      if (App.layout() === "wide") {
        const popupOpen = [...document.querySelectorAll(".modal-backdrop, .lb-login-modal, .team-select-modal, .tier-select-modal, .pvp-match-panel, .update-modal:not(.hidden)")]
          .some(m => getComputedStyle(m).display !== "none");
        const overlay = document.querySelector("#view-quiz-setup.active, #view-settlement.active, #view-friends.active, #view-leaderboard.active, #view-battle-menu.active");
        if (overlay && !popupOpen) {
          e.preventDefault();
          document.getElementById("btn-pd-home").click();
          return;
        }
      }
      const qv = document.getElementById("view-quiz");
      if (!qv || !qv.classList.contains("active")) return;
      if (document.getElementById("report-box")) return;
      const stay = document.getElementById("quiz-quit-stay");
      if (stay) { e.preventDefault(); stay.click(); return; }
      const keep = document.getElementById("quiz-settings-close");
      if (keep) {
        e.preventDefault();
        keep.click();
      } else if (!document.getElementById("quiz-settings-quit")) {
        e.preventDefault();
        Quiz.openSettings();
      }
    });

    /* capture 階段先記住原始 target 屬於邊個區域：handler 可能喺 click 期間 re-render，
       令 bubble 階段嘅 e.target 變咗 detached node，closest() 就會誤判「點咗 sheet 外面」。 */
    document.addEventListener("click", (e) => {
      const t = e.target;
      e.__peHit = {
        backdrop: !!(t && t.closest && t.closest("#view-home .ph-backdrop")),
        sheet: (t && t.closest && t.closest("#view-home .ph-sheet")) || null,
        closeBtn: !!(t && t.closest && t.closest("#view-home .ph-sheet-x")),
        /* gacha 抽獎動畫／結算卡掛喺 body（唔喺 sheet 入面），當佢哋係 gacha sheet 嘅延伸 */
        gachaOverlay: !!(t && t.closest && t.closest("#gacha-scene-b, #gacha-inspect"))
      };
    }, true);

    /* Home P1 sheet：backdrop 點擊關閉 + X 按鈕關閉 + 任何非 sheet 區域點擊先捲回 */
    document.addEventListener("click", (e) => {
      const anyOpen = document.querySelector("#view-home .ph-sheet.ph-open");
      if (!anyOpen) return;
      const hit = e.__peHit || {};

      /* wide：右欄係常駐面板唔係 modal —— 點左欄／外面唔關；只有 ✕ 會關（返 Daily Quests） */
      if (App.layout() === "wide") {
        if (hit.closeBtn && hit.sheet) App._closeSheet(hit.sheet.id);
        return;
      }

      if (hit.backdrop) { App._closeAllSheets(); return; }

      if (hit.closeBtn) {
        if (hit.sheet) App._closeSheet(hit.sheet.id);
        return;
      }

      /* 點擊咗 sheet 內嘅 element → 唔處理（由各 handler 自行關閉） */
      if (hit.sheet) return;

      /* 點擊咗 gacha overlay（抽獎動畫／結算卡）→ 當係 gacha sheet 內，唔好關 */
      if (hit.gachaOverlay && anyOpen.id === "sheet-gacha") return;

      /* 點擊咗任何其他地方 → 關閉 sheet，再讓原 click 冒泡執行 */
      App._closeAllSheets();
    });

    /* Ctrl+P / Cmd+P：播放圖片題音頻（要先 preventDefault，唔好開列印對話框）*/
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== "p") return;
      const qv = document.getElementById("view-quiz");
      if (!qv || !qv.classList.contains("active")) return;
      if (document.getElementById("report-box")) return;
      e.preventDefault();
      Quiz.playWordAudio();
    });

    /* Ctrl+H：等同按 Show hint */
    document.addEventListener("keydown", (e) => {
      if (!e.ctrlKey || String(e.key).toLowerCase() !== "h") return;
      const qv = document.getElementById("view-quiz");
      if (!qv || !qv.classList.contains("active")) return;
      if (document.getElementById("report-box")) return;
      e.preventDefault();
      Quiz.hint();
    });
  },

  /* 開機步驟：日曆掣、錯題回顧記住來源 */
  _bootCalendarAndReview() {
    /* 日曆 */
    document.getElementById("btn-cal-prev").onclick = () => Calendar.prev();
    document.getElementById("btn-cal-next").onclick = () => Calendar.next();

    /* 原本 showReview 需要知道來源 */
    const _origShowReview = this.showReview.bind(this);
    this.showReview = (from) => { this._reviewFrom = from || null; _origShowReview(); };
  },

  /* 開機步驟：載入題庫同 PokéAPI 資料、自訂圖片、世代、寵物、時間校正、狀態推算、首屏 render */
  async _bootLoadData() {
    /* 載入網站題庫（questions.csv）＋本地 PokéAPI 資料，先畫主畫面 */
    await Promise.all([loadSiteQuestions(), loadPictureWords(), loadPokemonDex()]);
    /* 自訂圖片題：從 IndexedDB hydrate blob URL 入 memory cache */
    if (typeof QImgDB !== "undefined") {
      try { await QImgDB.hydrateFromState(loadState().customQuestions); } catch (e) { console.warn(e); }
    }

    /* 世代系統（v127+）：
       1) 舊玩家可能已儲齊 Gen 1 → 啟動時重算 unlockedGen（靜默，唔彈慶祝窗）
       2) 已擁有嘅 Gen 2-5 entry 需要對應世代資料先好 derive 招式 */
    recomputeUnlockedGen();
    {
      const st = loadState();
      const gensOwned = new Set(st.entries.map(e => genOfChain(e.chainKey)));
      for (const g of gensOwned) {
        if (g > 1) await ensureGenDataLoaded(g);
      }
    }
    migrateEntries();
    /* 電子寵物：補算漏餵日子（只扣當前拍檔），要在首屏 render 之前完成 */
    if (window.Pet) Pet.runDailyCheck();
    /* 伺服器時間校正（失敗就沿用本機 offset，唔阻塞首屏） */
    if (window.Pet && window.Sync && Sync.syncClock) {
      Sync.syncClock().then((offset) => {
        if (offset === null || offset === undefined) return;
        Pet.runDailyCheck();
        this.renderHome();
      }).catch(() => {});
    }
    /* 狀態系統：頁面開住時每分鐘本地推算一次（HP 流失／睡眠倒數）；
       每 5 分鐘＋切返頁面時 server 結算（登入）校正；離線期間 Faint → 開 app 提示 */
    if (window.Pet && window.Care && !this._petTimerBound) {
      this._petTimerBound = true;
      const refreshCare = () => {
        this.renderHome();
        if (document.getElementById("pc-stage")) this._syncPetCare();
      };
      const serverSettle = (announce) => Care.settle().then(res => {
        refreshCare();
        if (announce && res && res.faintedNow && res.faintedNow.length) {
          this.toast(`${res.faintedNow.join(", ")} fainted while you were away. Use a Revival to bring ${res.faintedNow.length > 1 ? "them" : "it"} back.`);
        }
      }).catch(() => {});
      const tickPet = () => {
        Pet.runDailyCheck();
        refreshCare();
        schedulePetDecay();
      };
      const schedulePetDecay = () => {
        clearTimeout(this._petTimer);
        this._petTimer = setTimeout(tickPet, Math.max(1000, Pet.msUntilNextDecay() + 200));
      };
      schedulePetDecay();
      serverSettle(true);
      setInterval(() => { if (document.visibilityState === "visible") serverSettle(false); }, 5 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") { tickPet(); serverSettle(true); }
      });
    }
    /* 背景補下未完嘅世代資料包（斷點續傳） */
    if (window.GenPack) GenPack.resumePending(loadState().unlockedGen || 1);

    this.renderHome();
    this.showView("view-home");
  },

  /* 開機步驟：首屏之後：OAuth 雲端合併、wide 右欄預設、未登入彈 Login Hub */
  _bootAfterFirstRender(st) {
    /* 首屏已 render：等 loading 淡出走完（400ms）才做 OAuth 雲端合併，
       確保「Overwrite local progress?」確認窗浮喺正常畫面上，一定撳得到。 */
    if (this._needPostLogin) {
      this._needPostLogin = false;
      setTimeout(() => { this._postLogin(st); }, 600);
    }

    /* wide 右欄：首屏顯示 Daily Quests；之後 layout 改變（拉闊／收窄視窗、轉 iPad）跟住補／收 */
    this._showWideDefault();
    this._syncRotateHint(); /* 一開就打橫嘅手機 */
    if (!this._layoutChangeBound) {
      this._layoutChangeBound = true;
      document.addEventListener("pe:layout", (e) => this._onLayoutChange(e.detail.from, e.detail.to));
    }

    /* Login Gate：未登入 → 自動彈 Login Hub modal 擋住畫面 */
    const loggedIn = window.SupabaseAuth && SupabaseAuth.isLoggedIn();
    if (!loggedIn) {
      /* 等 loading 淡出後先彈 modal，避免 modal 被 loading overlay 遮住 */
      setTimeout(() => { this.openLoginHub(true); }, 500);
    }
  },

  /* 開機步驟：全部 UI 掣嘅按聲、按下動畫、震動 */
  _bootClickFeedback() {
    /* 全部 UI 掣短 click SFX + pressed 彈出動畫 + vibration（委派一次；跟 Settings SFX %） */
    if (!this._uiTapBound) {
      this._uiTapBound = true;
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(
          "button, [role=button], .chip-btn, .pd-menu-btn, .icon-btn, .entry-gate-btn, .footer-link, .guide-link, .reset-link, .move-choice, .curve-mode-opt"
        );
        if (!btn || btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
        /* 1. UI tap SFX */
        if (window.CaptureScene && CaptureScene.audio && CaptureScene.audio.uiTap) {
          CaptureScene.audio.uiTap();
        }
        /* 2. pressed 彈出動畫（防抖動：remove 再 add 重啟 animation） */
        btn.classList.remove("pressed");
        void btn.offsetWidth;  /* force reflow */
        btn.classList.add("pressed");
        setTimeout(() => btn.classList.remove("pressed"), 300);
        /* 3. Vibration（touch 設備先得；防止 Settings vibrate 關閉時都震） */
        if (navigator.vibrate && typeof App._vibrationEnabled === "boolean" && App._vibrationEnabled) {
          navigator.vibrate(12);
        } else if (navigator.vibrate && !("vibration" in window)) {
          /* 舊版只係 vibrate 存在但冇開關 → 輕微震 */
          navigator.vibrate(12);
        }
      }, true);
    }
  },

  /* 開機步驟：全域 BGM、Entry Gate、戰鬥 BGM 同捕捉場景 idle 預載 */
  _bootAudio() {
    /* 全域 BGM（Flat Water）+ Entry Gate：
       1) 開頁即試播 —— PWA / 高互動用戶可直接出聲，唔彈窗
       2) Autoplay 被擋 → 彈 entry gate，撳 YES!（合法手勢）解鎖 + 播 BGM */
    const entryGate = document.getElementById("entry-gate");
    const unlockAudio = () => {
      if (window.CaptureScene && CaptureScene.audio) {
        CaptureScene.audio.ensure();
        /* 戰鬥 BGM（2 MB mp3）唔再喺入場一刻 fetch＋decode（Rule 101）：入場掣撳完會卡一下。
           改為主頁 idle 時預載；答題 submit／Battle Menu 仍然會 bgmPrime，startBGM 自己亦會補載＋重試 */
        CaptureScene.audio.startTownBGM();
      }
    };
    let _bgmIdleQueued = false;
    const preloadBattleBGM = () => {
      if (_bgmIdleQueued) return;
      _bgmIdleQueued = true;
      setTimeout(() => {
        const run = () => {
          try { if (window.CaptureScene && CaptureScene.audio && CaptureScene.audio._loadBGMBuffer) CaptureScene.audio._loadBGMBuffer(); } catch (e) {}
        };
        if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 8000 }); else run();
      }, 6000);
    };
    unlockAudio();  /* 開頁即試（可能被 suspend） */
    preloadBattleBGM();
    /* three.js 捕捉場景（Rule 103）：唔再開機載；主頁 idle 20 秒後預載，答題開始亦會預載 */
    try { if (window.CaptureScene && CaptureScene.preload) CaptureScene.preload(20000); } catch (e) {}
    const audioCtx = window.CaptureScene && CaptureScene.audio ? CaptureScene.audio.ctx : null;
    if (audioCtx && audioCtx.state === "running") {
      entryGate.classList.add("hidden");     /* 已獲授權，唔使彈窗 */
    } else {
      entryGate.classList.remove("hidden");
      const closeGate = () => {
        unlockAudio();
        entryGate.classList.add("closing");
        setTimeout(() => entryGate.classList.add("hidden"), 320);
      };
      document.getElementById("btn-entry-yes").addEventListener("click", closeGate);
      /* 掂卡片外都當 YES */
      entryGate.addEventListener("click", (e) => { if (e.target === entryGate) closeGate(); });
    }
  },

  /* 開機步驟：Service Worker 註冊同新版本自動套用 */
  _bootServiceWorker() {
    /* Service Worker（PWA 離線）＋新版本自動套用 */
    if (location.protocol.startsWith("http") && "serviceWorker" in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      /* 新 SW 接管時自動 reload → 用戶永遠玩最新版，唔需要手動確認 */
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || reloading) return;
        reloading = true;
        location.reload();
      });

      /* Rule 103：SW install 會 precache ~14 MB（cries、戰鬥素材、BGM…）。第一次開 App 唔可以同首屏爭頻寬：
         已有 controller（第二次開）即刻註冊／檢查更新；第一次就等 load 完再 idle 8 秒先註冊 */
      const registerSW = () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then(reg => {
          /* 每次載入同返回頁面都檢查更新 */
          reg.update().catch(() => {});
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reg.update().catch(() => {});
          });
        })
        .catch(() => {});
      if (hadController) registerSW();
      else {
        const later = () => setTimeout(() => {
          if (window.requestIdleCallback) requestIdleCallback(registerSW, { timeout: 10000 }); else registerSW();
        }, 8000);
        if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
      }
    }
  }
});
