/* ============================================================
   PokeEngmon - Leaderboard Top 50
   v132+：真 RPC get_leaderboard()，冇 mock fallback
   排名準則：持有 Pokémon 總數（desc）；partner = 每個用戶當前設定嘅 active 拍檔
   Migration：supabase/migrations/supabase-migrate-20261026a-leaderboard-rpc.sql
   ============================================================ */

const Leaderboard = {
  /* 將 chain_key（可能係 species name 或舊 dex_<id> 格式）解析返 [dexId, enName] */
  _resolvePartner(chainKey) {
    if (!chainKey) return [0, "—"];
    if (chainKey.startsWith("dex_")) {
      const id = parseInt(chainKey.slice(4), 10);
      if (!isNaN(id) && SPECIES[id]) return [id, SPECIES[id].enName];
    }
    const chain = EVOLUTION_CHAINS[chainKey];
    if (chain) return [chain.stages[0][0], chain.stages[0][1]];
    for (const key in EVOLUTION_CHAINS) {
      const st = EVOLUTION_CHAINS[key].stages[0];
      if (st[1] === chainKey) return [st[0], st[1]];
    }
    return [0, "—"];
  },

  async open() {
    App.showView("view-leaderboard");
    await this.render();
  },

  /* ---------- 真 RPC：call get_leaderboard() ---------- */
  async _rpcRows() {
    if (!window.SupabaseAuth || !SupabaseAuth.isEnabled()) return null;
    if (!SupabaseAuth.currentUser()) return null;
    try {
      const raw = await SupabaseAuth._rpc("get_leaderboard", {});
      if (!Array.isArray(raw)) return null;
      return raw.map(row => {
        const [partnerDex, partnerName] = this._resolvePartner(row.partner_chain_key);
        return {
          name: row.trainer_name || "Anonymous Trainer",
          partnerDex, partnerName,
          partnerLevel: row.partner_level || 0,
          totalOwned: row.total_owned || 0,
          accountUuid: row.account_uuid || null,
          fromRpc: true
        };
      });
    } catch (e) {
      console.warn("[Leaderboard] RPC failed:", e);
      return null;
    }
  },

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

  async render() {
    const loggedIn = !!(window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser());

    let rows = await this._rpcRows();
    if (!rows) rows = [];

    const player = this._playerRow();

    // 玩家已喺 RPC 入面 → 用本地最新狀態覆蓋
    const myUuid = SupabaseAuth?.currentUser?.()?.id?.toLowerCase();
    const existing = rows.find(r => r.accountUuid && myUuid && r.accountUuid.toLowerCase() === myUuid);
    if (existing) {
      Object.assign(existing, { ...player, isYou: true });
    } else {
      rows.push(player);
    }

    rows.sort((a, b) =>
      b.totalOwned - a.totalOwned ||
      b.partnerLevel - a.partnerLevel ||
      a.name.localeCompare(b.name)
    );
    const youRank = rows.findIndex(r => r.isYou) + 1;
    const top = rows.slice(0, 50);

    const list = document.getElementById("leaderboard-list");

    // --- 未登入：顯示 login prompt，下方顯示玩家自己一行 ---
    if (!loggedIn) {
      list.innerHTML = `
        <div class="lb-lock">
          <div class="lb-lock-icon">🔒</div>
          <div class="lb-lock-title">Connect with Google to see the global leaderboard</div>
          <div class="lb-lock-sub">Your progress stays on this device — sign in to compete with other trainers!</div>
          <button class="lb-lock-btn" id="lb-connect-btn">🔐 Connect with Google</button>
        </div>
        <div class="lb-lock-tag">Your local stats</div>
        ${this._rowHTML(player, 1)}
      `;
      document.getElementById("lb-connect-btn").onclick = () => App.openLoginHub();
    }
    // --- 已登入但冇任何人（玩家冇 Pokémon）---
    else if (!rows.some(r => r.fromRpc) && player.totalOwned === 0) {
      list.innerHTML = `
        <div class="lb-empty">
          <div class="lb-empty-icon">🏆</div>
          <div class="lb-empty-title">No trainers yet!</div>
          <div class="lb-empty-sub">Be the first to catch a Pokémon and get on the board!</div>
        </div>
      `;
    }
    // --- 正常：顯示 Top 50 ---
    else {
      list.innerHTML = top.map((r, i) => this._rowHTML(r, i + 1)).join("");
    }

    const youCard = document.getElementById("lb-you");
    if (!loggedIn) {
      youCard.hidden = true;
      youCard.innerHTML = "";
    } else if (youRank > 50) {
      youCard.hidden = false;
      youCard.innerHTML = `<div class="lb-you-rank">Your Rank: #${youRank}</div>` +
        this._rowHTML(rows[youRank - 1], youRank);
    } else {
      youCard.hidden = true;
      youCard.innerHTML = "";
    }
  }
};
