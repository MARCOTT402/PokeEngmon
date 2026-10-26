/* ============================================================
   PokeEngmon - Leaderboard（Top 50 prototype）
   Mock data：deterministic seed，reload 一致
   排名準則：持有 Pokémon 總數（desc）；partner = 每個用戶當前設定嘅拍檔
   ============================================================ */

const Leaderboard = {
  /* mulberry32：定死 seed → mock 榜每次 reload 一樣，唔會閃 */
  _rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  TRAINER_NAMES: [
    "Ash", "Misty", "Brock", "Gary", "Serena", "Dawn", "May", "Clemont",
    "Lillie", "Gladion", "Nessa", "Bea", "Korrina", "Volkner", "Elesa", "Skyla",
    "Roxie", "Marlon", "Flannery", "Winona", "Norman", "Roark", "Gardenia", "Fantina",
    "Candice", "Jasmine", "Pryce", "Clair", "Morty", "Chuck", "Bugsy", "Whitney",
    "Falkner", "Sabrina", "Blaine", "Surge", "Erika", "Koga", "Janine", "Bruno",
    "Lorelei", "Agatha", "Lance", "Steven", "Wallace", "Cynthia", "Alder", "Iris",
    "Diantha", "Leon", "Hop", "Marnie", "Bede", "Raihan", "Piers", "Allister"
  ],

  open() {
    App.showView("view-leaderboard");
    this.render();
  },

  /* 50 個 mock 訓練員；partner = 佢哋當前設定嘅拍檔（mock 直接賦值） */
  _mockRows() {
    const rnd = this._rng(20261026);
    const rows = [];
    const used = new Set();
    for (let i = 0; i < 50; i++) {
      let name;
      do {
        name = this.TRAINER_NAMES[Math.floor(rnd() * this.TRAINER_NAMES.length)];
      } while (used.has(name) && used.size < this.TRAINER_NAMES.length);
      used.add(name);
      const chain = EVOLUTION_CHAINS[Math.floor(rnd() * EVOLUTION_CHAINS.length)];
      const stg = chain.stages[Math.floor(rnd() * chain.stages.length)];
      /* 分佈：頭部接近全圖鑑，尾部漸疏 */
      const totalOwned = Math.max(1, Math.round(151 * (1 - Math.pow(rnd(), 1.8))));
      /* partner 等級同收集度輕微掛鈎，加少許隨機 */
      const partnerLevel = Math.max(1, Math.min(100, Math.round(totalOwned * 0.45 + rnd() * 35)));
      rows.push({ name, partnerDex: stg[0], partnerName: stg[1], partnerLevel, totalOwned });
    }
    return rows;
  },

  /* 真實玩家行：partner = 當前設定嘅 active 拍檔 */
  _playerRow() {
    const st = loadState();
    const entry = getActiveEntry();
    let partnerDex = 0, partnerName = "—", partnerLevel = 0;
    if (entry) {
      const cur = entryCurrentSpecies(entry);
      partnerDex = cur[0];
      partnerName = cur[1];
      partnerLevel = entry.level || 1;
    }
    return {
      name: st.playerName || "You",
      partnerDex, partnerName, partnerLevel,
      totalOwned: collectedCount(),
      isYou: true
    };
  },

  _rowHTML(r, rank) {
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
    const img = r.partnerDex
      ? `<img class="lb-sprite" src="${animatedURL(r.partnerDex)}" alt="" loading="lazy"
              onerror="this.onerror=null;this.src='${spriteURL(r.partnerDex)}'">`
      : `<span class="lb-sprite lb-none">?</span>`;
    return `<div class="lb-row${r.isYou ? " lb-you" : ""}${rank <= 3 ? " lb-top" + rank : ""}">
      <div class="lb-rank">${medal}</div>
      ${img}
      <div class="lb-mid">
        <div class="lb-name">${escapeHTML(r.name)}${r.isYou ? ' <span class="lb-you-tag">YOU</span>' : ""}</div>
        <div class="lb-partner">${escapeHTML(r.partnerName)} · Lv.${r.partnerLevel}</div>
      </div>
      <div class="lb-count"><b>${r.totalOwned}</b><span>Pokémon</span></div>
    </div>`;
  },

  render() {
    const all = this._mockRows();
    all.push(this._playerRow());
    all.sort((a, b) =>
      b.totalOwned - a.totalOwned ||
      b.partnerLevel - a.partnerLevel ||
      a.name.localeCompare(b.name)
    );
    const youRank = all.findIndex(r => r.isYou) + 1; /* 1-based */
    const top = all.slice(0, 50);

    const list = document.getElementById("leaderboard-list");
    list.innerHTML = top.map((r, i) => this._rowHTML(r, i + 1)).join("");

    /* 玩家跌出 Top 50 → 上方 sticky 卡顯示實際名次 */
    const youCard = document.getElementById("lb-you");
    if (youRank > 50) {
      youCard.hidden = false;
      youCard.innerHTML = `<div class="lb-you-rank">Your Rank: #${youRank}</div>` +
        this._rowHTML(all[youRank - 1], youRank);
    } else {
      youCard.hidden = true;
      youCard.innerHTML = "";
    }
  }
};
