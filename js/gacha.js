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
    const dim = document.getElementById("gacha-dim");
    if (dim) dim.classList.remove("on");
    this._setEyes(null);
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

  /* P&D 暗転 overlay（lazy 建立，鋪滿成個 gacha view） */
  _ensureDim() {
    let dim = document.getElementById("gacha-dim");
    if (!dim) {
      dim = document.createElement("div");
      dim.className = "gacha-dim";
      dim.id = "gacha-dim";
      document.getElementById("view-gacha").appendChild(dim);
    }
    return dim;
  },

  /* 機械快龍眼睛發光預告（跟住波球漏光色走） */
  _setEyes(cls) {
    document.querySelectorAll("#gacha-machine .dm-eye").forEach(e => {
      e.classList.remove("leak-blue", "leak-gold", "leak-rainbow");
      if (cls) e.classList.add(cls);
    });
  },

  /* ---------- 抽獎主流程 ----------
     v100：RPC 延遲解耦 —— 點掣即刻開入幣動畫，server 抽獎背景進行，
     到波球跌出前先用 _resolveResult() 攞結果（hold 狀態頂住網絡延遲） */
  pull() {
    if (this.busy || !this._canPull()) return;
    this.busy = true;
    Pokedex.unlockAudio();   // 喺用戶點擊時解鎖音效（手機自動播放限制）
    const audio = this._audio();
    if (audio) audio.ensure();

    this._serverResult = null;
    this._resultReady = false;
    this._rarity = null;
    this._chainKey = null;

    /* v99：登入時走 server 權威抽獎 —— gacha_pull RPC 原子扣鑽 +
       server 自己 roll rarity/chain + 拎寵，防止 client 改機率/必中神獸。
       失敗或未登入 → _resolveResult() 用本地 path 頂上。 */
    const authed = window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser();
    const st = loadState();
    this._rpcPromise = authed
      ? SupabaseAuth.gachaPull(st.pendingExp || 0).catch(() => null)
      : null;

    this._resetStage();
    this._refreshControls();
    document.getElementById("btn-do-pull").disabled = true;

    this._startCoinPhase();
  },

  /* 本地 fallback 抽獎（離線 / RPC 失敗 / 未登入） */
  _applyLocalRoll() {
    const st = loadState();
    st.diamonds -= GAME_CONFIG.RARE_PULL_COST;
    saveState();
    this._rarity = this.rollRarity(this.mode);
    this._chainKey = this.pickChain(this._rarity);
  },

  /* 波球跌出前攞結果：server 未覆就入 hold 狀態（prompt "…"）等佢 */
  async _resolveResult() {
    const fid = this._flowId;
    if (this._resultReady) return true;

    let r = null;
    if (this._rpcPromise) {
      let settled = false;
      this._rpcPromise.then(() => { settled = true; });
      await Promise.resolve();          // 已解決嘅 promise 即刻落地
      if (!settled) this._prompt("…");  // 未覆 → hold
      r = await this._rpcPromise;
      if (fid !== this._flowId) return false;
      this._prompt("");
    }

    if (r && r.entry) {
      const st = loadState();
      this._serverResult = r;
      st.diamonds = r.balance;          // server 權威餘額（已扣 3 鑽）
      saveState();
      this._rarity = r.rarity;
      this._chainKey = r.entry.chain_key;
    } else {
      this._applyLocalRoll();
    }
    this._resultReady = true;

    /* 新 Pokemon：喺動畫期間預先載入叫聲，開球時即刻叫 */
    const stNow = loadState();
    const preview = EVOLUTION_CHAINS.find(c => c.key === this._chainKey);
    const isNewPull = this._serverResult
      ? !this._serverResult.is_dupe
      : !stNow.entries.some(e => e.chainKey === this._chainKey);
    if (preview && isNewPull) {
      Pokedex.prepareCry(preview.stages[0][0]);
    }
    return true;
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

  /* 階段 4（v100 P&D 式）：暗転聚光 → 波球跌出著地 → 搖 3 下漏光遞進
     → 確定演出升級（epic 藍→金 / legend 金→彩虹，rare 無升級）
     → 閃光 + 光柱爆開 → 結算 */
  async _dropBall() {
    this.phase = "ball";
    const fid = this._flowId;
    const stage = document.getElementById("gacha-stage");
    stage.classList.remove("stage-rumble");
    stage.classList.add("stage-drop");

    /* 攞抽獎結果（RPC 慢就 hold 住先） */
    const ok = await this._resolveResult();
    if (!ok || fid !== this._flowId) return;

    const rarity = this._rarity;
    const audio = this._audio();
    const dz = document.getElementById("gacha-dropzone");

    /* 暗転：全版變暗，聚光燈對正波球 */
    this._ensureDim().classList.add("on");

    /* 出場色：legend 金開場，epic / rare 藍開場（確定演出規則） */
    const startBall = rarity === "legend" ? "ball-yellow" : "ball-blue";
    const startLeak = rarity === "legend" ? "leak-gold" : "leak-blue";

    const ball = document.createElement("div");
    ball.className = `pokeball metal giant ${startBall} ${startLeak}`;
    ball.innerHTML = `<div class="pb-top"></div><div class="pb-mid"></div><div class="pb-bottom"></div><div class="pb-btn"></div>`;
    dz.appendChild(ball);

    /* 著地聲對正 ball-drop 動畫收尾（.95s）+ 眼睛發光預告 */
    setTimeout(() => {
      if (fid !== this._flowId) return;
      if (audio) audio.ballLand();
      this._haptic(35);
      this._setEyes(startLeak);
    }, 950);

    /* 3 下搖晃懸念：漏光 lk1→lk2→lk3 遞進 + 張力低鳴逐步升高 */
    [1400, 2050, 2700].forEach((t, i) => setTimeout(() => {
      if (fid !== this._flowId || !document.body.contains(ball)) return;
      ball.classList.remove("wob");
      void ball.offsetWidth;   // 重啟 CSS 動畫
      ball.classList.add("wob", `lk${i + 1}`);
      if (audio) { audio.wobble(i + 1); audio.leakHum(i + 1); }
      this._haptic(18);
    }, t));

    /* 確定演出：第 3 搖同拍升級（rare 無升級） */
    if (rarity !== "rare") {
      setTimeout(() => {
        if (fid !== this._flowId || !document.body.contains(ball)) return;
        ball.classList.add("upgrade");
        if (audio) audio.upgradeSting(rarity === "legend" ? 2 : 1);
        this._haptic([30, 40, 30]);
        setTimeout(() => {
          if (fid !== this._flowId || !document.body.contains(ball)) return;
          ball.classList.remove("upgrade", "leak-blue", "leak-gold", "ball-blue");
          if (rarity === "epic") {
            ball.classList.add("ball-yellow", "leak-gold");
            this._setEyes("leak-gold");
          } else {
            ball.classList.add("leak-rainbow");
            this._setEyes("leak-rainbow");
          }
        }, 220);
      }, 2700);
    }

    /* 開球：暗転退場 + 閃光 + 光柱爆點 */
    setTimeout(() => {
      if (fid !== this._flowId) return;
      this._ensureDim().classList.remove("on");
      this._setEyes(null);
      stage.classList.add("stage-flash");
      const flash = document.getElementById("gacha-flash");
      flash.classList.add("on", `flash-${rarity}`);
      const burst = document.createElement("div");
      burst.className = "gacha-burst on";
      dz.appendChild(burst);
      setTimeout(() => burst.remove(), 700);
      if (audio) audio.gotcha();
    }, 3300);

    setTimeout(() => { if (fid === this._flowId) this._reveal(rarity, this._chainKey); }, 3700);
  },

  _reveal(rarity, chainKey) {
    const stage = document.getElementById("gacha-stage");
    const flash = document.getElementById("gacha-flash");
    flash.classList.remove("on");
    stage.classList.remove("stage-flash");
    this.phase = "done";

    /* v99：server path —— 扣鑽/rarity/dupe 已由 gacha_pull RPC 完成，
       本地用 adoptServerEntry 採用 server row；否則行舊本地邏輯 */
    const sr = this._serverResult;
    this._serverResult = null;
    const st = loadState();
    let entry, isDupe, candyGain;
    let firstExpEvolve = null;

    if (sr) {
      const hadEntries = st.entries.length > 0;
      entry = adoptServerEntry(sr.entry);
      isDupe = sr.is_dupe;
      candyGain = isDupe ? 1 : 0;   // 稀有抽 dupe 必送 1 糖（server 已入帳）
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
      const got = obtainPokemon(chainKey, this.mode);
      entry = got.entry;
      isDupe = got.isDupe;
      candyGain = got.candyGain;

      /* 若有之前儲起嘅經驗值（第一次未有拍檔時），一次過入帳 */
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
