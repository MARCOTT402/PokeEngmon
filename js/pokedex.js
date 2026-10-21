/* ============================================================
   PokeEngmon - 圖鑑（Pokedex）
   擁有 → 有圖有名；未擁有 → 灰色剪影
   ============================================================ */

/* PokeAPI 叫聲（ogg）；iOS 唔支援 ogg 時改用 Showdown 嘅 mp3 後備 */
const CRY_LATEST = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";
const CRY_FALLBACK = "https://play.pokemonshowdown.com/audio/cries";

function crySlug(name) {
  return String(name).toLowerCase()
    .replace(/♀/g, "f").replace(/♂/g, "m")
    .replace(/[^a-z0-9]/g, "");
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
      `收集進度 <b>${owned.size}</b> / ${TOTAL_SPECIES}`;
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
        <span class="dex-name">${isOwned ? sp.name : "？？？"}</span>
        ${isOwned ? `<span class="dex-rarity" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>` : ""}
      `;
      if (isOwned) {
        cell.onclick = () => this.showDetail(sp.dexId);
        /* 撳圖案 → 播叫聲；撳卡片其他地方 → 睇詳情 */
        const img = cell.querySelector("img");
        img.title = "點一下聽叫聲";
        img.onclick = (e) => { e.stopPropagation(); this.playCry(sp.dexId); };
      }
      grid.appendChild(cell);
    });
  },

  /* 已擁有 → 大圖 + 資料 Modal */
  showDetail(dexId) {
    const sp = SPECIES[dexId];
    const st = loadState();
    const chain = EVOLUTION_CHAINS.find(c => c.key === sp.chainKey);
    const entry = st.entries.find(e => e.chainKey === sp.chainKey);
    const rz = RARITY[sp.rarity];

    /* 進化階段顯示（線性 + 伊貝分支） */
    const nodes = [];
    chain.stages.forEach((s, i) => {
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

    /* 等級／能力值／招式／糖果 */
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
      const moveChips = (entry.moves || []).length
        ? entry.moves.map(m => `<span class="dex-move">${moveLabel(m)}</span>`).join("")
        : `<span class="dex-move">未有招式</span>`;
      extraHTML = `
        <div class="dex-detail-zh">Lv.<span class="dex-level">${level}</span> / 99
          ・ <span class="dex-stars">${"★".repeat(entry.stars || 1)}</span></div>
        <div class="expbar"><i style="width:${pct}%"></i></div>
        <div class="hero-exp-text">${level >= MAX_LEVEL ? "Lv.99 MAX" : `EXP ${into} / ${span}（下一級）`}</div>
        <div class="dex-detail-zh">性格：${moveLabel(entry.nature)} ・ IV 31 ・ EV ${evTotal(entry.evs)} / ${MAX_EV_TOTAL}</div>
        <div class="dex-stats">${statCells}</div>
        <div class="dex-moves">
          <div class="dex-moves-title">招式（${(entry.moves || []).length}/4）</div>
          ${moveChips}
        </div>
        <div class="dex-candy">
          🍬 糖果 × ${entry.candies} ・ 重複抽到 ${entry.dupes} 次
          <br>
          <button id="btn-feed-candy" ${entry.candies > 0 && level < MAX_LEVEL ? "" : "disabled"}>
            餵 1 粒 → 升 1 級
          </button>
        </div>`;
    }

    App.showModal(`
      <div class="dex-detail">
        <span class="rarity-chip" style="background:${rz.bg};color:${rz.color}">${rz.label}</span>
        <img class="dex-art" id="dex-art" src="${artworkURL(dexId)}" alt="${sp.name}" title="點一下聽叫聲"
             onerror="this.onerror=null;this.src='${spriteURL(dexId)}';this.classList.add('pixel')">
        <div class="dex-detail-name">${sp.name}</div>
        <div class="dex-detail-zh">${sp.zh} ・ No.${String(dexId).padStart(3, "0")}</div>
        <div class="dex-stage-label">進化狀態：第 ${sp.stage} 階</div>
        <div class="evo-chain">${stageDots}</div>
        ${extraHTML}
      </div>
    `);
    const art = document.getElementById("dex-art");
    if (art) art.onclick = () => this.playCry(dexId);
    const feed = document.getElementById("btn-feed-candy");
    if (feed) feed.onclick = () => this.feedCandy(entry);
  },

  /* 餵糖果 → 升一級（會觸發學招式／進化） */
  feedCandy(entry) {
    if (!entry || entry.candies <= 0) return;
    const res = useEntryCandy(entry, 1);
    this.closeModal();
    this.render();
    App.renderHome();
    if (res.levelsGained === 0) { App.toast("已經 Lv.99 喇！"); return; }
    App.toast(`升到 Lv.${entry.level}！糖果剩 ${entry.candies}`);
    if (res.evolvedTo) setTimeout(() => App.showEvolveModal(res.evolvedTo), 300);
    if (res.learned.length) {
      setTimeout(() => App.queueMoveLearn(entry, res.learned), res.evolvedTo ? 1300 : 400);
    }
  },

  /* 播叫聲：PokeAPI ogg；唔支援／載入失敗就用 mp3 後備 */
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
