/* ============================================================
   PokeEngmon - Gacha：單抽演出（跌波、Scene B 時間線、檢視卡、再抽、清場）
   由 js/gacha.js 拆出（總計劃 P2.5；Rule 116）。同 js/gacha.js 共用同一個 Gacha 物件：
   Object.assign 只係將方法掛返上去，this／Gacha.xxx 用法完全唔變。
   載入次序：js/gacha.js 之後（index.html）。
   ============================================================ */

Object.assign(Gacha, {
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
});
