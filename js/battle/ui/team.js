/* ============================================================
   PokeEngmon Battle - 揀隊、開戰、PvP 開戰前畫面、照顧值、戰鬥背包
   由 js/battle/battle.js 拆出（總計劃 P2.5；Rule 117）。
   - 共用狀態：S = BattleUI._.S（原本閉包嘅 let）
   - 其他檔嘅函數／數據：B.xxx（B = BattleUI._）；同一個檔入面照直接 call
   載入次序：js/battle/battle.js 之後（index.html）。
   ============================================================ */

(() => {
  const B = BattleUI._, S = B.S;

  /* 揀隊頂部：對手預覽（訓練家 / 難度 / 敵方等級 / 敵方隊伍 / EP 成本） */
  function renderBattleInfo() {
    const box = document.getElementById("ts-battle-info");
    if (!box) return;
    if (S.mode !== "ai" || !S.aiTrainer) { box.hidden = true; box.innerHTML = ""; return; }
    const meta = B.TIER_META[S.aiTier] || B.TIER_META.normal;
    const frame = S.aiTier === "inferno" ? "frame-rainbow" : S.aiTier === "hard" ? "frame-purple" : "";
    const lv = S.foeTeamEntries.length ? S.foeTeamEntries[0].level : 1;
    const roster = S.foeTeamEntries.map(m => {
      const p = dexOf(m.dexId) || {};
      return `<img src="${spriteURL(m.dexId)}" alt="${p.name || ""}" title="${p.name || ""}">`;
    }).join("");
    box.hidden = false;
    box.innerHTML = `
      <div class="tsb-card ${frame}">
        <div class="tsb-head">
          <img class="tsb-portrait" src="${S.aiTrainer.sprite}" alt="">
          <div class="tsb-text">
            <div class="tsb-name">${S.aiTrainer.name}</div>
            <div class="tsb-meta"><span class="tsb-tier tier-${S.aiTier}">${meta.label}</span> Foe Lv. ${lv} · ${S.foeTeamEntries.length} vs you</div>
          </div>
          <div class="tsb-ep">⚡ 1</div>
        </div>
        <div class="tsb-roster">${roster}</div>
        ${S.levelSyncLevel ? `<div class="tsb-sync">Level Sync → Lv. ${S.levelSyncLevel} · levels restored after the battle</div>` : ""}
        ${frame ? `<span class="fire-band" aria-hidden="true"><i></i><i></i><b></b></span>` : ""}
      </div>`;
  }

  /* 揀隊排序：同圖鑑共用 DEXSORT 定義（預設 No.） */
  const TEAM_SORT_KEY = "pokeengmon_team_sort_v1";

  function openTeamSelect(cb, fixedSize) {
    const st = loadState();
    if (window.Pet) Pet.runDailyCheck();   /* 用最新 HP／狀態揀隊 */
    /* Faint（HP 0）唔可以揀入出戰隊伍 */
    const pool = st.entries.filter(e => Array.isArray(e.ownedSpecies) && e.ownedSpecies.length && !(window.Pet && Pet.isFaint(e)));
    if (!pool.length) { B.toast("All your Pokémon have fainted — use a Revival first."); B.openMenu(); return; }
    /* PvP 用抽中嘅場制；AI 依難度決定出戰數（Easy +1、Normal 同數、Hard/Inferno −1） */
    const want = (S.mode === "ai" && S.aiTrainer && !fixedSize)
      ? B.playerSlots(S.foeTeamEntries.length, S.aiTier)
      : fixedSize;
    const teamSize = Math.min(want || 1, pool.length);
    renderBattleInfo();
    document.getElementById("team-size-label").textContent = teamSize;
    const lvSync = S.levelSyncLevel;
    const grid = document.getElementById("team-select-grid");
    const selSort = document.getElementById("team-sort");
    const dirSort = document.getElementById("team-sort-dir");

    const prefs = DEXSORT.load(TEAM_SORT_KEY);
    let owned = [];
    function applySort() {
      owned = pool.slice();
      DEXSORT.sortList(owned, prefs.sort, prefs.dir, e => {
        const c = entryCurrentSpecies(e);
        return { dexId: c[0], level: e.level || 1 };
      });
    }
    applySort();
    DEXSORT.syncControls(selSort, dirSort, prefs);

    /* order = 出戰次序（第 0 隻 = 首位出場）；撳邊隻先，邊隻就排先 */
    const order = [];
    const lineup = document.getElementById("team-lineup");
    function renderOrder() {
      grid.querySelectorAll(".team-slot").forEach(el => {
        const pos = order.indexOf(+el.dataset.idx);
        el.classList.toggle("picked", pos >= 0);
        const badge = el.querySelector(".ts-order");
        if (badge) { badge.hidden = pos < 0; badge.textContent = pos < 0 ? "" : String(pos + 1); }
      });
      lineup.hidden = order.length === 0;
      lineup.innerHTML = order.map((idx, i) => {
        const cur = entryCurrentSpecies(owned[idx]);
        return `<div class="tl-chip" data-pos="${i}">
          <span class="tl-num">${i + 1}</span>
          <img src="${spriteURL(cur[0])}" alt="${cur[1]}">
          <button class="tl-mv" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Move earlier">◀</button>
          <button class="tl-mv" data-dir="1" ${i === order.length - 1 ? "disabled" : ""} aria-label="Move later">▶</button>
        </div>`;
      }).join("");
      lineup.querySelectorAll(".tl-mv").forEach(btn => {
        btn.onclick = () => {
          const pos = +btn.closest(".tl-chip").dataset.pos;
          const to = pos + (+btn.dataset.dir);
          if (to < 0 || to >= order.length) return;
          const tmp = order[pos]; order[pos] = order[to]; order[to] = tmp;
          renderOrder();
        };
      });
    }
    function renderGrid() {
      grid.innerHTML = owned.map((e, i) => {
        const cur = entryCurrentSpecies(e);
        const lv = lvSync || e.level || 1;
        const metric = DEXSORT.metric(prefs.sort, cur[0], lv);
        return `<div class="team-slot" data-idx="${i}">
          <span class="ts-order" hidden></span>
          <img src="${spriteURL(cur[0])}" alt="${cur[1]}">
          <span class="ts-name">${cur[1]}</span>
          <span class="ts-meta">${metric}${lvSync ? " ↑" : ""}</span>
        </div>`;
      }).join("");
      grid.querySelectorAll(".team-slot").forEach(el => {
        el.onclick = () => {
          const idx = +el.dataset.idx;
          const pos = order.indexOf(idx);
          if (pos >= 0) order.splice(pos, 1);
          else if (order.length < teamSize) order.push(idx);
          else return;   /* 已滿：要先取消一隻 */
          renderOrder();
        };
      });
      renderOrder();
    }

    /* 換排序：保留已揀選嘅精靈（用 uid 追） */
    S.teamPickerRebuild = (p) => {
      if (p) { prefs.sort = p.sort; prefs.dir = p.dir; }
      const keep = order.map(i => owned[i].uid);
      applySort();
      order.length = 0;
      keep.forEach(uid => {
        const idx = owned.findIndex(e => e.uid === uid);
        if (idx >= 0) order.push(idx);
      });
      DEXSORT.syncControls(selSort, dirSort, prefs);
      renderGrid();
    };
    if (!S.teamSortBound) {
      S.teamSortBound = true;
      if (selSort) selSort.addEventListener("change", () => {
        const p = DEXSORT.load(TEAM_SORT_KEY);
        p.sort = selSort.value;
        p.dir = DEXSORT.defaultDir(p.sort);
        DEXSORT.save(TEAM_SORT_KEY, p);
        if (S.teamPickerRebuild) S.teamPickerRebuild(p);
      });
      if (dirSort) dirSort.addEventListener("click", () => {
        const p = DEXSORT.load(TEAM_SORT_KEY);
        p.dir = p.dir === "desc" ? "asc" : "desc";
        DEXSORT.save(TEAM_SORT_KEY, p);
        if (S.teamPickerRebuild) S.teamPickerRebuild(p);
      });
    }

    /* 如果一定要全選（持有數 = 隊伍大小），預設全選（次序 = 排序後次序），照樣可以調位 */
    /* 我的隊伍（背包）：預填頭 N 隻（NvN 出排頭 N 隻；Faint 嘅已喺 pool 排除），出戰前照樣可以調整 */
    const myTeam = (typeof BagUI !== "undefined" && BagUI.getTeam) ? BagUI.getTeam() : (st.myTeam || []);
    myTeam.forEach(uid => {
      const i = owned.findIndex(e => e.uid === uid);
      if (i >= 0 && order.length < teamSize && !order.includes(i)) order.push(i);
    });
    if (teamSize >= owned.length) owned.forEach((_, i) => { if (!order.includes(i)) order.push(i); });
    renderGrid();
    document.getElementById("team-select-confirm").onclick = () => {
      if (order.length !== teamSize) { B.toast(`Pick exactly ${teamSize} Pokémon`); return; }
      S.teamEntries = order.map(i => owned[i]);
      document.getElementById("team-select-modal").style.display = "none";
      cb();
    };
    document.getElementById("team-select-modal").style.display = "flex";
  }

  function launchBattle() {
    if (S.mode === "pvp") { launchPvpBattle(); return; }
    S.mySide = "p1"; S.foeSide = "p2";
    /* Inferno Level Sync：只降唔升（玩家 Pokemon 本身低過 target 就保持不變）；
       sync 前真實等級存入 expLevel，供 grantKOExp 以弱勝強加成計算用 */
    const myTeam = (S.levelSyncLevel
      ? S.teamEntries.map(e => ({ ...e, level: Math.min(e.level, S.levelSyncLevel), expLevel: e.level }))
      : S.teamEntries).map(withCare);
    S.state = BattleState.create(myTeam, S.foeTeamEntries, { seed: (Math.random() * 0xFFFFFFFF) >>> 0 });
    afterLaunch();
  }

  /* PvP：交隊伍 → 等對手 → 用 row 嘅 seed 開戰（雙方模擬一致） */
  async function launchPvpBattle() {
    B.narrate("");
    try {
      await PvpNet.submitTeam(S.pvpBattle.id, S.pvpSide, S.teamEntries.map(withCare).map(serializeEntry));
      B.toast("Waiting for opponent's team…");
      const w = PvpNet.waitForTeams(S.pvpBattle.id);
      const b = await raceTimeout(w, PvpNet.ACTION_TIMEOUT_MS);
      w.cancel && w.cancel();
      if (!b || b.state === "finished") { B.toast("Opponent left. Battle cancelled."); S.pvpBattle = null; B.openMenu(); return; }
      const foeTeam = (S.pvpSide === "p1" ? b.p2_team : b.p1_team) || [];
      /* 對手冇交隊＝走佬：我當贏，寫完場避免 row 殘留 active */
      if (!foeTeam.length) {
        B.toast("Opponent left. Battle cancelled.");
        await PvpNet.finishBattleRow(S.pvpBattle.id, S.pvpSide);
        S.pvpBattle = null;
        B.openMenu();
        return;
      }
      S.foeTeamEntries = foeTeam;
      S.mySide = S.pvpSide; S.foeSide = S.pvpSide === "p1" ? "p2" : "p1";
      /* 注意：state 嘅 p1/p2 要跟 row（唔係跟我邊邊），兩邊客戶端先會一致 */
      const myCare = S.teamEntries.map(withCare);
      const p1T = S.pvpSide === "p1" ? myCare : S.foeTeamEntries;
      const p2T = S.pvpSide === "p1" ? S.foeTeamEntries : myCare;
      S.state = BattleState.create(p1T, p2T, { seed: Number(b.seed) >>> 0 });
      /* 第 13 項：pre-battle 頁（雙方頭像、隊伍、戰績）；最多等 PRE_BATTLE_SECONDS，唔會拖到對手 action 超時 */
      await showPreBattle(b);
      if (S.pvpBattle && S.pvpBattle.id === b.id) afterLaunch();
    } catch (e) {
      console.warn("[PvP] launch error:", e);
      B.toast("Network error: " + (e && e.message ? e.message.slice(0, 60) : ""));
      S.pvpBattle = null;
      B.openMenu();
    }
  }

  /* ---------- Pre-battle 頁（第 13 項）：PvP 揀完隊、開戰之前 ---------- */
  const PRE_BATTLE_SECONDS = 10;
  async function showPreBattle(b) {
    const me = SupabaseAuth && SupabaseAuth.currentUser ? SupabaseAuth.currentUser() : null;
    const myUid = me && me.id, foeUid = S.pvpSide === "p1" ? b.p2_uid : b.p1_uid;
    const cards = window.Avatars ? await raceTimeout(Avatars.fetchCards([myUid, foeUid]), 2500) || [] : [];
    const card = uid => cards.find(c => c.uid === uid) || {};
    const st = loadState();
    const mine = card(myUid), theirs = card(foeUid);
    const myAv = window.Avatars ? Avatars.mine() : null;
    const foeAv = theirs.avatar || null;
    const myRec = { w: mine.wins != null ? mine.wins : (st.pvpWins || 0), l: mine.losses != null ? mine.losses : (st.pvpLosses || 0) };
    const teamHTML = side => S.state[side].team.map(p =>
      `<div class="pb-mon"><img src="${spriteURL(p.dexId)}" alt="${escapeHTML(p.name)}"><span>Lv.${p.level}</span></div>`).join("");
    const side = (who, av, name, rec, teamSide) => `
      <div class="pb-side pb-${who}">
        <div class="pb-avatar">${window.Avatars ? Avatars.img(av) : ""}</div>
        <div class="pb-name">${escapeHTML(name)}</div>
        <div class="pb-rec">PvP <b>${rec.w}W</b> – <b>${rec.l}L</b></div>
        <div class="pb-team">${teamHTML(teamSide)}</div>
      </div>`;
    const h2h = (theirs.h2h_w != null) ? `<div class="pb-h2h">Head-to-head <b>${theirs.h2h_w}</b> – <b>${theirs.h2h_l}</b></div>` : "";
    let box = document.getElementById("pre-battle");
    if (!box) { box = document.createElement("div"); box.id = "pre-battle"; box.className = "pre-battle"; document.body.appendChild(box); }
    box.innerHTML = `<div class="pb-card">
        <div class="pb-kicker">${S.pvpIsFriend ? "FRIEND BATTLE" : "PVP BATTLE"} · ${S.state[S.mySide].team.length} vs ${S.state[S.foeSide].team.length}</div>
        <div class="pb-row">
          ${side("me", myAv, st.playerName || "You", myRec, S.mySide)}
          <div class="pb-vs">VS</div>
          ${side("foe", foeAv, theirs.name || S.pvpFoeName || "Opponent", { w: theirs.wins || 0, l: theirs.losses || 0 }, S.foeSide)}
        </div>
        ${h2h}
        <button type="button" class="btn-big btn-primary pb-go" id="pb-go">Continue (${PRE_BATTLE_SECONDS})</button>
      </div>`;
    box.style.display = "flex";
    B.sfx("select", .9);
    await new Promise(res => {
      let left = PRE_BATTLE_SECONDS;
      const btn = document.getElementById("pb-go");
      const done = () => { clearInterval(t); box.style.display = "none"; res(); };
      const t = setInterval(() => { left -= 1; btn.textContent = `Continue (${left})`; if (left <= 0) done(); }, 1000);
      btn.onclick = () => { B.sfx("select", .9); done(); };
    });
  }

  function raceTimeout(promise, ms) {
    return Promise.race([promise, new Promise(r => setTimeout(() => r(null), ms))]);
  }

  /* 隊伍序列化：只帶開戰需要嘅欄位（入得 jsonb） */
  function serializeEntry(e) {
    return {
      chainKey: e.chainKey || null, stage: e.stage || 1, branch: e.branch || 0, dexId: e.dexId,
      level: e.level, ivs: e.ivs || {}, evs: e.evs || {},
      nature: e.nature || "hardy", moves: (e.moves || []).filter(Boolean).slice(0, 4),
      /* 特性要一齊過去，否則 PvP 兩邊特性唔同 → 即時 desync */
      ability: (typeof e.ability === "string" && e.ability) ? e.ability : null,
      /* 育成 HP／狀態：對手部機要用同一個數值建隊，否則 desync */
      battleHp: e.battleHp == null ? null : e.battleHp,
      battleStatus: e.battleStatus || null,
      battlePoison: e.battlePoison || 0,
      /* 攜帶樹果（第 4b 段）：對手部機要知先模擬到同一個觸發 */
      heldItem: (typeof e.heldItem === "string" && /-berry$/.test(e.heldItem)) ? e.heldItem : null
    };
  }

  /* 玩家 entry → 帶育成 HP（千分比）同主要狀態入場 */
  function withCare(e) {
    const p = e.pet || {};
    if (window.Care) Care.ensure(p);
    return { ...e, battleHp: typeof p.hp === "number" ? p.hp : 1000, battleStatus: p.status || null, battlePoison: p.poison || 0 };
  }

  /* 戰鬥正常完結：寫返出戰隊伍 HP／狀態（混亂唔保留；劇毒 → 普通中毒），扣用咗嘅藥。中途斷線唔會行到呢度 */
  function saveTeamCare() {
    if (!window.Care || !S.state || !B.me()) return;
    const toCare = { burn: "brn", paralyze: "par", sleep: "slp", freeze: "frz", poison: "psn", toxic: "psn" };
    const team = B.me().team.filter(p => p.uid).map(p => ({
      uid: p.uid,
      /* 上 server 結算：NaN 唔准送出去（Rule 99） */
      hp: !(p.hp > 0) ? 0 : Math.min(1000, Math.max(1, Math.round(B.hpRatio(p) * 1000))),
      status: p.hp > 0 ? (toCare[p.status] || null) : null,
      poison: p.status === "poison" && p.severePoison ? 2 : 1,
      /* 攜帶樹果食咗 → server 清 held_item（只清同一粒） */
      heldUsed: p.heldUsed || null
    }));
    const used = S.battleUsed; S.battleUsed = {};
    Care.settleBattle(team, used).catch(e => console.warn("[Battle] settle team failed:", e && e.message));
  }

  /* 戰鬥 BAG 道具：7 種藥 + Revival + 有戰鬥效果嘅持有樹果 */
  function bagIds() {
    const berries = (window.Care && Care.ownedBerries) ? Care.ownedBerries().filter(k => BattleState.ITEMS[k]) : [];
    return B.BAG_ITEMS.concat(berries);
  }
  /* 樹果跟原作：冇效果唔准用、唔扣數（Rule 63）；藥照 spec 照用照扣 */
  function berryWouldWork(id, target) {
    const it = BattleState.ITEMS[id]; const p = (target != null && B.me().team[target]) ? B.me().team[target] : B.myActive();
    if (!it || !it.berry || !p || p.hp <= 0) return true;
    if ((it.healPct || it.heal || it.healFrac) && p.hp < p.maxHp) return true;
    if (it.cures && (it.cures.includes(p.status) || (it.cures.includes("confusion") && p.volatile && p.volatile.confusion > 0))) return true;
    if (it.pp && (p.moves || []).some(m => m.pp < m.maxPp)) return true;
    return false;
  }

  /* ---------- 戰鬥中三欄背包（背包第 4a 段）：BAG = 用道具；POKéMON／暈咗 = 換 Pokémon（中欄鎖定） ---------- */
  function openBattleBag(kind, forced) {
    /* Shadow Tag（Mega Gengar）：唔係強制換、唔係 KO 後換 → 換唔到 */
    const trap = kind === "switch" && !forced && !S.shiftPick && BattleState.trappedBy ? BattleState.trappedBy(S.state, S.mySide) : null;
    if (trap) {
      B.toast(`${B.myActive().name} can't escape — ${trap.name}'s Shadow Tag!`);
      B.showMainMenu(); B.narrate(`What will ${B.myActive().name.toUpperCase()} do?`);
      return;
    }
    if (typeof BagUI === "undefined" || !BagUI.openBattle) {
      if (kind === "bag") B.showBagMenu(); else B.showSwitchMenu(forced);
      return;
    }
    B.hideActionMenus();
    BagUI.openBattle({
      mode: kind, forced: !!forced,
      team: () => B.me().team.map((p, i) => ({
        idx: i, name: p.name, dexId: p.dexId, level: p.level, hp: p.hp, maxHp: p.maxHp, status: p.status,
        severe: !!p.severePoison, active: i === B.me().active, fainted: p.hp <= 0, held: p.held || null,
        moves: (p.moves || []).map(m => ({ slug: m.slug, name: m.name, pp: m.pp, maxPp: m.maxPp }))
      })),
      items: () => battleBagItems(),
      canUse: (id, idx) => {
        const it = BattleState.ITEMS[id]; const p = B.me().team[idx];
        if (!it || !p) return "Can't use this in battle";
        if (bagLeft(id) <= 0) return "No item left";
        if (it.revive) return p.hp <= 0 ? true : "Revival only works on a fainted Pokémon";
        if (p.hp <= 0) return `${p.name} has fainted — use a Revival`;
        return berryWouldWork(id, idx) ? true : "It won't have any effect.";
      },
      onUseItem: (id, idx) => B.chooseItem(id, idx),
      onSwitch: idx => B.chooseSwitch(idx),
      onClose: () => {
        if (S.shiftPick) { B.endShift(null); return; }
        B.showMainMenu(); B.narrate(`What will ${B.myActive().name.toUpperCase()} do?`);
      }
    });
  }
  /* 戰鬥 BAG 清單：用得嘅（藥／Revival／有戰鬥效果嘅樹果）+ 用唔到嘅樹果灰色（spec §10：全部列出、用唔到變灰） */
  function battleBagItems() {
    const out = [];
    const sprite = id => (window.Care && Care.MED_INFO[id]) ? Care.ITEM_SPRITE(Care.MED_INFO[id].sprite)
      : id === "revive" ? "assets/items/revive.png" : (window.Care ? Care.ITEM_SPRITE(id) : "");
    bagIds().forEach(id => {
      const n = bagLeft(id); if (n <= 0) return;
      const it = BattleState.ITEMS[id];
      const eff = it.revive ? "Revives a fainted teammate with full HP." : it.healPct ? `Restores ${it.healPct}% HP.` : it.heal ? `Restores ${it.heal} HP.`
        : it.healFrac ? `Restores 1/${it.healFrac} of max HP.` : it.pp ? `Restores ${it.pp} PP to a move.` : `Cures ${it.cures.length > 2 ? "any status" : it.cures[0]}.`;
      out.push({ id, name: it.label, icon: sprite(id), n, cat: it.berry ? "berries" : "medicine", usable: true,
        desc: eff + (it.med ? " Counts toward overdose (3 within 5 turns)." : "") });
    });
    if (window.Care && Care.ownedBerries) Care.ownedBerries().filter(k => !BattleState.ITEMS[k]).forEach(k => {
      out.push({ id: k, name: Care.BERRIES[k].name, icon: Care.ITEM_SPRITE(k), n: Care.berryCount(k), cat: "berries", usable: false,
        desc: "Can't be used from the Bag in battle." });
    });
    /* Mega 石：灰色（要攜帶，喺揀招頁撳 MEGA） */
    if (window.Care && Care.ownedMegas) Care.ownedMegas().forEach(k => {
      out.push({ id: k, name: MEGA_STONES[k].stoneName, icon: Care.ITEM_SPRITE(k), n: Care.megaCount(k), cat: "held", usable: false,
        desc: "Can't use this in battle — a Pokémon has to hold it. Tap MEGA on the move screen to Mega Evolve." });
    });
    return out;
  }

  /* 背包數量（扣埋今場已用） */
  function bagLeft(id) {
    return window.Pet ? Math.max(0, (Pet.countOf(id) || 0) - (S.battleUsed[id] || 0)) : 0;
  }

  function afterLaunch() {
    S.acting = true;   /* intro 期間鎖住操作 */
    S.forfeited = false;
    S.battleUsed = {};
    B.refreshBagButton();
    /* 速度切換只限 AI 對戰；結算畫面重設 */
    S.battleSpeed = (S.mode === "ai" && localStorage.getItem("pokeengmon_battle_speed") === "2") ? 2 : 1;
    B.syncSpeedButton();
    document.getElementById("battle-result").style.display = "none";
    /* 還原精靈動畫狀態（上一場可能殘留 faint/recall/pop class） */
    for (const id of ["foe-sprite", "my-sprite"]) {
      const sp = document.getElementById(id);
      sp.classList.remove("intro-pop", "anim-faint", "anim-recall", "anim-hit", "anim-lunge-foe", "anim-lunge-mine");
      sp.style.visibility = "";
    }
    document.querySelectorAll(".battle-hpbox").forEach(b => {
      b.style.setProperty("--hp-slide", "0ms");
      b.style.transform = "translateX(0)";
    });
    App.showView("view-battle");
    /* 背包第 4a 段：戰鬥畫面轉橫（打直會先出轉手機提示） */
    if (typeof BattleLand !== "undefined") BattleLand.enter();
    B.render();
    /* 對戰 BGM（Battle! Wild Pokémon）：接管 town BGM，完場先交返 */
    try { if (window.CaptureScene) CaptureScene.audio.startBGM(); } catch (e) {}
    B.playIntro();
  }

  /* ---------- 開場序列（FRLG：訓練家見面 → 拋球） ---------- */
  function foeTrainerName() {
    /* 好友局用邀請帶入嘅名，隨機 PvP 冇名就顯示 RIVAL */
    if (S.mode === "pvp" && S.pvpFoeName) return S.pvpFoeName.toUpperCase();
    return (S.mode === "ai" && S.aiTrainer) ? S.aiTrainer.name.toUpperCase() : "RIVAL";
  }
  function foeTrainerSprite() {
    return (S.mode === "ai" && S.aiTrainer) ? S.aiTrainer.sprite : "assets/trainers/rival.png";
  }

  Object.assign(B, {
    renderBattleInfo, TEAM_SORT_KEY, openTeamSelect, launchBattle, launchPvpBattle, PRE_BATTLE_SECONDS, showPreBattle,
    raceTimeout, serializeEntry, withCare, saveTeamCare, bagIds, berryWouldWork, openBattleBag, battleBagItems,
    bagLeft, afterLaunch, foeTrainerName, foeTrainerSprite
  });
})();
