/* ============================================================
   PokeEngmon - 扭蛋抽獎系統（v102 快龍拉手版）
   流程：拉動快龍隻手 ≥72%（即扣 3 寶石）→ 肚仔艙門打開
     → 跌出精靈球（稀有度決定球種）→ 金色背景 A 滾入
     → 搖 2 下懸念 → 按稀有度爆發 → 開球光柱 → 全屏檢視卡
   經濟結算沿用 v99/v101 server 權威（gacha_pull RPC），
   演出層完全解耦：中途離開只跳過動畫，獎勵照樣落地。
   ============================================================ */

/* 稀有度 → 球種 / 漏光 / 檢視卡光線色 */
const GACHA_BALL = {
  rare:   { cls: "ball-great",  glow: "leak-blue",    ray: "#7fb8ff", label: "RARE" },
  epic:   { cls: "ball-ultra",  glow: "leak-gold",    ray: "#c984ff", label: "EPIC" },
  legend: { cls: "ball-master", glow: "leak-rainbow", ray: "#ffc93c", label: "LEGENDARY" }
};
const GACHA_MAX_PULL = 150;     // 手臂最大下拉距離（px）
const GACHA_THRESHOLD = 0.72;   // 拉過 72% 即觸發，唔使放手
const GACHA_CHARGE_MS = 3000;      // 按住手杆幾耐先充滿 10 連
const GACHA_MULTI_THRESHOLD = 0.35; // 充滿後只需拉 35% 即發動
/* status bar 同款藍寶石 icon（dynamic 注入用，例如檢視卡按鈕） */
const GACHA_GEM_SVG = `<svg class="gem-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="#062036" stroke-width="1.6"/><circle cx="12" cy="12" r="10" fill="url(#gem-blue-gt)"/><ellipse cx="8" cy="7.5" rx="4" ry="2.5" fill="#ffffff" opacity="0.55"/><ellipse cx="15" cy="5.5" rx="1.8" ry="1" fill="#ffffff" opacity="0.45"/><ellipse cx="12" cy="18" rx="6" ry="1.5" fill="#000000" opacity="0.2"/></svg>`;

const Gacha = {
  mode: "rare",        // 淨返稀有抽（normal pull 已移除）
  busy: false,
  phase: "idle",       // idle | hand | opening | drop | sceneB | inspect
  _flowId: 0,          // 流程 token：離開頁面後作廢所有 pending timeout
  _flow: null,         // 當前流程（結算狀態綁喺 flow object，避免中斷污染其他流程）
  _timers: [],
  _bound: false,
  /* 拖拽狀態 */
  _dragging: false, _startY: 0, _curP: 0, _triggered: false, _lastCreak: 0,
  _sceneB: null,       // lazy 金色背景 A overlay（掛 body）
  _inspect: null,      // lazy 檢視卡 overlay（掛 body）
  _pendingEvolve: null,
  _pendingEvolves: [],  // 10 連可能一次過進化多隻
  _townStopped: false,
  /* 10 連充能狀態 */
  _charging: false, _charged: false, _chargeTimer: null, _chargeStart: 0,
  _holdStart: 0, _holdMs: 0, _suppressClick: false,
  /* 10 連結算 overlay */
  _multi: null, _multiResults: null, _multiMeta: null,

  open(mode) {
    this.mode = mode;
    this._townStopped = false;   /* 開場會即刻再停，避免 abort 先恢復再停嘅閃爍 */
    this.abort();      // 清走上次殘留；未結算就補結算，唔會「食咗鑽但冇派寵」
    App.openGachaSheet();
    this._bindArm();
    this._bindStageFit();
    this._resetStage();
    this._setCostChip(false);
    this._refreshControls();
    requestAnimationFrame(() => this._fitStage());
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
    const m = this._machine();
    if (m) m.classList.toggle("cant-afford", !afford);
    /* idle 待機提示：夠鑽就教拉手杆，唔夠就提住去賺 */
    if (this.phase === "idle" && !this._charging && !this._charged) {
      if (affordMulti) {
        this._prompt("⇣ DRAG FOR 1 PULL ・ HOLD 3s FOR 10×");
      } else {
        this._prompt(afford ? "⇣ DRAG DRAGONITE'S HAND ⇣" : "Not enough gems — earn more in quizzes!");
      }
    }
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

  _haptic(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
  },

  _audio() {
    return (window.CaptureScene && CaptureScene.audio) ? CaptureScene.audio : null;
  },

  _rm() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  _gsap() {
    return window.gsap || null;
  },

  _machine() {
    return document.getElementById("gacha-machine");
  },

  _arm() {
    return document.getElementById("dm-arm");
  },

  /* dev hook（只限 localhost）：覆寫視覺稀有度方便驗收，經濟結果不變 */
  _visualRarity(s) {
    const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (local && window.__gachaForceRarity && GACHA_BALL[window.__gachaForceRarity]) {
      return window.__gachaForceRarity;
    }
    return s.rarity;
  },

  /* ---------- 扣鑽 + 開獎 ----------
     v102 無按鈕版：拉動手杆過閾值 → _triggerPull 先調 _beginPull，
     即刻扣 3 寶石 + server 抽獎背景進行；波球跌出前先結算，
     之後所有演出純視覺，中途離開只會跳過動畫。 */
  _beginPull() {
    if (this.busy || !this._canPull()) return false;
    this.busy = true;
    Pokedex.unlockAudio();   // 喺用戶手勢內解鎖音效（手機自動播放限制）
    const audio = this._audio();
    if (audio) {
      audio.ensure();
      audio.stopTownBGM(500);
      this._townStopped = true;
    }

    /* v99：登入時走 server 權威抽獎 —— gacha_pull RPC 原子扣鑽 +
       server 自己 roll rarity/chain + 拎寵，防止 client 改機率/必中神獸。
       失敗或未登入 → 結算時用本地 path 頂上。 */
    const authed = window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser();
    const st = loadState();

    this._clearTimers();
    this._flow = {
      id: ++this._flowId,
      rpc: authed ? SupabaseAuth.gachaPull(st.pendingExp || 0, st.unlockedGen || 1).catch(() => null) : null,
      settled: false,
      settling: null,
      settlement: null
    };

    this._refreshControls();
    return true;
  },

  /* 經濟結算：扣鑽 + 派寵一次過落地，同演出完全解耦。
     server 有結果用 server 權威數據，否則行本地 fallback。 */
  async _settleResult(flow) {
    if (!flow) return null;
    if (flow.settled) return flow.settlement;
    if (flow.settling) return flow.settling;   // 同一 flow 只結算一次

    flow.settling = (async () => {
      let r = null;
      if (flow.rpc) {
        flow.rpcPending = true;
        flow.rpc.then(() => { flow.rpcPending = false; });
        await Promise.resolve();
        /* 仲等緊 server 先用「…」頂住，避免玩家以為流程卡死 */
        if (flow.rpcPending && flow.id === this._flowId) this._prompt("…");
        r = await flow.rpc;
        if (flow.id === this._flowId) this._prompt("");
      }

      const st = loadState();
      let rarity, chainKey, entry, isDupe, candyGain = 0;
      let firstExpEvolve = null;
      let newlyUnlockedGen = null;

      if (r && r.entry) {
        /* server path：扣鑽 / rarity / dupe 已由 gacha_pull RPC 完成 */
        st.diamonds = r.balance;          // server 權威餘額（已扣 3 鑽）
        saveState();
        rarity = r.rarity;
        chainKey = r.entry.chain_key;
        const hadEntries = st.entries.length > 0;
        const genBefore = st.unlockedGen || 1;
        entry = adoptServerEntry(r.entry);
        const genAfter = loadState().unlockedGen || 1;
        if (genAfter > genBefore) newlyUnlockedGen = genAfter;
        isDupe = r.is_dupe;
        candyGain = isDupe ? 1 : 0;       // 稀有抽 dupe 必送 1 糖（server 已入帳）
        if (st.pendingExp > 0) {
          if (!hadEntries && !isDupe) {
            /* 第一隻寵：server init_exp 已入帳 → 本地清零 */
            st.pendingExp = 0;
            saveState();
            if (entry.stage > 1) firstExpEvolve = SPECIES[entryCurrentSpecies(entry)[0]];
          } else {
            /* server 冇 apply init_exp（唔係第一隻）→ 本地入帳 + 背景補 RPC */
            const pending = st.pendingExp;
            const res = addEntryExp(entry, pending);
            st.pendingExp = 0;
            (res.learned || []).forEach(m => {
              if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
            });
            saveState();
            firstExpEvolve = res.evolvedTo;
            if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
              SupabaseAuth.addEntryExp(entry.uid, pending);
              if (res.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
                Sync.patchEntry(entry.uid, { branch: entry.branch });
              }
            }
          }
        }
      } else {
        /* v140：已登入且 RPC 已試過但失敗 → 唔好本地假成功（否則 pull 會打回頭，寵／鑽「消失」）
           匿名／真離線（冇發起 RPC）先至走本地 fallback */
        const attemptedRpc = !!flow.rpc;
        const loggedIn = !!(window.SupabaseAuth && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn());
        if (loggedIn && attemptedRpc) {
          flow.settled = true;
          flow.settlement = null;
          return null;
        }
        /* 本地 fallback（匿名／離線） */
        rarity = this.rollRarity(this.mode);
        chainKey = this.pickChain(rarity);
        if (!chainKey) {
          /* 該世代呢個稀有度冇鏈（理論上唔會發生）→ 退款兼中止 */
          flow.settled = true;
          flow.settlement = null;
          return null;
        }
        st.diamonds -= GAME_CONFIG.RARE_PULL_COST;
        saveState();
        const got = obtainPokemon(chainKey, this.mode);
        entry = got.entry;
        isDupe = got.isDupe;
        candyGain = got.candyGain || 0;
        newlyUnlockedGen = got.newlyUnlockedGen || null;

        /* 若有之前儲起嘅經驗值（第一次未有拍檔時），一次過入帳
           v138：必須先 snapshot pending，再清零——舊碼清零後 RPC 永遠傳 0 */
        if (st.pendingExp > 0) {
          const pending = st.pendingExp;
          const res = addEntryExp(entry, pending);
          st.pendingExp = 0;
          (res.learned || []).forEach(m => {
            if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
          });
          saveState();
          firstExpEvolve = res.evolvedTo;
          if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
            SupabaseAuth.addEntryExp(entry.uid, pending);
            if (res.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
              Sync.patchEntry(entry.uid, { branch: entry.branch });
            }
          }
        }
      }

      flow.settled = true;
      flow.settlement = { rarity, chainKey, entry, isDupe, candyGain, firstExpEvolve, newlyUnlockedGen };

      /* 預先載入叫聲，出卡時即刻叫（v102 起：新舊寵都播） */
      const preview = EVOLUTION_CHAINS.find(c => c.key === chainKey);
      if (preview) Pokedex.prepareCry(preview.stages[0][0]);

      this._updateDiamondDisplay();
      return flow.settlement;
    })();

    try {
      return await flow.settling;
    } finally {
      flow.settling = null;
    }
  },

  /* ============================================================
     10 連抽：按住手杆 3 秒充能 → 拉落 → 10 連
     ============================================================ */

  _setCostChip(multi) {
    const el = document.getElementById("gacha-cost");
    if (!el) return;
    el.classList.toggle("multi", !!multi);
    const cost = multi ? GAME_CONFIG.MULTI_PULL_COST : GAME_CONFIG.RARE_PULL_COST;
    el.innerHTML = `Cost: ${GACHA_GEM_SVG} ×${cost}` +
      (multi ? `<span class="gc-10x">10×</span>` : "");
  },

  _startCharge() {
    if (this.phase !== "idle" || this._charging || this._charged) return;
    this._charging = true;
    this._chargeStart = performance.now();
    const m = this._machine();
    if (m) m.classList.add("charging");
    this._setCostChip(true);
    this._prompt("CHARGING 10×… 0%");
    Pokedex.unlockAudio();
    const audio = this._audio();
    if (audio) audio.ensure();
    this._chargeTimer = this._setT(() => this._chargeComplete(), GACHA_CHARGE_MS);
    this._chargeTicker();
  },

  _chargeTicker() {
    if (!this._charging) return;
    const p = Math.min(1, (performance.now() - this._chargeStart) / GACHA_CHARGE_MS);
    const audio = this._audio();
    if (audio && p < 1) audio.chargeTick(p);
    if (this.phase === "idle" && this._charging) {
      this._prompt(`CHARGING 10×… ${Math.round(p * 100)}%`);
    }
    if (this._charging) this._setT(() => this._chargeTicker(), 260);
  },

  _chargeComplete() {
    this._chargeTimer = null;
    if (!this._charging) return;
    if (!this._canMultiPull()) {
      /* 唔夠 30 鑽：唔會進入 charged，等玩家知要儲幾多 */
      this._cancelCharge();
      this._prompt(`Need ${GAME_CONFIG.MULTI_PULL_COST} gems for 10×`);
      this._haptic(40);
      return;
    }
    this._charging = false;
    this._charged = true;
    const m = this._machine();
    if (m) {
      m.classList.remove("charging");
      m.classList.add("charged");
    }
    this._setCostChip(true);
    this._refreshControls();
    this._prompt("READY! PULL DOWN FOR 10×");
    const pr = document.getElementById("gacha-prompt");
    if (pr) pr.classList.add("almost");
    const audio = this._audio();
    if (audio) audio.chargeReady();
    this._haptic([20, 30, 20]);
  },

  _cancelCharge() {
    if (this._chargeTimer) {
      clearTimeout(this._chargeTimer);
      this._chargeTimer = null;
    }
    const was = this._charging || this._charged;
    this._charging = false;
    this._charged = false;
    const m = this._machine();
    if (m) m.classList.remove("charging", "charged");
    if (was) {
      this._setCostChip(false);
      this._prompt("");
    }
  },

  _beginMultiPull() {
    if (this.busy || !this._canMultiPull()) return false;
    this.busy = true;
    Pokedex.unlockAudio();
    const audio = this._audio();
    if (audio) {
      audio.ensure();
      audio.stopTownBGM(500);
      this._townStopped = true;
    }
    const authed = !!(window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser());
    const st = loadState();
    this._clearTimers();
    this._flow = {
      id: ++this._flowId,
      multi: true,
      authed,
      gen: st.unlockedGen || 1,
      pendingExp: st.pendingExp || 0,
      settled: false,
      settling: null,
      settlement: null
    };
    this._refreshControls();
    return true;
  },

  /* 10 連經濟結算：9 次普通 + 最後 1 次保底，同演出解耦。
     server 權威優先；匿名／離線才走本地 fallback。 */
  async _settleMulti(flow) {
    if (!flow) return null;
    if (flow.settled) return flow.settlement;
    if (flow.settling) return flow.settling;

    flow.settling = (async () => {
      const count = GAME_CONFIG.MULTI_PULL_COUNT;
      const results = [];
      let pending = flow.pendingExp || 0;
      let balance = null;

      if (flow.authed) {
        for (let i = 0; i < count; i++) {
          if (flow.id === this._flowId) this._prompt(`OPENING ${i + 1}/${count}…`);
          const isLast = i === count - 1;
          let r = null;
          try {
            r = isLast
              ? await SupabaseAuth.gachaPullLucky(flow.gen)
              : await SupabaseAuth.gachaPull(i === 0 ? pending : 0, flow.gen);
          } catch (e) {
            r = null;
          }
          if (!r || !r.entry) {
            /* v140：已登入但 RPC 失敗 → 唔本地假派；已落地嘅抽數保留 */
            if (flow.id === this._flowId) this._prompt("");
            flow.settled = true;
            flow.settlement = null;
            return null;
          }
          pending = 0;
          balance = r.balance;
          const s = this._applyServerPull(r, i === 0);
          if (s) results.push(s);
        }
      } else {
        /* 本地 fallback：先確認第 10 抽有保底鏈，避免扣完鑽才失敗 */
        const lucky = this._pickLuckyChainLocal(flow.gen);
        if (!lucky.key) {
          flow.settled = true;
          flow.settlement = null;
          return null;
        }
        const st0 = loadState();
        st0.diamonds = Math.max(0, st0.diamonds - GAME_CONFIG.MULTI_PULL_COST);
        saveState();
        balance = st0.diamonds;
        for (let i = 0; i < count; i++) {
          if (flow.id === this._flowId) this._prompt(`OPENING ${i + 1}/${count}…`);
          let rarity, chainKey;
          if (i === count - 1) {
            rarity = lucky.rarity;
            chainKey = lucky.key;
          } else {
            rarity = this.rollRarity(this.mode);
            chainKey = this.pickChain(rarity);
            if (!chainKey) {
              rarity = "rare";
              chainKey = this.pickChain("rare");
            }
          }
          if (!chainKey) {
            flow.settled = true;
            flow.settlement = null;
            return null;
          }
          const s = this._applyLocalPull(chainKey, rarity, i === 0);
          if (s) results.push(s);
        }
      }

      if (flow.id === this._flowId) this._prompt("");
      const evolves = results.map(s => s.firstExpEvolve).filter(Boolean);
      const newlyUnlockedGen = results.reduce(
        (mx, s) => (s.newlyUnlockedGen && s.newlyUnlockedGen > mx ? s.newlyUnlockedGen : mx), null);
      flow.settled = true;
      flow.settlement = { results, evolves, newlyUnlockedGen, balance };
      this._updateDiamondDisplay();
      return flow.settlement;
    })();

    try {
      return await flow.settling;
    } finally {
      flow.settling = null;
    }
  },

  /* server 單抽結果落地（沿用單抽 server path 的規則） */
  _applyServerPull(r, applyPending) {
    const st = loadState();
    st.diamonds = r.balance;
    saveState();
    const rarity = r.rarity;
    const chainKey = r.entry.chain_key;
    const hadEntries = st.entries.length > 0;
    const genBefore = st.unlockedGen || 1;
    const entry = adoptServerEntry(r.entry);
    const genAfter = loadState().unlockedGen || 1;
    const newlyUnlockedGen = genAfter > genBefore ? genAfter : null;
    const isDupe = !!r.is_dupe;
    const candyGain = isDupe ? 1 : 0;
    let firstExpEvolve = null;

    if (applyPending && st.pendingExp > 0) {
      if (!hadEntries && !isDupe) {
        st.pendingExp = 0;
        saveState();
        if (entry.stage > 1) firstExpEvolve = SPECIES[entryCurrentSpecies(entry)[0]];
      } else {
        const pending = st.pendingExp;
        const res = addEntryExp(entry, pending);
        st.pendingExp = 0;
        (res.learned || []).forEach(m => {
          if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
        });
        saveState();
        firstExpEvolve = res.evolvedTo;
        if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
          SupabaseAuth.addEntryExp(entry.uid, pending);
          if (res.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
            Sync.patchEntry(entry.uid, { branch: entry.branch });
          }
        }
      }
    }

    const preview = EVOLUTION_CHAINS.find(c => c.key === chainKey);
    if (preview) Pokedex.prepareCry(preview.stages[0][0]);
    return { rarity, chainKey, entry, isDupe, candyGain, firstExpEvolve, newlyUnlockedGen };
  },

  /* 本地單抽結果落地（匿名／離線） */
  _applyLocalPull(chainKey, rarity, applyPending) {
    const got = obtainPokemon(chainKey, this.mode);
    if (!got) return null;
    const entry = got.entry;
    const isDupe = got.isDupe;
    const candyGain = got.candyGain || 0;
    const newlyUnlockedGen = got.newlyUnlockedGen || null;
    let firstExpEvolve = null;
    const st = loadState();

    if (applyPending && st.pendingExp > 0) {
      const pending = st.pendingExp;
      const res = addEntryExp(entry, pending);
      st.pendingExp = 0;
      (res.learned || []).forEach(m => {
        if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
      });
      saveState();
      firstExpEvolve = res.evolvedTo;
      if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
        SupabaseAuth.addEntryExp(entry.uid, pending);
        if (res.evolvedTo && entry.branch != null && window.Sync && Sync.isEnabled()) {
          Sync.patchEntry(entry.uid, { branch: entry.branch });
        }
      }
    }
    return { rarity, chainKey, entry, isDupe, candyGain, firstExpEvolve, newlyUnlockedGen };
  },

  /* 本地保底：50/50 legend / epic，優先「未持有」，排除 normal */
  _pickLuckyChainLocal(gen) {
    const st = loadState();
    const owned = new Set((st.entries || []).map(e => e.chainKey));
    const order = Math.random() < 0.5 ? ["legend", "epic"] : ["epic", "legend"];
    for (const rar of order) {
      const pool = pullablePool(gen, rar) || [];
      if (!pool.length) continue;
      const fresh = pool.filter(k => !owned.has(k));
      const list = fresh.length ? fresh : pool;
      return { rarity: rar, key: list[Math.floor(Math.random() * list.length)] };
    }
    return { rarity: "rare", key: this.pickChain("rare") };
  },

  /* 拉過閾值：扣 30 寶石 → 手臂回彈 → 開艙 → 等結算 → 10 球跌出 */
  async _triggerMultiPull() {
    if (this._triggered) return;
    if (!this._beginMultiPull()) {
      this._refreshControls();
      const g0 = this._gsap();
      if (g0 && !this._rm()) {
        const proxy0 = { p: this._curP };
        g0.to(proxy0, { p: 0, duration: .5, ease: "elastic.out(1,.45)", onUpdate: () => this._setPull(proxy0.p) });
      } else {
        this._setPull(0);
      }
      return;
    }
    const flow = this._flow;
    this._triggered = true;
    this._dragging = false;
    this._holdMs = 0;
    this._suppressClick = true;
    this._charging = false;
    this._charged = false;
    this.phase = "opening";
    this._setCostChip(true);
    document.getElementById("view-gacha").classList.add("playing");
    const fid = flow.id;
    const machine = this._machine();
    machine.classList.remove("dragging", "charging", "charged");
    this._prompt("");
    const audio = this._audio();
    if (audio) audio.pullSnap();
    this._haptic([20, 40, 20]);

    const g = this._gsap();
    if (g && !this._rm()) {
      const proxy = { p: this._curP };
      g.to(proxy, { p: 0, duration: .3, ease: "power3.out", onUpdate: () => this._setPull(proxy.p) });
    } else {
      this._setPull(0);
    }

    this._spdBegin();
    this._setT(() => {
      if (fid !== this._flowId) return;
      machine.classList.add("belly-open");
      if (audio) audio.bellyOpen();
      this._haptic([30, 40, 30]);
    }, 180);

    let s = null;
    try {
      s = await this._settleMulti(flow);
    } catch (err) {
      console.error("[Gacha] 10× settlement failed", err);
    }
    if (!s) {
      if (fid === this._flowId) {
        this.busy = false;
        this._flow = null;
        this._resetStage();
        this._setCostChip(false);
        this._refreshControls();
        this._prompt("Something went wrong — try again.");
      }
      return;
    }
    if (fid !== this._flowId) return;

    this._setT(() => { if (fid === this._flowId) this._dropBalls(flow, s.results); }, 600);
  },

  /* 10 球跌出：由肚仔彈到 5×2 tray */
  _dropBalls(flow, results) {
    this.phase = "drop";
    const fid = flow.id;
    const dz = document.getElementById("gacha-dropzone");
    const belly = document.getElementById("dm-belly");
    if (!dz || !belly || !results.length) return;

    const bRect = belly.getBoundingClientRect();
    const dzRect = dz.getBoundingClientRect();
    const size = 34, gap = 8, cols = 5;
    const rows = Math.ceil(results.length / cols);
    const gridW = cols * size + (cols - 1) * gap;
    const gridH = rows * size + (rows - 1) * gap;
    const baseX = (dzRect.width - gridW) / 2;
    const baseY = dzRect.height - gridH - 12;
    const sx = bRect.left - dzRect.left + bRect.width / 2 - size / 2;
    const sy = bRect.top - dzRect.top + bRect.height * .28;
    const g = this._gsap();

    results.forEach((s, i) => {
      const cfg = GACHA_BALL[this._visualRarity(s)] || GACHA_BALL.rare;
      const ball = document.createElement("div");
      ball.className = `eject-ball mini pokeball ${cfg.cls}`;
      ball.innerHTML = this._ballHTML();
      ball.style.left = sx + "px";
      ball.style.top = sy + "px";
      ball.style.width = size + "px";
      ball.style.height = size + "px";
      dz.appendChild(ball);
      const col = i % cols, row = Math.floor(i / cols);
      const tx = baseX + col * (size + gap) - sx;
      const ty = baseY + row * (size + gap) - sy;
      if (g && !this._rm()) {
        g.to(ball, {
          x: tx, y: ty, opacity: 1, rotation: 360,
          duration: .5, delay: i * .05, ease: "bounce.out"
        });
      } else {
        ball.style.transform = `translate(${tx}px, ${ty}px)`;
        ball.style.opacity = "1";
      }
    });

    const audio = this._audio();
    this._setT(() => { if (audio) audio.ballLand(); }, 450);
    this._setT(() => {
      if (fid !== this._flowId) return;
      this._openSceneBMulti(flow, results);
    }, 900 + results.length * 50);
  },

  /* 背景 A 10 連版：5×2 精靈球 */
  _openSceneBMulti(flow, results) {
    this.phase = "sceneB";
    const fid = flow.id;
    const sc = this._ensureSceneB();
    if (window.AnimSpeed) AnimSpeed.badge(sc, this._spd || 1);
    const wrap = sc.querySelector(".gsb-ball-wrap");
    const particles = sc.querySelector(".gsb-particles");
    const prompt = sc.querySelector(".gsb-prompt");

    sc.classList.remove("hidden");
    requestAnimationFrame(() => sc.classList.add("show"));

    particles.innerHTML = "";
    if (!this._rm()) {
      for (let i = 0; i < 24; i++) {
        const sp = document.createElement("span");
        sp.style.left = (Math.random() * 100) + "%";
        sp.style.animationDuration = (5 + Math.random() * 7) + "s";
        sp.style.animationDelay = (-Math.random() * 8) + "s";
        sp.style.transform = "scale(" + (0.5 + Math.random()) + ")";
        particles.appendChild(sp);
      }
    }

    prompt.textContent = "10 POKÉMON INCOMING…";
    wrap.classList.remove("roll-in");
    wrap.style.transform = "";
    wrap.innerHTML = `<div class="gsb-multi">` + results.map(s => {
      const cfg = GACHA_BALL[this._visualRarity(s)] || GACHA_BALL.rare;
      return `<div class="pokeball ${cfg.cls}">${this._ballHTML()}</div>`;
    }).join("") + `</div>`;

    const audio = this._audio();
    if (audio) audio.ballRoll();

    const balls = wrap.querySelectorAll(".pokeball");
    this._setT(() => {
      if (fid !== this._flowId) return;
      this._sceneBTimelineMulti(flow, results, balls);
    }, this._rm() ? 300 : 750);
  },

  /* 逐粒揭示：rare → epic → legend */
  _sceneBTimelineMulti(flow, results, balls) {
    const fid = flow.id;
    const sc = this._sceneB;
    const rings = sc.querySelector(".gsb-rings");
    const flash = sc.querySelector(".gsb-flash");
    const prompt = sc.querySelector(".gsb-prompt");
    const audio = this._audio();
    const rank = { rare: 0, epic: 1, legend: 2 };
    const order = results
      .map((s, i) => ({ s, i, r: rank[this._visualRarity(s)] || 0 }))
      .sort((a, b) => a.r - b.r);
    const k = this._rm() ? .35 : 1;

    const pop = (item) => {
      const b = balls[item.i];
      if (!b || !document.body.contains(b)) return;
      b.classList.remove("wob"); void b.offsetWidth;
      b.classList.add("wob");
      if (audio) audio.wobble(1);
      this._setT(() => {
        if (!document.body.contains(b)) return;
        b.classList.add("open", "revealed");
        if (audio) audio.ballLand();
        const rarity = this._visualRarity(item.s);
        if (rarity === "epic" || rarity === "legend") {
          flash.classList.remove("on", "big"); void flash.offsetWidth;
          flash.classList.add("on");
          if (rarity === "legend") flash.classList.add("big");
          const g = this._gsap();
          if (g && !this._rm()) {
            g.fromTo(sc, { x: rarity === "legend" ? -8 : -4 },
              { x: 0, duration: .45, ease: "elastic.out(1.2,.3)",
                onComplete: () => { sc.style.transform = ""; } });
          }
          if (rarity === "legend" && audio) audio.upgradeSting(2);
          this._haptic(rarity === "legend" ? [30, 50, 50] : [16]);
        }
        const n = rarity === "legend" ? 3 : 1;
        for (let j = 0; j < n; j++) {
          const r = document.createElement("i");
          r.className = "gsb-ring";
          r.style.borderColor = rarity === "legend" ? "#ffe28a" : "#d8a4ff";
          r.style.animationDelay = (j * .1 / (this._spd || 1)) + "s";
          rings.appendChild(r);
          this._setT(() => r.remove(), 1200);
        }
      }, 260 * k);
    };

    prompt.textContent = "REVEALING…";
    order.forEach((item, idx) => {
      this._setT(() => {
        if (fid !== this._flowId) return;
        pop(item);
      }, (400 + idx * 240) * k);
    });

    this._setT(() => {
      if (fid !== this._flowId) return;
      prompt.textContent = "";
      this._revealMultiResults(flow, results);
    }, (400 + order.length * 240 + 900) * k);
  },

  _revealMultiResults(flow, results) {
    this.phase = "inspect";
    this._flow = null;
    this._spdEnd();
    const sc = this._sceneB;
    if (sc) sc.classList.remove("show");
    const meta = flow.settlement || {};
    this._pendingEvolves = (meta.evolves || []).slice();
    if (meta.newlyUnlockedGen) App._pendingGenUnlock = meta.newlyUnlockedGen;

    this._setT(() => {
      if (sc) sc.classList.add("hidden");
      this._fillMultiResults(results, meta);
      const el = this._ensureMulti();
      el.classList.remove("hidden");
      requestAnimationFrame(() => el.classList.add("show"));
    }, 450);

    this.busy = false;
    this._refreshControls();
    App.renderHome();
  },

  /* 10 連結算 overlay（lazy 建立，fixed 掛 body） */
  _ensureMulti() {
    if (this._multi) return this._multi;
    const el = document.createElement("div");
    el.id = "gacha-multi";
    el.className = "hidden";
    el.innerHTML = `
      <div class="gm-card">
        <button class="gm-close" type="button" aria-label="Close">✕</button>
        <div class="gm-title">LUCKY <span>10×</span></div>
        <div class="gm-summary"></div>
        <div class="gm-warn hidden"></div>
        <div class="gm-grid"></div>
        <div class="gm-actions">
          <button class="btn-big btn-primary gm-again" type="button"></button>
          <button class="btn-big btn-plain gm-done" type="button">DONE</button>
        </div>
      </div>
      <div class="gm-detail hidden">
        <div class="gi-card gm-detail-card"></div>
      </div>`;
    document.body.appendChild(el);
    /* 結算 overlay 掛喺 body（唔喺 sheet 入面）：click 必須阻止冒泡，
       否則 sheet 嘅「點外面關閉」handler 會誤關成個抽獎頁 */
    ["pointerdown", "pointerup", "click", "touchstart"].forEach(t => {
      el.addEventListener(t, e => e.stopPropagation());
    });
    el.querySelector(".gm-close").addEventListener("click", () => this._closeMulti());
    el.querySelector(".gm-done").addEventListener("click", () => this._closeMulti());
    el.querySelector(".gm-again").addEventListener("click", () => this._multiAgain());
    const det = el.querySelector(".gm-detail");
    det.addEventListener("click", e => {
      if (e.target === det) det.classList.add("hidden");
    });
    this._multi = el;
    return el;
  },

  _fillMultiResults(results, meta) {
    const el = this._ensureMulti();
    this._multiResults = results;
    this._multiMeta = meta || {};

    const counts = { legend: 0, epic: 0, rare: 0 };
    let newCount = 0;
    results.forEach(s => {
      counts[s.rarity] = (counts[s.rarity] || 0) + 1;
      if (!s.isDupe) newCount++;
    });
    const summary = [];
    if (counts.legend) summary.push(`<span class="gm-stat legend">★ LEGEND ×${counts.legend}</span>`);
    if (counts.epic) summary.push(`<span class="gm-stat epic">★ EPIC ×${counts.epic}</span>`);
    if (counts.rare) summary.push(`<span class="gm-stat rare">RARE ×${counts.rare}</span>`);
    summary.push(`<span class="gm-stat new">${newCount} NEW</span>`);
    el.querySelector(".gm-summary").innerHTML = summary.join("");
    el.querySelector(".gm-warn").classList.add("hidden");

    const grid = el.querySelector(".gm-grid");
    grid.innerHTML = results.map((s, i) => {
      const cur = entryCurrentSpecies(s.entry);
      const dex = cur[0];
      const stars = s.rarity === "legend" ? "★★★" : s.rarity === "epic" ? "★★" : "★";
      return `<button class="gm-cell" type="button" data-rarity="${s.rarity}" data-idx="${i}">
        <span class="gm-badge ${s.isDupe ? "dupe" : "new"}">${s.isDupe ? "DUPE" : "NEW"}</span>
        <img src="${artworkURL(dex)}" alt="${cur[1]}" onerror="this.onerror=null;this.src='${spriteURL(dex)}'">
        <span class="gm-name">${cur[1]}</span>
        <span class="gm-meta">Lv.${s.entry.level} ${stars}</span>
      </button>`;
    }).join("");
    grid.onclick = (e) => {
      const cell = e.target.closest(".gm-cell");
      if (cell && this._multiResults) this._showMultiDetail(+cell.dataset.idx);
    };

    el.querySelector(".gm-detail").classList.add("hidden");
    this._refreshMultiAgainButton();
  },

  _showMultiDetail(idx) {
    const s = this._multiResults && this._multiResults[idx];
    if (!s) return;
    const el = this._multi;
    const det = el.querySelector(".gm-detail");
    const card = det.querySelector(".gm-detail-card");
    const rarity = this._visualRarity(s);
    const cfg = GACHA_BALL[rarity] || GACHA_BALL.rare;
    const entry = s.entry;
    const cur = entryCurrentSpecies(entry);
    const dex = cur[0];
    const dexEntry = dexOf(dex);
    const types = (dexEntry && dexEntry.types) || [];
    const stats = statsForEntry(entry);
    const stars = rarity === "legend" ? "★★★" : rarity === "epic" ? "★★" : "★";

    card.innerHTML = `
      <span class="gi-rarity">${cfg.label}</span>
      <img class="gi-art" alt="${cur[1]}" src="${artworkURL(dex)}" onerror="this.onerror=null;this.src='${spriteURL(dex)}'">
      <div class="gi-name">${cur[1]}</div>
      <div class="gi-meta">No.${String(dex).padStart(3, "0")} ・ Lv.${entry.level} ・ ${stars}</div>
      <div class="gi-types">${types.map(t =>
        `<span class="gi-type" style="background:${typeColor(t)}"><img src="${typeIconURL(t)}" alt="" onerror="this.remove()">${typeLabel(t).toUpperCase()}</span>`
      ).join("")}</div>
      <div class="gi-stats">${stats
        ? STAT_KEYS.map(k2 => `<div class="gi-stat"><b>${stats[k2]}</b><span>${STAT_LABELS[k2]}</span></div>`).join("")
        : ""}</div>
      <div class="gi-note ${s.isDupe ? "" : "new"}">${s.isDupe
        ? `Already have it! ⚡ EV point +1${s.candyGain ? " ・ 🍬 Candy +1" : ""}`
        : "NEW! Registered to your Pokédex."}</div>`;
    const chip = card.querySelector(".gi-rarity");
    if (chip) {
      if (rarity === "epic") chip.style.background = "#b26be0";
      else if (rarity === "legend") {
        chip.style.background = "linear-gradient(180deg,#ffd970,#e09a12)";
        chip.style.color = "#5a3a00";
      }
    }
    det.classList.remove("hidden");
    try { Pokedex.playCry(dex); } catch (e) { /* audio unavailable */ }
  },

  _refreshMultiAgainButton() {
    if (!this._multi) return;
    const btn = this._multi.querySelector(".gm-again");
    const st = loadState();
    const cost = GAME_CONFIG.MULTI_PULL_COST;
    if (st.diamonds >= cost) {
      btn.disabled = false;
      btn.innerHTML = `${GACHA_GEM_SVG} ×${cost} ・ 10× AGAIN`;
    } else {
      btn.disabled = true;
      btn.innerHTML = `Need ${GACHA_GEM_SVG} ×${cost} (you have ${st.diamonds})`;
    }
  },

  _multiAgain() {
    if (this.busy || !this._canMultiPull()) {
      this._refreshMultiAgainButton();
      return;
    }
    const evolves = (this._pendingEvolves || []).slice();
    this._pendingEvolves = [];
    const evo = this._pendingEvolve;
    this._pendingEvolve = null;
    if (evo) evolves.unshift(evo);
    this._cleanupScene();
    this._flushEvolves(evolves);
    App.maybeShowGenUnlock();
    this._setPull(1);
    this._triggerMultiPull();
  },

  _closeMulti() {
    const evolves = (this._pendingEvolves || []).slice();
    this._pendingEvolves = [];
    const evo = this._pendingEvolve;
    this._pendingEvolve = null;
    if (evo) evolves.unshift(evo);
    this._cleanupScene();
    this._setCostChip(false);
    this._prompt("");
    this.phase = "idle";
    this._refreshControls();
    this._flushEvolves(evolves);
    App.maybeShowGenUnlock();
    App.renderHome();
  },

  /* 一次過揭示所有待播進化（逐個彈窗，上一個撳完先到下一個） */
  _flushEvolves(list) {
    const q = (list || []).filter(Boolean);
    if (!q.length) return;
    const show = (i) => {
      if (i >= q.length) return;
      App.showEvolveModal(q[i], () => show(i + 1));
    };
    show(0);
  },

  /* ============================================================
     v102 演出層：拉手杆（即扣 3 寶石）→ 肚開 → 跌球 → 背景 A → 檢視卡
     ============================================================ */

  /* 快龍 window 自適應：等 stage 填滿淨低空間後，按比例縮放機器，顯示全隻快龍 */
  _bindStageFit() {
    if (this._fitBound) return;
    this._fitBound = true;
    const stage = document.getElementById("gacha-stage");
    if (!stage) return;
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._fitStage());
      this._ro.observe(stage);
    } else {
      window.addEventListener("resize", () => this._fitStage());
    }
    const img = stage.querySelector(".dm-art");
    if (img && !img.complete) img.addEventListener("load", () => this._fitStage());
  },

  _fitStage() {
    const stage = document.getElementById("gacha-stage");
    const m = this._machine();
    if (!stage || !m) return;
    const img = m.querySelector(".dm-art");
    const ar = (img && img.naturalWidth && img.naturalHeight)
      ? img.naturalWidth / img.naturalHeight : (640 / 829);
    const prompt = document.getElementById("gacha-prompt");
    const cs = getComputedStyle(stage);
    const availH = stage.clientHeight - (prompt ? prompt.offsetHeight : 0)
      - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    /* 右側預留 ~30px 俾伸出機身嘅機械手臂 */
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 30;
    if (availH < 120 || availW < 120) return;   // sheet 未開好／太細：保持 CSS 預設
    m.style.width = Math.round(Math.min(availW, availH * ar)) + "px";
  },

  /* 手臂拖拽監聽（open() 綁一次，handler 內檢查 phase） */
  _bindArm() {
    if (this._bound) return;
    this._bound = true;
    const arm = this._arm();
    if (!arm) return;
    arm.addEventListener("pointerdown", e => this._onArmDown(e));
    arm.addEventListener("pointermove", e => this._onArmMove(e));
    arm.addEventListener("pointerup", e => this._onArmUp(e));
    arm.addEventListener("pointercancel", e => this._onArmUp(e));
    arm.addEventListener("keydown", e => {
      if (this.phase !== "idle") return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (e.repeat || this._dragging) return;
      /* 鍵盤長按 3 秒 = 10 連；短按放手 = 單抽 */
      this._dragging = true;
      this._triggered = false;
      this._holdStart = performance.now();
      this._suppressClick = false;
      Pokedex.unlockAudio();
      const audio = this._audio();
      if (audio) audio.ensure();
      this._startCharge();
    });
    arm.addEventListener("keyup", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (this.phase !== "idle") return;
      e.preventDefault();
      const holdMs = performance.now() - (this._holdStart || 0);
      this._dragging = false;
      if (this._charged) {
        this._triggerMultiPull();
      } else {
        this._cancelCharge();
        if (holdMs < 600 && !this.busy) this._tryAutoPull();
        else this._refreshControls();
      }
    });
    arm.addEventListener("click", () => {
      /* 長按放手會產生 click：吞咗佢，避免變成單抽 */
      if (this._suppressClick) { this._suppressClick = false; return; }
      if (this.phase !== "idle" || this._dragging || this._triggered || this._curP >= 0.05) return;
      this._tryAutoPull();
    });
  },

  _setPull(p) {
    this._curP = p;
    const m = this._machine();
    if (!m) return;
    m.style.setProperty("--pull", Math.round(p * GACHA_MAX_PULL) + "px");
    m.style.setProperty("--pullp", p.toFixed(3));
    const arm = this._arm();
    if (arm) arm.setAttribute("aria-valuenow", Math.round(p * 100));
    const pr = document.getElementById("gacha-prompt");
    if (pr && this.phase === "idle") pr.classList.toggle("almost", p > 0.5);
  },

  _onArmDown(e) {
    if (this.phase !== "idle" || this._dragging || this.busy) return;
    if (!this._canPull() && !this._canMultiPull()) {
      this._prompt("Not enough gems — earn more in quizzes!");
      this._haptic(30);
      return;
    }
    this._dragging = true;
    this._triggered = false;
    this._startY = e.clientY;
    this._suppressClick = false;
    this._holdStart = performance.now();
    try { this._arm().setPointerCapture(e.pointerId); } catch (_) { /* unsupported */ }
    this._machine().classList.add("dragging");
    this._prompt("");
    Pokedex.unlockAudio();   // 抓住手杆嗰刻解鎖音效
    const audio = this._audio();
    if (audio) audio.ensure();
    /* 按住即開始充能；3 秒內拉落 = 單抽，3 秒後拉落 = 10 連 */
    this._startCharge();
    e.preventDefault();
  },

  _onArmMove(e) {
    if (!this._dragging || this._triggered) return;
    const dy = Math.min(Math.max(e.clientY - this._startY, 0), GACHA_MAX_PULL);
    const p = dy / GACHA_MAX_PULL;
    /* 未充滿就真拖拽 = 單抽：即刻取消充能 */
    if (!this._charged && p > 0.10) this._cancelCharge();
    this._setPull(p);
    const now = performance.now();
    const audio = this._audio();
    if (audio && now - this._lastCreak > 80 && p > 0.05) {
      this._lastCreak = now;
      audio.pullCreak(p);
    }
    if (this._charged) {
      if (p >= GACHA_MULTI_THRESHOLD && this._canMultiPull()) this._triggerMultiPull();
      return;
    }
    if (p >= GACHA_THRESHOLD && this._canPull()) this._triggerPull();
  },

  _onArmUp() {
    if (!this._dragging) return;
    this._dragging = false;
    this._holdMs = performance.now() - (this._holdStart || 0);
    this._suppressClick = this._holdMs > 600;
    this._machine().classList.remove("dragging");
    if (this._triggered) return;
    /* 未拉落就放手 → 取消充能 + 未有 10 連 */
    this._cancelCharge();
    /* 未達標放手 → 彈簧回彈（未扣鑽），並還原待機提示 */
    const audio = this._audio();
    if (audio) audio.pullSnap();
    const g = this._gsap();
    if (g && !this._rm()) {
      const proxy = { p: this._curP };
      g.to(proxy, { p: 0, duration: .7, ease: "elastic.out(1,.45)", onUpdate: () => this._setPull(proxy.p) });
    } else {
      this._setPull(0);
    }
    this._refreshControls();
  },

  /* 單擊 / 鍵盤：檢查鑽石後自動拉到底（同拉手杆一樣會扣 3 寶石） */
  _tryAutoPull() {
    if (this.busy || this._charging || this._charged) return;
    if (!this._canPull()) {
      this._prompt("Not enough gems — earn more in quizzes!");
      this._haptic(30);
      return;
    }
    this._prompt("");
    this._autoPull();
  },

  /* 無障礙 / 單擊：自動拉到底觸發 */
  _autoPull() {
    const g = this._gsap();
    if (g && !this._rm()) {
      const proxy = { p: this._curP };
      g.to(proxy, { p: 1, duration: .45, ease: "power2.in",
        onUpdate: () => this._setPull(proxy.p),
        onComplete: () => this._triggerPull() });
    } else {
      this._setPull(1);
      this._triggerPull();
    }
  },

  /* 拉過閾值：扣 3 寶石開獎 → 手臂回彈 → 180ms 艙門開 → 等結算 → 600ms 跌球 */
  async _triggerPull() {
    if (this._triggered) return;
    /* 扣鑽 + 起 flow（server RPC 背景進行）；唔夠鑽就回彈唔扣 */
    if (!this._beginPull()) {
      this._refreshControls();
      const g0 = this._gsap();
      if (g0 && !this._rm()) {
        const proxy0 = { p: this._curP };
        g0.to(proxy0, { p: 0, duration: .5, ease: "elastic.out(1,.45)", onUpdate: () => this._setPull(proxy0.p) });
      } else {
        this._setPull(0);
      }
      return;
    }
    const flow = this._flow;
    this._triggered = true;
    this._dragging = false;
    this.phase = "opening";
    document.getElementById("view-gacha").classList.add("playing");
    const fid = flow.id;
    const machine = this._machine();
    machine.classList.remove("dragging");
    this._prompt("");
    const audio = this._audio();
    if (audio) audio.pullSnap();
    this._haptic(20);

    /* 手臂回彈 */
    const g = this._gsap();
    if (g && !this._rm()) {
      const proxy = { p: this._curP };
      g.to(proxy, { p: 0, duration: .3, ease: "power3.out", onUpdate: () => this._setPull(proxy.p) });
    } else {
      this._setPull(0);
    }

    /* 艙門打開 */
    this._spdBegin();
    this._setT(() => {
      if (fid !== this._flowId) return;
      machine.classList.add("belly-open");
      if (audio) audio.bellyOpen();
      this._haptic([30, 40, 30]);
    }, 180);

    /* 經濟結算：RPC 未完成時 _settleResult 會自己顯示「…」hold 狀態 */
    let s = null;
    try {
      s = await this._settleResult(flow);
    } catch (err) {
      console.error("[Gacha] settlement failed", err);
    }
    if (!s) {
      /* 結算失敗：解鎖 UI，唔可以卡死 */
      if (fid === this._flowId) {
        this.busy = false;
        this._flow = null;
        this._resetStage();
        this._refreshControls();
        this._prompt("Something went wrong — try again.");
      }
      return;
    }
    if (fid !== this._flowId) return;

    this._setT(() => { if (fid === this._flowId) this._dropBall(flow, s); }, 600);
  },

  _ballHTML() {
    return `<span class="pb-top"></span><span class="pb-bottom"></span><span class="pb-mid"></span><span class="pb-btn"></span><span class="pb-shine"></span>`;
  },

  /* 肚仔跌球：彈出 → 彈跳 → 滾走 → 入背景 A */
  _dropBall(flow, s) {
    this.phase = "drop";
    const fid = flow.id;
    const rarity = this._visualRarity(s);
    const cfg = GACHA_BALL[rarity];
    const dz = document.getElementById("gacha-dropzone");
    const belly = document.getElementById("dm-belly");
    if (!dz || !belly) return;

    const ball = document.createElement("div");
    ball.className = `eject-ball pokeball ${cfg.cls}`;
    ball.innerHTML = this._ballHTML();
    const bRect = belly.getBoundingClientRect();
    const dzRect = dz.getBoundingClientRect();
    ball.style.left = (bRect.left - dzRect.left + bRect.width / 2 - 32) + "px";
    ball.style.top = (bRect.top - dzRect.top + bRect.height * .3) + "px";
    dz.appendChild(ball);

    const audio = this._audio();
    /* 時間點對齊 ball-eject 1.7s：第一落點 ~38%（650ms）、滾動 ~68%（1160ms）、完結 1700ms */
    this._setT(() => { if (audio) audio.ballLand(); }, 650);
    this._setT(() => { if (audio) audio.ballRoll(); }, 1160);
    this._setT(() => {
      if (fid !== this._flowId) return;
      ball.remove();
      this._openSceneB(flow, s);
    }, 1750);
  },

  /* 背景 A overlay（lazy 建立，fixed 掛 body 避免 containing block 問題） */
  _ensureSceneB() {
    if (this._sceneB) return this._sceneB;
    const el = document.createElement("div");
    el.id = "gacha-scene-b";
    el.className = "hidden";
    el.innerHTML = `
      <div class="gsb-bg">
        <i class="gsb-wave w1"></i><i class="gsb-wave w2"></i><i class="gsb-wave w3"></i>
        <i class="gsb-horizon"></i>
        <div class="gsb-particles"></div>
      </div>
      <div class="gsb-spot"></div>
      <div class="gsb-stage">
        <div class="gsb-ball-wrap"></div>
        <div class="gsb-rings"></div>
        <div class="gsb-magic hidden"></div>
        <div class="gsb-beam"></div>
      </div>
      <div class="gsb-flash"></div>
      <div class="gsb-prompt"></div>`;
    document.body.appendChild(el);
    this._sceneB = el;
    return el;
  },

  _openSceneB(flow, s) {
    this.phase = "sceneB";
    const fid = flow.id;
    const rarity = this._visualRarity(s);
    const cfg = GACHA_BALL[rarity];
    const sc = this._ensureSceneB();
    if (window.AnimSpeed) AnimSpeed.badge(sc, this._spd || 1);
    const wrap = sc.querySelector(".gsb-ball-wrap");
    const particles = sc.querySelector(".gsb-particles");
    const prompt = sc.querySelector(".gsb-prompt");

    sc.classList.remove("hidden");
    requestAnimationFrame(() => sc.classList.add("show"));

    /* 上升金粉粒子 */
    particles.innerHTML = "";
    if (!this._rm()) {
      for (let i = 0; i < 22; i++) {
        const sp = document.createElement("span");
        sp.style.left = (Math.random() * 100) + "%";
        sp.style.animationDuration = (5 + Math.random() * 7) + "s";
        sp.style.animationDelay = (-Math.random() * 8) + "s";
        sp.style.transform = "scale(" + (0.5 + Math.random()) + ")";
        particles.appendChild(sp);
      }
    }

    prompt.textContent = "It's rolling…";
    wrap.innerHTML = `<span class="leak ${cfg.glow}"></span><div class="pokeball giant ${cfg.cls}">${this._ballHTML()}<span class="pb-light"></span></div>`;
    wrap.classList.add("roll-in");
    const audio = this._audio();
    if (audio) audio.ballRoll();

    this._setT(() => {
      if (fid !== this._flowId) return;
      wrap.classList.remove("roll-in");
      prompt.textContent = "Something is moving…";
      this._sceneBTimeline(flow, s);
    }, this._rm() ? 200 : 750);
  },

  /* 背景 A 時間線：搖 2 下 → 分級爆發 → 開球 → 光柱 zoom → 檢視卡 */
  _sceneBTimeline(flow, s) {
    const fid = flow.id;
    const rarity = this._visualRarity(s);
    const sc = this._sceneB;
    const ball = sc.querySelector(".pokeball");
    const leak = sc.querySelector(".leak");
    const magic = sc.querySelector(".gsb-magic");
    const beam = sc.querySelector(".gsb-beam");
    const flash = sc.querySelector(".gsb-flash");
    const rings = sc.querySelector(".gsb-rings");
    const prompt = sc.querySelector(".gsb-prompt");
    const audio = this._audio();
    const k = this._rm() ? 0.25 : 1;   // reduced-motion 壓縮時間

    const wobbleOnce = (n) => {
      if (!document.body.contains(ball)) return;
      ball.classList.remove("wob"); void ball.offsetWidth;   // 重啟 CSS 動畫
      ball.classList.add("wob");
      if (audio) audio.wobble(n);
      this._haptic(n === 2 ? 26 : 18);
      leak.classList.remove("lk1", "lk2"); void leak.offsetWidth;
      leak.classList.add(n === 2 ? "lk2" : "lk1");
    };
    const spawnRings = (count, color) => {
      for (let i = 0; i < count; i++) {
        const r = document.createElement("i");
        r.className = "gsb-ring";
        r.style.borderColor = color;
        r.style.animationDelay = (i * 0.12 / (this._spd || 1)) + "s";
        rings.appendChild(r);
        this._setT(() => r.remove(), 1100 + i * 120);
      }
    };
    const spawnStars = (n, color) => {
      for (let i = 0; i < n; i++) {
        const sp = document.createElement("span");
        sp.className = "gsb-star";
        sp.textContent = "✦";
        sp.style.color = color;
        const ang = Math.random() * Math.PI * 2;
        const dist = 90 + Math.random() * 160;
        sp.style.setProperty("--dx", Math.cos(ang) * dist + "px");
        sp.style.setProperty("--dy", Math.sin(ang) * dist + "px");
        sp.style.fontSize = (12 + Math.random() * 18) + "px";
        rings.appendChild(sp);
        this._setT(() => sp.remove(), 1000);
      }
    };
    /* 震屏只震 overlay 本身 —— 唔好震 body，否則 .hub-bar fixed 定位會移位 */
    const shake = (strength) => {
      const g = this._gsap();
      if (this._rm() || !g || strength <= 0) return;
      g.fromTo(sc, { x: -strength }, { x: 0, duration: .5, ease: "elastic.out(1.2,.3)",
        onComplete: () => { sc.style.transform = ""; } });
    };
    const doFlash = (big) => {
      flash.classList.remove("on", "big"); void flash.offsetWidth;
      flash.classList.add("on");
      if (big) flash.classList.add("big");
    };

    this._setT(() => { if (fid === this._flowId) wobbleOnce(1); }, 350 * k);
    this._setT(() => { if (fid === this._flowId) { wobbleOnce(2); if (audio) audio.leakHum(2); } }, 1050 * k);

    /* 分級爆發 */
    this._setT(() => {
      if (fid !== this._flowId) return;
      prompt.textContent = "";
      const starColor = rarity === "rare" ? "#8ecbff" : rarity === "epic" ? "#d8a4ff" : "#ffe28a";
      if (rarity === "rare") {
        if (audio) audio.gotcha();
        doFlash(false);
        spawnRings(1, "#bfe0ff");
        spawnStars(10, starColor);
      } else if (rarity === "epic") {
        magic.classList.remove("hidden");
        magic.style.filter = "blur(.4px) drop-shadow(0 0 14px rgba(200,120,255,.8))";
        if (audio) audio.upgradeSting(1);
        this._setT(() => { if (audio) audio.gotcha(); }, 140);
        doFlash(false);
        spawnRings(2, "#d8a4ff");
        spawnStars(16, starColor);
        shake(5);
      } else {
        magic.classList.remove("hidden");
        magic.style.filter = "blur(.4px) drop-shadow(0 0 18px rgba(255,210,90,.95))";
        if (audio) audio.upgradeSting(2);
        this._setT(() => { if (audio) audio.gotcha(); }, 180);
        doFlash(true);
        spawnRings(3, "#ffe28a");
        spawnStars(24, starColor);
        shake(8);
        this._haptic([40, 60, 60]);
      }
    }, 1800 * k);

    /* 開球：上下分離 + 內光 */
    this._setT(() => {
      if (fid !== this._flowId) return;
      ball.classList.add("open");
      leak.classList.remove("lk1", "lk2");
      if (audio) audio.ballLand();
    }, 2450 * k);

    /* 光柱沖天 + zoom */
    this._setT(() => {
      if (fid !== this._flowId) return;
      beam.classList.add("rise");
      if (audio) audio.beamWhoosh();
      const g = this._gsap();
      if (g && !this._rm()) {
        g.to(sc.querySelector(".gsb-stage"), { scale: 1.12, duration: .4, ease: "power2.in" });
        g.to(sc.querySelector(".gsb-ball-wrap"), { scale: 1.8, duration: .4, ease: "power2.in" });
      }
      doFlash(true);
    }, 2850 * k);

    this._setT(() => { if (fid === this._flowId) this._revealInspect(flow, s); }, 3250 * k);
  },

  /* 檢視卡 overlay（lazy 建立，fixed 掛 body） */
  _ensureInspect() {
    if (this._inspect) return this._inspect;
    const el = document.createElement("div");
    el.id = "gacha-inspect";
    el.className = "hidden";
    el.innerHTML = `
      <div class="gi-rays"></div>
      <div class="gi-card">
        <span class="gi-rarity"></span>
        <img class="gi-art" alt="">
        <div class="gi-name"></div>
        <div class="gi-meta"></div>
        <div class="gi-types"></div>
        <div class="gi-stats"></div>
        <div class="gi-note"></div>
        <div class="gi-actions">
          <button class="btn-big btn-primary gi-again"></button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector(".gi-again").addEventListener("click", () => this._pullAgain());
    this._inspect = el;
    return el;
  },

  _refreshAgainButton() {
    if (!this._inspect) return;
    const btn = this._inspect.querySelector(".gi-again");
    const st = loadState();
    const cost = GAME_CONFIG.RARE_PULL_COST;
    if (st.diamonds >= cost) {
      btn.disabled = false;
      btn.innerHTML = `${GACHA_GEM_SVG} ×${cost} TO GO!`;
    } else {
      btn.disabled = true;
      btn.innerHTML = `Need ${GACHA_GEM_SVG} ×${cost} (you have ${st.diamonds})`;
    }
  },

  _revealInspect(flow, s) {
    this.phase = "inspect";
    this._flow = null;
    this._spdEnd();
    const rarity = this._visualRarity(s);
    const cfg = GACHA_BALL[rarity];
    const entry = s.entry;
    const cur = entryCurrentSpecies(entry);
    const dex = cur[0];
    const insp = this._ensureInspect();

    insp.dataset.rarity = rarity;
    insp.querySelector(".gi-rays").style.setProperty("--ray", cfg.ray);
    insp.querySelector(".gi-rarity").textContent = cfg.label;
    const art = insp.querySelector(".gi-art");
    art.onerror = () => { art.onerror = null; art.src = spriteURL(dex); };
    art.src = artworkURL(dex);
    art.alt = cur[1];
    insp.querySelector(".gi-name").textContent = cur[1];
    /* 星級跟稀有度：legend ★★★ / epic ★★ / rare ★ */
    const stars = rarity === "legend" ? "★★★" : rarity === "epic" ? "★★" : "★";
    insp.querySelector(".gi-meta").textContent =
      `No.${String(dex).padStart(3, "0")} ・ Lv.${entry.level} ・ ${stars}`;
    const dexEntry = dexOf(dex);
    const types = (dexEntry && dexEntry.types) || [];
    insp.querySelector(".gi-types").innerHTML = types.map(t =>
      `<span class="gi-type" style="background:${typeColor(t)}"><img src="${typeIconURL(t)}" alt="" onerror="this.remove()">${typeLabel(t).toUpperCase()}</span>`
    ).join("");
    const stats = statsForEntry(entry);
    insp.querySelector(".gi-stats").innerHTML = stats
      ? STAT_KEYS.map(k2 => `<div class="gi-stat"><b>${stats[k2]}</b><span>${STAT_LABELS[k2]}</span></div>`).join("")
      : "";
    const note = insp.querySelector(".gi-note");
    if (s.isDupe) {
      note.className = "gi-note";
      note.textContent = `Already have it! ⚡ EV point +1${s.candyGain ? " ・ 🍬 Candy +1" : ""}`;
    } else {
      note.className = "gi-note new";
      note.textContent = "NEW! Registered to your Pokédex.";
    }
    this._refreshAgainButton();
    this._pendingEvolve = s.firstExpEvolve || null;
    /* 世代解鎖 stash 落 App，等用戶離開檢視卡時先彈慶祝窗（避免遮擋抽獎卡） */
    if (s.newlyUnlockedGen) App._pendingGenUnlock = s.newlyUnlockedGen;

    /* 背景 A 退場 → 檢視卡登場 */
    const sc = this._sceneB;
    if (sc) sc.classList.remove("show");
    this._setT(() => {
      if (sc) sc.classList.add("hidden");
      insp.classList.remove("hidden");
      requestAnimationFrame(() => insp.classList.add("show"));
    }, 450);

    /* 每次出卡都播叫聲（v102 起：唔再只限新寵） */
    this._setT(() => { try { Pokedex.playCry(dex); } catch (e) { /* audio unavailable */ } }, 350);

    this.busy = false;
    this._refreshControls();
    App.renderHome();
  },

  /* 檢視卡「×3 TO GO!」：執場後即刻再抽（手杆自動拉到底，同樣扣 3 寶石） */
  _pullAgain() {
    if (this.busy || !this._canPull()) return;
    this._cleanupScene();
    const evo = this._pendingEvolve;
    this._pendingEvolve = null;
    if (evo) App.showEvolveModal(evo);
    App.maybeShowGenUnlock();
    this._setPull(1);
    this._triggerPull();
  },

  /* 執場：overlay / 艙門 / 拖拽旗標全部還原（Prototype 教訓：旗標唔重置會卡死再抽） */
  _cleanupScene() {
    this._spdEnd();
    const g = this._gsap();
    const sc = this._sceneB;
    if (sc) {
      if (g) {
        g.killTweensOf(sc);
        g.killTweensOf(sc.querySelector(".gsb-stage"));
        g.killTweensOf(sc.querySelector(".gsb-ball-wrap"));
      }
      sc.classList.remove("show");
      sc.classList.add("hidden");
      sc.style.transform = "";
      sc.querySelector(".gsb-rings").innerHTML = "";
      const wrap = sc.querySelector(".gsb-ball-wrap");
      wrap.innerHTML = "";
      wrap.style.transform = "";
      sc.querySelector(".gsb-stage").style.transform = "";
      sc.querySelector(".gsb-magic").classList.add("hidden");
      sc.querySelector(".gsb-beam").classList.remove("rise");
      sc.querySelector(".gsb-prompt").textContent = "";
    }
    if (this._inspect) {
      this._inspect.classList.remove("show");
      this._inspect.classList.add("hidden");
    }
    const machine = this._machine();
    if (machine) machine.classList.remove("belly-open", "dragging", "stop-bob");
    const dz = document.getElementById("gacha-dropzone");
    if (dz) dz.innerHTML = "";
    document.getElementById("view-gacha").classList.remove("playing");
    this._cancelCharge();
    if (this._multi) {
      this._multi.classList.remove("show");
      this._multi.classList.add("hidden");
    }
    this._dragging = false;
    this._triggered = false;
    this._suppressClick = false;
    this._holdMs = 0;
    this._curP = 0;
    this._setPull(0);
  },

  _resetStage() {
    this._cleanupScene();
    this._setCostChip(false);
    this._prompt("");
    this.phase = "idle";
  }
};
