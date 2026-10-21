/* ============================================================
   PokeEngmon - 扭蛋抽獎系統
   硬幣投入 → 機器搖動兩次 → 精靈球掉出（彈跳）→ 閃光 → 開球
   ============================================================ */

const Gacha = {
  mode: "normal",      // 'normal' | 'rare'
  busy: false,

  open(mode) {
    this.mode = mode;
    this.busy = false;
    App.showView("view-gacha");
    document.getElementById("gacha-title").textContent =
      mode === "rare" ? "💎 Rare Pull" : "🎯 Normal Pull";
    this._resetStage();
    this._refreshControls();
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
    return this.mode === "normal" ? st.normalPulls >= 1 : st.diamonds >= GAME_CONFIG.RARE_PULL_COST;
  },

  _refreshControls() {
    const btn = document.getElementById("btn-do-pull");
    const st = loadState();
    if (this._canPull()) {
      btn.disabled = false;
      btn.textContent = this.mode === "normal"
        ? `Insert coin to pull! (${st.normalPulls} left)`
        : `Insert coin to pull! (💎 ${st.diamonds})`;
    } else {
      btn.disabled = true;
      btn.textContent = this.mode === "normal"
        ? "No normal pulls left — earn some by practising!"
        : `Not enough diamonds (need 💎${GAME_CONFIG.RARE_PULL_COST})`;
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
    if (this.mode === "normal") st.normalPulls -= 1;
    else st.diamonds -= GAME_CONFIG.RARE_PULL_COST;
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

    /* 新 Pokemon 登場時叫一聲（重複抽到唔叫） */
    if (!isDupe) {
      setTimeout(() => Pokedex.playCry(cur[0]), 350);
    }

    /* 首次入帳經驗引起嘅進化 */
    if (firstExpEvolve) {
      setTimeout(() => App.showEvolveModal(firstExpEvolve), 1400);
    }

    App.renderHome();   // 更新主畫面資料
  }
};
