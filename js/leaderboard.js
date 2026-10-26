/* ============================================================
   PokeEngmon - Leaderboard Top 50
   v133：全球榜 anon 可讀；未登入彈 popup 提示 join
   排名準則：持有 Pokémon 總數（desc）；partner = 每個用戶當前設定嘅 active 拍檔
   Migration：supabase/migrations/supabase-migrate-20261026c-leaderboard-anon-read.sql
   ============================================================ */

const Leaderboard = {
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
    // 未登入 → 彈 popup（一次性，localStorage 記住）
    const loggedIn = !!(window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser());
    if (!loggedIn && !localStorage.getItem("lb_login_prompt_seen")) {
      this._showLoginPrompt();
    }
  },

  async _rpcRows() {
    if (!window.SupabaseAuth || !SupabaseAuth.isEnabled()) return null;
    try {
      const raw = await SupabaseAuth._rpcTable("get_leaderboard", {});
      console.log("[Leaderboard] _rpcTable raw:", raw, "isArray:", Array.isArray(raw), "len:", raw?.length);
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
    let rows = await this._rpcRows();
    if (!rows) rows = [];

    const player = this._playerRow();
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
    // 有 RPC 數據 → 顯示；冇 RPC 數據（server 空 or RPC fail）→ 顯示空狀態
    const hasRpc = rows.some(r => r.fromRpc);
    if (!hasRpc && player.totalOwned === 0) {
      list.innerHTML = `
        <div class="lb-empty">
          <div class="lb-empty-icon">🏆</div>
          <div class="lb-empty-title">No trainers yet!</div>
          <div class="lb-empty-sub">Be the first to catch a Pokémon and get on the board!</div>
        </div>
      `;
    } else {
      list.innerHTML = top.map((r, i) => this._rowHTML(r, i + 1)).join("");
    }

    // 玩家跌出 Top 50 先顯示 sticky youCard
    const youCard = document.getElementById("lb-you");
    if (youRank > 50) {
      youCard.hidden = false;
      youCard.innerHTML = `<div class="lb-you-rank">Your Rank: #${youRank}</div>` +
        this._rowHTML(rows[youRank - 1], youRank);
    } else {
      youCard.hidden = true;
      youCard.innerHTML = "";
    }
  },

  /* 未登入 popup：一次性，localStorage 記住 */
  _showLoginPrompt() {
    localStorage.setItem("lb_login_prompt_seen", "1");
    const html = `
      <div class="lb-login-modal" id="lb-login-modal">
        <div class="lb-login-card">
          <div class="lb-login-icon">�</div>
          <div class="lb-login-title">Connect with Google to join the global leaderboard!</div>
          <div class="lb-login-sub">You can browse the board as a guest — sign in to save your rank and unlock cloud sync.</div>
          <div class="lb-login-actions">
            <button class="lb-login-cancel" id="lb-login-cancel">Maybe later</button>
            <button class="lb-login-go" id="lb-login-go">🔐 Connect with Google</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", html);
    const modal = document.getElementById("lb-login-modal");
    document.getElementById("lb-login-cancel").onclick = () => modal.remove();
    document.getElementById("lb-login-go").onclick = () => {
      modal.remove();
      App.openLoginHub();
    };
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  }
};
