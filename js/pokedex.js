/* ============================================================
   PokeEngmon - Pokedex
   Owned -> full art & data; not owned -> grey silhouette
   ============================================================ */

/* PokeAPI cries (ogg); iOS falls back to Showdown mp3 */
const CRY_LATEST = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";
const CRY_FALLBACK = "https://play.pokemonshowdown.com/audio/cries";

function crySlug(name) {
  return String(name).toLowerCase()
    .replace(/♀/g, "f").replace(/♂/g, "m")
    .replace(/[^a-z0-9]/g, "");
}

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

  /* Unlock audio inside a user gesture (mobile autoplay policy),
     so the cry can still play a few seconds later when the ball opens */
  unlockAudio() {
    try {
      const a = this._audio || (this._audio = new Audio());
      if (a.dataset.unlocked) return;
      a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
      a.play().then(() => {
        a.dataset.unlocked = "1";
        a.pause();
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  },

  /* Play cry: PokeAPI ogg; fall back to mp3 */
  playCry(dexId) {
    const sp = SPECIES[dexId];
    if (!sp) return;
    const a = this._audio || (this._audio = new Audio());
    a.dataset.fallback = "0";
    a.onerror = () => this._fallbackCry(sp.name, a);
    a.volume = 0.75;
    a.src = `${CRY_LATEST}/${dexId}.ogg`;
    a.play().catch(() => this._fallbackCry(sp.name, a));
  },

  _fallbackCry(name, a) {
    if (a.dataset.fallback === "1") return;
    a.dataset.fallback = "1";
    a.src = `${CRY_FALLBACK}/${crySlug(name)}.mp3`;
    a.play().catch(() => {});
  }
};
