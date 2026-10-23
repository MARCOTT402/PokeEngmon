/* ============================================================
   PokeEngmon - 扭蛋抽獎系統（v98 互動版）
   流程沿用捕捉場景節奏：
     比卡超金幣彈出 → 用戶點 3 下逐步投入入幣位
     → 機身震動 → 巨大金屬球跌出（稀有度決定球種）
     → 搖 3 下懸念 → 閃光開球 → 結算
   ============================================================ */

const Gacha = {
  mode: "rare",        // 淨返稀有抽（normal pull 已移除）
  busy: false,
  phase: "idle",       // idle | coin | inserting | rumble | ball | done
  taps: 0,
  _flowId: 0,          // 流程 token：離開頁面後作廢所有 pending timeout
  _bound: false,

  open(mode) {
    this.mode = mode;
    this.busy = false;
    this._flowId++;    // 作廢上一次流程嘅 timeout
    App.showView("view-gacha");
    document.getElementById("gacha-title").textContent = "💎 Rare Pull";
    this._bindTap();
    this._resetStage();
    this._refreshControls();
  },

  /* 全版點按（捕捉場景同款）：只有 coin 階段先計數，按鈕除外 */
  _bindTap() {
    if (this._bound) return;
    this._bound = true;
    document.getElementById("view-gacha").addEventListener("pointerdown", (e) => {
      if (e.target && e.target.closest("button")) return;
      this._tap();
    });
  },

  _updateDiamondDisplay() {
    const st = loadState();
    const el = document.getElementById("gacha-diamonds");
    if (el) el.textContent = st.diamonds;
  },

  _resetStage() {
    const stage = document.getElementById("gacha-stage");
    stage.className = "gacha-stage";
    document.getElementById("gacha-dropzone").innerHTML = "";
    const result = document.getElementById("gacha-result");
    result.innerHTML = "";
    result.classList.remove("enter");
    document.getElementById("gacha-flash").className = "gacha-flash";
    document.getElementById("gacha-machine").classList.remove("grand");
    const coin = document.getElementById("gacha-coin");
    if (coin) coin.remove();
    document.getElementById("view-gacha").classList.remove("playing");
    this._prompt("");
    this._showTaps(false);
    this.phase = "idle";
    this.taps = 0;
  },

  _canPull() {
    const st = loadState();
    return st.diamonds >= GAME_CONFIG.RARE_PULL_COST;
  },

  _refreshControls() {
    const btn = document.getElementById("btn-do-pull");
    const st = loadState();
    this._updateDiamondDisplay();
    if (this._canPull()) {
      btn.disabled = false;
      btn.textContent = `Insert coin to pull! (💎 ${st.diamonds})`;
    } else {
      btn.disabled = true;
      btn.textContent = `Not enough diamonds (need 💎${GAME_CONFIG.RARE_PULL_COST})`;
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
    const list = PULLABLE[rarity];
    return list[Math.floor(Math.random() * list.length)];
  },

  /* ---------- UI helpers ---------- */
  _prompt(text) {
    const el = document.getElementById("gacha-prompt");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("show", !!text);
  },

  _showTaps(show) {
    const el = document.getElementById("gacha-taps");
    if (el) el.classList.toggle("show", !!show);
  },

  _updateDots() {
    document.querySelectorAll("#gacha-taps i").forEach((d, i) => {
      d.classList.toggle("on", i < this.taps);
    });
  },

  _haptic(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
  },

  _audio() {
    return (window.CaptureScene && CaptureScene.audio) ? CaptureScene.audio : null;
  },

  /* ---------- 抽獎主流程 ---------- */
  pull() {
    if (this.busy || !this._canPull()) return;
    this.busy = true;
    Pokedex.unlockAudio();   // 喺用戶點擊時解鎖音效（手機自動播放限制）
    const audio = this._audio();
    if (audio) audio.ensure();
    const st = loadState();
    st.diamonds -= GAME_CONFIG.RARE_PULL_COST;
    saveState();

    this._rarity = this.rollRarity(this.mode);
    this._chainKey = this.pickChain(this._rarity);

    /* 新 Pokemon：喺動畫期間預先載入叫聲，開球時即刻叫 */
    const preview = EVOLUTION_CHAINS.find(c => c.key === this._chainKey);
    if (preview && !st.entries.some(e => e.chainKey === this._chainKey)) {
      Pokedex.prepareCry(preview.stages[0][0]);
    }

    this._resetStage();
    this._refreshControls();
    document.getElementById("btn-do-pull").disabled = true;

    this._startCoinPhase();
  },

  /* 階段 1：巨大發光機身 + 比卡超金幣彈出，等用戶點 3 下 */
  _startCoinPhase() {
    this.phase = "coin";
    this.taps = 0;
    const stage = document.getElementById("gacha-stage");
    document.getElementById("view-gacha").classList.add("playing");
    stage.classList.add("phase-coin");
    document.getElementById("gacha-machine").classList.add("grand");

    const coin = document.createElement("div");
    coin.className = "gacha-coin-grand";
    coin.id = "gacha-coin";
    coin.innerHTML = `
      <div class="gc-spin">
        <div class="gc-face"><img class="gc-pika" src="assets/animated/25.gif" alt=""></div>
        <div class="gc-shine"></div>
      </div>`;
    document.getElementById("gacha-machine").appendChild(coin);

    this._prompt("Tap the coin 3× to insert it!");
    this._showTaps(true);
    this._updateDots();
    const audio = this._audio();
    if (audio) audio.ready();
  },

  /* 階段 1 互動：每點一下金幣移近入幣位，聲調逐步升高 */
  _tap() {
    if (this.phase !== "coin") return;
    this.taps += 1;
    const audio = this._audio();
    if (audio) audio.coin(this.taps);
    this._haptic(10 + this.taps * 8);
    this._updateDots();

    const coin = document.getElementById("gacha-coin");
    if (coin && this.taps < 3) {
      coin.classList.remove("coin-step-1", "coin-step-2");
      coin.classList.add(`coin-step-${this.taps}`);
    }

    if (this.taps === 1) this._prompt("Nice! Tap again…");
    if (this.taps === 2) this._prompt("One more tap!");
    if (this.taps >= 3) this._insertCoin();
  },

  /* 階段 2：金幣側身滑入入幣位 */
  _insertCoin() {
    this.phase = "inserting";
    const fid = this._flowId;
    const coin = document.getElementById("gacha-coin");
    if (coin) coin.classList.add("coin-insert");
    const audio = this._audio();
    if (audio) audio.coinInsert();
    this._haptic([20, 30, 40]);
    this._prompt("Here it comes…");
    this._showTaps(false);

    setTimeout(() => { if (fid === this._flowId && coin) coin.remove(); }, 520);
    setTimeout(() => { if (fid === this._flowId) this._rumble(); }, 480);
  },

  /* 階段 3：機身強烈震動 */
  _rumble() {
    this.phase = "rumble";
    const fid = this._flowId;
    const stage = document.getElementById("gacha-stage");
    stage.classList.remove("phase-coin");
    stage.classList.add("stage-rumble");
    const audio = this._audio();
    if (audio) audio.rumble();
    this._haptic([30, 40, 30, 40, 60]);
    this._prompt("");

    setTimeout(() => { if (fid === this._flowId) this._dropBall(); }, 1200);
  },

  /* 階段 4：巨大金屬球跌出 → 著地 → 搖 3 下（捕捉場景懸念節奏）→ 閃光開球 */
  _dropBall() {
    this.phase = "ball";
    const fid = this._flowId;
    const stage = document.getElementById("gacha-stage");
    stage.classList.remove("stage-rumble");
    stage.classList.add("stage-drop");

    const dz = document.getElementById("gacha-dropzone");
    const ball = document.createElement("div");
    ball.className = `pokeball metal giant ${RARITY[this._rarity].ballClass}`;
    ball.innerHTML = `<div class="pb-top"></div><div class="pb-mid"></div><div class="pb-bottom"></div><div class="pb-btn"></div>`;
    dz.appendChild(ball);

    const audio = this._audio();
    /* 著地聲對正 ball-drop 動畫收尾（.95s） */
    setTimeout(() => {
      if (fid !== this._flowId) return;
      if (audio) audio.ballLand();
      this._haptic(35);
    }, 950);

    /* 3 下搖晃懸念（捕捉場景同款節奏，聲調逐步降低） */
    [1400, 2050, 2700].forEach((t, i) => setTimeout(() => {
      if (fid !== this._flowId || !document.body.contains(ball)) return;
      ball.classList.remove("wob");
      void ball.offsetWidth;   // 重啟 CSS 動畫
      ball.classList.add("wob");
      if (audio) audio.wobble(i + 1);
      this._haptic(18);
    }, t));

    setTimeout(() => {
      if (fid !== this._flowId) return;
      stage.classList.add("stage-flash");
      const flash = document.getElementById("gacha-flash");
      flash.classList.add("on", `flash-${this._rarity}`);
      if (audio) audio.gotcha();
    }, 3300);

    setTimeout(() => { if (fid === this._flowId) this._reveal(this._rarity, this._chainKey); }, 3700);
  },

  _reveal(rarity, chainKey) {
    const stage = document.getElementById("gacha-stage");
    const flash = document.getElementById("gacha-flash");
    flash.classList.remove("on");
    stage.classList.remove("stage-flash");
    this.phase = "done";

    const { entry, isDupe, candyGain } = obtainPokemon(chainKey, this.mode);

    /* 若有之前儲起嘅經驗值（第一次未有拍檔時），一次過入帳 */
    const st = loadState();
    let firstExpEvolve = null;
    if (st.pendingExp > 0) {
      const res = addEntryExp(entry, st.pendingExp);
      st.pendingExp = 0;
      /* 新入手時自動補招（有空位先學，最多 4 招） */
      (res.learned || []).forEach(m => {
        if (entry.moves.length < 4 && !entry.moves.includes(m.move)) entry.moves.push(m.move);
      });
      saveState();
      firstExpEvolve = res.evolvedTo;
    }

    /* 開球動畫 */
    stage.classList.add("stage-open");
    const ball = document.querySelector("#gacha-dropzone .pokeball");
    if (ball) ball.classList.add("open");

    /* Pokemon 出現並上下彈跳 */
    const cur = entryCurrentSpecies(entry);
    const rz = RARITY[rarity];

    const result = document.getElementById("gacha-result");
    result.innerHTML = `
      <div class="gacha-pokemon bounce">
        <img src="${spriteURL(cur[0])}" alt="${cur[1]}"
             onerror="this.onerror=null;this.src='${artworkURL(cur[0])}'">
      </div>
      <div class="gacha-name">${cur[1]} <small>Lv.${entry.level}</small></div>
      <span class="rarity-chip" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>
      ${isDupe
        ? `<div class="gacha-dupe">You already have it! EV point +1${candyGain ? " ・ 🍬 Candy +1" : ""}</div>` : `<div class="gacha-new">NEW!</div>`}
    `;
    result.classList.add("enter");

    /* 結算過場：機身淡出，還原資訊同按鈕 */
    setTimeout(() => {
      stage.classList.add("settling");
      document.getElementById("view-gacha").classList.remove("playing");
    }, 480);

    const pullBtn = document.getElementById("btn-do-pull");
    pullBtn.disabled = true;
    pullBtn.textContent = "Pull complete!";
    /* 抽完之後解鎖，稍後自動還原按鈕俾玩家繼續再抽 */
    this.busy = false;
    setTimeout(() => this._refreshControls(), 1400);

    /* 稀有抽專屬慶祝：要勁過普通捕捉場景嘅爽感 */
    if (this.mode === "rare") this._celebrate(rarity, cur[0]);

    /* 新 Pokemon 登場時叫一聲（重複抽到唔叫） */
    if (!isDupe) {
      setTimeout(() => Pokedex.playCry(cur[0]), 350);
    }

    /* 首次入帳經驗引起嘅進化 */
    if (firstExpEvolve) {
      setTimeout(() => App.showEvolveModal(firstExpEvolve), 1400);
    }

    App.renderHome();   // 更新主畫面資料

    /* 同步到雲端：diamonds 扣減 + 新 pokemon */
    if (window.Sync && Sync.isEnabled()) Sync.pushState();
  },

  /* ---------- 稀有抽慶祝動畫 ----------
     比普通捕捉場景更爽：光柱爆發 → 衝擊波 → 星星四散 → 大字 RARE GET!
     Epic / Legend 加碼：雙層衝擊波 + 更多星星 + 螢幕震動 */
  _celebrate(rarity, dexId) {
    const rz = RARITY[rarity];
    const layer = document.createElement("div");
    layer.className = "gacha-celebrate";
    layer.innerHTML = `
      <div class="gacha-beam" style="background:linear-gradient(180deg, transparent 0%, ${rz.color}66 30%, ${rz.color} 100%)"></div>
      <div class="gacha-ring"></div>
      ${rarity !== "rare" ? `<div class="gacha-ring" style="border-color:${rz.color}cc; box-shadow:0 0 60px 22px ${rz.color}55"></div>` : ""}
      <div class="gacha-poke-glow" style="background:radial-gradient(circle, ${rz.color}dd, ${rz.color}00 70%)"></div>`;
    document.body.appendChild(layer);

    /* 星星 */
    const starCount = rarity === "legend" ? 18 : (rarity === "epic" ? 14 : 10);
    const stars = [];
    for (let i = 0; i < starCount; i++) {
      const s = document.createElement("span");
      s.className = "gacha-star";
      s.textContent = rarity === "legend" ? "⭐" : (i % 2 ? "✦" : "✧");
      s.style.left = (50 + (Math.random() * 56 - 28)) + "%";
      s.style.top = (46 + (Math.random() * 26 - 13)) + "%";
      layer.appendChild(s);
      stars.push(s);
    }

    /* 大字 */
    const bigText = document.createElement("div");
    bigText.className = "gacha-rare-get";
    bigText.textContent = rarity === "legend" ? "⭐ LEGEND GET! ⭐" : (rarity === "epic" ? "✨ EPIC GET! ✨" : "💫 RARE GET! 💫");
    bigText.style.color = rz.color;
    layer.appendChild(bigText);

    const beam = layer.querySelector(".gacha-beam");
    const rings = layer.querySelectorAll(".gacha-ring");
    const glow = layer.querySelector(".gacha-poke-glow");

    if (window.gsap) {
      const tl = gsap.timeline();
      tl.set([beam, glow, bigText, ...stars], { opacity: 0 })
        /* 光柱爆發 */
        .to(beam, { opacity: 1, duration: .16, ease: "power2.out" })
        .fromTo(beam, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: .38, ease: "power3.out" }, "<")
        /* 衝擊波 */
        .to(rings, { opacity: 1, scale: 3.4, duration: .55, ease: "power1.out", stagger: .12 }, "<")
        .to(rings, { opacity: 0, duration: .35 }, ">-.15")
        /* 星星散開 + 大字彈出 */
        .to(stars, { opacity: 1, scale: 1.25, duration: .12, stagger: .02 }, "<")
        .to(stars, {
          x: () => (Math.random() * 260 - 130),
          y: () => (Math.random() * -200 - 40),
          opacity: 0, scale: .4, duration: .9, ease: "power2.out"
        }, "<")
        .fromTo(bigText, { opacity: 0, scale: .3, rotate: -6 },
          { opacity: 1, scale: 1, rotate: -3, duration: .45, ease: "back.out(2.2)" }, "<")
        .to(glow, { opacity: .95, duration: .3 }, "<")
        .to(beam, { opacity: 0, duration: .7 }, ">1.0")
        .to(glow, { opacity: 0, duration: .8 }, "<")
        .to(bigText, { opacity: 0, y: -30, duration: .5 }, "<");

      /* 螢幕震動 */
      gsap.fromTo(document.body, { x: -7 }, { x: 0, duration: .5, ease: "elastic.out(1, 0.25)", delay: .05 });
    }

    if (window.CaptureScene && CaptureScene.audio) CaptureScene.audio.correct();
    setTimeout(() => layer.remove(), 3400);
  }
};
