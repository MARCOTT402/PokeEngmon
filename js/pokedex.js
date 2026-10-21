/* ============================================================
   PokeEngmon - Pokedex
   Owned -> full art & data; not owned -> grey silhouette
   ============================================================ */

/* Local cries: mp3 downloaded for 1-151 (assets/cries/{dexId}.mp3) */
const CRY_LOCAL = "assets/cries";
function cryURL(dexId) { return `${CRY_LOCAL}/${dexId}.mp3`; }

function capitalizeWord(slug) {
  const s = String(slug || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const Pokedex = {
  open() {
    App.showView("view-pokedex");
    this.render();
  },

  render() {
    const st = loadState();
    const owned = new Set();
    st.entries.forEach(e => e.ownedSpecies.forEach(id => owned.add(id)));

    document.getElementById("dex-progress").innerHTML =
      `Collected <b>${owned.size}</b> / ${TOTAL_SPECIES}`;
    document.getElementById("home-dex-progress").textContent = `${owned.size}/${TOTAL_SPECIES}`;

    const grid = document.getElementById("pokedex-grid");
    grid.innerHTML = "";

    Object.values(SPECIES).sort((a, b) => a.dexId - b.dexId).forEach(sp => {
      const isOwned = owned.has(sp.dexId);
      const cell = document.createElement("button");
      cell.className = "dex-cell" + (isOwned ? " owned" : "");
      const rz = RARITY[sp.rarity];
      cell.innerHTML = `
        <img src="${spriteURL(sp.dexId)}" alt="${isOwned ? sp.name : "??"}" loading="lazy">
        <span class="dex-name">${isOwned ? sp.name : "???"}</span>
        ${isOwned ? `<span class="dex-rarity" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>` : ""}
      `;
      if (isOwned) {
        cell.onclick = () => this.showDetail(sp.dexId);
        /* Tap the sprite for its cry; tap elsewhere for details */
        const img = cell.querySelector("img");
        img.title = "Tap to hear its cry";
        img.onclick = (e) => { e.stopPropagation(); this.playCry(sp.dexId); };
      }
      grid.appendChild(cell);
    });
  },

  /* Owned -> big art + data modal */
  showDetail(dexId, keepScroll) {
    const sp = SPECIES[dexId];
    const st = loadState();
    const chain = EVOLUTION_CHAINS.find(c => c.key === sp.chainKey);
    const entry = st.entries.find(e => e.chainKey === sp.chainKey);
    const rz = RARITY[sp.rarity];

    /* Evolution chain (linear + Eevee branches) */
    const nodes = [];
    chain.stages.forEach((s) => {
      const got = entry && entry.ownedSpecies.includes(s[0]);
      nodes.push(`<div class="evo-node ${got ? "got" : ""}">
                <img src="${spriteURL(s[0])}" alt="${s[1]}">
                <span>${got ? s[1] : "???"}</span>
              </div>`);
    });
    (chain.branches || []).forEach(opts => {
      const sub = opts.map(s => {
        const got = entry && entry.ownedSpecies.includes(s[0]);
        return `<div class="evo-node ${got ? "got" : ""}">
                  <img src="${spriteURL(s[0])}" alt="${s[1]}">
                  <span>${got ? s[1] : "???"}</span>
                </div>`;
      }).join("");
      nodes.push(`<div class="evo-branch">${sub}</div>`);
    });
    const stageDots = nodes.join(`<span class="evo-arrow">→</span>`);

    /* Level / stats / moves / EV / candy */
    let extraHTML = "";
    if (entry) {
      ensureEntryPokemonData(entry);
      const level = entry.level || 1;
      const base = expAtLevel(dexId, level);
      const span = levelSpan(dexId, level);
      const into = Math.max(0, entry.exp - base);
      const pct = level >= MAX_LEVEL ? 100 : Math.min(100, (into / span) * 100);
      const stats = calcStats(dexId, level, entry.ivs, entry.evs, entry.nature);
      const statCells = STAT_KEYS.map(k =>
        `<div class="dex-stat">${STAT_LABELS[k]}<b>${stats ? stats[k] : "-"}</b></div>`).join("");
      const cards = (entry.moves || []).length
        ? entry.moves.map(m => moveCardHTML(m)).join("")
        : `<div class="dex-empty">No moves yet</div>`;
      const canAddEv = (k) => (entry.evPoints || 0) > 0
        && (entry.evs[k] || 0) < MAX_EV
        && evTotal(entry.evs) < MAX_EV_TOTAL;
      const evButtons = STAT_KEYS.map(k => `
        <button class="ev-btn" data-stat="${k}" ${canAddEv(k) ? "" : "disabled"}>
          <span>${STAT_LABELS[k]}</span><b>${entry.evs[k] || 0}</b><i>+1</i>
        </button>`).join("");

      extraHTML = `
        <div class="dex-level-line">Lv.<span class="dex-level">${level}</span> / ${MAX_LEVEL}
          ・ <span class="dex-stars">${"★".repeat(entry.stars || 1)}</span></div>
        <div class="expbar"><i style="width:${pct}%"></i></div>
        <div class="hero-exp-text">${level >= MAX_LEVEL ? "Lv.MAX" : `EXP ${into} / ${span} to next Lv.`}</div>
        <div class="dex-sub">Nature: <b>${capitalizeWord(entry.nature)}</b> ・ IV ${ivTotal(entry.ivs)} / ${MAX_IV * 6} ・ EV ${evTotal(entry.evs)} / ${MAX_EV_TOTAL}</div>
        <div class="dex-stats">${statCells}</div>

        <div class="dex-ev">
          <div class="dex-ev-head">
            <span>EV Points <b class="ev-points">${entry.evPoints || 0}</b></span>
            <span class="dex-ev-total">EV ${evTotal(entry.evs)} / ${MAX_EV_TOTAL}</span>
          </div>
          <div class="dex-ev-tip">Duplicate pulls give 1 EV point. Tap a stat to add +1.</div>
          <div class="ev-grid">${evButtons}</div>
        </div>

        <div class="dex-moves">
          <div class="dex-moves-title">Moves (${(entry.moves || []).length}/4)</div>
          ${cards}
        </div>

        <div class="dex-candy">
          🍬 Candy × <b>${entry.candies}</b> ・ Duplicates: <b>${entry.dupes}</b>
          <div class="dex-candy-tip">Candy comes from rare 💎 pulls only.</div>
          <button id="btn-feed-candy" ${entry.candies > 0 && level < MAX_LEVEL ? "" : "disabled"}>
            Feed 1 candy → +1 level
          </button>
        </div>`;
    }

    const scrollTop = keepScroll ? (document.querySelector(".modal-card") || {}).scrollTop : 0;
    App.showModal(`
      <div class="dex-detail">
        <span class="rarity-chip" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>
        <img class="dex-art" id="dex-art" src="${artworkURL(dexId)}" alt="${sp.name}" title="Tap to hear its cry"
             onerror="this.onerror=null;this.src='${spriteURL(dexId)}';this.classList.add('pixel')">
        <div class="dex-detail-name">${sp.name}</div>
        <div class="dex-no">No.${String(dexId).padStart(3, "0")}</div>
        <div class="dex-stage-label">Evolution stage ${sp.stage}</div>
        <div class="evo-chain">${stageDots}</div>
        ${extraHTML}
      </div>
    `);
    if (keepScroll) document.querySelector(".modal-card").scrollTop = scrollTop;

    const art = document.getElementById("dex-art");
    if (art) art.onclick = () => this.playCry(dexId);
    const feed = document.getElementById("btn-feed-candy");
    if (feed) feed.onclick = () => this.feedCandy(entry);
    document.querySelectorAll("#modal-root .ev-btn").forEach(btn => {
      btn.onclick = () => {
        if (!addEvPoint(entry, btn.dataset.stat)) return;
        this.showDetail(dexId, true);
        App.renderHome();
      };
    });
  },

  /* Feed candy -> +1 level (may learn a move / evolve) */
  feedCandy(entry) {
    if (!entry || entry.candies <= 0) return;
    const res = useEntryCandy(entry, 1);
    App.closeModal();
    this.render();
    App.renderHome();
    if (res.levelsGained === 0) { App.toast("Already Lv.MAX!"); return; }
    App.toast(`Level up! Now Lv.${entry.level} ・ Candy left ${entry.candies}`);
    if (res.evolvedTo) setTimeout(() => App.showEvolveModal(res.evolvedTo), 300);
    if (res.learned.length) {
      setTimeout(() => App.queueMoveLearn(entry, res.learned), res.evolvedTo ? 1300 : 400);
    }
  },

  /* 喺用戶點擊時解鎖 Web Audio（手機自動播放限制），
     令幾秒後開球時仍然可以播放叫聲 */
  unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !this._ctx) this._ctx = new AC();
      if (!this._ctx) return;
      if (this._ctx.state === "suspended") this._ctx.resume();
      /* 喺手勢內播一個無聲 buffer，確保 iOS 真正啟動 AudioContext */
      if (!this._ctxStarted) {
        const b = this._ctx.createBuffer(1, 1, 22050);
        const s = this._ctx.createBufferSource();
        s.buffer = b;
        s.connect(this._ctx.destination);
        s.start(0);
        this._ctxStarted = true;
      }
    } catch (e) { /* ignore */ }
  },

  /* 預先下載＋解碼（抽獎動畫期間做，開球時即叫） */
  prepareCry(dexId) {
    const key = String(dexId);
    if (this._cryCache[key]) return Promise.resolve(this._cryCache[key]);
    if (this._cryPending[key]) return this._cryPending[key];
    const ctx = this._ctx;
    if (!ctx) return Promise.resolve(null);
    const job = fetch(cryURL(dexId))
      .then(res => (res.ok ? res.arrayBuffer() : null))
      .then(buf => {
        if (!buf) return null;
        return new Promise((resolve) => {
          const done = data => resolve(data || null);
          try {
            const p = ctx.decodeAudioData(buf, done, () => resolve(null));
            if (p && p.then) p.then(done, () => resolve(null));
          } catch (e) { resolve(null); }
        });
      })
      .then(audio => {
        if (audio) this._cryCache[key] = audio;
        delete this._cryPending[key];
        return audio;
      })
      .catch(() => {
        delete this._cryPending[key];
        return null;
      });
    this._cryPending[key] = job;
    return job;
  },

  /* 播叫聲：Web Audio（已解鎖）優先，失敗先用 HTMLAudio */
  playCry(dexId) {
    if (!SPECIES[dexId]) return;
    if (!this._ctx) this.unlockAudio();
    const key = String(dexId);
    if (this._ctx) {
      if (this._ctx.state === "suspended") this._ctx.resume();
      if (this._cryCache[key]) { this._playBuffer(this._cryCache[key]); return; }
      this.prepareCry(dexId).then(buf => {
        if (buf) this._playBuffer(buf);
        else this._playHTML(dexId);
      });
      return;
    }
    this._playHTML(dexId);
  },

  _playBuffer(buffer) {
    try {
      const src = this._ctx.createBufferSource();
      const gain = this._ctx.createGain();
      gain.gain.value = 0.8;
      src.buffer = buffer;
      src.connect(gain);
      gain.connect(this._ctx.destination);
      src.start(0);
    } catch (e) { /* ignore */ }
  },

  _playHTML(dexId) {
    const a = this._audio || (this._audio = new Audio());
    a.volume = 0.75;
    a.src = cryURL(dexId);
    a.play().catch(() => {});
  }
};

Pokedex._cryCache = {};
Pokedex._cryPending = {};
