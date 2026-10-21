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

    /* 經驗條 */
    let expHTML = "";
    if (entry) {
      const maxStage = chainMaxStage(chain);
      if (entry.stage < maxStage) {
        const threshold = GAME_CONFIG.EVO_EXP[entry.stage - 1];
        const prev = entry.stage >= 2 ? GAME_CONFIG.EVO_EXP[entry.stage - 2] : 0;
        const pct = Math.min(100, ((entry.exp - prev) / (threshold - prev)) * 100);
        expHTML = `
          <div class="expbar"><i style="width:${pct}%"></i></div>
          <div class="hero-exp-text">EXP ${entry.exp} / ${threshold}（下次進化）</div>`;
      } else if (maxStage === 1) {
        expHTML = `<div class="hero-exp-text">EXP ${entry.exp} ・ 呢隻唔會進化</div>`;
      } else {
        expHTML = `<div class="hero-exp-text">EXP ${entry.exp} ・ 已完成進化 🎉</div>`;
      }
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
        ${expHTML}
      </div>
    `);
    const art = document.getElementById("dex-art");
    if (art) art.onclick = () => this.playCry(dexId);
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
