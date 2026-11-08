/* ============================================================
   PokeEngmon Battle - Battle menu 訓練員卡（spec .trae/specs/20261108-trainer-level.md §4–5）
   - 頭像：Avatars.mine() 全身像企喺戰鬥草地台；撳頭像 → Avatars.openPicker（同 Friends 頁同一個）
   - 資料牌：名（st.playerName）＋ Trainer Lv（TrainerLevel.mine()）＋ PvP 勝率同一行 ＋ W/L ＋ EXP 條
   - My Team：背包 BagUI.getTeam() 6 格（名／Lv／HP／狀態）只讀；撳 → BagUI.open({ from: "battle" })
   - 打 AI 訓練員唔再開揀隊頁：B.teamLineup(n) = My Team 次序、跳過 Faint、最多 n 隻（team.js openTeamSelect 用）
   共用狀態／跨檔：B = BattleUI._（Rule 117）。載入次序：js/battle/ui/menu.js 之後。
   ============================================================ */

(() => {
  const B = BattleUI._;
  const esc = (s) => escapeHTML(s);

  /* 純函數（單元測試）：entries = 全部 entry；teamUids = My Team 次序；isFaint(entry) */
  function pickLineup(entries, teamUids, n, isFaint) {
    const byUid = new Map((entries || []).map(e => [String(e.uid), e]));
    const out = [];
    for (const uid of (teamUids || [])) {
      if (out.length >= n) break;
      const e = byUid.get(String(uid));
      if (e && !(isFaint && isFaint(e))) out.push(e);
    }
    return out;
  }

  const isFaint = e => !!(window.Pet && Pet.isFaint(e));
  const myTeamUids = () => (typeof BagUI !== "undefined" && BagUI.getTeam) ? BagUI.getTeam() : (loadState().myTeam || []);

  /** 打 AI：My Team 頭 n 隻健康嘅 */
  function teamLineup(n) {
    return pickLineup(loadState().entries, myTeamUids(), n, isFaint);
  }

  function teamInfo() {
    const st = loadState();
    const byUid = new Map(st.entries.map(e => [String(e.uid), e]));
    return myTeamUids().map(uid => {
      const e = byUid.get(String(uid)); if (!e) return null;
      const [dex, name] = entryCurrentSpecies(e);
      const h = window.Care ? Care.hpOf(e) : { pct: 100, faint: false };
      const sk = window.Care ? Care.statusKey(e.pet) : null;
      return { e, dex, name, lv: e.level || 1, pct: Number.isFinite(h.pct) ? h.pct : 100, faint: !!h.faint, status: sk };
    }).filter(Boolean);
  }

  const loggedIn = () => !!(window.SupabaseAuth && SupabaseAuth.isLoggedIn && SupabaseAuth.isLoggedIn());

  function infoHTML(st) {
    const name = st.playerName || "Trainer";
    const lv = window.TrainerLevel ? TrainerLevel.mine() : null;
    const w = Number(st.pvpWins) || 0, l = Number(st.pvpLosses) || 0, total = w + l;
    const online = loggedIn();
    const rate = online && total
      ? `<span class="tc-wr-big">${Math.round(w / total * 100)}<small>%</small></span>`
      : `<span class="tc-wr-big none">—</span>`;
    const wl = !online ? "Log in to battle online"
      : !total ? "No PvP battles yet"
      : `<b class="w">${w}W</b> <b class="l">${l}L</b> <span>· ${total} battle${total === 1 ? "" : "s"}</span>`;
    let lvTag = "", bar = "";
    if (lv) {
      lvTag = `<span class="tc-lvtag"><i>Lv</i>${lv.lv}</span>`;
      const pct = lv.need ? Math.min(100, Math.round(lv.into / lv.need * 100)) : 100;
      bar = `<div class="tc-xp"><span class="lbl">EXP</span><span class="track"><i style="width:${pct}%"></i></span></div>
        <div class="tc-xp-note">${lv.need ? `${lv.into} / ${lv.need} EXP to Lv${lv.lv + 1}` : "MAX LEVEL"}</div>`;
    } else {
      bar = `<div class="tc-xp-note">Log in to earn Trainer EXP</div>`;
    }
    return `<div class="tc-row1"><span class="tc-name">${esc(name)}</span>${lvTag}</div>
      <div class="tc-row2"><span class="tc-wr-lbl">PvP WIN RATE</span>${rate}</div>
      <div class="tc-wr-wl">${wl}</div>
      ${bar}`;
  }

  function slotsHTML(team) {
    const leadIdx = team.findIndex(p => !p.faint);   /* 暈咗會跳過，第一隻未暈先係真正出場 */
    const hpCls = p => p.faint ? "faint" : p.pct < 20 ? "low" : p.pct <= 50 ? "mid" : "";
    let html = "";
    for (let i = 0; i < 6; i++) {
      const p = team[i];
      if (!p) { html += `<button type="button" class="tc-slot empty" data-bag aria-label="Empty slot — set your team in the Bag"><span class="tc-ball" aria-hidden="true"></span></button>`; continue; }
      const st = p.status && !p.faint && window.Care ? Care.STATUS_INFO[p.status] : null;
      html += `<button type="button" class="tc-slot ${i === leadIdx ? "lead" : ""} ${p.faint ? "fnt" : ""}" data-bag
          aria-label="${esc(p.name)}, level ${p.lv}${p.faint ? ", fainted" : ""}" title="${esc(p.name)}">
        <span class="tc-no">${i + 1}</span>
        ${st ? `<img class="tc-st" src="assets/battle/ui/status-${st.icon}.png" alt="${st.label}">` : ""}
        ${p.faint ? `<img class="tc-st" src="assets/battle/ui/status-fnt.png" alt="Fainted">` : ""}
        <img class="tc-spr" src="${animatedURL(p.dex)}" alt="" draggable="false">
        <span class="tc-pname">${esc(p.name)}</span>
        <span class="tc-lv">Lv${p.lv}</span>
        <span class="bag-minihp ${hpCls(p)}"><i style="width:${p.faint ? 0 : p.pct}%"></i></span>
      </button>`;
    }
    const healthy = team.filter(p => !p.faint).length;
    const hint = !team.length
      ? `Your team is empty — add Pokémon in the <b>Bag</b> to battle.`
      : !healthy
        ? `Everyone has fainted — heal them in the <b>Bag</b> first.`
        : healthy < team.length
          ? `Fainted Pokémon are skipped — <b>${esc(team[leadIdx].name)}</b> goes out first.`
          : `Trainer battles send out your team <b>in this order</b>.`;
    return { html, hint, warn: !team.length || !healthy };
  }

  function renderTrainerCard() {
    const card = document.getElementById("bm-trainer-card");
    if (!card) return;
    const st = loadState();
    const av = window.Avatars ? Avatars.mine() : "red";
    const team = teamInfo();
    const s = slotsHTML(team);
    card.innerHTML = `
      <div class="tc-field">
        <button type="button" class="tc-trainer" id="tc-trainer" aria-label="Change trainer avatar (${esc(window.Avatars ? Avatars.label(av) : "")})">
          <img src="${window.Avatars ? Avatars.url(av) : ""}" alt="" draggable="false">
        </button>
        <div class="tc-win">${infoHTML(st)}</div>
      </div>
      <div class="tc-team">
        <div class="tc-team-head">
          <span class="tc-team-title"><img src="assets/battle/ui/poke-ball-big.png" alt="">MY TEAM <em>${team.length}/6</em></span>
          <button type="button" class="tc-bag-btn" data-bag>Edit in Bag<span aria-hidden="true">›</span></button>
        </div>
        <div class="tc-slots">${s.html}</div>
        <div class="tc-hint ${s.warn ? "warn" : ""}">${s.hint}</div>
      </div>`;
    if (!card._bound) {
      card._bound = true;
      card.addEventListener("click", e => {
        const t = /** @type {Element} */ (e.target);
        if (t.closest("#tc-trainer")) { if (window.Avatars) Avatars.openPicker(() => renderTrainerCard()); return; }
        if (t.closest("[data-bag]")) openBag();
      });
    }
  }

  function openBag() {
    if (typeof BagUI !== "undefined") BagUI.open({ from: "battle" });
  }

  /* Tier 卡：「You bring N」下面顯示實際出場嗰幾隻（My Team 次序） */
  function bringHTML(n) {
    const go = teamLineup(n);
    const icons = go.map(e => {
      const [dex, name] = entryCurrentSpecies(e);
      return `<img src="${animatedURL(dex)}" alt="${esc(name)}" title="${esc(name)}">`;
    }).join("");
    const short = go.length < n;
    const note = !go.length ? "No healthy Pokémon in your team" : short ? `Only ${go.length} ready` : "from My Team";
    return `<span class="tc-bring ${short ? "short" : ""}">${icons}<small>${note}</small></span>`;
  }

  /* 頭像喺其他頁改咗（Friends）→ 卡跟住更新 */
  document.addEventListener("trainer-avatar-changed", () => renderTrainerCard());
  document.addEventListener("trainer-exp-changed", () => renderTrainerCard());

  Object.assign(B, { renderTrainerCard, teamLineup, pickLineup, bringHTML, openTeamBag: openBag });
})();
