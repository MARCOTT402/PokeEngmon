/* ============================================================
   PokeEngmon - Leaderboard Top 50
   v137：#3 partner level 由 exp derive；#4 totalOwned 用鏈數，同 server 對齊
   排名準則：持有進化鏈數（desc）；partner = active 優先，否則最新 entry
   Migration：supabase/migrations/supabase-migrate-20261026f-leaderboard-partner-exp.sql
   ============================================================ */

const Leaderboard = {
  /* chain_key → [dexId, enName, level]。有 exp/branch 就 derive 形態 + 等級。 */
  _resolvePartner(chainKey, exp, branch) {
    if (!chainKey) return [0, "—", 0];
    /* 舊 settle_capture 遺留：dex_<id> */
    if (String(chainKey).startsWith("dex_")) {
      const id = parseInt(chainKey.slice(4), 10);
      if (!isNaN(id) && SPECIES[id]) return [id, SPECIES[id].name, 1];
    }
    /* EVOLUTION_CHAINS 係 array，唔係 object — 必須 .find(c => c.key === ...) */
    const chain = EVOLUTION_CHAINS.find(c => c.key === chainKey);
    if (!chain) return [0, "—", 0];
    /* 有 exp → 重推 stage／level；冇就 show stage-1 Lv.1 */
    if (exp != null && typeof deriveEntryFields === "function") {
      const derived = deriveEntryFields({
        chainKey,
        exp: Number(exp) || 0,
        branch: (branch === 0 || branch) ? branch : null,
        dupes: 0
      });
      const cur = entryCurrentSpecies(derived);
      return [cur[0], cur[1], derived.level || 1];
    }
    return [chain.stages[0][0], chain.stages[0][1], 1];
  },

  async open() {
    App.showView("view-leaderboard");
    await this.render();
    /* 未登入 → 彈 popup（一次性，localStorage 記住） */
    const loggedIn = !!(window.SupabaseAuth && SupabaseAuth.isEnabled() && SupabaseAuth.currentUser());
    if (!loggedIn && !localStorage.getItem("lb_login_prompt_seen")) {
      this._showLoginPrompt();
    }
  },

  async _rpcRows() {
    if (!window.SupabaseAuth || !SupabaseAuth.isEnabled()) return null;
    try {
      const raw = await SupabaseAuth._rpcTable("get_leaderboard", {});
      if (!Array.isArray(raw)) return null;
      return raw.map(row => {
        const [partnerDex, partnerName, derivedLv] = this._resolvePartner(
          row.partner_chain_key,
          row.partner_exp,
          row.partner_branch
        );
        return {
          name: row.trainer_name || "Anonymous Trainer",
          partnerDex, partnerName,
          partnerLevel: derivedLv || row.partner_level || 0,
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
    /* 用進化鏈數（entries.length），唔用 collectedCount（進化形態會灌水） */
    return {
      name: st.playerName || "You",
      partnerDex, partnerName, partnerLevel,
      totalOwned: (st.entries || []).length,
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
      /* 保留 server totalOwned 做排名；本地只覆蓋名／partner 顯示 */
      const serverOwned = existing.totalOwned;
      Object.assign(existing, { ...player, isYou: true, totalOwned: serverOwned, fromRpc: true });
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
          <div class="lb-login-icon">🏅</div>
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
