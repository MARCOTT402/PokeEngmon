/* ============================================================
   PokeEngmon - Gacha：10 連抽（結算、演出、結果格、詳情、再抽）
   由 js/gacha.js 拆出（總計劃 P2.5；Rule 116）。同 js/gacha.js 共用同一個 Gacha 物件：
   Object.assign 只係將方法掛返上去，this／Gacha.xxx 用法完全唔變。
   載入次序：js/gacha.js 之後（index.html）。
   ============================================================ */

Object.assign(Gacha, {
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
  }
});
