/* ============================================================
   PokeEngmon - 扭蛋抽獎系統
   硬幣投入 → 機器搖動兩次 → 精靈球掉出（彈跳）→ 閃光 → 開球
   ============================================================ */

const Gacha = {
  mode: "rare",        // 淨返稀有抽（normal pull 已移除）
  busy: false,

  open(mode) {
    this.mode = mode;
    this.busy = false;
    App.showView("view-gacha");
    document.getElementById("gacha-title").textContent = "💎 Rare Pull";
    this._resetStage();
    this._refreshControls();
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
    document.getElementById("gacha-result").innerHTML = "";
    document.getElementById("gacha-flash").className = "gacha-flash";
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

  /* ---------- 抽獎主流程 ---------- */
  pull() {
    if (this.busy || !this._canPull()) return;
    this.busy = true;
    Pokedex.unlockAudio();   // 喺用戶點擊時解鎖音效（手機自動播放限制）
    const st = loadState();
    st.diamonds -= GAME_CONFIG.RARE_PULL_COST;
    saveState();

    const rarity = this.rollRarity(this.mode);
    const chainKey = this.pickChain(rarity);

    /* 新 Pokemon：喺動畫期間預先載入叫聲，開球時即刻叫 */
    const preview = EVOLUTION_CHAINS.find(c => c.key === chainKey);
    if (preview && !st.entries.some(e => e.chainKey === chainKey)) {
      Pokedex.prepareCry(preview.stages[0][0]);
    }

    this._resetStage();
    this._refreshControls();
    const stage = document.getElementById("gacha-stage");

    /* 1) 硬幣投入 */
    const coin = document.createElement("div");
    coin.className = "gacha-coin";
    document.getElementById("gacha-machine").appendChild(coin);
    stage.classList.add("stage-coin");

    /* 2) 機器搖兩下 */
    setTimeout(() => {
      coin.remove();
      stage.classList.add("stage-shake");
    }, 650);

    /* 3) 精靈球掉出（輕微彈跳） */
    setTimeout(() => {
      stage.classList.add("stage-drop");
      const dz = document.getElementById("gacha-dropzone");
      const ball = document.createElement("div");
      ball.className = `pokeball ${RARITY[rarity].ballClass}`;
      ball.innerHTML = `<div class="pb-top"></div><div class="pb-mid"></div><div class="pb-bottom"></div><div class="pb-btn"></div>`;
      dz.appendChild(ball);
    }, 1500);

    /* 4) 閃光 → 5) 開球 → Pokemon 出現 */
    setTimeout(() => {
      stage.classList.add("stage-flash");
      const flash = document.getElementById("gacha-flash");
      flash.classList.add("on", `flash-${rarity}`);
    }, 2550);

    setTimeout(() => this._reveal(rarity, chainKey), 2950);
  },

  _reveal(rarity, chainKey) {
    const stage = document.getElementById("gacha-stage");
    const flash = document.getElementById("gacha-flash");
    flash.classList.remove("on");
    stage.classList.remove("stage-flash");

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
        ? `<div class="gacha-dupe">You already have it! EV point +1${candyGain ? " ・ 🍬 Candy +1" : ""}</div>`
        : `<div class="gacha-new">NEW!</div>`}
    `;

    document.getElementById("btn-do-pull").disabled = true;
    document.getElementById("btn-do-pull").textContent = "Pull complete!";

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
