/* ============================================================
   PokeEngmon Battle - 戰鬥畫面 render、狀態章、招式／換隻／背包選單、Mega 掣
   由 js/battle/battle.js 拆出（總計劃 P2.5；Rule 117）。
   - 共用狀態：S = BattleUI._.S（原本閉包嘅 let）
   - 其他檔嘅函數／數據：B.xxx（B = BattleUI._）；同一個檔入面照直接 call
   載入次序：js/battle/battle.js 之後（index.html）。
   ============================================================ */

(() => {
  const B = BattleUI._, S = B.S;

  /* ---------- helpers ---------- */
  function me() { return S.state[S.mySide]; }
  function foe() { return S.state[S.foeSide]; }
  function myActive() { return active(S.state, S.mySide); }
  function foeActive() { return active(S.state, S.foeSide); }
  function active(st, side) { return st[side].team[st[side].active]; }

  function narrate(msg) {
    B.hideCaret();
    /* PokeRogue：每句新訊息播 ui/select.wav；倒下／能力變化用專屬音效 */
    const m = msg || "";
    if (/fainted!/.test(m)) sfx("faint", .9);
    else if (/ rose!/.test(m)) sfx("stat_up", .9);
    else if (/ fell!/.test(m)) sfx("stat_down", .9);
    else sfx("select", .9);
    B.typewrite(msg, B.showCaret);   /* 打完字先出提示三角，等玩家撳一下繼續 */
  }

  /* PokeRogue 音效（assets/battle/sfx/*.wav，經 CaptureAudio.playOnce 走 sfxBus） */
  function sfx(name, vol) {
    try {
      if (!window.CaptureScene || !CaptureScene.audio) return;
      CaptureScene.audio.playOnce("assets/battle/sfx/" + name + ".wav", vol == null ? 1 : vol);
    } catch (e) {}
  }

  /* FRLG HP 條顏色：綠 → 黃 → 紅 */
  /* HP 比例 0–1（Rule 99）：maxHp 0／NaN、hp NaN 都回有限值，HP 條唔會因為 NaN 寫唔落 */
  function hpRatio(p) {
    const max = Number(p && p.maxHp), hp = Number(p && p.hp);
    if (!(max > 0) || !Number.isFinite(hp)) return 0;
    return Math.min(1, Math.max(0, hp / max));
  }

  function hpColor(pct) { return pct > 50 ? "#58d080" : pct > 20 ? "#f8c038" : "#f84040"; }

  /* 對戰精靈圖：Gen 1-5（≤649）有本地動態 GIF；其餘用 PokeAPI 靜態圖 fallback */
  function battleSprite(dexId) { return dexId <= 649 ? animatedURL(dexId) : spriteURL(dexId); }

  /* ---------- render ---------- */
  function render() {
    const mine = myActive();
    const foe = foeActive();
    /* 敵方 HP box */
    document.getElementById("foe-name").textContent = foe.name;
    document.getElementById("foe-level").textContent = foe.level;
    const foePct = hpRatio(foe) * 100;
    const foeBar = document.getElementById("foe-hpbar");
    foeBar.style.width = foePct + "%";
    foeBar.style.background = hpColor(foePct);
    if (typeof PokeSprite !== "undefined") {
      PokeSprite.show(document.getElementById("foe-sprite"), foe.megaSprite || foe.dexId, "front");
    }
    /* 我方 HP box */
    document.getElementById("my-name").textContent = mine.name;
    document.getElementById("my-level").textContent = mine.level;
    const myPct = hpRatio(mine) * 100;
    const myBar = document.getElementById("my-hpbar");
    myBar.style.width = myPct + "%";
    myBar.style.background = hpColor(myPct);
    document.getElementById("my-hp-cur").textContent = Math.max(0, mine.hp);
    document.getElementById("my-hp-max").textContent = mine.maxHp;
    if (typeof PokeSprite !== "undefined") {
      PokeSprite.show(document.getElementById("my-sprite"), mine.megaSprite || mine.dexId, "back");
    }

    /* status badges（FRLG 原裝 icon） */
    setStatusBadge("foe-status", foe.status);
    setStatusBadge("my-status", mine.status);
    renderFieldChips();
    updateMyExpBar();
  }

  /* 場地狀態 chip：天氣（含回合數）+ 雙方釘子/壁標記；無效果時成列收埋 */
  function renderFieldChips() {
    const el = document.getElementById("battle-field");
    if (!el || !S.state) return;
    const rows = [];
    if (S.state.weather) {
      const icon = { sun: "☀", rain: "🌧", sandstorm: "🌪", hail: "❄" }[S.state.weather.name] || "";
      const label = { sun: "SUN", rain: "RAIN", sandstorm: "SANDSTORM", hail: "HAIL" }[S.state.weather.name];
      rows.push(`<div class="bf-row"><span class="bf-chip bf-weather">${icon} ${label} ${S.state.weather.turns}</span></div>`);
    }
    const sideChips = (side, cls) => {
      const s = S.state[side].side;
      const chips = [];
      if (s.reflect > 0) chips.push(`Reflect ${s.reflect}`);
      if (s.lightScreen > 0) chips.push(`Light Screen ${s.lightScreen}`);
      if (s.spikes > 0) chips.push(`Spikes ×${s.spikes}`);
      if (s.stealthRock) chips.push("S. Rock");
      return chips.length ? `<div class="bf-row">${chips.map(c => `<span class="bf-chip ${cls}">${c}</span>`).join("")}</div>` : "";
    };
    const foeRow = sideChips(S.foeSide, "bf-foe");
    const myRow = sideChips(S.mySide, "bf-mine");
    if (foeRow) rows.push(foeRow);
    if (myRow) rows.push(myRow);
    el.innerHTML = rows.join("");
    el.style.display = rows.length ? "flex" : "none";
  }

  /* EXP 條：同主頁一樣顯示「呢一級入面行咗幾多」（into / span），唔係齋得個殼 */
  function updateMyExpBar() {
    const bar = document.getElementById("my-expbar");
    const e = S.teamEntries[me().active];
    if (!e) { bar.style.width = "0%"; return; }
    const level = e.level || 1;
    if (level >= MAX_LEVEL) { bar.style.width = "100%"; return; }
    const dexId = entryCurrentSpecies(e)[0];
    const into = Math.max(0, (e.exp || 0) - expAtLevel(dexId, level));
    const span = levelSpan(dexId, level);
    bar.style.width = Math.min(100, (into / span) * 100) + "%";
  }

  function statusBadge(s) {
    return { burn: "brn", paralyze: "par", poison: "psn", toxic: "tox", sleep: "slp", freeze: "frz" }[s] || "";
  }
  /* moveInfo type → 原裝屬性徽章檔名（FRLG 冇 fairy，用 ??? 徽章） */
  const TYPE_BADGE = {
    normal: "normal", fire: "fire", water: "water", electric: "electric", grass: "grass",
    ice: "ice", fighting: "fighting", poison: "poison", ground: "ground", flying: "flying",
    psychic: "psychic", bug: "bug", rock: "rock", ghost: "ghost", dragon: "dragon",
    dark: "dark", steel: "steel", fairy: "unknown", "???": "unknown"
  };
  function setStatusBadge(elId, status) {
    const el = document.getElementById(elId);
    const key = statusBadge(status);
    if (key) { el.src = `assets/battle/ui/status-${key}.png`; el.hidden = false; }
    else { el.hidden = true; el.removeAttribute("src"); }
  }

  /* ---------- 動作選單 ---------- */
  /* 敵方資料牌右邊嘅傷害加乘小窗（PokeRogue EnemyBattleInfo.updateEffectiveness）：
     指住招式時顯示 xN（對敵方屬性嘅屬性倍率）；status 招／離開選單就收埋 */
  function updateEffBox(idx) {
    const box = document.getElementById("foe-eff");
    if (idx == null) { box.style.display = "none"; return; }
    const m = myActive().moves[idx];
    const info = m && moveInfo(m.slug);
    if (!info || info.damage_class === "status" || !(info.power > 0)) {
      box.style.display = "none";
      return;
    }
    const mult = typeMultiplier(info.type, foeActive().types);
    box.textContent = "x" + (mult === 0.5 ? "0.5" : mult === 0.25 ? "0.25" : mult);
    box.style.display = "block";
  }

  function hideActionMenus() {
    document.getElementById("battle-action-menu").style.display = "none";
    document.getElementById("battle-move-menu").style.display = "none";
    const bag = document.getElementById("battle-bag-menu");
    if (bag) bag.style.display = "none";
    const bottom = document.querySelector(".battle-bottom");
    bottom.classList.remove("menu-open", "move-open");
    updateEffBox(null);
  }

  function showMainMenu() {
    document.getElementById("battle-action-menu").style.display = "grid";
    document.getElementById("battle-move-menu").style.display = "none";
    const yn = document.getElementById("battle-yesno");
    if (yn) yn.style.display = "none";
    const bag = document.getElementById("battle-bag-menu");
    if (bag) bag.style.display = "none";
    const bottom = document.querySelector(".battle-bottom");
    bottom.classList.add("menu-open");
    bottom.classList.remove("move-open");
    updateEffBox(null);
  }

  /* 右邊資料框：屬性徽章 + 分類 + POWER / ACC / PP（PokeRogue FightUiHandler） */
  function renderMoveInfo(idx) {
    const mine = myActive();
    const m = mine.moves[idx];
    const body = document.getElementById("bmp-info");
    if (!m) { body.innerHTML = ""; return; }
    const info = moveInfo(m.slug);
    const badge = TYPE_BADGE[info.type] ? `assets/battle/ui/type-${TYPE_BADGE[info.type]}.png` : "";
    const cat = info.damage_class === "physical" ? "PHYSICAL"
      : info.damage_class === "special" ? "SPECIAL" : "STATUS";
    body.innerHTML = `
      <div class="bmp-info-head">
        ${badge ? `<img src="${badge}" alt="${info.type}">` : ""}
        <span class="bmp-cat">${cat}</span>
      </div>
      <div class="bmp-info-row"><b>POWER</b><span>${info.power > 0 ? info.power : "---"}</span></div>
      <div class="bmp-info-row"><b>ACC</b><span>${info.accuracy != null ? info.accuracy : "---"}</span></div>
      <div class="bmp-info-row"><b>PP</b><span>${m.pp}/${m.maxPp}</span></div>`;
    /* 指住呢招時：敵方資料牌右邊彈出傷害加乘（PokeRogue 同款） */
    updateEffBox(idx);
  }

  function showMoveMenu() {
    const mine = myActive();
    /* 4 招都冇 PP → 直接 Struggle（原版 FIGHT 掣會即出 Struggle） */
    if (!mine.moves.some(m => m.pp > 0)) { chooseMove(0); return; }
    const list = document.getElementById("bmp-moves");
    list.innerHTML = mine.moves.map((m, i) =>
      `<button class="bmp-move-btn" data-idx="${i}" ${m.pp <= 0 ? "disabled" : ""}>${m.name}</button>`
    ).join("");
    list.querySelectorAll(".bmp-move-btn").forEach(b => {
      const idx = +b.dataset.idx;
      b.onclick = () => chooseMove(idx);
      /* 指住（或鍵盤 focus）該招式 → 右邊框顯示它的資料 */
      const focusIt = () => {
        list.querySelectorAll(".bmp-move-btn").forEach(x => x.classList.toggle("cur", x === b));
        renderMoveInfo(idx);
      };
      b.onmouseenter = focusIt;
      b.onfocus = focusIt;
    });
    const back = document.getElementById("bmp-back");
    back.onclick = () => { showMainMenu(); narrate(`What will ${myActive().name.toUpperCase()} do?`); };
    renderMegaButton();
    document.getElementById("battle-action-menu").style.display = "none";
    document.getElementById("battle-move-menu").style.display = "flex";
    const bottom = document.querySelector(".battle-bottom");
    bottom.classList.add("menu-open", "move-open");
    /* PokeRogue 預設 cursor 喺第 0 招：未指任何招之前先顯示第一招資料 */
    renderMoveInfo(0);
    list.querySelector(".bmp-move-btn")?.classList.add("cur");
  }

  /* ---------- PokeRogue 換精靈頁（party select） ----------
     click POKéMON 入嚟：左邊大格放出戰緊嗰隻、右欄 5 格後備、
     底部 "Choose a Pokémon." + CANCEL 掣；點格 → 右下角 options（SEND OUT / CANCEL） */

  function partyMsg(t) {
    document.getElementById("party-msg-text").textContent = t;
  }

  function showSwitchMenu(force) {
    S.partyForced = !!force;
    S.partySel = -1;
    document.getElementById("battle-action-menu").style.display = "none";
    document.getElementById("battle-move-menu").style.display = "none";
    document.querySelector(".battle-bottom").classList.remove("menu-open");
    document.getElementById("party-options").style.display = "none";
    document.getElementById("party-cancel").style.visibility = force ? "hidden" : "visible";
    /* PokeRogue party 頁會蓋走底部對話框，避免文字框喺 party frame 上面漏出嚟 */
    document.querySelector(".battle-bottom").style.visibility = "hidden";
    partyMsg("Choose a Pokémon.");
    renderParty();
    document.getElementById("battle-party").style.display = "block";
    sfx("select", .9);
  }

  function closeParty() {
    document.getElementById("battle-party").style.display = "none";
    document.querySelector(".battle-bottom").style.visibility = "";
    S.partySel = -1;
  }

  function closePartyOptions() {
    document.getElementById("party-options").style.display = "none";
    S.partySel = -1;
  }

  /* PokeRogue 排版：出戰緊嗰隻喺左邊大格（slot 0），其餘順序排右欄 */
  function renderParty() {
    const team = me().team;
    const activeIdx = me().active;
    const order = [activeIdx, ...team.map((_, i) => i).filter(i => i !== activeIdx)];
    const slots = document.getElementById("party-slots");
    slots.innerHTML = order.map((ti, pos) => {
      const p = team[ti];
      const fainted = p.hp <= 0;
      const ratio = hpRatio(p);
      const st = statusBadge(p.status);
      const inner = `
        <span class="ps-icon"><img src="${battleSprite(p.dexId)}" alt=""></span>
        <span class="ps-name">${p.name}</span>
        <img class="ps-lvlabel" src="assets/battle/party/party_slot_overlay_lv.png" alt="Lv">
        <span class="ps-lv">${p.level}</span>
        ${st ? `<img class="ps-status" src="assets/battle/ui/status-${st}.png" alt="">` : ""}
        ${fainted ? "" : `
        <span class="ps-hpbar"></span>
        <span class="ps-hpoverlay ${ratio > .5 ? "hi" : ratio > .25 ? "mid" : "lo"}" style="width:${(pos === 0 ? 72.73 : 45.71) * ratio}%"></span>
        <span class="ps-hptext">${Math.max(0, p.hp)}/${p.maxHp}</span>`}`;
      if (pos === 0) {
        return `<div class="party-slot ps-main${fainted ? " fnt" : ""}" data-team="${ti}" style="left:2.8125%;top:38.125%;width:34.375%">${inner}</div>`;
      }
      const top = (44 + 28 * pos) / 2.4;   /* PokeRogue design：top = 44+28i（/240 → %） */
      return `<div class="party-slot ps-bench${fainted ? " fnt" : ""}" data-team="${ti}" style="left:44.6875%;top:${top}%;width:54.6875%">${inner}</div>`;
    }).join("");
    slots.querySelectorAll(".party-slot").forEach(el => {
      el.onclick = () => onPartySlot(+el.dataset.team);
    });
  }

  function selectPartySlot(ti) {
    document.querySelectorAll(".party-slot").forEach(e =>
      e.classList.toggle("sel", +e.dataset.team === ti));
  }

  function onPartySlot(ti) {
    const p = me().team[ti];
    sfx("select", .9);
    selectPartySlot(ti);
    if (p.hp <= 0) {
      closePartyOptions();
      partyMsg(`${p.name} has no energy left to battle!`);
      return;
    }
    if (ti === me().active) {
      closePartyOptions();
      partyMsg(`${p.name} is already in battle!`);
      return;
    }
    S.partySel = ti;
    partyMsg(`Do what with ${p.name}?`);
    document.getElementById("party-options").style.display = "flex";
  }

  /* ---------- 玩家出招 ---------- */
  /* MEGA 掣：攜帶對應 Mega 石 + 今場未用過先出；撳一下 = 準備（揀招時一齊 Mega 進化） */
  function renderMegaButton() {
    const box = document.querySelector("#battle-move-menu .bmp-moves");
    if (!box) return;
    let btn = document.getElementById("bmp-mega");
    const can = !!(BattleState.canMega && BattleState.canMega(S.state, S.mySide));
    if (!can) { S.megaArmed = false; if (btn) btn.remove(); return; }
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "bmp-mega"; btn.className = "bmp-mega"; btn.type = "button";
      box.appendChild(btn);
    }
    const m = BattleState.megaOf(myActive());
    btn.textContent = S.megaArmed ? "MEGA ✓" : "MEGA";
    btn.title = `Mega Evolve into ${m.formName} with your move`;
    btn.classList.toggle("on", S.megaArmed);
    btn.onclick = () => { S.megaArmed = !S.megaArmed; renderMegaButton(); };
  }
  function chooseMove(idx) {
    if (S.acting) return;
    S.acting = true;
    /* 即刻收埋選單，免得等緊 click 講對話時誤撳到招式掣 */
    hideActionMenus();
    const action = { kind: "move", moveIdx: idx };
    if (S.megaArmed && BattleState.canMega && BattleState.canMega(S.state, S.mySide)) action.mega = true;
    S.megaArmed = false;
    B.resolveTurn(action);
  }

  /* 第 16 項：KO 對手後問「要唔要換」— 揀咗就交返 idx 俾 offerShift（唔經 resolveTurn） */
  function endShift(idx) {
    const r = S.shiftPick; S.shiftPick = null;
    closeParty(); hideActionMenus();
    r(idx);
  }
  /* 戰鬥底部 YES／NO（用同一個 menubox） */
  function askYesNo(q) {
    return new Promise(resolve => {
      narrate(q);
      hideActionMenus();
      const box = document.querySelector(".battle-menubox");
      let yn = document.getElementById("battle-yesno");
      if (!yn) {
        yn = document.createElement("div");
        yn.id = "battle-yesno"; yn.className = "battle-menu-grid battle-yesno";
        yn.innerHTML = `<button type="button" class="battle-menu-btn" data-yn="1">YES</button><button type="button" class="battle-menu-btn" data-yn="0">NO</button>`;
        box.appendChild(yn);
      }
      yn.style.display = "grid";
      const bottom = document.querySelector(".battle-bottom");
      bottom.classList.add("menu-open");
      yn.onclick = e => {
        const b = e.target.closest("[data-yn]"); if (!b) return;
        e.stopPropagation();
        sfx("select", .9);
        yn.style.display = "none";
        bottom.classList.remove("menu-open");
        resolve(b.dataset.yn === "1");
      };
    });
  }
  function hasBench() {
    return me().team.some((p, i) => i !== me().active && p.hp > 0);
  }
  /* AI 模式：原作 Shift 模式 — 對手出下一隻之前問，換寵唔使回合；返回 team idx 或 null */
  async function offerShift(nextName) {
    const yes = await askYesNo(`${B.foeTrainerName()} is about to use ${nextName}. Switch Pokémon?`);
    if (!yes) return null;
    return new Promise(res => { S.shiftPick = res; B.openBattleBag("switch", false); });
  }
  function chooseSwitch(idx) {
    if (S.shiftPick) { endShift(idx); return; }
    if (S.acting) return;
    S.acting = true;
    closeParty();
    hideActionMenus();
    /* 暈咗之後補位（AI 戰）：原作規則係回合完先換入，唔使回合、對手冇得白打一下（Rule 92）。
       PvP 換寵仍然係下一回合 action（Rule 22，兩邊 seed 同步），唔郁 */
    if (S.mode !== "pvp" && myActive().hp <= 0) {
      (async () => {
        await B.animatedSwitch(S.mySide, idx);
        if (BattleState.checkFinished(S.state)) { B.finishBattle(); return; }
        /* 入場釘子打死新寵：再強制換 */
        if (myActive().hp <= 0 && BattleState.hasUsable(me().team)) {
          await B.say(`${myActive().name} fainted! Choose your next Pokémon.`);
          S.acting = false;
          B.openBattleBag("switch", true);
          return;
        }
        /* 同一回合雙方都暈：對手都要補位（舊流程靠回合尾 AI 自動換） */
        if (foeActive().hp <= 0 && BattleState.hasUsable(foe().team)) {
          await B.animatedSwitch(S.foeSide, foe().team.findIndex(p => p.hp > 0));
          if (BattleState.checkFinished(S.state)) { B.finishBattle(); return; }
        }
        narrate(`What will ${myActive().name.toUpperCase()} do?`);
        showMainMenu();
        S.acting = false;
      })();
      return;
    }
    const action = { kind: "switch", idx };
    B.resolveTurn(action);
  }

  /* ---------- BAG：玩家背包（7 種藥 + Revival），一回合一件、佔回合 ---------- */
  function refreshBagButton() {
    const btn = document.getElementById("btn-battle-bag");
    if (!btn) return;
    /* PvP：戰前投票准用藥先開 */
    const allowed = S.mode === "ai" || (S.mode === "pvp" && S.pvpRules && S.pvpRules.items);
    btn.disabled = !(allowed && B.bagIds().some(id => B.bagLeft(id) > 0));
  }

  function bagInfoHTML(id) {
    const it = BattleState.ITEMS[id];
    const eff = it.revive ? "Revives a fainted teammate (full HP)" : it.healPct ? `Restores ${it.healPct}% HP`
      : it.heal ? `Restores ${it.heal} HP` : it.healFrac ? `Restores 1/${it.healFrac} HP` : it.pp ? `Restores ${it.pp} PP`
      : `Cures ${it.cures.length > 2 ? "any status" : it.cures[0]}`;
    return `<div class="bmp-info-head"><span class="bmp-cat">ITEM</span></div>
      <div class="bmp-info-row"><b>${it.label}</b><span>×${B.bagLeft(id)}</span></div>
      <div class="bmp-info-row"><span>${eff}</span></div>
      <div class="bmp-info-row"><span>${it.med ? "Uses your turn · counts toward overdose" : "Uses your turn"}</span></div>`;
  }

  function showBagMenu(reviveList) {
    const list = document.getElementById("bbp-list");
    const info = document.getElementById("bbp-info");
    if (reviveList) {
      /* Revival：揀邊隻 Faint 隊員 */
      list.innerHTML = reviveList.map(i => `<button class="bmp-move-btn" data-target="${i}">${me().team[i].name}</button>`).join("");
      list.querySelectorAll("[data-target]").forEach(b => b.onclick = () => chooseItem("revive", +b.dataset.target));
      info.innerHTML = `<div class="bmp-info-head"><span class="bmp-cat">REVIVAL</span></div><div class="bmp-info-row"><span>Pick a fainted Pokémon</span></div>`;
    } else {
      const have = B.bagIds().filter(id => B.bagLeft(id) > 0);
      if (!have.length) { B.toast("Your bag is empty."); return; }
      list.innerHTML = have.map(id => `<button class="bmp-move-btn" data-item="${id}">${BattleState.ITEMS[id].label} ×${B.bagLeft(id)}</button>`).join("");
      list.querySelectorAll("[data-item]").forEach(b => {
        b.onclick = () => chooseItem(b.dataset.item);
        b.onmouseenter = () => { info.innerHTML = bagInfoHTML(b.dataset.item); };
      });
      info.innerHTML = bagInfoHTML(have[0]);
    }
    document.getElementById("battle-action-menu").style.display = "none";
    document.getElementById("battle-move-menu").style.display = "none";
    document.getElementById("battle-bag-menu").style.display = "flex";
    const bottom = document.querySelector(".battle-bottom");
    bottom.classList.add("menu-open", "move-open");
    updateEffBox(null);
    const back = document.getElementById("bbp-back");
    back.onclick = () => { showMainMenu(); narrate(`What will ${myActive().name.toUpperCase()} do?`); };
  }

  function chooseItem(itemId, target) {
    if (S.acting) return;
    if (B.bagLeft(itemId) <= 0) return;
    if (itemId === "revive" && target === undefined) {
      const fainted = me().team.map((p, i) => p.hp <= 0 ? i : -1).filter(i => i >= 0);
      if (!fainted.length) { B.toast("No fainted Pokémon to revive."); return; }
      if (fainted.length === 1) target = fainted[0];
      else { showBagMenu(fainted); return; }
    }
    const tgt = (target != null && me().team[target]) ? me().team[target] : myActive();
    if (itemId !== "revive" && tgt.hp <= 0) { B.toast("This Pokémon can't use an item."); return; }
    if (!B.berryWouldWork(itemId, target)) { B.toast("It won't have any effect."); return; }
    S.acting = true;
    S.battleUsed[itemId] = (S.battleUsed[itemId] || 0) + 1;   /* 用咗就扣（HP 滿都照扣，計入過量） */
    hideActionMenus();
    refreshBagButton();
    B.resolveTurn({ kind: "item", itemId, target });
  }

  Object.assign(B, {
    me, foe, myActive, foeActive, active, narrate, sfx, hpRatio, hpColor, battleSprite, render, renderFieldChips,
    updateMyExpBar, statusBadge, TYPE_BADGE, setStatusBadge, updateEffBox, hideActionMenus, showMainMenu,
    renderMoveInfo, showMoveMenu, partyMsg, showSwitchMenu, closeParty, closePartyOptions, renderParty,
    selectPartySlot, onPartySlot, renderMegaButton, chooseMove, endShift, askYesNo, hasBench, offerShift,
    chooseSwitch, refreshBagButton, bagInfoHTML, showBagMenu, chooseItem
  });
})();
