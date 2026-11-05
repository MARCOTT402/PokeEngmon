﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/* ============================================================
   PokeEngmon - 主流程
   路由 / 主畫面 / 題型選擇 + CSV 匯入 / 結算獎勵 / 錯題回顧 / 進化 / Modal
   ============================================================ */

const APP_VERSION = "1.62.0";

const App = {
  lastRecord: null,   // 今次做完嘅一組（結算 / 錯題回顧用）
  pendingEvolve: null,
  selectedTopics: new Set(),   // 題型選擇
  _sheetSwitching: false,       /* 上框 sheet 切換中（close→open timer 期間 block 重複 click） */

  /* ---------- 路由 ---------- */
  showView(id) {
    /* 如果目前有 fixed overlay view（Friends/Leaderboard/Battle Menu），
       且目標係 view-home，先加 exit 動畫 class，延遲 400ms 再切 active */
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
      /* 等 400ms 動畫跑完先真正切 view */
      setTimeout(() => {
        fixedOverlayActive.classList.remove("fixed-overlay-exit");
        this._doShowView(id);
      }, 400);
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
    window.scrollTo(0, 0);
  },

  /* 紅框功能鍵（上框 4 個 stat + 下巴 Home 球）：答題 / 捕捉 / 對戰時全部停用，防誤觸 */
  _setFrameLock(locked) {
    const shell = document.getElementById("pd-shell");
    if (!shell) return;
    shell.classList.toggle("frame-locked", locked);
    ["btn-bezel-streak", "btn-bezel-diamond", "btn-bezel-dex", "btn-bezel-energy", "btn-pd-home"]
      .forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = locked;
        el.setAttribute("aria-disabled", locked ? "true" : "false");
      });
  },

  /* 已解鎖物種數：ownership 聯集（唔以 entry 數計，避免進化形態灌水） */
  _unlockedSpeciesCount(st) {
    if (typeof collectedCount === "function") return collectedCount();
    const set = new Set();
    (st.entries || []).forEach(e => {
      if (typeof ensureEntryPokemonData === "function" && !Array.isArray(e.ownedSpecies)) ensureEntryPokemonData(e);
      (e.ownedSpecies || []).forEach(id => set.add(id));
    });
    return set.size;
  },

  /* 計算累加到 unlockedGen 嘅物種總數（Gen1=151, Gen1+2=251 …） */
  _unlockedGenTotal(gen) {
    if (typeof GENS === "undefined") return 151;
    let total = 0;
    for (let i = 0; i < gen && i < GENS.length; i++) {
      const range = GENS[i].range;
      total += range[1] - range[0] + 1;
    }
    return total || 151;
  },

  /* Canvas 閃電動畫（22×22 px pixel art，閃爍效果） */
  _initBoltCanvas() {
    const canvas = document.getElementById("pd-bolt-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* Pixel art 閃電（5 段 path，22×22） */
    const boltPaths = [
      /* base frame — 主閃電 */
      [[14,2, 8,11,12,11,7,20]],
      /* frame 2 — 加支線 */
      [[14,2, 8,11,12,11,7,20], [10,7, 14,9]],
      /* frame 3 — 加另一條支線 */
      [[14,2, 8,11,12,11,7,20], [10,7, 14,9], [9,14, 6,16]],
      /* frame 4 — 減返支線 */
      [[14,2, 8,11,12,11,7,20]],
    ];

    let frameIdx = 0;
    let tick = 0;
    const FLASH_INTERVAL = 6; /* 每 N tick 換一幀 */

    const draw = () => {
      ctx.clearRect(0, 0, 22, 22);

      const paths = boltPaths[frameIdx % boltPaths.length];
      paths.forEach(pts => {
        /* 主體（亮黃） */
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i+1]);
        ctx.stroke();

        /* 高光（白邊） */
        ctx.strokeStyle = "#fff8dc";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i+1]);
        ctx.stroke();
      });

      tick++;
      if (tick >= FLASH_INTERVAL) { tick = 0; frameIdx++; }
    };

    /* 開始動畫 */
    this._boltRaf = requestAnimationFrame(function loop() {
      draw();
      App._boltRaf = requestAnimationFrame(loop);
    });

    /* 清理（頁面隱藏時） */
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this._boltRaf) {
        cancelAnimationFrame(this._boltRaf);
        this._boltRaf = null;
      } else if (!this._boltRaf) {
        this._boltRaf = requestAnimationFrame(function loop() {
          draw();
          App._boltRaf = requestAnimationFrame(loop);
        });
      }
    });
  },

  /* ---------- 主畫面 ---------- */
  renderHome() {
    const st = loadState();
    /* 右上角鑽石數字 pill */
    const topDiamonds = document.getElementById("topbar-diamonds");
    if (topDiamonds) topDiamonds.textContent = st.diamonds;

    /* 連續天數 x1 格式 */
    const streakEl = document.getElementById("home-streak-label");
    if (streakEl) streakEl.textContent = "x" + calcStreak();

    /* Pokédex：分子 = 已解鎖物種數（ownedSpecies 聯集，唔重複計進化形態）；
       分母 = 累加到 unlockedGen 嘅物種總數 */
    const dexProgEl = document.getElementById("home-dex-progress");
    if (dexProgEl) {
      const unlocked = App._unlockedSpeciesCount(st);
      const denominator = App._unlockedGenTotal(st.unlockedGen || 1);
      dexProgEl.textContent = unlocked + "/" + denominator;
    }

    /* Energy：單一數值（戰鬥可用能量 points）— 必須先 Energy.ensure() normalize */
    const energyEl = document.getElementById("td-energy-val");
    if (energyEl) {
      let points = 0;
      if (typeof Energy !== "undefined" && Energy.ensure) {
        const e = Energy.ensure(st);
        points = Number(e?.points) || 0;
      } else {
        /* fallback：直接讀 st.energy（正常情況唔會行到） */
        const e = st.energy;
        points = (e && typeof e === "object") ? (Number(e.points) || 0) : (typeof e === "number" ? e : 0);
      }
      energyEl.textContent = points;
    }

    /* 登入 chip 狀態：任何情況下都同步返真實登入狀態（包括 localStorage restore） */
    if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) this._markLoggedIn();

    /* 拍檔卡（Signature） */
    const entry = getActiveEntry();
    const sprite = document.getElementById("hero-sprite");
    const nameEl = document.getElementById("hero-name");
    const rarityEl = document.getElementById("hero-rarity");
    const lvEl = document.getElementById("hero-lv");
    const fullVal = document.getElementById("hero-full-val");

    /* Hero HP/EXP bar 位置已遷到 Signature 卡；舊 label/stage 元素由新 ID 取代 */
    if (entry) {
      ensureEntryPokemonData(entry);
      const chain = EVOLUTION_CHAINS.find(c => c.key === entry.chainKey);
      const cur = entryCurrentSpecies(entry);
      const rz = RARITY[chain?.baseRarity] || RARITY.normal; /* v141：冇 "common" key，舊 fallback 會 undefined → rz.bg throw */
      const level = entry.level || 1;
      /* Animated pixel GIF from local assets; falls back to the static sprite */
      sprite.onerror = () => { sprite.onerror = null; sprite.src = spriteURL(cur[0]); };
      sprite.src = animatedURL(cur[0]);
      sprite.style.visibility = "visible";
      sprite.style.display = "";
      nameEl.textContent = cur[1];
      rarityEl.textContent = rz.label;
      rarityEl.style.background = rz.bg;
      rarityEl.style.color = rz.color;
      if (lvEl) lvEl.textContent = "Lv." + level;

      /* 電子寵物狀態：只跟當前拍檔，其他寶可夢唔受影響 */
      const petSt = window.Pet ? Pet.status(entry) : null;

      /* HP：上限 = 戰鬥引擎 stats.hp；現值 = hp_permille（狀態系統第一期） */
      this._renderHeroBattleHp(entry, cur[0], level, petSt);
      const hpBar = document.getElementById("hero-hpbar");
      const hpNote = document.getElementById("hero-pet-note");
      if (hpBar && hpNote) {
        if (petSt) {
          hpBar.style.width = Math.max(0, petSt.health) + "%";
          if (fullVal) fullVal.textContent = `${Math.max(0, petSt.health)}/100`;
          const wrap = hpBar.parentElement;
          wrap.classList.toggle("mid", petSt.health > 25 && petSt.health <= 50);
          wrap.classList.toggle("low", petSt.health <= 25);
          sprite.classList.toggle("fainted", petSt.faint);
          if (petSt.frozen) {
            hpNote.textContent = "Time check needed — reconnect to sync";
          } else if (petSt.faint) {
            hpNote.textContent = "Fainted";   /* spec：Faint 唔顯示復活提示 */
          } else if (petSt.health >= 100) {
            hpNote.textContent = "Full";
          } else {
            hpNote.textContent = "Hungry — tap to feed";
          }
        } else {
          hpBar.style.width = "0%";
          hpNote.textContent = "";
        }
      }
    } else {
      sprite.style.visibility = "hidden";
      sprite.style.display = "none";
      sprite.classList.remove("fainted");
      nameEl.textContent = "No Pokémon yet";
      rarityEl.textContent = "—";
      rarityEl.style.background = ""; rarityEl.style.color = "";
      if (lvEl) lvEl.textContent = "";
      if (fullVal) fullVal.textContent = "—";
      /* 冇拍檔時清空健康條 */
      this._renderHeroBattleHp(null);
      const hpBar0 = document.getElementById("hero-hpbar");
      const hpNote0 = document.getElementById("hero-pet-note");
      if (hpBar0) {
        hpBar0.style.width = "0%";
        hpBar0.parentElement.classList.remove("mid", "low");
      }
      if (hpNote0) hpNote0.textContent = "Answer questions → pull a Pokémon!";
    }

    /* 點拍檔 → Partner Care（育成 / 餵食 / 換拍檔都可以喺彈窗做） */
    sprite.classList.toggle("clickable", !!entry);
    sprite.onclick = () => { if (entry) this.openPartnerPicker(); };

    /* 版本號移入 setting sheet */
    const verEl = document.getElementById("app-version");
    if (verEl) verEl.textContent = APP_VERSION;
    if (typeof Gym !== "undefined" && Gym.refreshHomeUI) Gym.refreshHomeUI();
    /* 外部條件進化（例如未來 likes 達 20）→ 主頁／登入時自動播出進化場景 */
    if (typeof EvolveScene !== "undefined") this._checkPendingEvolutions();
  },

  /* ---------- 主頁／登入時檢查條件已達成嘅進化（trade likes 等） ---------- */
  _checkPendingEvolutions() {
    if (this._evoChecking) return;
    const root = document.getElementById("modal-root");
    if (root && root.innerHTML) return;   /* 有彈窗進行中，唔打斷 */
    const st = loadState();
    const pending = [];
    (st.entries || []).forEach(e => {
      const info = entryNextEvolution(e);
      if (!info || !info.target || !canEvolveNow(e, info)) return;
      const fromDex = entryCurrentSpecies(e)[0];
      const res = addEntryExp(e, 0);
      if (!res || !res.evolvedTo) return;
      pending.push({ fromDex, toDex: res.evolvedTo.dexId });
      if (window.Sync && Sync.isEnabled && Sync.isEnabled()) {
        if (e.branch != null) Sync.patchEntry(e.uid, { branch: e.branch });
        if (e.stone) Sync.patchEntry(e.uid, { stone_used: e.stone });
      }
    });
    if (!pending.length) return;
    saveState();
    this._evoChecking = true;
    this.renderHome();
    const next = () => {
      const p = pending.shift();
      if (!p) {
        this._evoChecking = false;
        this.renderHome();
        return;
      }
      EvolveScene.open({ fromDex: p.fromDex, toDex: p.toDex, onDone: next });
    };
    setTimeout(next, 400);
  },

  /* ---------- 重設進度（Settings 內，要輸入訓練員名先撳得） ---------- */
  _confirmReset() {
    const st = loadState();
    const playerName = st.playerName || "The PokéEngmon Trainer";
    const safeName = escapeHTML(playerName);
    this.showModal(`
      <div class="confirm-box">
        <p>Reset <b>all progress</b> and the Pokédex?<br><small>(Imported custom questions will also be deleted)</small></p>
        <p class="reset-type-hint">Type your trainer name <b>${safeName}</b> to confirm:</p>
        <input id="reset-name-input" class="quiz-answer-input" type="text"
               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
               placeholder="${safeName}">
        <div class="confirm-row">
          <button id="cf-yes" class="btn-big btn-primary btn-danger" disabled>Delete everything</button>
          <button id="cf-no" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`, true);
    const input = document.getElementById("reset-name-input");
    const yesBtn = document.getElementById("cf-yes");
    input.oninput = () => {
      yesBtn.disabled = input.value.trim().toLowerCase() !== playerName.trim().toLowerCase();
    };
    input.onkeydown = (e) => { if (e.key === "Enter" && !yesBtn.disabled) yesBtn.click(); };
    setTimeout(() => input.focus(), 50);
    yesBtn.onclick = async () => {
      /* 先丟棄未發送嘅同步 queue，再清雲端，最後清本機（避免 reset 後又被寫返上去） */
      if (window.Sync) Sync.clearQueue();
      if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
        const cloud = await SupabaseAuth.resetProgress();
        if (!cloud) this.toast("Cloud reset failed — this device was cleared only");
      }
      resetState();
      this.closeModal();
      this.renderHome();
      this.toast("All reset — starting fresh!");
    };
    document.getElementById("cf-no").onclick = () => this.closeModal();
  },

  /* ---------- 換拍檔（只限已抽到嘅） ---------- */
  openPartnerPicker() {
    const st = loadState();
    if (!st.entries.length) { this.toast("No Pokémon yet — finish a set to pull one!"); return; }
    const entry = getActiveEntry();
    if (!entry) return;
    Pet.ensure(entry);
    this._pcSel = null;

    this.showModal(`
      <div class="petcare">
        <div class="pc-head">
          <h3>Partner Care</h3>
          <button class="pc-close" type="button" aria-label="Close">✕</button>
        </div>

        <div class="pc-stage" id="pc-stage">
          <div class="pc-ground"></div>
          <div class="pc-walker"><img id="pc-sprite" alt="partner"></div>
          <div class="pc-pills">
            <button type="button" class="pc-pill status" id="pc-status" hidden></button>
            <span class="pc-pill streak" id="pc-streak" title="Practice streak"><svg class="pc-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 L7.5 11.5 L11 12 L8 22 L16.5 10.5 L12 10.8 L14.5 2 Z" fill="#ffd54f" stroke="#3d1f00" stroke-width="1.4" stroke-linejoin="round"/></svg><b>0</b></span>
          </div>
          <div class="pc-hpwrap">
            <div class="pc-hprow"><span class="pc-hpk">HP</span><div class="pc-hpbar pc-battlehp" id="pc-battlehp"><i id="pc-battlehpfill"></i></div><span class="pc-hpv" id="pc-battlehptext">—</span></div>
            <div class="pc-hprow"><span class="pc-hpk">Fullness</span><div class="pc-hpbar" id="pc-hpbar"><i id="pc-hpfill"></i></div><span class="pc-hpv" id="pc-hptext">100/100</span></div>
          </div>
          <div class="pc-decay">Fullness −4% per hour</div>
          <div class="pc-floatwrap" id="pc-float"></div>
        </div>
        <div class="pc-state" id="pc-state"></div>

        <div class="pc-items">
          ${(() => {
            /* 樹果（第 3b 段）取代 food／premium；舊庫存仲有先顯示 */
            const legacy = ["food", "premium"].filter(k => Pet.countOf(k) > 0).map(k => `
          <div class="pc-item" data-kind="${k}">
            <img src="assets/items/${k}.png" alt=""><span>${k === "food" ? "Food +25" : "Premium +50"}</span>
            <b class="pc-count" data-count="${k}">0</b>
          </div>`).join("");
            const berries = Care.ownedBerries().map(k => { const b = Care.BERRIES[k]; return `
          <div class="pc-item berry ${b.tier}" data-kind="${k}" title="${b.name} — fullness +${b.fullness}%">
            <img src="${Care.ITEM_SPRITE(b.sprite)}" alt=""><span>${b.name.replace(" Berry", "")} +${b.fullness}</span>
            <b class="pc-count" data-count="${k}">0</b>
          </div>`; }).join("");
            return (legacy + berries) || `<div class="pc-berry-empty">No berries yet — answer quiz questions to collect them.</div>`;
          })()}
        </div>
        <div class="pc-evo-note" id="pc-evo-note"></div>
        <div class="pc-tip">Drag food onto your partner — or tap it, then tap the stage.</div>
        <div class="pc-bag-note">Medicine, Revival and evolution stones are in the <b>Bag</b>. <button type="button" class="pc-open-bag" id="pc-open-bag">Open Bag ›</button></div>

        <div class="pc-rosterhead"><span>Your Pokémon</span><span>Tap to bring it to the stage</span></div>
        <div class="pc-sortbar">
          <select id="pc-sort" class="dex-sort" aria-label="Sort your Pokémon"></select>
          <button id="pc-sort-dir" class="dex-dir" type="button" aria-label="Toggle sort direction">↑</button>
        </div>
        <div class="partner-list" id="pc-roster"></div>
      </div>`);

    const modal = document.getElementById("modal-root");
    modal.querySelector(".pc-close").onclick = () => this.closeModal();
    const openBag = modal.querySelector("#pc-open-bag");
    if (openBag) openBag.onclick = () => { this.closeModal(); if (typeof BagUI !== "undefined") BagUI.open({ from: "home" }); };

    /* 精靈列表排序（同圖鑑共用 DEXSORT 定義） */
    DEXSORT.bindControls(
      modal.querySelector("#pc-sort"),
      modal.querySelector("#pc-sort-dir"),
      "pokeengmon_care_sort_v1",
      () => this._syncPetCare()
    );

    /* 道具：點擊選取（手機）＋ 桌面拖放 */
    modal.querySelectorAll(".pc-item").forEach(tile => {
      const kind = tile.dataset.kind;
      tile.addEventListener("click", () => {
        if (!Pet.canUse(kind, getActiveEntry())) {
          const res = Pet.useItem(kind, getActiveEntry());   /* 借用佢嘅錯誤訊息 */
          if (res && !res.ok) this._pcToast(res.msg);
          return;
        }
        this._pcSel = this._pcSel === kind ? null : kind;
        this._syncPetCare();
      });
      tile.addEventListener("dragstart", e => {
        this._pcSel = kind;
        try { e.dataTransfer.setData("text/plain", kind); } catch (err) {}
        this._syncPetCare();
      });
      tile.addEventListener("dragend", () => {
        this._pcSel = null;
        const stage = document.getElementById("pc-stage");
        if (stage) stage.classList.remove("drop-hint");
        this._syncPetCare();
      });
    });

    const stage = document.getElementById("pc-stage");
    stage.addEventListener("dragover", e => {
      if (!this._pcSel) return;
      e.preventDefault();
      stage.classList.add("drop-hint");
    });
    stage.addEventListener("dragleave", () => stage.classList.remove("drop-hint"));
    stage.addEventListener("drop", e => {
      e.preventDefault();
      stage.classList.remove("drop-hint");
      const kind = this._pcSel || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
      if (kind) this._pcUse(kind);
    });
    stage.addEventListener("click", () => {
      if (this._pcSel) this._pcUse(this._pcSel);
    });

    this._syncPetCare();

    /* 開啟時即時結算（登入：server care_settle；guest：本地） */
    Pet.runDailyCheck();
    this._syncPetCare();
    this.renderHome();
    if (window.Care) Care.settle().then(() => { this._syncPetCare(); this.renderHome(); }).catch(() => {});
  },

  _pcFloat(text, cls) {
    const box = document.getElementById("pc-float");
    if (!box) return;
    box.innerHTML = `<div class="pc-float ${cls || ""}">${escapeHTML(text)}</div>`;
    setTimeout(() => { box.innerHTML = ""; }, 1200);
  },

  async _pcUse(kind) {
    const entry = getActiveEntry();
    this._pcSel = null;
    if (window.Care && !STONE_KINDS.includes(kind) && (Care.online() || (Care.isBerry && Care.isBerry(kind)))) {
      if (this._pcBusy) return;
      this._pcBusy = true;
      const name = entryCurrentSpecies(entry)[1];
      const out = (kind === "food" || kind === "premium" || Care.isBerry(kind)) ? await Care.feed(entry, kind) : await Care.use(entry, kind);
      this._pcBusy = false;
      const label = Care.MED_INFO[kind] ? Care.MED_INFO[kind].name : (Care.BERRIES && Care.BERRIES[kind]) ? Care.BERRIES[kind].name : (kind === "premium" ? "Premium Food" : (kind === "revive" ? "Revival" : "Food"));
      if (out && out.ok) this._pcFloat(Care.eventText(out.event, name, label), /^(vomit|faint|od_)/.test(out.event) ? "bad" : "good");
      else this._pcToast(Care.REASON_TEXT[out && out.reason] || "Can't use that now");
      this._syncPetCare();
      this.renderHome();
      return;
    }
    const res = Pet.useItem(kind, entry);
    if (res.ok) {
      this._pcFloat(res.msg, /^(vomit|faint|od_)/.test(res.event || "") ? "bad" : "good");
      this.renderHome();
      this._syncPetCloud();
      /* 石進化：branch / stone_used 要上雲，否則 pull 重推會退化 */
      if (res.evolvedTo) {
        const current = getActiveEntry();
        if (current && window.Sync && Sync.isEnabled && Sync.isEnabled()) {
          if (res.branch != null) Sync.patchEntry(current.uid, { branch: res.branch });
          if (res.stone) Sync.patchEntry(current.uid, { stone_used: res.stone });
        }
        /* 先留住舊形態喺舞台發光（光團），完左先彈進化 hub；
           hub 關閉後重開 Partner Care 先見到新形態 */
        this._pcKeepSprite = true;
        this._syncPetCare();
        const sp = document.getElementById("pc-sprite");
        if (sp) sp.classList.add("glow-evo");
        setTimeout(() => {
          this.showEvolveModal(res.evolvedTo, () => {
            this._pcKeepSprite = false;
            this.openPartnerPicker();
          }, res.evolvedFrom);
        }, 1500);
        return;
      }
      this._syncPetCare();
    } else {
      this._pcToast(res.msg);
    }
  },

  /* 寵物狀態 + 背包 → 雲端備份（只對已登入用戶；失敗靜默，下次操作再試） */
  _syncPetCloud() {
    if (!window.Sync || !Sync.isEnabled || !Sync.isEnabled()) return;
    if (!Sync.pushPet || !Sync.pushItems) return;
    const entry = getActiveEntry();
    if (entry && entry.pet) Sync.pushPet(entry.uid, entry.pet);
    Sync.pushItems(Pet.items());
  },

  _pcToast(msg) {
    const box = document.getElementById("pc-float");
    if (!box) return;
    box.innerHTML = `<div class="pc-float bad">${escapeHTML(msg)}</div>`;
    setTimeout(() => { box.innerHTML = ""; }, 1200);
  },

  /* 主頁 HP 條：顯示實數 cur/max；>50% 綠、20–50% 黃、<20% 紅、Faint 灰 */
  _renderHeroBattleHp(entry, dexId, level, petSt) {
    const fill = document.getElementById("hero-battlehp");
    const val = document.getElementById("hero-battlehp-val");
    if (!fill || !val) return;
    const wrap = fill.parentElement;
    if (!entry) {
      fill.style.width = "0%";
      val.textContent = "—";
      wrap.classList.remove("mid", "low", "faint");
      return;
    }
    const hp = window.Care ? Care.hpOf(entry) : { cur: 0, max: 0, pct: 0, faint: false };
    const faint = hp.faint;
    const pct = hp.max > 0 ? hp.pct : 0;
    fill.style.width = pct + "%";
    val.textContent = hp.max > 0 ? `${hp.cur}/${hp.max}` : "—";
    wrap.classList.toggle("faint", faint);
    wrap.classList.toggle("mid", !faint && pct >= 20 && pct <= 50);
    wrap.classList.toggle("low", !faint && pct < 20);
    /* 狀態 icon：撳落去 → 睡眠／冰凍顯示倒數，其他顯示「持續中，需用藥解除」 */
    const stBtn = document.getElementById("hero-status");
    if (stBtn) {
      const key = window.Care && entry.pet ? Care.statusKey(entry.pet) : null;
      stBtn.hidden = !key || faint;
      if (key) {
        stBtn.querySelector("img").src = `assets/battle/ui/status-${Care.STATUS_INFO[key].icon}.png`;
        stBtn.onclick = (ev) => { ev.stopPropagation(); this.toast(this._statusInfoText(entry)); };
      }
    }
  },

  /* 狀態說明（主頁 icon／Partner Care 共用） */
  _statusInfoText(entry) {
    const p = entry && entry.pet; if (!p || !window.Care) return "";
    const key = Care.statusKey(p); if (!key) return "";
    const info = Care.STATUS_INFO[key];
    if (key === "slp" || key === "frz") {
      const left = Math.ceil(Care.sleepLeftMs(p) / 60000);
      return `${info.label} — ${key === "slp" ? "wakes up" : "thaws"} in ${left} min. ${key === "slp" ? "Awakening" : "Ice Heal"} fixes it now.`;
    }
    return `${info.label} — lasts until cured. ${info.note}`;
  },

  /* 同步育成彈窗三層內容（唔重建 DOM，避免動畫閃） */
  _syncPetCare() {
    const st = loadState();
    const entry = getActiveEntry();
    if (!entry) return;
    const p = Pet.ensure(entry);
    const cur = entryCurrentSpecies(entry);
    const dayQ = Pet.dayKey();

    const sprite = document.getElementById("pc-sprite");
    if (sprite && !this._pcKeepSprite) {
      const want = animatedURL(cur[0]);
      if (sprite.dataset.src !== want) {
        sprite.dataset.src = want;
        sprite.onerror = () => { sprite.onerror = null; sprite.src = spriteURL(cur[0]); };
        sprite.src = want;
      }
    }
    const faint = Pet.isFaint(entry);
    const stage = document.getElementById("pc-stage");
    if (stage) stage.classList.toggle("faint", faint);

    /* 飽肚值條 */
    const bar = document.getElementById("pc-hpbar");
    if (bar) {
      bar.classList.toggle("mid", p.health > 25 && p.health <= 50);
      bar.classList.toggle("low", p.health <= 25);
    }
    const fill = document.getElementById("pc-hpfill");
    if (fill) fill.style.width = Math.max(0, p.health) + "%";
    const hpText = document.getElementById("pc-hptext");
    if (hpText) hpText.textContent = `${Math.max(0, p.health)}/100`;

    /* HP 條：>50% 綠、20–50% 黃、<20% 紅、Faint 灰 */
    const hp = Care.hpOf(entry);
    const hbar = document.getElementById("pc-battlehp");
    if (hbar) {
      hbar.classList.toggle("faint", hp.faint);
      hbar.classList.toggle("mid", !hp.faint && hp.pct >= 20 && hp.pct <= 50);
      hbar.classList.toggle("low", !hp.faint && hp.pct < 20);
    }
    const hfill = document.getElementById("pc-battlehpfill");
    if (hfill) hfill.style.width = hp.pct + "%";
    const htext = document.getElementById("pc-battlehptext");
    if (htext) htext.textContent = hp.max ? `${hp.cur}/${hp.max}` : "—";

    /* 狀態 pill（撳落去睇說明／倒數） */
    const key = Care.statusKey(p);
    const stPill = document.getElementById("pc-status");
    if (stPill) {
      stPill.hidden = !key || faint;
      if (key) {
        stPill.innerHTML = `<img src="assets/battle/ui/status-${Care.STATUS_INFO[key].icon}.png" alt=""> ${Care.STATUS_INFO[key].label}`;
        stPill.onclick = () => this._pcToast(this._statusInfoText(entry));
      }
    }
    /* 連續答題日數（餵食 streak 已取消） */
    const streak = document.querySelector("#pc-streak b");
    if (streak) streak.textContent = typeof calcStreak === "function" ? calcStreak() : 0;

    /* 狀態文案 */
    const state = document.getElementById("pc-state");
    if (state) {
      state.className = "pc-state";
      if (faint) {
        state.classList.add("faint");
        state.textContent = `${cur[1]} has fainted — answers still count but earn 0 EXP, and it can't battle.`;
      } else if (key) {
        state.classList.add("hungry");
        state.textContent = this._statusInfoText(entry);
      } else if (p.health >= 100) {
        state.classList.add("full");
        state.textContent = "Full! Feeding more now will make it throw up.";
      } else {
        state.classList.add("hungry");
        state.textContent = `${cur[1]} is hungry — fullness drops 4% per hour.`;
      }
    }

    /* 道具數量 + 可用狀態 */
    document.querySelectorAll("#modal-root .pc-item").forEach(tile => {
      const kind = tile.dataset.kind;
      const n = Pet.countOf(kind);
      const badge = tile.querySelector(".pc-count");
      if (badge) badge.textContent = n;
      const usable = Pet.canUse(kind, entry);
      tile.classList.toggle("disabled", !usable);
      tile.classList.toggle("selected", this._pcSel === kind && usable);
      tile.draggable = usable;
    });

    /* 進化石提示：下一階段需要咩條件 */
    const evoNote = document.getElementById("pc-evo-note");
    if (evoNote) {
      const info = entryNextEvolution(entry);
      let txt = "";
      if (!info) {
        txt = "Fully evolved — no further evolution.";
      } else if (info.trade) {
        const likes = loadState().trainerLikes || 0;
        txt = `Needs ${TRADE_LIKES_REQUIRED} likes to evolve (${likes}/${TRADE_LIKES_REQUIRED})`;
      } else if (info.target && info.stone) {
        txt = `Give it a ${STONE_LABELS[info.stone]} in the Bag to evolve.`;
      } else if (info.target) {
        txt = (entry.level || 1) >= (info.needLevel || 0)
          ? "Ready to evolve!"
          : `Evolves at Lv.${info.needLevel} (now Lv.${entry.level || 1}).`;
      } else if (info.options && info.options.length) {
        const kinds = info.options.filter(o => o.stone).map(o => STONE_LABELS[o.stone]);
        txt = kinds.length ? `Evolves with ${kinds.join(" / ")}.` : "";
      }
      evoNote.textContent = txt;
    }

    /* 全部寶可夢：沿用原本 Switch Partner 的 dex-cell 外觀 */
    const roster = document.getElementById("pc-roster");
    if (roster) {
      const prefs = DEXSORT.load("pokeengmon_care_sort_v1");
      DEXSORT.syncControls(
        document.getElementById("pc-sort"),
        document.getElementById("pc-sort-dir"),
        prefs
      );
      const list = st.entries.slice();
      DEXSORT.sortList(list, prefs.sort, prefs.dir, e => {
        const c = entryCurrentSpecies(e);
        return { dexId: c[0], level: e.level || 1 };
      });
      roster.innerHTML = list.map(e => {
        ensureEntryPokemonData(e);
        const chain = EVOLUTION_CHAINS.find(c => c.key === e.chainKey);
        const c = entryCurrentSpecies(e);
        const rz = RARITY[chain?.baseRarity] || RARITY.normal;
        const faint = Pet.isFaint(e);
        const active = e.uid === st.activeUid;
        const metric = DEXSORT.metric(prefs.sort, c[0], e.level || 1);
        return `<button class="dex-cell owned ${active ? "current" : ""} ${faint ? "pc-faint" : ""}" data-uid="${e.uid}">
          <img src="${spriteURL(c[0])}" alt="${c[1]}">
          <span class="dex-name">${c[1]}</span>
          <span class="dex-rarity" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>
          <span class="p-stage">${metric} ・ ${"★".repeat(e.stars || 1)}${active ? " ・ Active" : ""}</span>
        </button>`;
      }).join("");
      roster.querySelectorAll(".dex-cell").forEach(cell => {
        cell.onclick = () => {
          const st2 = loadState();
          const uid = cell.dataset.uid;
          if (!uid || uid === st2.activeUid) return;
          const prevUid = st2.activeUid;
          st2.activeUid = uid;
          /* 換入嘅寶可夢由今日起計：唔追討盒子期間嘅自然消耗（唔會一換入就 −50） */
          const nextEntry = st2.entries.find(x => x.uid === uid);
          if (nextEntry && window.Pet) Pet.adoptActive(nextEntry);
          saveState();
          if (window.Sync && Sync.isEnabled()) {
            /* 先用舊拍檔結算到而家，再換 active（新拍檔由而家起計） */
            const settle = (window.Care && Care.online()) ? Care.settle() : Promise.resolve();
            settle.catch(() => {}).then(() => Sync.pushActive(uid));
          }
          /* 換走嘅拍檔：佢嘅 pet 狀態要保持上雲（否則首次 backfill 會漏） */
          const prevEntry = st2.entries.find(x => x.uid === prevUid);
          if (prevEntry && prevEntry.pet && window.Sync && Sync.pushPet) {
            Sync.pushPet(prevUid, prevEntry.pet);
          }
          this._pcSel = null;
          this._syncPetCare();
          this.renderHome();
          this._syncPetCloud();
        };
      });
    }
  },

  /* ---------- 題型選擇（做題前）：大類 → 單元 → 題型 三層 ---------- */
  openSetup() {
    this.selectedTopics = new Set(getCategories().flatMap(c => c.units.flatMap(u => u.topics.map(t => t.key))));
    this._expanded = new Set();
    const first = getCategories().find(c => !c.comingSoon);
    if (first) this._expanded.add("c:" + first.category);
    this.renderSetup();
    this.showView("view-quiz-setup");
  },

  _allTopicKeys() {
    return getCategories().flatMap(c => c.units.flatMap(u => u.topics.map(t => t.key)));
  },

  renderSetup() {
    const cats = getCategories();
    const list = document.getElementById("topic-list");
    list.innerHTML = "";
    if (!this._expanded) this._expanded = new Set();

    cats.forEach(({ category, units, count, comingSoon }) => {
      const keys = units.flatMap(u => u.topics.map(t => t.key));
      const sel = keys.filter(k => this.selectedTopics.has(k)).length;
      const all = keys.length > 0 && sel === keys.length;
      const catKey = "c:" + category;
      const open = !comingSoon && this._expanded.has(catKey);

      const card = document.createElement("div");
      card.className = "course-card" + (all ? " course-all" : "") + (open ? " open" : "")
        + (comingSoon ? " course-soon" : "");

      /* 大類列：☑ 一次過全選／取消成個大類；撳名或箭咀展開入面嘅單元 */
      const head = document.createElement("div");
      head.className = "course-head";
      head.innerHTML = `
        <span class="course-check" role="checkbox" aria-checked="${all}">${all ? "☑" : sel > 0 ? "◩" : "☐"}</span>
        <span class="course-name">${escapeHTML(category)}</span>
        <span class="course-count">${comingSoon ? "Coming Soon" : `${sel}/${keys.length} topics · ${count} questions`}</span>
        <span class="course-arrow">${comingSoon ? "" : open ? "▾" : "▸"}</span>`;
      if (!comingSoon) {
        head.querySelector(".course-check").onclick = (e) => {
          e.stopPropagation();
          if (all) keys.forEach(k => this.selectedTopics.delete(k));
          else keys.forEach(k => this.selectedTopics.add(k));
          this.renderSetup();
        };
        head.onclick = () => {
          if (open) this._expanded.delete(catKey);
          else this._expanded.add(catKey);
          this.renderSetup();
        };
      }
      card.appendChild(head);

      /* 展開後：大類入面嘅單元 */
      if (open) {
        const box = document.createElement("div");
        box.className = "course-topics";

        const mini = document.createElement("div");
        mini.className = "setup-mini-row course-mini-row";
        const bAll = document.createElement("button");
        bAll.className = "btn-mini";
        bAll.textContent = "Select all in this category";
        bAll.onclick = () => { keys.forEach(k => this.selectedTopics.add(k)); this.renderSetup(); };
        const bNone = document.createElement("button");
        bNone.className = "btn-mini";
        bNone.textContent = "Clear all";
        bNone.onclick = () => { keys.forEach(k => this.selectedTopics.delete(k)); this.renderSetup(); };
        mini.appendChild(bAll);
        mini.appendChild(bNone);
        box.appendChild(mini);

        units.forEach(({ unit, topics, count: unitCount }) => {
          const uKeys = topics.map(t => t.key);
          const uSel = uKeys.filter(k => this.selectedTopics.has(k)).length;
          const uAll = uSel === uKeys.length;
          const unitKey = "u:" + category + "\u0001" + unit;
          const uOpen = this._expanded.has(unitKey);

          const row = document.createElement("div");
          row.className = "unit-card" + (uOpen ? " open" : "") + (uAll ? " unit-all" : "");

          /* 單元列：☑ 全選／取消整個單元；撳名或箭咀展開題型 */
          const uHead = document.createElement("div");
          uHead.className = "unit-head";
          uHead.innerHTML = `
            <span class="course-check" role="checkbox" aria-checked="${uAll}">${uAll ? "☑" : uSel > 0 ? "◩" : "☐"}</span>
            <span class="unit-name">${escapeHTML(unit)}</span>
            <span class="course-count">${uSel}/${uKeys.length} · ${unitCount} questions</span>
            <span class="course-arrow">${uOpen ? "▾" : "▸"}</span>`;
          uHead.querySelector(".course-check").onclick = (e) => {
            e.stopPropagation();
            if (uAll) uKeys.forEach(k => this.selectedTopics.delete(k));
            else uKeys.forEach(k => this.selectedTopics.add(k));
            this.renderSetup();
          };
          uHead.onclick = () => {
            if (uOpen) this._expanded.delete(unitKey);
            else this._expanded.add(unitKey);
            this.renderSetup();
          };
          row.appendChild(uHead);

          /* 展開後：單元入面嘅個別題型 */
          if (uOpen) {
            const tbox = document.createElement("div");
            tbox.className = "unit-topics";
            topics.forEach(({ topic, count: n, key }) => {
              const on = this.selectedTopics.has(key);
              const b = document.createElement("button");
              b.className = "topic-chip" + (on ? " on" : "");
              b.innerHTML = `<span class="topic-name">${escapeHTML(topic)}</span><span class="topic-count">${n} questions</span>`;
              b.onclick = () => {
                if (on) this.selectedTopics.delete(key);
                else this.selectedTopics.add(key);
                this.renderSetup();
              };
              tbox.appendChild(b);
            });
            row.appendChild(tbox);
          }

          box.appendChild(row);
        });
        card.appendChild(box);
      }

      list.appendChild(card);
    });

    const selCount = this.selectedTopics.size;
    /* 計算已揀題型嘅總題數（SM-2 Session Pool 會自動分配 Due / New）*/
    const allQ = getAllQuestions();
    const totalCount = allQ.filter(q => this.selectedTopics.has(questionTopicKey(q))).length;
    const startBtn = document.getElementById("btn-setup-start");
    startBtn.disabled = selCount === 0 || totalCount === 0;
    startBtn.textContent = selCount === 0
      ? "Pick at least one topic"
      : totalCount === 0
        ? "No questions match — pick another topic"
        : "▶ Start";

    /* Question source counts */
    const st = loadState();
    const siteN = SITE_QUESTIONS.length;
    const customN = (st.customQuestions || []).length;
    const parts = [];
    if (siteN > 0) parts.push(`Site questions: ${siteN}`);
    if (customN > 0) parts.push(`Custom: ${customN}`);
    document.getElementById("custom-q-count").textContent = parts.join(" ・ ");
  },

  /* ---------- App 內新增句子題 ---------- */
  openAddSentence() {
    this.showModal(`
      <div class="import-box">
        <h3>✏️ Add sentence question</h3>
        <p class="settings-sub" style="text-align:left;margin:0">Put <code>___</code> where the blank should be.</p>
        <label class="import-label">Sentence</label>
        <textarea id="add-sent-sentence" class="import-paste" rows="3" placeholder="Excuse me, what ___ your name?"></textarea>
        <label class="import-label">Answer</label>
        <input id="add-sent-answer" class="import-file" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="your">
        <label class="import-label">Category (optional)</label>
        <input id="add-sent-category" class="import-file" type="text" value="Grammar" placeholder="Grammar">
        <label class="import-label">Unit (optional)</label>
        <input id="add-sent-unit" class="import-file" type="text" value="Custom" placeholder="Custom">
        <label class="import-label">Topic (optional)</label>
        <input id="add-sent-topic" class="import-file" type="text" value="Custom Sentences" placeholder="Custom Sentences">
        <label class="import-label">Level 1–9 (optional)</label>
        <input id="add-sent-level" class="import-file" type="number" min="1" max="9" value="1">
        <div class="confirm-row">
          <button id="btn-add-sent-save" class="btn-big btn-primary">Save</button>
          <button id="btn-add-sent-cancel" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`, true);
    document.getElementById("btn-add-sent-cancel").onclick = () => this.closeModal();
    document.getElementById("btn-add-sent-save").onclick = () => {
      const r = addCustomSentenceQuestion({
        sentence: document.getElementById("add-sent-sentence").value,
        answer: document.getElementById("add-sent-answer").value,
        category: document.getElementById("add-sent-category").value,
        unit: document.getElementById("add-sent-unit").value,
        topic: document.getElementById("add-sent-topic").value,
        level: document.getElementById("add-sent-level").value
      });
      if (!r.ok) { this.toast(r.error); return; }
      this.closeModal();
      this.selectedTopics = new Set(this._allTopicKeys());
      this.renderSetup();
      this.toast("Sentence question added");
    };
  },

  /* ---------- App 內新增圖片單字題 ---------- */
  openAddPicture() {
    this.showModal(`
      <div class="import-box">
        <h3>🖼️ Add picture question</h3>
        <label class="import-label">Picture (WebP / JPG / PNG)</label>
        <input type="file" id="add-pic-file" accept="image/webp,image/jpeg,image/png" class="import-file">
        <div id="add-pic-preview-wrap" class="add-pic-preview hidden">
          <img id="add-pic-preview" alt="Preview">
        </div>
        <label class="import-label">Answer (the word)</label>
        <input id="add-pic-word" class="import-file" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Chemistry">
        <label class="import-label">Category (optional)</label>
        <input id="add-pic-category" class="import-file" type="text" value="Vocab" placeholder="Vocab">
        <label class="import-label">Unit (optional)</label>
        <input id="add-pic-unit" class="import-file" type="text" value="Dictation" placeholder="Dictation">
        <label class="import-label">Topic (optional)</label>
        <input id="add-pic-topic" class="import-file" type="text" value="Custom Pictures" placeholder="Custom Pictures">
        <div class="confirm-row">
          <button id="btn-add-pic-save" class="btn-big btn-primary">Save</button>
          <button id="btn-add-pic-cancel" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`, true);
    const fileEl = document.getElementById("add-pic-file");
    const wrap = document.getElementById("add-pic-preview-wrap");
    const img = document.getElementById("add-pic-preview");
    let previewUrl = "";
    fileEl.onchange = () => {
      if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} previewUrl = ""; }
      const f = fileEl.files && fileEl.files[0];
      if (!f) { wrap.classList.add("hidden"); img.removeAttribute("src"); return; }
      previewUrl = URL.createObjectURL(f);
      img.src = previewUrl;
      wrap.classList.remove("hidden");
    };
    document.getElementById("btn-add-pic-cancel").onclick = () => {
      if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
      this.closeModal();
    };
    document.getElementById("btn-add-pic-save").onclick = async () => {
      const file = fileEl.files && fileEl.files[0];
      const r = await addCustomPictureQuestion({
        word: document.getElementById("add-pic-word").value,
        file,
        category: document.getElementById("add-pic-category").value,
        unit: document.getElementById("add-pic-unit").value,
        topic: document.getElementById("add-pic-topic").value
      });
      if (!r.ok) { this.toast(r.error); return; }
      if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
      this.closeModal();
      this.selectedTopics = new Set(this._allTopicKeys());
      this.renderSetup();
      this.toast("Picture question added");
    };
  },

  /* ---------- 瀏覽／編輯／刪除自訂題 ---------- */
  openMyQuestions() {
    const list = (loadState().customQuestions || []).slice();
    const esc = (s) => escapeHTML(String(s ?? ""));
    const rows = list.length === 0
      ? `<p class="my-q-empty">No custom questions yet.</p>`
      : `<div class="my-q-list">${list.map((q, i) => {
          const isWord = q.type === "word";
          const thumb = isWord && q.imageId && typeof QImgDB !== "undefined"
            ? (QImgDB.urlSync(q.imageId) || "")
            : "";
          const meta = `${q.category || (isWord ? "Vocab" : "Grammar")} / ${q.unit || q.course || "Custom"} / ${q.topic || ""}`;
          const main = isWord ? (q.word || q.answer || "") : (q.sentence || "");
          const ans = isWord ? "" : (q.answer || "(empty)");
          return `<div class="my-q-row">
            ${thumb ? `<img class="my-q-thumb" src="${esc(thumb)}" alt="">` : (isWord ? `<div class="my-q-thumb my-q-thumb-empty"></div>` : "")}
            <div class="my-q-body">
              <div class="my-q-meta">${esc(meta)}</div>
              <div class="my-q-main">${esc(main)}</div>
              ${ans !== "" ? `<div class="my-q-ans">→ ${esc(ans)}</div>` : ""}
            </div>
            <div class="my-q-actions">
              <button type="button" class="btn-small btn-secondary my-q-edit" data-i="${i}">Edit</button>
              <button type="button" class="btn-small btn-plain my-q-del" data-i="${i}">Delete</button>
            </div>
          </div>`;
        }).join("")}</div>`;

    this.showModal(`
      <div class="import-box my-q-box">
        <h3>📋 My questions (${list.length})</h3>
        ${rows}
        <div class="confirm-row">
          ${list.length ? `<button id="btn-myq-clear" class="btn-big btn-plain">🗑 Delete all</button>` : ""}
          <button id="btn-myq-close" class="btn-big btn-primary">Close</button>
        </div>
      </div>`, true);

    document.getElementById("btn-myq-close").onclick = () => this.closeModal();
    const clearBtn = document.getElementById("btn-myq-clear");
    if (clearBtn) {
      clearBtn.onclick = async () => {
        if (!confirm("Delete ALL custom questions? This cannot be undone.")) return;
        await clearCustomQuestionsAndImages();
        this.renderSetup();
        this.toast("Custom questions deleted (site questions are kept)");
        this.openMyQuestions();
      };
    }
    document.querySelectorAll("#modal-root .my-q-edit").forEach(btn => {
      btn.onclick = () => {
        const q = list[+btn.dataset.i];
        if (q) this.openEditCustomQuestion(q.id);
      };
    });
    document.querySelectorAll("#modal-root .my-q-del").forEach(btn => {
      btn.onclick = async () => {
        const q = list[+btn.dataset.i];
        if (!q) return;
        if (!confirm("Delete this question?")) return;
        const r = await deleteCustomQuestion(q.id);
        if (!r.ok) { this.toast(r.error || "Delete failed"); return; }
        this.renderSetup();
        this.toast("Question deleted");
        this.openMyQuestions();
      };
    });
  },

  openEditCustomQuestion(id) {
    const q = (loadState().customQuestions || []).find(x => x && x.id === id);
    if (!q) { this.toast("Question not found"); this.openMyQuestions(); return; }
    const escAttr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const isWord = q.type === "word";

    if (isWord) {
      const thumb = q.imageId && typeof QImgDB !== "undefined" ? (QImgDB.urlSync(q.imageId) || "") : "";
      this.showModal(`
        <div class="import-box">
          <h3>✏️ Edit picture question</h3>
          <div id="edit-pic-preview-wrap" class="add-pic-preview${thumb ? "" : " hidden"}">
            <img id="edit-pic-preview" alt="Preview"${thumb ? ` src="${escAttr(thumb)}"` : ""}>
          </div>
          <label class="import-label">Replace picture (optional)</label>
          <input type="file" id="edit-pic-file" accept="image/webp,image/jpeg,image/png" class="import-file">
          <label class="import-label">Answer (the word)</label>
          <input id="edit-pic-word" class="import-file" type="text" value="${escAttr(q.word || q.answer || "")}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <label class="import-label">Category</label>
          <input id="edit-pic-category" class="import-file" type="text" value="${escAttr(q.category || "Vocab")}">
          <label class="import-label">Unit</label>
          <input id="edit-pic-unit" class="import-file" type="text" value="${escAttr(q.unit || q.course || "Dictation")}">
          <label class="import-label">Topic</label>
          <input id="edit-pic-topic" class="import-file" type="text" value="${escAttr(q.topic || "Custom Pictures")}">
          <label class="import-label">Level 1–9</label>
          <input id="edit-pic-level" class="import-file" type="number" min="1" max="9" value="${escAttr(q.level || 1)}">
          <div class="confirm-row">
            <button id="btn-edit-save" class="btn-big btn-primary">Save</button>
            <button id="btn-edit-back" class="btn-big btn-plain">Back</button>
          </div>
        </div>`, true);
      const fileEl = document.getElementById("edit-pic-file");
      const wrap = document.getElementById("edit-pic-preview-wrap");
      const img = document.getElementById("edit-pic-preview");
      let previewUrl = "";
      fileEl.onchange = () => {
        if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} previewUrl = ""; }
        const f = fileEl.files && fileEl.files[0];
        if (!f) return;
        previewUrl = URL.createObjectURL(f);
        img.src = previewUrl;
        wrap.classList.remove("hidden");
      };
      document.getElementById("btn-edit-back").onclick = () => {
        if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
        this.openMyQuestions();
      };
      document.getElementById("btn-edit-save").onclick = async () => {
        const file = fileEl.files && fileEl.files[0];
        const r = await updateCustomQuestion(id, {
          word: document.getElementById("edit-pic-word").value,
          category: document.getElementById("edit-pic-category").value,
          unit: document.getElementById("edit-pic-unit").value,
          topic: document.getElementById("edit-pic-topic").value,
          level: document.getElementById("edit-pic-level").value,
          file: file || undefined
        });
        if (!r.ok) { this.toast(r.error); return; }
        if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
        this.selectedTopics = new Set(this._allTopicKeys());
        this.renderSetup();
        this.toast("Question updated");
        this.openMyQuestions();
      };
      return;
    }

    const expl = q.explain || {};
    const answerVal = [q.answer].concat(q.accept || [])
      .filter((a, i) => i === 0 || (a != null && String(a).length))
      .map(a => (a == null ? "" : String(a)))
      .join(" / ");
    this.showModal(`
      <div class="import-box">
        <h3>✏️ Edit sentence question</h3>
        <p class="settings-sub" style="text-align:left;margin:0">Put <code>___</code> where the blank should be.</p>
        <label class="import-label">Sentence</label>
        <textarea id="edit-sent-sentence" class="import-paste" rows="3"></textarea>
        <label class="import-label">Answer</label>
        <input id="edit-sent-answer" class="import-file" type="text" value="${escAttr(answerVal)}" autocomplete="off" autocapitalize="off" spellcheck="false">
        <label class="import-label">Category</label>
        <input id="edit-sent-category" class="import-file" type="text" value="${escAttr(q.category || "Grammar")}">
        <label class="import-label">Unit</label>
        <input id="edit-sent-unit" class="import-file" type="text" value="${escAttr(q.unit || q.course || "Custom")}">
        <label class="import-label">Topic</label>
        <input id="edit-sent-topic" class="import-file" type="text" value="${escAttr(q.topic || "Custom Sentences")}">
        <label class="import-label">Level 1–9</label>
        <input id="edit-sent-level" class="import-file" type="number" min="1" max="9" value="${escAttr(q.level || 1)}">
        <label class="import-label">Keywords (optional)</label>
        <input id="edit-sent-keyword" class="import-file" type="text" value="${escAttr(expl.keyword || "")}">
        <label class="import-label">Hint (optional)</label>
        <input id="edit-sent-hint" class="import-file" type="text" value="${escAttr(expl.hint || "")}">
        <div class="confirm-row">
          <button id="btn-edit-save" class="btn-big btn-primary">Save</button>
          <button id="btn-edit-back" class="btn-big btn-plain">Back</button>
        </div>
      </div>`, true);
    document.getElementById("edit-sent-sentence").value = q.sentence || "";
    document.getElementById("btn-edit-back").onclick = () => this.openMyQuestions();
    document.getElementById("btn-edit-save").onclick = async () => {
      const r = await updateCustomQuestion(id, {
        sentence: document.getElementById("edit-sent-sentence").value,
        answer: document.getElementById("edit-sent-answer").value,
        category: document.getElementById("edit-sent-category").value,
        unit: document.getElementById("edit-sent-unit").value,
        topic: document.getElementById("edit-sent-topic").value,
        level: document.getElementById("edit-sent-level").value,
        keyword: document.getElementById("edit-sent-keyword").value,
        hint: document.getElementById("edit-sent-hint").value
      });
      if (!r.ok) { this.toast(r.error); return; }
      this.selectedTopics = new Set(this._allTopicKeys());
      this.renderSetup();
      this.toast("Question updated");
      this.openMyQuestions();
    };
  },

  /* ---------- CSV 匯入（含指引） ---------- */
  openImport() {
    this.showModal(`
      <div class="import-box">
        <h3>📥 Import CSV Questions</h3>
        <details class="csv-guide">
          <summary>📖 CSV format guide (tap to open)</summary>
          <div class="csv-guide-body">
            <p><b>One question per line, 9 columns, comma separated:</b></p>
            <pre>No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint</pre>
            <ul>
              <li><b>No</b> (optional): five digits, e.g. <code>00001</code>; also matches <code>Q_folder/grammar/grammar_images/00001.png</code> as the question image</li>
              <li><b>Category</b>: the big group — <code>Phonetics</code>, <code>Grammar</code>, <code>Vocab</code>, <code>Phrases</code>, <code>Listening</code>, <code>Reading</code>, <code>Proof-reading</code>, <code>Rewriting</code>, <code>Talking with AI</code>, <code>Reading Aloud</code>, <code>Punctuation</code></li>
              <li><b>Unit</b>: the group inside the category (e.g. <code>Articles</code>, <code>Past Tense</code> under Grammar)</li>
              <li><b>Topic</b>: the small group inside the unit (e.g. <code>Articles: Basics</code>); same name = same topic</li>
              <li><b>Level</b>: number <code>1</code>, <code>2</code>, <code>3</code>, <code>4</code>… (shows that many ★ when answering)</li>
              <li><b>Sentence</b>: must contain <code>___</code> (three underscores) as the blank</li>
              <li><b>Answer</b>: the correct answer; several accepted answers can be separated with <code>|</code> or <code>/</code> (e.g. <code>were not / weren't</code>); <b>may be blank</b> (zero article)</li>
              <li><b>Keywords</b> (optional): words to highlight in the sentence, separated with <code>/</code> (one arrow from each word to the blank)</li>
              <li><b>Hint</b> (optional): short explanation shown after a wrong answer</li>
            </ul>
            <p><b>Example:</b></p>
            <pre>No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint
00001,Grammar,Articles,Articles: Basics,1,This is ___ apple. It is sweet and red.,an,apple,Vowel sound (apple)
00002,Grammar,Articles,Articles: Advanced,3,He went to ___ school by bus.,,school,Zero article: go to school</pre>
            <p class="csv-note">⚠ A header row (first cell "No" or "Category") is skipped automatically. Old 8-column files (No,Course,Topic,…) still work — they are treated as <code>Grammar</code>. Wrap any value containing commas in double quotes.<br>Question images live in <code>Q_folder/grammar/grammar_images/</code> named after the number (<code>00001.png</code>; jpg/jpeg/webp/gif also accepted). No image = nothing shown.</p>
          </div>
        </details>

        <label class="import-label">Option 1: choose a CSV file</label>
        <input type="file" id="csv-file" accept=".csv,text/csv,text/plain" class="import-file">

        <label class="import-label">Option 2: paste the content</label>
        <textarea id="csv-paste" class="import-paste" rows="5" placeholder="No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint&#10;00001,Grammar,Past Tense,Past Tense Verbs,1,Yesterday I ___(go) to the park.,went,Yesterday,go becomes went"></textarea>

        <div class="confirm-row">
          <button id="btn-do-import" class="btn-big btn-primary">Import</button>
          <button id="btn-clear-custom" class="btn-big btn-plain">🗑 Delete all imported questions</button>
          <button id="btn-import-cancel" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`, true);

    document.getElementById("btn-do-import").onclick = () => this._doImport();
    document.getElementById("btn-import-cancel").onclick = () => this.closeModal();
    document.getElementById("btn-clear-custom").onclick = async () => {
      await clearCustomQuestionsAndImages();
      this.closeModal();
      this.renderSetup();
      this.toast("Custom questions deleted (site questions are kept)");
    };
  },

  _doImport() {
    const file = document.getElementById("csv-file").files[0];
    const pasted = document.getElementById("csv-paste").value;

    if (file) {
      const reader = new FileReader();
      reader.onload = () => this._importText(reader.result);
      reader.onerror = () => this.toast("Could not read the file — please try again");
      reader.readAsText(file, "UTF-8");
    } else if (pasted.trim()) {
      this._importText(pasted);
    } else {
      this.toast("Choose a file or paste CSV content");
    }
  },

  _importText(text) {
    const { questions, skipped } = questionsFromCSV(text);
    if (questions.length === 0) {
      this.toast(skipped > 0 ? `No valid questions (${skipped} bad rows)` : "No valid questions");
      return;
    }
    const st = loadState();
    /* 防重複：對照全部題目（內建＋網站＋已匯入），同題型＋同句子＋同答案就跳過 */
    const seen = new Set(getAllQuestions().map(questionKey));
    let added = 0;
    questions.forEach(q => {
      const key = `${q.topic}\u0001${q.sentence}\u0001${q.answer}`;
      if (seen.has(key)) return;
      seen.add(key);
      (st.customQuestions = st.customQuestions || []).push(q);
      added++;
    });
    saveState();
    this.closeModal();
    this.selectedTopics = new Set(this._allTopicKeys());   // 新題型自動選上
    this.renderSetup();
    if (added === 0) {
      this.toast("Those questions were already imported — nothing added");
    } else {
      const dup = questions.length - added;
      this.toast(`Imported ${added} questions${dup > 0 ? ` (${dup} duplicates skipped)` : ""}${skipped > 0 ? `, ${skipped} bad rows skipped` : ""}!`);
    }
  },

  /* ---------- 家長自訂題教學（由 Settings → How to create your own questions 開啟） ---------- */
  openParentGuide() {
    this.showModal(`
      <div class="guide-box">
        <h3>📖 How to Create Your Own Questions</h3>
        <p class="guide-lead">You can add your own English questions for your child — no coding needed.</p>

        <div class="guide-section">
          <h4>In the app (quickest for one question)</h4>
          <ol>
            <li><b>Settings → ✏️ Add sentence question</b> — type a sentence with <code>___</code> and the answer.</li>
            <li><b>Settings → 🖼️ Add picture question</b> — upload a WebP/JPG/PNG and type the word.</li>
            <li>Custom questions stay in this browser. Edit or delete them via <b>Settings → 📋 View my questions</b> (or delete all there / in Import CSV).</li>
          </ol>
        </div>

        <div class="guide-section">
          <h4>Method A — Ask AI to generate questions (easiest for many)</h4>
          <ol>
            <li>Copy the full prompt from <a href="Q_folder/AI%E5%87%BA%E9%A1%8C%E6%8C%87%E5%BC%95.md" target="_blank" rel="noopener">📄 AI出題指引.md</a> (opens in a new tab).</li>
            <li>Paste it to ChatGPT / Claude / Gemini, and add what you want, e.g.<br><i>"Generate 30 P.3 questions on Past Tense, category Grammar, 2 units, 2–3 topics each, level 1–4."</i></li>
            <li>The AI will return CSV text. Copy it.</li>
            <li>Back here → <b>Settings → 📥 Import CSV Questions → Option 2: paste the content</b> → Import.</li>
          </ol>
        </div>

        <div class="guide-section">
          <h4>Method 2 — Write or edit the CSV yourself</h4>
          <p>One question per line, 9 columns, comma separated:</p>
          <pre class="guide-pre">No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint</pre>
          <ul>
            <li><b>No</b> (optional): five digits, e.g. <code>00001</code> — also used as the question image filename</li>
            <li><b>Category</b>: the big group, e.g. <code>Grammar</code>, <code>Vocab</code>, <code>Reading</code></li>
            <li><b>Unit</b>: the group inside the category, e.g. <code>Articles</code></li>
            <li><b>Topic</b>: the small group inside the unit, e.g. <code>Articles: Basics</code></li>
            <li><b>Level</b>: <code>1</code>–<code>5</code> (1 = easiest; shows that many ★)</li>
            <li><b>Sentence</b>: must contain <code>___</code> (three underscores) as the blank</li>
            <li><b>Answer</b>: the correct answer; separate multiple accepted answers with <code>/</code> (e.g. <code>were not / weren't</code>); <b>leave completely empty for zero-article questions</b></li>
            <li><b>Keywords</b> (optional): words to highlight in the sentence, separated with <code>/</code>; each must appear verbatim in the sentence</li>
            <li><b>Hint</b> (optional): short English explanation shown after a wrong answer</li>
          </ul>
          <p class="guide-tip">⚠ Category, Unit, Topic and Hint must be in <b>English</b>. Wrap any value containing a comma in double quotes.</p>
        </div>

        <div class="guide-section">
          <h4>Example (copy-paste ready)</h4>
          <pre class="guide-pre">No,Category,Unit,Topic,Level,Sentence,Answer,Keywords,Hint
00001,Grammar,Articles,Articles: Basics,1,This is ___ apple. It is sweet and red.,an,apple,Vowel sound (apple)
00002,Grammar,Articles,Articles: Advanced,3,He went to ___ school by bus.,,school,Zero article: go to school
00003,Grammar,Past Tense,Past Tense Verbs,2,Yesterday I ___(go) to the park.,went,Yesterday,Past tense of go is went.</pre>
        </div>

        <div class="guide-section">
          <h4>Question images (optional)</h4>
          <p>If you want a picture for a question, put the image in <code>Q_folder/grammar/grammar_images/</code> and name it after the question number, e.g. <code>00001.png</code> (<code>.jpg</code> / <code>.jpeg</code> / <code>.webp</code> / <code>.gif</code> also work). No image = the question just shows text.</p>
        </div>

        <div class="guide-section">
          <h4>Where do imported questions live?</h4>
          <p>Custom questions (CSV import + in-app add) are saved in this browser (<code>customQuestions</code>; picture blobs in IndexedDB) and merged with the built-in bank. They are kept after sign-out, and show under their Course/Topic in the picker. Open <b>Settings → 📋 View my questions</b> to edit or delete individual items, or delete all there / via <b>🗑 Delete all imported questions</b> in the Import window.</p>
        </div>

        <button id="guide-close" class="btn-big btn-primary">Got it!</button>
      </div>`, true);
    document.getElementById("guide-close").onclick = () => this.closeModal();
  },

  /* ---------- 完成一組 → 捕捉場景 → 結算 ---------- */
  async onQuizFinished(data) {
    this.lastCapture = null;
    /* 唔可以 fade 走 quiz：quiz 係 display-window overlay，淡出期間會露出後面主頁 */
    await this._captureThenSettle(data);
  },

  /* 捕捉場景（WARNING）→ 結算 */
  async _captureThenSettle(data) {
    const scene = window.CaptureScene;
    if (scene && scene.isSupported()) {
      let chainKey = null;
      try {
        const rarity = Gacha.rollRarity("normal");
        chainKey = Gacha.pickChain(rarity);
      } catch (e) { chainKey = null; }

      if (chainKey) {
        const chain = EVOLUTION_CHAINS.find(c => c.key === chainKey);
        const [dexId, name] = chain.stages[0];
        this.showView("view-capture");
        scene.primeAudio();
        let capResult = null;
        try {
          capResult = await scene.play({
            dexId,
            name,
            onCaught: () => {
              const res = obtainPokemon(chainKey, "normal");
              const cur = entryCurrentSpecies(res.entry);
              /* obtain_capture 要求 dex_id === chain_rarity.stage1_dex；
                 dupe 已進化 entry 時 cur[0] 係最終形態 → 必須傳 scene 嘅 stage1 dexId */
              const stage1Dex = dexId;
              this.lastCapture = { dexId: cur[0], name: cur[1], isDupe: res.isDupe, caught: true };
              /* 世代解鎖：儲起喺結算後彈慶祝窗 + 背景下載新代資料包 */
              if (res.newlyUnlockedGen) this._pendingGenUnlock = res.newlyUnlockedGen;
              /* 防金手指：server 記錄捕捉 + server 權威派寵（fire-and-forget，唔阻動畫）
                 obtain_capture 回傳後用 server 行覆蓋本地 entry（IV/dupes/candies 以 server 為準） */
              if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
                SupabaseAuth.settleCapture(stage1Dex);
                SupabaseAuth.obtainCapture(chainKey, stage1Dex).then(r => {
                  if (r && r.entry) {
                    const before = loadState().unlockedGen || 1;
                    adoptServerEntry(r.entry);
                    const after = loadState().unlockedGen || 1;
                    if (after > before) this._pendingGenUnlock = after;
                  }
                });
              }
              this.renderHome();
              return { isDupe: res.isDupe, dexId: cur[0], name: cur[1] };
            }
          });
        } catch (e) {
          console.warn("[capture] scene failed — skipping to settlement:", e);
        }
        /* Escape path: scene resolved with caught:false, onCaught never fired */
        if (capResult && capResult.caught === false) {
          this.lastCapture = { caught: false, dexId, name };
        }
      }
    }

    this.onSetComplete(data);
  },

  /* ---------- 完成一組 → 結算 ---------- */
  async onSetComplete(data) {
    const st = loadState();

    /* 獎勵計算：經驗值按 PokéAPI 該等級所需經驗比例發放
       v3 單一維度：只計「無提示清題數」→ 換算到 /10 刻度 → span 百分比；
       Lv.1–10 新手期保底 50% span（分級高過 50% 照攞高嗰個） */
    const entry = getActiveEntry();
    const perfect = data.score === data.total;
    let expGain = GAME_CONFIG.EXP_BASE;
    if (entry) {
      ensureEntryPokemonData(entry);
      const dexId = entryCurrentSpecies(entry)[0];
      const level = entry.level || 1;
      const span = levelSpan(dexId, level);
      const totalQ = Math.max(1, data.total || 1);
      const s = Math.round((data.score / totalQ) * 10);
      let pct;
      if (s >= 10)      pct = 1.00;
      else if (s === 9)  pct = 0.90;
      else if (s === 8)  pct = 0.80;
      else if (s >= 5)   pct = 0.50;
      else if (s >= 1)   pct = 0.30;
      else               pct = 0.10;
      if (level <= 10) pct = Math.max(0.50, pct);
      expGain = Math.max(10, Math.round(span * pct));
    }
    const rewards = { ticket: 0, diamonds: 0, exp: expGain };
    /* 電子寵物：拍檔 Faint → 本回合 EXP 0（提示留喺結算畫面） */
    if (entry && window.Pet && Pet.isFaint(entry)) {
      rewards.exp = 0;
      rewards.fainted = true;
    }
    /* 電子寵物掉落：10/10 → 復活藥 1 + 高級食物 1（另有 10% 額外復活藥）；
       1–9 題 → 普通食物 1（另有 10% 復活藥） */
    rewards.drops = window.Pet ? Pet.rollDrops(data.score === data.total) : [];
    /* 背包第 3b 段：答題掉樹果（全對 → Super、1–9 題 → Normal；登入由 server 抽） */
    if (window.Care && Care.awardBerry) {
      try {
        const berry = await Care.awardBerry(data.score === data.total);
        if (berry && Care.BERRIES[berry]) rewards.drops.unshift({ kind: berry, label: `🫐 ${Care.BERRIES[berry].name} +1` });
      } catch (e) {}
    }
    /* 背包第 4c 段：全對 → 3% 掉 Mega 石（只會係你擁有物種嘅石；登入由 server 抽） */
    if (window.Care && Care.awardMega && data.score === data.total) {
      try {
        const mega = await Care.awardMega(true);
        if (mega && typeof MEGA_STONES !== "undefined" && MEGA_STONES[mega]) rewards.drops.unshift({ kind: mega, label: `🔮 ${MEGA_STONES[mega].stoneName} +1` });
      } catch (e) {}
    }
    /* 狀態系統：答題掉藥（全對穩掉 1 隻、1–9 題 10%；登入由 server 抽） */
    if (window.Care) {
      try {
        const med = await Care.awardMeds(data.score === data.total);
        if (med && Care.MED_INFO[med]) rewards.drops.push({ kind: med, label: `💊 ${Care.MED_INFO[med].name} +1` });
      } catch (e) {}
    }
    /* 掉落即時備份上雲（換機／清 cache 都唔會失去道具） */
    if (window.Pet && window.Sync && Sync.isEnabled && Sync.isEnabled() && Sync.pushItems) {
      Sync.pushItems(Pet.items());
    }
    /* Diamonds：防金手指走 RPC（登入時由 server 計算 + 權威 balance）
       RPC 失敗（null）→ fallback 本地計算，離線都唔會變 0 粒 */
    let serverRes = null;
    if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
      serverRes = await SupabaseAuth.awardRoundDiamonds(data.score, data.total);
    }
    /* v139：本地 fallback 跟 award_round_diamonds 相對門檻（score==total→3, >=total-2→2, >=total-3→1）
       舊絕對門檻（>=8/>=7）令短 set 例如 4/5 變 0💎 */
    const localDiamondBonus = (() => {
      const sc = data.score, tot = data.total;
      if (sc === tot) return GAME_CONFIG.PERFECT_DIAMOND;
      if (sc >= tot - 2) return GAME_CONFIG.GREAT_DIAMOND;
      if (sc >= tot - 3) return GAME_CONFIG.GOOD_DIAMOND;
      return 0;
    })();
    if (serverRes && typeof serverRes.bonus === "number") {
      rewards.diamonds = serverRes.bonus;
      st.diamonds = serverRes.balance;   // server 權威，唔係本地 +=
    } else if (!(window.SupabaseAuth && SupabaseAuth.isLoggedIn())) {
      /* 匿名／離線：本地計鑽 */
      rewards.diamonds = localDiamondBonus;
      st.diamonds += rewards.diamonds;
    } else {
      /* v140：已登入但 RPC 失敗 → 唔本地加鑽（避免同雲端脫節後 pull 打回） */
      rewards.diamonds = 0;
      this.toast("Cloud sync hiccup — diamond reward will retry next round");
    }

    addPracticeRecord(data);
    this.lastRecord = data;

    /* 經驗值入帳：有拍檔 → 直接加；冇 → 儲起等第一抽 */
    let levelRes = null;
    if (entry) {
      levelRes = addEntryExp(entry, rewards.exp);
      /* 登入時 EXP 走 RPC（server 權威累加）；失敗唔緊要，下次 pull 以 server 為準。
         伊貝進化分支一經決定要 PATCH 上雲（branch 係重推進化嘅必要輸入） */
      if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
        SupabaseAuth.addEntryExp(entry.uid, rewards.exp);
        if (levelRes && levelRes.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
          Sync.patchEntry(entry.uid, { branch: entry.branch });
        }
      }
    } else {
      st.pendingExp = (st.pendingExp || 0) + rewards.exp;
    }
    saveState();

    /* v99：diamonds/EXP/entries 已各自經 RPC 上雲；SM-2 cards/history 由 queueUpsert/
       queueHistory 批量 flush —— 唔再需要 pushState 全量推（會重複 insert history） */

    rewards.evolving = !!(levelRes && levelRes.evolvedTo);
    this._renderSettlement(data, rewards);
    this.showView("view-settlement");
    if (levelRes) {
      if (levelRes.levelsGained > 0) {
        const whose = entryCurrentSpecies(entry)[1];
        this.toast(`${whose} reached Lv.${entry.level}!`);
      }
      if (levelRes.evolvedTo) {
        /* 進化場景播完先處理學招／世代解鎖 */
        setTimeout(() => this.showEvolveModal(levelRes.evolvedTo, () => {
          if (levelRes.learned.length) setTimeout(() => this.queueMoveLearn(entry, levelRes.learned), 400);
          setTimeout(() => this.maybeShowGenUnlock(), 400);
        }), 600);
      } else {
        if (levelRes.learned.length) {
          setTimeout(() => this.queueMoveLearn(entry, levelRes.learned), 600);
        }
        setTimeout(() => this.maybeShowGenUnlock(), 900);
      }
    } else {
      setTimeout(() => this.maybeShowGenUnlock(), 900);
    }

    /* Gym：結算畫面之後返主頁先判 badge（Hint／錯題已計入 results） */
    if (Quiz.mode === "gym" || data.mode === "gym") {
      this._gymSettleData = data;
      if (typeof Gym !== "undefined" && data.gymMilestone) Gym._activeMilestone = data.gymMilestone;
    } else {
      this._gymSettleData = null;
    }
  },

  _renderSettlement(data, rewards) {
    const perfect = data.score === data.total;
    const great = data.score >= data.total - 2;
    document.getElementById("settle-title").textContent =
      perfect ? "Perfect lesson! 🎉" : great ? "Great work!" : "Set complete!";
    const toPolish = data.total - data.score;
    document.getElementById("settle-sub").textContent = perfect
      ? "No mistakes, no hints. Legendary trainer!"
      : `${toPolish} to polish — they'll come back for review.`;

    /* 分數圈：clean 題數 / 總數，動畫填色 */
    const R = 66, C = 2 * Math.PI * R;
    document.getElementById("settle-score").innerHTML = `
      <div class="settle-ring ${perfect ? "perfect" : ""}" role="img" aria-label="${data.score} of ${data.total} correct without hints">
        <svg viewBox="0 0 160 160" aria-hidden="true"><circle class="bg" cx="80" cy="80" r="${R}"/>
          <circle class="fg" id="settle-ring-fg" cx="80" cy="80" r="${R}" style="stroke-dasharray:${C};stroke-dashoffset:${C}"/></svg>
        <div class="num"><div><b id="settle-ring-n">0</b><small>/ ${data.total} clean</small></div></div>
      </div>`;
    const fg = document.getElementById("settle-ring-fg");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (fg) fg.style.strokeDashoffset = String(C * (1 - (data.total ? data.score / data.total : 0)));
    }));
    this._countUp(document.getElementById("settle-ring-n"), data.score, 900);

    /* 三格 stat：準確度（答啱提交 ÷ 全部提交）／用時／最高 combo */
    const mm = Math.floor(data.duration / 60), ss = data.duration % 60;
    const submits = data.total + (Number(data.wrongTries) || 0);
    const acc = submits ? Math.round((data.total / submits) * 100) : 100;
    document.getElementById("settle-stats").innerHTML = `
      <div class="settle-stat s-acc"><h4>Accuracy</h4><p id="settle-acc">0%</p></div>
      <div class="settle-stat s-time"><h4>Time</h4><p>${mm}:${String(ss).padStart(2, "0")}</p></div>
      <div class="settle-stat s-combo"><h4>Best combo</h4><p>🔥 ${Number(data.bestCombo) || 0}</p></div>`;
    const statEls = document.querySelectorAll("#settle-stats .settle-stat");
    statEls.forEach((el, i) => setTimeout(() => {
      el.classList.add("in");
      if (i === 0) this._countUp(document.getElementById("settle-acc"), acc, 600, "%");
    }, 500 + i * 140));

    const cap = this.lastCapture;
    let capHTML = "";
    if (cap) {
      if (cap.caught === false) {
        capHTML = `
      <div class="settle-capture is-escape">
        <img src="${animatedURL(cap.dexId)}" alt="${cap.name}"
             onerror="this.onerror=null;this.src='${artworkURL(cap.dexId)}'">
        <div>
          <b>${cap.name}</b>
          <span>It broke free! Better luck next time.</span>
        </div>
      </div>`;
      } else {
        capHTML = `
      <div class="settle-capture">
        <img src="${animatedURL(cap.dexId)}" alt="${cap.name}"
             onerror="this.onerror=null;this.src='${artworkURL(cap.dexId)}'">
        <div>
          <b>${cap.name}</b>
          <span>${cap.isDupe ? "Duplicate capture — EV +1" : "New capture — added to your Pokédex"}</span>
        </div>
      </div>`;
      }
    }

    const dropRows = (rewards.drops || [])
      .map(d => `<div class="settle-rw drop"><span class="ic">🎁</span><span class="lb">${d.label}</span></div>`).join("");

    /* 獎勵逐行彈入 + 數字 count-up（數值本身唔變，只係動畫） */
    document.getElementById("settle-rewards").innerHTML = capHTML + `
      ${rewards.diamonds > 0 ? `<div class="settle-rw"><span class="ic">💎</span><span class="lb">Diamonds</span><span class="val">+<span data-count="${rewards.diamonds}">0</span></span></div>` : ""}
      <div class="settle-rw"><span class="ic">⭐</span><span class="lb">Partner EXP</span><span class="val">+<span data-count="${rewards.exp}">0</span></span></div>
      ${rewards.fainted ? `<div class="settle-rw warn"><span class="ic">💤</span><span class="lb">Your partner has fainted — no EXP this round. Feed it a Revival in Partner Care.</span></div>` : ""}
      ${dropRows}`;
    document.querySelectorAll("#settle-rewards .settle-rw").forEach((el, i) => setTimeout(() => {
      el.classList.add("in");
      const n = el.querySelector("[data-count]");
      if (n) this._countUp(n, Number(n.dataset.count) || 0, 500);
    }, 950 + i * 160));

    /* 錯題預覽（最多 3 條）→「See all」入現有錯題回顧 */
    const mist = document.getElementById("settle-mist");
    const misses = (data.results || []).filter(r => !r.correct)
      .map(r => ({ r, q: (typeof findQuestion === "function") ? findQuestion(r.qid) : null })).filter(x => x.q);
    const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\u0022": "&quot;" };
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>\u0022]/g, ch => ESC[ch]);
    if (misses.length) {
      mist.innerHTML = `<h3>To review <button type="button" id="settle-see-all">See all ›</button></h3><ul>${misses.slice(0, 3).map(({ r, q }) => {
        const ans = q.type === "word" ? q.word : q.answer;
        const line = (q.type === "word" || !q.sentence)
          ? `🔊 <b>${esc(ans)}</b>`
          : esc(q.sentence).replace(/_{3,}/, `<b>${esc(ans)}</b>`);
        return `<li>${line}<small>${r.hint ? "💡 Hint used" : "✕ Needed another try"}${q.topic ? " · " + esc(q.topic) : ""}</small></li>`;
      }).join("")}</ul>`;
      document.getElementById("settle-see-all").onclick = () => document.getElementById("btn-review").click();
    } else {
      mist.innerHTML = "";
    }

    if (data.score >= data.total - 2) this._settleConfetti();

    /* Capture jingle on settlement: success → "Obtained a Pokémon!", escape → "Obtained a Berry!".
       Both live in assets/bgm, so they follow the Music slider (not SFX). */
    if (cap && window.CaptureScene && CaptureScene.audio) {
      const jingleUrl = cap.caught ? "assets/bgm/obtained-pokemon.mp3" : "assets/bgm/obtained-berry.mp3";
      CaptureScene.audio.playMusicOnce(jingleUrl, 0.4);
    }
    /* 捕捉完結：jingle 播完後恢復全域 BGM（有進化場景就交返俾場景完結時恢復） */
    if (!rewards.evolving && window.CaptureScene && CaptureScene.audio) {
      setTimeout(() => CaptureScene.audio.startTownBGM(), 3200);
    }

    const st = loadState();
    const rareBtn = document.getElementById("btn-pull-rare");
    /* 永遠顯示：唔夠鑽石就 disabled + 顯示差額（目標可見，唔會版面跳動）
       圖案用 status bar 同款寶石（#gem-blue gradient 喺 topbar SVG defs，成個 document 引用到） */
    const gemSvg = `<svg class="gem-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="#062036" stroke-width="1.6"/><circle cx="12" cy="12" r="10" fill="url(#gem-blue)"/><ellipse cx="8" cy="7.5" rx="4" ry="2.5" fill="#ffffff" opacity="0.55"/><ellipse cx="15" cy="5.5" rx="1.8" ry="1" fill="#ffffff" opacity="0.45"/><ellipse cx="12" cy="18" rx="6" ry="1.5" fill="#000000" opacity="0.2"/></svg>`;
    const enough = st.diamonds >= GAME_CONFIG.RARE_PULL_COST;
    rareBtn.disabled = !enough;
    rareBtn.innerHTML = enough
      ? `${gemSvg} Lucky Draw ×${GAME_CONFIG.RARE_PULL_COST}`
      : `${gemSvg} Lucky Draw <small class="settle-btn-gap">need ${GAME_CONFIG.RARE_PULL_COST - st.diamonds} more</small>`;
  },

  /* 數字由 0 數上去（ease-out） */
  _countUp(el, to, ms, suffix) {
    if (!el) return;
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !to) { el.textContent = to + (suffix || ""); return; }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + (suffix || "");
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  _settleConfetti() {
    const box = document.getElementById("settle-confetti");
    if (!box) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    box.innerHTML = "";
    const cols = ["#ffcb05", "#3b5ca8", "#ee4035", "#1fa34a", "#ff7a1a", "#ab47bc"];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement("i");
      p.style.left = (Math.random() * 100) + "%";
      p.style.background = cols[i % cols.length];
      p.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
      p.style.setProperty("--rot", (Math.random() * 900 - 450) + "deg");
      p.style.animationDuration = (1.8 + Math.random() * 1.6) + "s";
      p.style.animationDelay = (Math.random() * .5) + "s";
      box.appendChild(p);
    }
    clearTimeout(this._confettiTimer);
    this._confettiTimer = setTimeout(() => { box.innerHTML = ""; }, 4200);
  },

  /* ---------- 錯題回顧 ---------- */
  showReview() {
    const list = document.getElementById("review-list");
    list.innerHTML = "";
    const results = this.lastRecord ? this.lastRecord.results : [];
    const wrongs = results.filter(r => !r.correct);

    if (results.length > 0 && wrongs.length === 0) {
      list.innerHTML = `<div class="review-none">All correct this time — no mistakes! 🌟</div>`;
    } else {
      wrongs.forEach(w => {
        const q = findQuestion(w.qid);
        if (q) Explain.render(list, q, w.chosen);
      });
    }
    this.showView("view-review");
  },

  /* ---------- 升級學招式（最多 4 招） ---------- */
  queueMoveLearn(entry, moves) {
    this._moveEntry = entry;
    this._moveQueue = (moves || []).filter(m => !(entry.moves || []).includes(m.move));
    this._showNextMoveLearn();
  },

  _showNextMoveLearn() {
    const q = (this._moveQueue || []).shift();
    if (!q) {
      this._moveQueue = [];
      this._moveEntry = null;
      this.closeModal();
      this.renderHome();
      return;
    }
    const entry = this._moveEntry;
    if (!entry || !POKEMON_DEX) { this._moveQueue = []; return; }
    const cur = entryCurrentSpecies(entry);
    const label = moveLabel(q.move);
    const known = entry.moves || [];
    if (known.includes(q.move)) { this._showNextMoveLearn(); return; }

    const full = known.length >= 4;
    const options = full
      ? known.map((m, i) => `<button class="btn-big btn-plain move-choice" data-i="${i}">Replace ${moveLabel(m)}</button>`).join("")
      : `<button id="move-learn-yes" class="btn-big btn-primary">Learn ${label}</button>`;

    this.showModal(`
      <div class="move-box">
        <div class="move-title">✨ New move!</div>
        ${moveCardHTML(q.move)}
        <div class="move-sub">${cur[1]} Lv.${q.level}${full ? " ・ 4 moves already — pick one to replace" : ""}</div>
        <div class="move-list">${options}</div>
        <button id="move-learn-no" class="btn-big btn-plain">Not this time</button>
      </div>`, true);

    const next = () => { this.closeModal(); this._showNextMoveLearn(); };
    document.getElementById("move-learn-no").onclick = next;
    const yes = document.getElementById("move-learn-yes");
    if (yes) yes.onclick = () => {
      entry.moves.push(q.move);
      saveState();
      next();
    };
    document.querySelectorAll("#modal-root .move-choice").forEach(btn => {
      btn.onclick = () => {
        entry.moves[Number(btn.dataset.i)] = q.move;
        saveState();
        next();
      };
    });
  },

  /* ---------- 世代解鎖慶祝 + 資料包下載 ----------
     onCaught / gacha 結算發現 newlyUnlockedGen 時 stash 落 _pendingGenUnlock，
     結算頁出現後由 maybeShowGenUnlock() 彈窗（避免同進化/結算彈窗撞車）。 */
  maybeShowGenUnlock() {
    const gen = this._pendingGenUnlock;
    if (!gen) return;
    this._pendingGenUnlock = null;
    this.showGenUnlock(gen);
  },

  showGenUnlock(gen) {
    if (typeof GENS === "undefined") return;
    const g = GENS.find(x => x.gen === gen);
    if (!g) return;
    /* 即刻載入新世代圖鑑資料（之後捕捉/抽獎要用 learnset） */
    ensureGenDataLoaded(gen);
    const roman = ["I","II","III","IV","V"][gen - 1] || String(gen);
    /* 即場開下資料包（背景）；modal 顯示進度 */
    this.showModal(`
      <div class="gen-unlock-card">
        <img src="assets/gen-icons/${gen}.png" alt="${g.name}"
             onerror="this.onerror=null;this.src='${artworkURL(g.iconDex)}'">
        <h2>🎉 Gen ${roman} Unlocked!</h2>
        <div class="gu-region">${g.name} Region</div>
        <div class="gu-desc">New Pokémon now appear in tall grass and Rare Pulls!<br>
          Downloading the ${g.name} pack for offline play…</div>
        <div class="gen-unlock-bar"><i id="gu-bar"></i></div>
        <div class="gu-progress-text" id="gu-text">Preparing…</div>
        <button id="gu-ok" class="btn-big btn-primary">Let's go!</button>
      </div>`, true);
    document.getElementById("gu-ok").onclick = () => {
      this.closeModal();
      /* 用戶撳完 OK 都未下完 → 背景繼續（GenPack 內部有續傳） */
    };
    GenPack.download(gen, ({ done, total, failed }) => {
      const bar = document.getElementById("gu-bar");
      const txt = document.getElementById("gu-text");
      if (!bar || !txt) return;   // 用戶已關彈窗，背景下載繼續
      const pct = total ? Math.round(done / total * 100) : 0;
      bar.style.width = pct + "%";
      txt.textContent = failed > 0
        ? `${done}/${total} files (${failed} failed — will retry next launch)`
        : `${done}/${total} files`;
    }).then(ok => {
      const txt = document.getElementById("gu-text");
      if (txt) txt.textContent = ok ? "Pack ready — playable offline! ✅" : "Pack partly downloaded — will resume next launch.";
    });
  },

  /* ---------- 進化 Scene（EvolveScene 播完整段動畫） ---------- */
  showEvolveModal(species, onDone, fromDex) {
    if (!species) return;
    let from = fromDex;
    if (!from) {
      const chain = EVOLUTION_CHAINS.find(c => c.key === species.chainKey);
      if (chain) {
        const idx = species.branch ? chain.stages.length - 1 : (species.stageIndex || 0) - 1;
        const prev = chain.stages[idx];
        if (prev) from = prev[0];
      }
    }
    if (!from) from = species.dexId;
    const done = () => {
      this.renderHome();
      if (onDone) onDone();
    };
    if (typeof EvolveScene === "undefined") { done(); return; }
    EvolveScene.open({ fromDex: from, toDex: species.dexId, onDone: done });
  },

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

  /* ---------- Login Hub（Poké Ball 風格） ---------- */
  _markLoggedIn() {
    const v = document.getElementById("login-state");
    if (!v) return;
    const user = window.SupabaseAuth?.currentUser();
    const email = user?.email || "";
    v.textContent = email ? "Connected" : "Connected";
    v.title = email || "Connected — tap to manage";
    /* 登入後先開始好友背景輪詢（帶來新邀請／請求數） */
    if (window.Friends && Friends.startPolling) Friends.startPolling();
  },

  /* 還原登入狀態文字（sign out 後用） */
  _markLoggedOut() {
    const v = document.getElementById("login-state");
    if (!v) return;
    v.textContent = "Sign in";
    v.title = "";
  },

  /* OAuth redirect 返嚟之後嘅雲端合併。一定要等首屏 render 完、loading 淡出後才跑：
     舊版喺 init() 內 await 呢段，一旦彈出「Overwrite local progress?」確認窗，
     modal（z-index 50）會被 loading overlay（99999）完全遮住 → 撳唔到掣
     → promise 永遠 pending → init() 唔 resolve → 卡死喺 loading 頁。
     改為非阻塞：首屏照出，確認窗浮喺正常畫面上面，用戶一定撳得到。 */
  async _postLogin(st) {
    try {
      await SupabaseAuth.ensureFreshSession();
      if (!st._googleMigrated) {
        const deviceId = ensureDeviceId();
        const isNewAccount = await SupabaseAuth.migrateAnonymous(deviceId);
        console.log("[OAuth] migrate result — isNewAccount:", isNewAccount);
        if (isNewAccount === true) {
          /* 新帳戶：本地進度經 import_state 一次性上傳（v106 server 收緊：
             diamonds 唔過界——固定派 20 粒 welcome bonus；entries ≤151、
             exp ≤1.25M、candies ≤99、dupes ≤100；每帳戶一生一次
             imported_at 鎖 + user_imports audit log），之後 pull 正規化
             （server 行先係權威） */
          const payload = {
            diamonds: st.diamonds || 0,
            total_sets: st.totalSets || 0,
            total_correct: st.totalCorrect || 0,
            total_questions: st.totalQuestions || 0,
            trainer_name: st.playerName || "The PokéEngmon Trainer",
            entries: (st.entries || []).map(e => ({
              id: e.uid,
              chain_key: e.chainKey,
              exp: Number(e.exp ?? 0),
              ivs: e.ivs || {},
              evs: e.evs || {},
              ev_points: e.evPoints ?? 0,
              candies: e.candies ?? 0,
              dupes: e.dupes ?? 0,
              branch: (e.branch === 0 || e.branch) ? e.branch : null,
              active: e.uid === st.activeUid,
              obtained_at: e.obtainedAt || Date.now()
            }))
          };
          const imported = await SupabaseAuth.importState(payload);
          console.log("[OAuth] importState result:", imported);
          /* SM-2 cards/history 維持直推（非敏感學習數據） */
          await Sync.pushState();
          await Sync.pull();
          console.log("[OAuth] ✅ Local progress imported to new Google account");
          st._googleMigrated = true;
          st._needsCurveSetup = true;  /* 新帳戶 → 彈 curve setup */
          saveState();
        } else if (isNewAccount === false) {
          /* 舊帳戶：從雲端拉下來；本地有進度先問用戶（呢個窗而家一定撳得到） */
          const hasLocalProgress = this._localHasProgress();
          if (hasLocalProgress) {
            const confirmed = await this._confirmOverwrite();
            if (!confirmed) {
              /* 用戶拒絕 → sign out，保留本地進度 */
              await SupabaseAuth.signOut();
              if (window.Friends && Friends.stopPolling) Friends.stopPolling();
              st._googleMigrated = false;
              saveState();
              this.renderHome();
              this.toast("Sign-in cancelled — your local progress is kept.");
              /* 取消 OAuth sign in 後 → 自動彈 Login Gate */
              setTimeout(() => { this.openLoginHub(true); }, 500);
              return;
            }
          }
          await Sync.pull();
          console.log("[OAuth] ✅ Existing account data pulled from cloud");
          st._googleMigrated = true;
          saveState();
        } else {
          /* migrate 失敗 / 未知狀態：保守起見 pull（雲端有就用雲端） */
          try { await Sync.pull(); } catch (e) {}
          st._googleMigrated = true;
          saveState();
        }
      } else {
        /* 已 migrate 過（之前登入過）：拉雲端最新數據 */
        try { await Sync.pull(); } catch (e) {}
      }
      this.renderHome();
      /* 顯示實際登入嘅 email，萬一 Google 選錯帳戶用戶可以即刻發現 */
      const signedEmail = SupabaseAuth.currentUser()?.email;
      this.toast(signedEmail
        ? `✅ Signed in as ${signedEmail}`
        : "✅ Signed in! Your progress is cloud-synced.");

      /* 新帳戶 → 彈 Learning Curve Mode 設定 */
      if (st._needsCurveSetup) {
        st._needsCurveSetup = false;
        saveState();
        /* 等 toast 顯示完先彈 curve setup modal */
        setTimeout(() => { this._showCurveSetupForm(); }, 800);
      }
    } catch (e) { console.warn("[OAuth] post-login failed:", e.message); }
  },

  /* 檢查本地係咪有遊玩進度（用嚟決定 connect 舊帳戶時使唔使彈 overwrite 警告） */
  _localHasProgress() {
    const st = loadState();
    const cardCount = (typeof SM2 !== "undefined" && SM2.listAll) ? SM2.listAll().length : 0;
    return (st.diamonds || 0) > 0
      || (st.entries && Object.keys(st.entries).length > 0)
      || cardCount > 0
      || (st.totalSets || 0) > 0;
  },

  /* 彈出「覆蓋本地進度」確認視窗，回傳 Promise<boolean> */
  _confirmOverwrite() {
    return new Promise((resolve) => {
      const existing = document.getElementById("overwrite-modal");
      if (existing) existing.remove();
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.id = "overwrite-modal";
      backdrop.innerHTML = `
        <div class="modal-card">
          <div class="modal-icon">⚠️</div>
          <h3>Overwrite local progress?</h3>
          <p style="font-size:.85rem;line-height:1.5;margin:6px 0;color:#6b7280;">
            This Google account already has saved progress in the cloud.<br>
            Connecting will <strong>overwrite your current local progress</strong> with the cloud data.
          </p>
          <p style="font-size:.78rem;color:#ef4444;font-weight:700;margin:8px 0 14px;">
            Your local diamonds, Pokémon and study records will be replaced.
          </p>
          <div style="display:flex;gap:10px;">
            <button class="btn-secondary" style="flex:1;" data-act="cancel">Cancel</button>
            <button class="btn-primary" style="flex:1;background:#ef4444;" data-act="confirm">Overwrite &amp; Connect</button>
          </div>
        </div>`;
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop || e.target.closest("[data-act=cancel]")) {
          backdrop.remove();
          resolve(false);
        } else if (e.target.closest("[data-act=confirm]")) {
          backdrop.remove();
          resolve(true);
        }
      });
      document.body.appendChild(backdrop);
    });
  },

  /* ================= Auth UI v2（v1.59：單一卡片 + Create account / Sign in tab） =================
     - Google 掣喺兩個 tab 都有，按 tab 轉名（Sign up / Sign in with Google）—— Rule 55 / Rule 73
     - isGate=true → 首次進入嘅強制登入 gate：唔俾點外面、Esc 關，亦冇 ✕（Rule 51）
     - 所有 email/password input 用正確 autocomplete，俾 iOS Keychain／Password Manager 自動填
     - input 一律 16px 字，防 iOS focus 自動 zoom */
  _authLast() {
    try { return JSON.parse(localStorage.getItem("pe_auth_last") || "null") || {}; } catch (e) { return {}; }
  },
  _authRemember(method, email) {
    try {
      const prev = this._authLast();
      localStorage.setItem("pe_auth_last", JSON.stringify({ method, email: email || prev.email || "" }));
    } catch (e) {}
  },
  /* 只有滑鼠／觸控板裝置先 autofocus；手機一開就彈鍵盤會遮住半張卡 */
  _authFinePointer() {
    try { return window.matchMedia("(hover: hover) and (pointer: fine)").matches; } catch (e) { return false; }
  },
  _authIcon(name) {
    if (name === "google") return `<svg class="au-gicon" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.2 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c3 0 5.8 1.1 7.9 3l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15 19 12.5 24 12.5c3 0 5.8 1.1 7.9 3l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 16.3 4.5 9.6 8.8 6.3 14.1z"/><path fill="#4CAF50" d="M24 43.5c5 0 9.6-1.9 13-5l-6-4.8c-2.1 1.4-4.8 2.3-7.9 2.3-5.2 0-9.7-3.1-11.3-7.4l-6.5 5C9.3 39.2 16.1 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6 4.8C42 33.9 43.5 29.2 43.5 24c0-1.2-.1-2.4-.4-3.5z"/></svg>`;
    if (name === "eye") return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
    if (name === "eyeOff") return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
    if (name === "mail") return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`;
    return "";
  },
  _authSpinner(label) { return `<span class="au-spin" aria-hidden="true"></span><span>${label}</span>`; },
  _authCloseBtn(isGate) {
    return isGate ? "" : `<button type="button" class="au-iconbtn au-x" data-act="close" aria-label="Close">✕</button>`;
  },

  /* GoTrue 原始錯誤 → 用戶睇得明嘅文案（field = 要標紅邊一格） */
  _authError(raw) {
    const m = String(raw || "");
    if (/already (been )?registered|already exists/i.test(m)) return { code: "taken", field: "email", msg: "This email already has an account." };
    if (/invalid login credentials|invalid grant/i.test(m)) return { code: "creds", field: "pass", msg: "Incorrect email or password." };
    if (/not confirmed/i.test(m)) return { code: "unconfirmed", msg: "Please confirm your email first — check your inbox for the activation link." };
    if (/rate limit|too many|security purposes/i.test(m)) return { code: "rate", msg: "Too many attempts. Please wait a minute and try again." };
    if (/password/i.test(m) && /(should|weak|least|characters)/i.test(m)) return { code: "weak", field: "pass", msg: m };
    if (/failed to fetch|network|load failed/i.test(m)) return { code: "net", msg: "Can't reach the server. Check your connection and try again." };
    return { code: "other", msg: m || "Something went wrong. Please try again." };
  },

  _authFieldHTML(o) {
    const pw = o.type === "password";
    return `
      <div class="au-field${pw ? " has-eye" : ""}" data-f="${o.key}">
        <div class="au-lab"><label for="${o.id}">${o.label}</label>${o.aside || ""}</div>
        <div class="au-wrap">
          <input id="${o.id}" class="au-input" type="${o.type || "text"}" name="${o.name}" autocomplete="${o.ac}" ${o.attrs || ""}
            placeholder="${o.ph || ""}" value="${escapeHTML(o.value || "")}" aria-describedby="${o.id}-m">
          ${pw ? `<button type="button" class="au-eye" data-act="eye" aria-label="Show password" aria-pressed="false">${this._authIcon("eye")}</button>` : ""}
        </div>
        ${o.meter ? `<div class="au-meter" data-s="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>` : ""}
        <div class="au-msg${o.hint ? " hint" : ""}" id="${o.id}-m" data-hint="${escapeHTML(o.hint || "")}">${o.hint || ""}</div>
      </div>`;
  },

  /* 表單 helper：inline 驗證、錯誤、banner、loading 鎖定 */
  _authForm(root, mode) {
    const self = this;
    const field = k => root.querySelector(`.au-field[data-f="${k}"]`);
    const F = {
      val(k) { const i = field(k)?.querySelector("input"); return i ? (k === "pass" ? i.value : i.value.trim()) : ""; },
      setErr(k, msg) {
        const f = field(k); if (!f) return;
        f.classList.add("invalid"); f.classList.remove("valid");
        f.querySelector("input").setAttribute("aria-invalid", "true");
        const m = f.querySelector(".au-msg"); m.className = "au-msg err"; m.textContent = msg; m.dataset.err = "1";
      },
      clearErr(k) {
        const f = field(k); if (!f) return;
        f.classList.remove("invalid");
        f.querySelector("input").removeAttribute("aria-invalid");
        const m = f.querySelector(".au-msg");
        if (m.dataset.err) { m.dataset.err = ""; m.className = "au-msg" + (m.dataset.hint ? " hint" : ""); m.textContent = m.dataset.hint || ""; }
      },
      check(k) {
        const v = F.val(k);
        let err = "";
        if (k === "name") err = !v ? "Pick a trainer name." : (v.length < 2 ? "Use at least 2 characters." : "");
        if (k === "email") err = !v ? "Enter your email." : (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "That doesn't look like an email — check for typos." : "");
        if (k === "pass") err = !v ? (mode === "signup" ? "Create a password." : "Enter your password.") : (mode === "signup" && v.length < 8 ? "Password needs at least 8 characters." : "");
        if (err) { F.setErr(k, err); return false; }
        F.clearErr(k);
        if (k !== "pass") field(k)?.classList.add("valid");
        return true;
      },
      checkAll(keys) {
        let first = null;
        keys.forEach(k => { if (!F.check(k) && !first) first = k; });
        if (first) field(first).querySelector("input").focus();
        return !first;
      },
      banner(html, kind) {
        const b = root.querySelector("#au-banner");
        if (b) b.innerHTML = html ? `<div class="au-banner ${kind || ""}" role="alert">${html}</div>` : "";
      },
      busy(on, label) {
        root.classList.toggle("is-busy", on);
        root.querySelectorAll("input, button").forEach(x => { if (x.id !== "au-submit") x.disabled = on; });
        const b = root.querySelector("#au-submit");
        if (!b) return;
        if (!b.dataset.label) b.dataset.label = b.textContent.trim();
        b.disabled = on;
        b.innerHTML = on ? self._authSpinner(label) : b.dataset.label;
      },
      focusFirst() {
        if (!self._authFinePointer()) return;
        const ins = [...root.querySelectorAll(".au-field input")];
        const i = ins.find(x => !x.value) || ins[0];
        if (i) i.focus();
      }
    };
    /* blur 先驗證（唔好一打字就鬧）；再打字即清錯誤 */
    root.querySelectorAll(".au-field input").forEach(inp => {
      const k = inp.closest(".au-field").dataset.f;
      inp.addEventListener("blur", () => { if (inp.value && !root.classList.contains("is-busy")) F.check(k); });
      inp.addEventListener("input", () => { F.clearErr(k); F.banner(""); });
    });
    /* 顯示／隱藏密碼 */
    root.querySelectorAll("[data-act=eye]").forEach(btn => {
      btn.onclick = () => {
        const inp = btn.parentElement.querySelector("input");
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        btn.innerHTML = self._authIcon(show ? "eyeOff" : "eye");
        btn.setAttribute("aria-pressed", String(show));
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      };
    });
    const close = root.querySelector("[data-act=close]");
    if (close) close.onclick = () => this.closeModal();
    this._authBindEsc();
    return F;
  },

  _authBindEsc() {
    if (this._authEscBound) return;
    this._authEscBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const au = document.querySelector("#modal-root .au");
      if (!au || au.dataset.gate === "1" || au.classList.contains("is-busy")) return;
      this.closeModal();
    });
  },

  /* isGate=true 時代表首次進入 App 嘅強制登入 gate，唔俾 click outside 關閉 */
  openLoginHub(isGate, tab) {
    const user = window.SupabaseAuth ? SupabaseAuth.currentUser() : null;
    if (user) { this._showAccountHub(); return; }
    this._showAuth(isGate, tab);
  },
  _showSignUpForm(isGate) { this._showAuth(isGate, "signup"); },
  _showSignInForm(isGate) { this._showAuth(isGate, "signin"); },

  /* ---------- 主 Auth 卡：Create account / Sign in ---------- */
  _showAuth(isGate, tab, opts = {}) {
    const last = this._authLast();
    const t = (tab === "signin" || tab === "signup") ? tab : (last.method ? "signin" : "signup");
    const up = t === "signup";
    const email = opts.email != null ? opts.email : (up ? "" : (last.email || ""));
    const lastG = !up && last.method === "google";
    const lastE = !up && last.method === "email";

    this.showModal(`
      <div class="login-hub au" data-gate="${isGate ? 1 : 0}" role="dialog" aria-labelledby="au-title">
        ${this._authCloseBtn(isGate)}
        <div class="au-brand">
          <div class="lh-ball au-ball" aria-hidden="true"></div>
          <h2 class="au-title" id="au-title">${up ? "Create your Trainer account" : "Welcome back, Trainer"}</h2>
          <p class="au-sub">${up ? "Save your Pokémon and progress across all your devices." : "Sign in to continue where you left off."}</p>
        </div>

        <div class="au-seg" role="tablist" aria-label="Account" data-tab="${t}">
          <span class="au-seg-pill" aria-hidden="true"></span>
          <button type="button" role="tab" id="au-tab-signup" aria-selected="${up}" tabindex="${up ? 0 : -1}" data-tab-btn="signup">Create account</button>
          <button type="button" role="tab" id="au-tab-signin" aria-selected="${!up}" tabindex="${up ? -1 : 0}" data-tab-btn="signin">Sign in</button>
        </div>

        <button type="button" class="au-btn au-btn-google" id="au-google">
          ${lastG ? `<span class="au-last">Last used</span>` : ""}
          ${this._authIcon("google")}<span>${up ? "Sign up with Google" : "Sign in with Google"}</span>
        </button>

        <div class="au-divider"><span>or with email</span></div>

        <div id="au-banner" aria-live="polite"></div>
        <form id="au-form" class="au-form" novalidate>
          ${up ? this._authFieldHTML({ key: "name", id: "au-name", label: "Trainer name", name: "nickname", ac: "nickname",
                   attrs: 'maxlength="24" enterkeyhint="next" autocapitalize="words"', ph: "e.g. Ash" }) : ""}
          ${this._authFieldHTML({ key: "email", id: "au-email", type: "email", name: "email", ac: up ? "email" : "username",
              label: `Email${lastE ? ' <span class="au-last-inline">Last used</span>' : ""}`,
              attrs: 'inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next"',
              ph: "you@example.com", value: email })}
          ${this._authFieldHTML({ key: "pass", id: "au-pass", type: "password", name: "password", ac: up ? "new-password" : "current-password",
              label: "Password",
              aside: up ? "" : `<button type="button" class="au-link au-link-sm" data-act="forgot">Forgot password?</button>`,
              attrs: `enterkeyhint="${up ? "done" : "go"}"${up ? ' minlength="8"' : ""}`,
              ph: up ? "At least 8 characters" : "Your password",
              meter: up,
              hint: up ? "Use 8+ characters. Mix letters and numbers to make it stronger." : "" })}
          <button type="submit" class="au-btn au-btn-primary" id="au-submit">${up ? "Create account" : "Sign in"}</button>
        </form>

        <p class="au-foot">${up
          ? "Your trainer data, Pokémon and diamonds are saved to the cloud and sync across devices."
          : `New here? <button type="button" class="au-link" data-tab-btn="signup">Create an account</button>`}</p>
      </div>`, !!isGate);

    const root = document.querySelector("#modal-root .au");
    const q = s => root.querySelector(s);
    const F = this._authForm(root, t);
    const curEmail = () => (q("#au-email")?.value || "").trim();

    /* Tab 切換：保留已打嘅 email */
    root.querySelectorAll("[data-tab-btn]").forEach(b => {
      b.onclick = () => {
        const nt = b.dataset.tabBtn;
        if (nt === t) return;
        this._showAuth(isGate, nt, { email: curEmail(), dir: nt === "signin" ? 1 : -1 });
      };
    });
    q(".au-seg").onkeydown = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const nt = up ? "signin" : "signup";
      this._showAuth(isGate, nt, { email: curEmail(), keepTabFocus: true });
    };
    if (opts.dir) root.style.setProperty("--au-dx", (opts.dir * 14) + "px");

    q("#au-google").onclick = () => this._authGoogle(q("#au-google"));

    const fg = q("[data-act=forgot]");
    if (fg) fg.onclick = () => this._showForgot(isGate, curEmail());

    const pass = q("#au-pass");
    if (up) {
      const meter = q(".au-meter");
      const msg = q("#au-pass-m");
      pass.addEventListener("input", () => {
        const p = pass.value;
        let s = 0;
        if (p) {
          if (p.length >= 8) s++;
          if (/[a-z]/i.test(p) && /\d/.test(p)) s++;
          if (/[^a-z0-9]/i.test(p) || (/[A-Z]/.test(p) && /[a-z]/.test(p))) s++;
          if (p.length >= 12) s++;
          s = Math.max(1, s);
        }
        meter.dataset.s = String(s);
        if (!msg.dataset.err) {
          const left = 8 - p.length;
          msg.textContent = p && left > 0 ? `${left} more character${left > 1 ? "s" : ""}` : msg.dataset.hint;
        }
      });
    } else {
      /* Caps Lock 提示（淨係桌面鍵盤有用） */
      const msg = q("#au-pass-m");
      const caps = (e) => {
        if (!e.getModifierState || msg.dataset.err) return;
        const on = e.getModifierState("CapsLock");
        msg.className = "au-msg" + (on ? " warn" : "");
        msg.textContent = on ? "Caps Lock is on" : "";
      };
      pass.addEventListener("keyup", caps);
      pass.addEventListener("keydown", caps);
    }

    q("#au-form").onsubmit = (e) => {
      e.preventDefault();
      if (root.classList.contains("is-busy")) return;
      F.banner("");
      if (!F.checkAll(up ? ["name", "email", "pass"] : ["email", "pass"])) return;
      if (up) this._authDoSignup(root, F, isGate);
      else this._authDoSignin(root, F, isGate);
    };

    if (opts.keepTabFocus) q(`#au-tab-${t}`).focus();
    else F.focusFirst();
  },

  _authGoogle(btn) {
    const html = btn.innerHTML;
    this._authRemember("google");
    btn.disabled = true;
    btn.innerHTML = this._authSpinner("Opening Google…");
    /* signInWithGoogle 會 redirect 走，正常唔會 resolve；失敗先還原掣 */
    Promise.resolve()
      .then(() => SupabaseAuth.signInWithGoogle())
      .catch((e) => {
        console.warn("Google sign-in failed:", e);
        btn.disabled = false; btn.innerHTML = html;
        this.toast("Couldn't open Google sign-in. Please try again.");
      });
  },

  async _authDoSignup(root, F, isGate) {
    const email = F.val("email"), nick = F.val("name"), pass = F.val("pass");
    F.busy(true, "Creating account…");
    const res = await SupabaseAuth.signUpWithEmail(email, pass);
    if (!res.ok) {
      F.busy(false);
      const er = this._authError(res.error);
      if (er.code === "taken") {
        F.setErr("email", er.msg);
        F.banner(`Already registered? <button type="button" class="au-link" data-go="signin">Sign in instead</button>`, "info");
        root.querySelector("[data-go=signin]").onclick = () => this._showAuth(isGate, "signin", { email });
      } else if (er.field) {
        F.setErr(er.field, er.msg);
      } else {
        F.banner(escapeHTML(er.msg));
      }
      return;
    }
    this._authRemember("email", email);
    /* 暱稱即刻寫入 local（需要 confirm email 嘅情況都保留），首次登入時 import_state 帶上雲 */
    if (nick) {
      const st = loadState();
      st.playerName = nick;
      st.nameCustomized = true;
      saveState();
    }
    if (res.needConfirm) { this._showCheckEmail(email, "confirm", isGate); return; }

    await SupabaseAuth.ensureFreshSession();
    /* _postLogin 可能需要彈 overwrite 確認窗（掛 body，唔係 modal-root），所以完咗先 closeModal */
    try { await this._postLogin(loadState()); } catch (err) {}
    this._markLoggedIn();
    this.closeModal();
    this.renderHome();
    this.toast(`✅ Welcome, ${nick}! Your progress is saved.`);
  },

  async _authDoSignin(root, F, isGate) {
    const email = F.val("email"), pass = F.val("pass");
    F.busy(true, "Signing in…");
    const res = await SupabaseAuth.signInWithEmail(email, pass);
    if (!res.ok) {
      F.busy(false);
      const er = this._authError(res.error);
      if (er.code === "creds") {
        F.setErr("pass", er.msg);
        F.banner(`Couldn't sign you in. Check your password or <button type="button" class="au-link" data-go="forgot">reset it</button>.`);
        root.querySelector("[data-go=forgot]").onclick = () => this._showForgot(isGate, email);
        const p = root.querySelector("#au-pass");
        if (p) { p.focus(); p.select(); }
      } else if (er.code === "unconfirmed") {
        F.banner(`${escapeHTML(er.msg)} <button type="button" class="au-link" data-go="resend">Resend link</button>`, "info");
        root.querySelector("[data-go=resend]").onclick = () => this._showCheckEmail(email, "confirm", isGate, true);
      } else if (er.field) {
        F.setErr(er.field, er.msg);
      } else {
        F.banner(escapeHTML(er.msg));
      }
      return;
    }
    this._authRemember("email", email);
    this.closeModal();
    try { await this._postLogin(loadState()); } catch (err) {}
    this._markLoggedIn();
    this.closeModal();
    this.renderHome();
    this.toast(`✅ Signed in as ${email}`);
  },

  /* ---------- Forgot Password ---------- */
  _showForgot(isGate, email = "") {
    this.showModal(`
      <div class="login-hub au" data-gate="${isGate ? 1 : 0}" role="dialog" aria-labelledby="au-title">
        <button type="button" class="au-iconbtn au-back" data-act="back" aria-label="Back">←</button>
        ${this._authCloseBtn(isGate)}
        <div class="au-brand au-brand-pad">
          <div class="au-art" aria-hidden="true">🔑</div>
          <h2 class="au-title" id="au-title">Reset your password</h2>
          <p class="au-sub">Enter the email you signed up with and we'll send you a secure link to set a new password.</p>
        </div>
        <div id="au-banner" aria-live="polite"></div>
        <form id="au-form" class="au-form" novalidate>
          ${this._authFieldHTML({ key: "email", id: "au-email", type: "email", name: "email", ac: "username", label: "Email",
              attrs: 'inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"',
              ph: "you@example.com", value: email })}
          <button type="submit" class="au-btn au-btn-primary" id="au-submit">Send reset link</button>
        </form>
      </div>`, !!isGate);

    const root = document.querySelector("#modal-root .au");
    const F = this._authForm(root, "forgot");
    root.querySelector("[data-act=back]").onclick = () =>
      this._showAuth(isGate, "signin", { email: F.val("email"), dir: -1 });
    root.querySelector("#au-form").onsubmit = async (e) => {
      e.preventDefault();
      if (root.classList.contains("is-busy")) return;
      if (!F.checkAll(["email"])) return;
      const em = F.val("email");
      F.busy(true, "Sending…");
      const res = await SupabaseAuth.sendPasswordReset(em);
      if (!res.ok) {
        const er = this._authError(res.error);
        if (er.code === "rate" || er.code === "net") { F.busy(false); F.banner(escapeHTML(er.msg)); return; }
      }
      /* Supabase 防 user enumeration：有冇呢個 email 都當成功 */
      this._showCheckEmail(em, "reset", isGate);
    };
    F.focusFirst();
  },

  /* ---------- Check your inbox（sign up confirm / reset） ----------
     sendNow=true：入嚟即刻再寄一次（例如 sign in 時發現 email 未 confirm） */
  _showCheckEmail(email, kind, isGate, sendNow) {
    const reset = kind === "reset";
    this.showModal(`
      <div class="login-hub au au-center" data-gate="${isGate ? 1 : 0}" role="dialog" aria-labelledby="au-title">
        ${this._authCloseBtn(isGate)}
        <div class="au-art" aria-hidden="true">✉️</div>
        <h2 class="au-title" id="au-title">Check your inbox</h2>
        <p class="au-sub">${reset ? "If an account exists for" : "We sent a confirmation link to"}<br><strong>${escapeHTML(email)}</strong></p>
        <p class="au-hint">${reset
          ? "Open the link in the email to choose a new password."
          : "Tap the link in the email to activate your account, then come back and sign in."} Can't find it? Check your Spam or Promotions folder.</p>
        <div class="au-stack">
          <button type="button" class="au-btn au-btn-primary" data-act="done">${reset ? "Back to sign in" : "I've confirmed — Sign in"}</button>
          <button type="button" class="au-btn au-btn-ghost" data-act="resend">Resend email</button>
          <button type="button" class="au-link au-link-sm au-center-link" data-act="change">Wrong email? Change it</button>
        </div>
      </div>`, !!isGate);

    const root = document.querySelector("#modal-root .au");
    this._authForm(root, "check");
    root.querySelector("[data-act=done]").onclick = () => this._showAuth(isGate, "signin", { email });
    root.querySelector("[data-act=change]").onclick = () =>
      reset ? this._showForgot(isGate, email) : this._showAuth(isGate, "signup", { email });

    const rb = root.querySelector("[data-act=resend]");
    const cooldown = (sec) => {
      let n = sec;
      rb.disabled = true;
      rb.textContent = `Resend email in ${n}s`;
      const tm = setInterval(() => {
        if (!document.body.contains(rb)) { clearInterval(tm); return; }
        n--;
        if (n <= 0) { clearInterval(tm); rb.disabled = false; rb.textContent = "Resend email"; }
        else rb.textContent = `Resend email in ${n}s`;
      }, 1000);
    };
    const send = async () => {
      rb.disabled = true;
      rb.innerHTML = this._authSpinner("Sending…");
      const res = reset ? await SupabaseAuth.sendPasswordReset(email) : await SupabaseAuth.resendSignup(email);
      if (!document.body.contains(rb)) return;
      if (res && res.ok) { this.toast("📧 Email sent again"); cooldown(60); }
      else {
        const er = this._authError(res && res.error);
        this.toast(er.msg);
        cooldown(er.code === "rate" ? 60 : 5);
      }
    };
    rb.onclick = send;
    if (sendNow) send(); else cooldown(60);
  },

  /* ---------- 已登入狀態 Account Hub ---------- */
  async _showAccountHub() {
    const user = SupabaseAuth.currentUser();
    let identities = [];
    try { identities = (await SupabaseAuth.getIdentities()) || []; } catch (e) {}
    const emailIdent = identities.find(i => i.provider === "email");
    const googleIdent = identities.find(i => i.provider === "google");
    const hasGoogle = !!googleIdent;
    const hasEmail = !!emailIdent;
    const name = loadState().playerName || "The PokéEngmon Trainer";
    const initial = (name.trim()[0] || "T").toUpperCase();
    const gMail = googleIdent?.identity_data?.email || "";
    const eMail = emailIdent?.identity_data?.email || "";
    const hint = !hasGoogle
      ? "Connect Google so you can sign in with one tap — and never get locked out."
      : (!hasEmail ? "You sign in with your Google account." : "You can sign in with either method.");

    this.showModal(`
      <div class="login-hub au" data-gate="0" role="dialog" aria-labelledby="au-title">
        ${this._authCloseBtn(false)}
        <div class="au-acct">
          <div class="au-avatar" aria-hidden="true">${escapeHTML(initial)}</div>
          <div class="au-acct-info">
            <div class="au-acct-name" id="au-title">${escapeHTML(name)}</div>
            <div class="au-acct-email">${escapeHTML(user?.email || gMail || eMail || "")}</div>
            <div class="au-synced">Progress synced</div>
          </div>
        </div>
        <div class="au-sec">Sign-in methods</div>
        <div class="au-list">
          <div class="au-li">
            <span class="au-li-ic">${this._authIcon("google")}</span>
            <span class="au-li-t">Google${gMail ? `<small>${escapeHTML(gMail)}</small>` : ""}</span>
            ${hasGoogle ? `<span class="au-pill-ok">Connected</span>` : `<button type="button" class="au-link" id="au-link-google">Connect</button>`}
          </div>
          <div class="au-li">
            <span class="au-li-ic">${this._authIcon("mail")}</span>
            <span class="au-li-t">Email &amp; password${eMail ? `<small>${escapeHTML(eMail)}</small>` : ""}</span>
            ${hasEmail ? `<span class="au-pill-ok">Connected</span>` : `<span class="au-muted">Not set</span>`}
          </div>
        </div>
        <p class="au-hint au-hint-left">${hint}</p>
        <div class="au-stack">
          <button type="button" class="au-btn au-btn-danger-ghost" id="au-signout">Sign out</button>
        </div>
      </div>`, false);

    const root = document.querySelector("#modal-root .au");
    this._authForm(root, "account");

    const lg = root.querySelector("#au-link-google");
    if (lg) {
      lg.onclick = async () => {
        lg.disabled = true;
        lg.innerHTML = this._authSpinner("Connecting…");
        const res = await SupabaseAuth.linkGoogle();
        if (res && !res.ok) {
          lg.disabled = false; lg.textContent = "Connect";
          if (res.error === "manual_linking_disabled") {
            this.toast("Please enable Manual Linking in Supabase Dashboard (Auth → Settings → Security)");
          } else {
            this.toast("Failed to connect Google: " + (res.error || "unknown"));
          }
        }
      };
    }
    root.querySelector("#au-signout").onclick = () => this._confirmSignOut();
  },

  _confirmSignOut() {
    this.showModal(`
      <div class="login-hub au au-center" data-gate="0" role="alertdialog" aria-labelledby="au-title">
        <div class="au-art" aria-hidden="true">👋</div>
        <h2 class="au-title" id="au-title">Sign out?</h2>
        <p class="au-sub">Your progress is safe in the cloud. Progress on this device will be cleared until you sign in again.</p>
        <div class="au-stack">
          <button type="button" class="au-btn au-btn-danger" id="au-submit">Sign out</button>
          <button type="button" class="au-btn au-btn-ghost" data-act="cancel">Cancel</button>
        </div>
      </div>`, false);
    const root = document.querySelector("#modal-root .au");
    const F = this._authForm(root, "signout");
    root.querySelector("[data-act=cancel]").onclick = () => this._showAccountHub();
    root.querySelector("#au-submit").onclick = async () => {
      F.busy(true, "Signing out…");
      try {
        await SupabaseAuth.signOut();
        if (window.Friends && Friends.stopPolling) Friends.stopPolling();
        clearGameProgress();
        const fresh = loadState();
        fresh._googleMigrated = false;
        saveState();
        try { await Sync.pull(); } catch (e) {}
        this._markLoggedOut();
        this.closeModal();
        this.renderHome();
        this.toast("Signed out — local progress cleared");
        /* Sign out 後 → 自動彈 Login Gate（Rule 51；500ms 等 toast 顯示） */
        setTimeout(() => { this.openLoginHub(true, "signin"); }, 500);
      } catch (e) {
        console.error("[SignOut] failed:", e);
        F.busy(false);
        this.toast("Sign out failed: " + e.message);
      }
    };
  },

  /* ---------- 首次登入 Learning Curve Mode 設定 ---------- */
  _showCurveSetupForm() {
    const modeOpts = [
      { v: "junior", label: "🧒 Junior", desc: "Gentle curve with extra attempts & hints" },
      { v: "standard", label: "📘 Standard", desc: "Balanced review for most learners" },
      { v: "teen", label: "🎓 Teen", desc: "Steadier pace for secondary learners" },
      { v: "adult", label: "🧑 Adult", desc: "Longer intervals for faster recall" }
    ];
    const modeHtml = modeOpts.map(o => `
      <label class="curve-mode-opt${o.v === "standard" ? " active" : ""}">
        <input type="radio" name="curveModeSetup" value="${o.v}" ${o.v === "standard" ? "checked" : ""}>
        <span class="cm-label">${o.label}</span>
        <small class="cm-desc">${o.desc}</small>
      </label>`).join("");

    this.showModal(`
      <div class="login-hub curve-setup-hub">
        <div class="lh-ball" aria-hidden="true"></div>
        <h3>📈 Pick Your Learning Curve</h3>
        <p class="lh-sub">This controls how aggressively we schedule reviews. You can change it anytime in Settings.</p>
        <div class="curve-mode-grid">${modeHtml}</div>
        <div class="lh-actions">
          <button id="lh-curve-continue" class="btn-big btn-primary">Start Playing →</button>
        </div>
      </div>`, false);  /* 呢個 modal 可以關，但最好俾用戶揀完先關 */

    /* Setup form 嘅 active 切換（之前漏咗！） */
    document.querySelectorAll('input[name="curveModeSetup"]').forEach(r => {
      r.onchange = () => {
        document.querySelectorAll(".curve-mode-opt").forEach(l => l.classList.remove("active"));
        r.closest(".curve-mode-opt").classList.add("active");
      };
    });

    document.getElementById("lh-curve-continue").onclick = async () => {
      const sel = document.querySelector('input[name="curveModeSetup"]:checked');
      const mode = sel ? sel.value : "standard";
      /* 寫入本地 state + SM2 */
      if (typeof setCurveMode === "function") setCurveMode(mode);
      saveState();
      /* 寫入 DB（pushState 會自動 patch user_account.curve_mode） */
      try { await Sync.pushState(); } catch (e) { console.warn("Curve mode DB patch failed:", e); }
      this.closeModal();
      this.toast(`📈 Curve mode: ${mode}`);
    };
  },

  /* ---------- 改訓練員名 ---------- */
  openRename() {
    const st = loadState();
    this.showModal(`
      <div class="rename-box">
        <h3 class="rename-title">Trainer Name</h3>
        <p class="rename-sub">Type a name for your trainer.</p>
        <input id="rename-input" class="rename-input" type="text" maxlength="24"
               autocomplete="off" autocapitalize="words" spellcheck="false"
               value="${escapeHTML(st.playerName)}">
        <div class="confirm-row">
          <button id="rename-save" class="btn-big btn-primary">Save</button>
          <button id="rename-cancel" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`);
    const input = document.getElementById("rename-input");
    input.focus();
    input.select();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("rename-save").click();
    });
    document.getElementById("rename-save").onclick = () => {
      const name = input.value.trim().slice(0, 24) || "The PokéEngmon Trainer";
      st.playerName = name;
      st.nameCustomized = true;
      saveState();
      /* trainer_name 係唯一仲直寫嘅 account 欄位 */
      if (window.Sync && Sync.isEnabled()) Sync.pushState();
      this.closeModal();
      this.renderHome();
      this.toast(`Trainer name saved: ${name}`);
    };
    document.getElementById("rename-cancel").onclick = () => this.closeModal();
  },

  /* ---------- 版權 / 免責聲明 ---------- */
  openDisclaimer() {
    this.showModal(`
      <div class="disclaimer-box">
        <h3>Copyright &amp; Disclaimer</h3>
        <p>This website is an unofficial, non-commercial educational and reward tool. It is <b>NOT</b> affiliated with, endorsed, sponsored, or approved by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company.</p>
        <p>Pokémon and Pokémon character names, images, sprites, cries, music, and related game assets are trademarks of © Nintendo, Creatures Inc., and GAME FREAK inc. All rights belong to their respective owners.</p>
        <p>All assets are used only for non-commercial educational, learning-reward, and motivational purposes.</p>

        <h4>Data &amp; Image Credits</h4>
        <p>Pokémon base stats, moves, evolution data, sprites, and type icons are provided by <a href="https://pokeapi.co" target="_blank" rel="noopener">PokéAPI</a>.</p>
        <p>Pokémon cries are provided by the Pokémon Showdown community.</p>
        <p>The quiz progress runner mascot is a custom, non-commercial fan illustration supplied for this project (Pikachu-inspired). Pokémon-related rights remain with © Nintendo / Creatures Inc. / GAME FREAK inc.</p>
        <p>Battle UI frames, HP boxes, battle backgrounds, trainer sprites, Poké Ball graphics, and move attack-effect sprites are original assets from Pokémon FireRed/LeafGreen (© Nintendo / Creatures Inc. / GAME FREAK inc.), ripped from <a href="https://www.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen/" target="_blank" rel="noopener">The Spriters Resource</a> (rippers: redblueyellow, desgardes, Superjustinbros, Spherical Ice, EternalLight, wormintheworks) and the pret/pokefirered decompilation project.</p>
        <p>Per-move battle animations (frame data + spritesheets), in-battle Pokémon sprite animations, the battle dialogue window, the party (switch Pokémon) screen UI, the "emerald" dialogue font and battle sound effects are adapted from the open-source assets of the Pokémon fan games <a href="https://www.pokerogue.net/" target="_blank" rel="noopener">PokeRogue</a> and Pokémon Reborn (<a href="https://github.com/pagefaultgames/pokerogue-assets" target="_blank" rel="noopener">pokerogue-assets</a>, beta branch). All Pokémon-related artwork remains © Nintendo / Creatures Inc. / GAME FREAK inc.</p>

        <h4>Font</h4>
        <p><i>Inter</i> by Rasmus Andersson, licensed under the SIL Open Font License 1.1.</p>
        <p>Battle screen font: <i>pokemon-emerald-pro</i> (PokeRogue's "emerald" font), with <i>DotGothic16</i> by Fontworks Inc. (SIL Open Font License 1.1) as a fallback.</p>

        <h4>Music &amp; Sound Credits</h4>
        <p>Background music: <i>Flat Water</i> by BGM channel (official music video). All rights belong to their respective owners.</p>
        <p>Battle/jingle/evolution tracks (<i>Battle! (Wild Pokémon)</i>, <i>Obtained a Pokémon!</i>, <i>Obtained a Berry!</i>, <i>Evolution</i>, <i>Fanfare — Evolution</i>, from Pokémon Red/Green/Blue/Yellow) are from the original Pokémon game soundtracks, composed by Junichi Masuda, Gō Ichinose, Morikazu Aoki, Shota Kageyama and others. © Nintendo / Creatures Inc. / GAME FREAK inc.</p>
        <p>Pokémon soundtrack resources referenced from <a href="https://downloads.khinsider.com" target="_blank" rel="noopener">KHInsider Video Game Music</a> (unofficial fan archive).</p>

        <h4>In-Game Items</h4>
        <p>All diamonds, pull tickets, candies, cards, and Pokémon in this app are virtual learning rewards. They have no real-world value and cannot be exchanged for money or physical goods. There is no real-money trading.</p>

        <button id="btn-disclaimer-close" class="btn-big btn-primary">Close</button>
      </div>`);
    document.getElementById("btn-disclaimer-close").onclick = () => this.closeModal();
  },

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
    if (id === "sheet-setting") { this._syncAudioSliders(); this._syncCurveMode(); }
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
    requestAnimationFrame(() => { sheet.classList.add("ph-open"); });
  },
  /* ====== Sheet 系統 ======
   * 所有 close 路徑共享同一規則：
   *   1. 只 remove ph-open class（transition 0.4s 自然播放）
   *   2. setTimeout 430ms（比 transition + binder open 嘅 410ms 遲 20ms）
   *   3. timer 執行時先檢查有冇新 ph-open（stillOpen guard）→ 有就 skip hidden
   *   4. 絕對唔好 remove class 同時設 hidden（跳過 transform 動畫）
   */
  _closeSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    if (id === "sheet-gacha" && typeof Gacha !== "undefined") Gacha.abort();
    sheet.classList.remove("ph-open");
    /* remove 自己後即刻檢查：如果冇其他 sheet 仲開住 → 一併 remove backdrop */
    const anyOpen = document.querySelector("#view-home .ph-sheet.ph-open");
    if (!anyOpen) {
      const bd = document.querySelector("#view-home .ph-backdrop");
      if (bd) bd.classList.remove("ph-open");
    }
    setTimeout(() => {
      /* 雙重 rAF 確保 _openSheet 嘅 rAF ph-open 已跑完 */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const stillOpen = document.querySelector("#view-home .ph-sheet.ph-open");
        if (stillOpen) return; /* 合法 sheet 開住（user 真係想睇）→ skip，唔好 force close */
        /* 真係冇任何 sheet 開住 → 清理所有已關閉 sheet + backdrop */
        const bd = document.querySelector("#view-home .ph-backdrop");
        if (bd) bd.hidden = true;
        document.querySelectorAll("#view-home .ph-sheet").forEach(s => {
          if (!s.classList.contains("ph-open")) {
            s.hidden = true;
            this._unmountSheetView(s);
          }
        });
      }));
    }, 430);
  },
  _closeAllSheets() {
    const sheets = document.querySelectorAll("#view-home .ph-sheet");
    /* 同 _closeSheet 一致：gacha sheet 關閉前要 abort（收埋結算卡／場景 overlay、恢復 BGM） */
    if (typeof Gacha !== "undefined" && document.getElementById("sheet-gacha")?.classList.contains("ph-open")) Gacha.abort();
    sheets.forEach(s => s.classList.remove("ph-open"));
    const bd = document.querySelector("#view-home .ph-backdrop");
    if (bd) bd.classList.remove("ph-open");
    setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const stillOpen = document.querySelector("#view-home .ph-sheet.ph-open");
        if (stillOpen) return; /* binder 410ms 後開咗新 sheet → skip */
        sheets.forEach(s => {
          if (!s.classList.contains("ph-open")) {
            s.hidden = true;
            this._unmountSheetView(s);
          }
        });
        if (bd) bd.hidden = true;
      }));
    }, 430);
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
  /* 移除：舊時逐個 close 完再 closeAll → 會雙 timer race。
   * 所有 close 路徑（_closeSheet / _closeAllSheets）都有自己嘅 stillOpen guard timer */
  _checkCloseAllSheets() {},
  _bindSheetBtn(btnId, sheetId) {
    const btn = document.getElementById(btnId);
    if (btn) btn.onclick = () => { /* 子 onclick 會覆寫，但保留 default handler 如果子冇覆蓋 */ };
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
  },

  /* ---------- Modal / Toast ---------- */
  showModal(html, noClose) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal-card">${html}</div></div>`;
    if (!noClose) {
      root.querySelector(".modal-backdrop").onclick = (e) => {
        if (e.target === e.currentTarget) this.closeModal();
      };
    }
  },

  closeModal() {
    if (this._sfxPreviewTimer) { clearTimeout(this._sfxPreviewTimer); this._sfxPreviewTimer = null; }
    if (window.CaptureScene && CaptureScene.audio && CaptureScene.audio.stopPreviewSfx) {
      CaptureScene.audio.stopPreviewSfx();
    }
    document.getElementById("modal-root").innerHTML = "";
    if (typeof Pokedex !== "undefined" && Pokedex._setDexBackMode) Pokedex._setDexBackMode("grid");
  },

  /* 同步狀態 banner：唔會靜靜消失，要俾用戶自己 dismiss */
  showSyncBanner(msg, isError) {
    const el = document.getElementById("sync-banner");
    if (!el) return;
    el.className = "sync-banner" + (isError ? " sync-error" : "");
    el.innerHTML = `<span>${escapeHTML(msg)}</span><button id="sync-banner-x">OK</button>`;
    document.getElementById("sync-banner-x").onclick = () => el.classList.add("hidden");
  },

  toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  },

  /* ---------- 初始化 ---------- */
  async init() {
    const st = loadState();
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
          }, 410);
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
        const st = loadState();
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
    const dockBinder = (id, sheetId, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onclick = () => {
        if (App._sheetSwitching) return;

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
          }, 410);
        } else {
          fn();
        }
      };
    };
    dockBinder("btn-bd-battle", "sheet-battle", () => this._openSheet("sheet-battle"));
    dockBinder("btn-bd-leaderboard", null, () => { if (typeof Leaderboard !== "undefined") Leaderboard.open(); });
    dockBinder("btn-bd-friends", null, () => { if (typeof Friends !== "undefined") Friends.open(); });
    dockBinder("btn-bd-setting", "sheet-setting", () => this._openSheet("sheet-setting"));

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
      /* ✕ 確認窗開住：Enter = Keep learning */
      const stayBtn = document.getElementById("quiz-quit-stay");
      if (stayBtn) { e.preventDefault(); stayBtn.click(); return; }
      /* 設定彈窗開住：Enter = 確認 Quit this set（經按鈕，會一併關窗） */
      const quitBtn = document.getElementById("quiz-settings-quit");
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
      /* Home P1 sheet 優先：任何 ph-sheet 開住 → 先關 */
      const openSheets = document.querySelectorAll("#view-home .ph-sheet.ph-open");
      if (openSheets.length) {
        e.preventDefault();
        App._closeAllSheets();
        return;
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

    /* 日曆 */
    document.getElementById("btn-cal-prev").onclick = () => Calendar.prev();
    document.getElementById("btn-cal-next").onclick = () => Calendar.next();

    /* 原本 showReview 需要知道來源 */
    const _origShowReview = this.showReview.bind(this);
    this.showReview = (from) => { this._reviewFrom = from || null; _origShowReview(); };

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

    /* 首屏已 render：等 loading 淡出走完（400ms）才做 OAuth 雲端合併，
       確保「Overwrite local progress?」確認窗浮喺正常畫面上，一定撳得到。 */
    if (this._needPostLogin) {
      this._needPostLogin = false;
      setTimeout(() => { this._postLogin(st); }, 600);
    }

    /* Login Gate：未登入 → 自動彈 Login Hub modal 擋住畫面 */
    const loggedIn = window.SupabaseAuth && SupabaseAuth.isLoggedIn();
    if (!loggedIn) {
      /* 等 loading 淡出後先彈 modal，避免 modal 被 loading overlay 遮住 */
      setTimeout(() => { this.openLoginHub(true); }, 500);
    }

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

    /* 全域 BGM（Flat Water）+ Entry Gate：
       1) 開頁即試播 —— PWA / 高互動用戶可直接出聲，唔彈窗
       2) Autoplay 被擋 → 彈 entry gate，撳 YES!（合法手勢）解鎖 + 播 BGM */
    const entryGate = document.getElementById("entry-gate");
    const unlockAudio = () => {
      if (window.CaptureScene && CaptureScene.audio) {
        CaptureScene.audio.ensure();
        CaptureScene.audio.bgmPrime();       /* 預先解鎖 + decode 戰鬥 BGM */
        CaptureScene.audio.startTownBGM();
      }
    };
    unlockAudio();  /* 開頁即試（可能被 suspend） */
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

      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then(reg => {
          /* 每次載入同返回頁面都檢查更新 */
          reg.update().catch(() => {});
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reg.update().catch(() => {});
          });
        })
        .catch(() => {});
    }
  },
};

/* 首屏 Loading overlay：載入完成後淡出移除。
   失敗或超時都一定要收走，唔可以永遠轉精靈球。 */
let _loadingDone = false;
function dismissLoading() {
  if (_loadingDone) return;
  _loadingDone = true;
  const el = document.getElementById("loading-screen");
  if (!el) return;
  el.classList.add("ld-out");
  setTimeout(() => el.remove(), 420);
}
function armLoadingWatchdog() {
  setTimeout(() => {
    if (_loadingDone) return;
    const sub = document.getElementById("loading-sub");
    if (sub) sub.textContent = "Still loading… tap here to retry";
    const el = document.getElementById("loading-screen");
    if (el) el.addEventListener("click", () => location.reload(), { once: true });
  }, 20000);
}

document.addEventListener("DOMContentLoaded", () => {
  armLoadingWatchdog();
  App.init().then(dismissLoading).catch((err) => {
    console.error("[boot] init failed", err);
    dismissLoading();
  });
});

/* 其他模組（friends.js / quests.js）用 window.App 判斷，補返個全域引用 */
window.App = App;
