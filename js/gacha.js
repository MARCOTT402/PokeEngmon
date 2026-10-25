/* ============================================================
   PokeEngmon - 扭蛋抽獎系統（v102 快龍拉手版）
   流程：💎 ×3 TO GO! → 拉動快龍隻手 ≥72% → 肚仔艙門打開
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

  open(mode) {
    this.mode = mode;
    this.abort();      // 清走上次殘留；未結算就補結算，唔會「食咗鑽但冇派寵」
    App.showView("view-gacha");
    document.getElementById("gacha-title").textContent = "💎 Rare Pull";
    this._bindArm();
    this._resetStage();
    this._refreshControls();
  },

  /* 中斷當前流程：跳過演出，但經濟交易照樣落地 */
  abort() {
    const flow = this._flow;
    this._flowId++;
    this._clearTimers();
    this._flow = null;
    this.busy = false;

    if (flow && !flow.settled) {
      /* 未結算 → 背景補做，避免中途離開導致扣鑽但冇寵物 */
      this._settleResult(flow).then(() => {
        this._refreshControls();
        App.renderHome();
      }).catch(() => {});
    }

    this._resetStage();
    this._refreshControls();
  },

  /* 所有流程 timeout 都經呢個 wrapper 記錄，中斷時一次過清走 */
  _setT(fn, ms) {
    const id = setTimeout(fn, ms);
    this._timers.push(id);
    return id;
  },

  _clearTimers() {
    this._timers.forEach(id => clearTimeout(id));
    this._timers = [];
  },

  _updateDiamondDisplay() {
    const st = loadState();
    const el = document.getElementById("gacha-diamonds");
    if (el) el.textContent = st.diamonds;
  },

  _canPull() {
    const st = loadState();
    return st.diamonds >= GAME_CONFIG.RARE_PULL_COST;
  },

  _refreshControls() {
    const btn = document.getElementById("btn-do-pull");
    if (!btn) return;
    const st = loadState();
    this._updateDiamondDisplay();
    if (this._canPull()) {
      btn.disabled = false;
      btn.textContent = `💎 ×${GAME_CONFIG.RARE_PULL_COST} TO GO!`;
    } else {
      btn.disabled = true;
      btn.textContent = `Need 💎${GAME_CONFIG.RARE_PULL_COST} (you have ${st.diamonds})`;
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

  /* ---------- 抽獎主流程 ----------
     v101：RPC 延遲解耦 + 經濟結算提早落地 ——
     點掣即刻進入拉手階段，server 抽獎背景進行；
     波球跌出前先結算（扣鑽 + 派寵），之後所有演出純視覺，
     中途離開只會跳過動畫，唔會出現「扣咗鑽但冇寵物」。 */
  pull() {
    if (this.busy || !this._canPull()) return;
    this.busy = true;
    Pokedex.unlockAudio();   // 喺用戶點擊時解鎖音效（手機自動播放限制）
    const audio = this._audio();
    if (audio) audio.ensure();

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

    this._resetStage();
    this._refreshControls();
    const btn = document.getElementById("btn-do-pull");
    if (btn) btn.disabled = true;

    this._startHandPhase();
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
        /* 本地 fallback（離線 / 未登入 / RPC 失敗） */
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

        /* 若有之前儲起嘅經驗值（第一次未有拍檔時），一次過入帳 */
        if (st.pendingExp > 0) {
          const res = addEntryExp(entry, st.pendingExp);
          st.pendingExp = 0;
          (res.learned || []).forEach(m => {
            if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
          });
          saveState();
          firstExpEvolve = res.evolvedTo;
          if (window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser()) {
            SupabaseAuth.addEntryExp(entry.uid, st.pendingExp);
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
     v102 演出層：拉手 → 肚開 → 跌球 → 背景 A → 檢視卡
     ============================================================ */

  _startHandPhase() {
    this.phase = "hand";
    document.getElementById("view-gacha").classList.add("playing");
    this._prompt("⇣ DRAG DRAGONITE'S HAND ⇣");
    const audio = this._audio();
    if (audio) audio.ready();
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
      if (this.phase !== "hand") return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._autoPull(); }
    });
    arm.addEventListener("click", () => {
      if (this.phase === "hand" && !this._dragging && !this._triggered && this._curP < 0.05) this._autoPull();
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
    if (pr && this.phase === "hand") pr.classList.toggle("almost", p > 0.5);
  },

  _onArmDown(e) {
    if (this.phase !== "hand" || this._dragging) return;
    this._dragging = true;
    this._triggered = false;
    this._startY = e.clientY;
    try { this._arm().setPointerCapture(e.pointerId); } catch (_) { /* unsupported */ }
    this._machine().classList.add("dragging");
    e.preventDefault();
  },

  _onArmMove(e) {
    if (!this._dragging || this._triggered) return;
    const dy = Math.min(Math.max(e.clientY - this._startY, 0), GACHA_MAX_PULL);
    const p = dy / GACHA_MAX_PULL;
    this._setPull(p);
    const now = performance.now();
    const audio = this._audio();
    if (audio && now - this._lastCreak > 80 && p > 0.05) {
      this._lastCreak = now;
      audio.pullCreak(p);
    }
    if (p >= GACHA_THRESHOLD) this._triggerPull();
  },

  _onArmUp() {
    if (!this._dragging) return;
    this._dragging = false;
    this._machine().classList.remove("dragging");
    if (this._triggered) return;
    /* 未達標放手 → 彈簧回彈 */
    const audio = this._audio();
    if (audio) audio.pullSnap();
    const g = this._gsap();
    if (g && !this._rm()) {
      const proxy = { p: this._curP };
      g.to(proxy, { p: 0, duration: .7, ease: "elastic.out(1,.45)", onUpdate: () => this._setPull(proxy.p) });
    } else {
      this._setPull(0);
    }
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

  /* 拉過閾值：手臂回彈 → 180ms 艙門開 → 等結算 → 600ms 跌球 */
  async _triggerPull() {
    if (this._triggered) return;
    const flow = this._flow;
    if (!flow) return;
    this._triggered = true;
    this._dragging = false;
    this.phase = "opening";
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
        r.style.animationDelay = (i * 0.12) + "s";
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
          <button class="btn-big btn-plain gi-home">‹ Back to Home</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector(".gi-again").addEventListener("click", () => this._pullAgain());
    el.querySelector(".gi-home").addEventListener("click", () => this._goHome());
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
      btn.textContent = `💎 ×${cost} TO GO!`;
    } else {
      btn.disabled = true;
      btn.textContent = `Need 💎${cost} (you have ${st.diamonds})`;
    }
  },

  _revealInspect(flow, s) {
    this.phase = "inspect";
    this._flow = null;
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

  /* 檢視卡「💎 ×3 TO GO!」：執場後即刻再抽 */
  _pullAgain() {
    if (this.busy || !this._canPull()) return;
    this._cleanupScene();
    const evo = this._pendingEvolve;
    this._pendingEvolve = null;
    if (evo) App.showEvolveModal(evo);
    App.maybeShowGenUnlock();
    this.pull();
  },

  /* 檢視卡「Back to Home」 */
  _goHome() {
    this._cleanupScene();
    const evo = this._pendingEvolve;
    this._pendingEvolve = null;
    App.showView("view-home");
    if (evo) App.showEvolveModal(evo);
    App.maybeShowGenUnlock();
  },

  /* 執場：overlay / 艙門 / 拖拽旗標全部還原（Prototype 教訓：旗標唔重置會卡死再抽） */
  _cleanupScene() {
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
    this._dragging = false;
    this._triggered = false;
    this._curP = 0;
    this._setPull(0);
  },

  _resetStage() {
    this._cleanupScene();
    this._prompt("");
    this.phase = "idle";
  }
};
