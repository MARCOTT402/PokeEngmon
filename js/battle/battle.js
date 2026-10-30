/* ============================================================
   PokeEngmon Battle - UI 控制器（火紅版排版）
   依賴全域：Battle, BattleState, App, loadState, getActiveEntry,
             entryCurrentSpecies, spriteURL, animatedURL, typeColor,
             typeLabel, moveInfo, RARITY
   ============================================================ */

const BattleUI = (() => {
  let state = null;        /* BattleState */
  let mode = "ai";         /* 'ai' | 'pvp' */
  let mySide = "p1";       /* 玩家係 p1 */
  let foeSide = "p2";
  let aiTrainer = null;
  let teamEntries = [];    /* 玩家揀嘅 entries（原始 entry，唔係 battle pokemon） */
  let foeTeamEntries = [];
  let acting = false;      /* 防止重複點擊 */
  let pendingSwitch = false;
  let pvpMatchTimer = null;  /* PvP 配對計時（模擬用，Task 9 換真配對） */
  let pvpTeamSize = 3;       /* 抽中嘅場制 */
  const toast = (m) => App.toast(m);

  /* ---------- 入口 ---------- */
  function openMenu() {
    App.showView("view-battle-menu");
    renderMenu();
  }

  function renderMenu() {
    const st = loadState();
    const havePokemon = st.entries.some(e => e.ownedSpecies && e.ownedSpecies.length);
    document.getElementById("battle-menu-pvp").onclick = () => {
      if (!havePokemon) { toast("You need Pokémon first! Pull or capture one."); return; }
      startPvP();
    };
    document.getElementById("battle-menu-ai").onclick = () => {
      if (!havePokemon) { toast("You need Pokémon first! Pull or capture one."); return; }
      openAITrainers();
    };
    document.getElementById("battle-menu-back").onclick = () => { App.renderHome(); App.showView("view-home"); };
  }

  /* ---------- AI Trainers 梯隊 ---------- */
  const AI_TRAINERS = [
    { id: "youngster", name: "Youngster Timmy", level: 5, team: [{ dexId: 19, level: 5, moves: ["tackle", "tail-whip"] }] },
    { id: "bugcatcher", name: "Bug Catcher Sid", level: 10, team: [{ dexId: 13, level: 10, moves: ["tackle", "string-shot"] }, { dexId: 10, level: 8, moves: ["tackle", "harden"] }] },
    { id: "lass", name: "Lass Dana", level: 18, team: [{ dexId: 35, level: 18, moves: ["tackle", "tail-whip", "quick-attack"] }, { dexId: 16, level: 16, moves: ["tackle", "sand-attack"] }] },
    { id: "gentleman", name: "Gentleman Alfred", level: 28, team: [{ dexId: 96, level: 28, moves: ["confusion", "disable", "psybeam"] }, { dexId: 64, level: 26, moves: ["confusion", "psybeam"] }] },
    { id: "ace", name: "Ace Trainer Kiera", level: 40, team: [{ dexId: 248, level: 40, moves: ["crunch", "fire-punch", "thunder-punch", "ice-punch"] }, { dexId: 282, level: 38, moves: ["psychic", "shadow-ball", "calm-mind"] }] }
  ];

  function openAITrainers() {
    const st = loadState();
    const beaten = st.aiTrainersBeaten || [];
    const list = document.getElementById("ai-trainer-list");
    list.innerHTML = AI_TRAINERS.map((t, i) => {
      const unlocked = i === 0 || beaten.includes(AI_TRAINERS[i - 1].id);
      const done = beaten.includes(t.id);
      return `<div class="ai-trainer-card ${unlocked ? "" : "locked"} ${done ? "done" : ""}" data-id="${t.id}">
        <div class="at-name">${unlocked ? t.name : "???"}${done ? " ✓" : ""}</div>
        <div class="at-lvl">Lv. ${t.level}${unlocked ? " · " + t.team.length + " Pokémon" : " · Locked"}</div>
      </div>`;
    }).join("");
    list.querySelectorAll(".ai-trainer-card").forEach(card => {
      card.onclick = () => {
        const unlocked = card.classList.contains("locked") === false;
        if (!unlocked) return;
        startAI(AI_TRAINERS.find(t => t.id === card.dataset.id));
      };
    });
    document.getElementById("battle-menu-back").onclick = () => openMenu();
    App.showView("view-battle-menu");
  }

  /* ---------- 開始對戰 ---------- */
  function startAI(trainer) {
    mode = "ai";
    aiTrainer = trainer;
    foeTeamEntries = trainer.team.map(m => ({ dexId: m.dexId, level: m.level, ivs: {}, evs: {}, nature: "hardy", moves: m.moves }));
    openTeamSelect(() => launchBattle());
  }

  /* ---------- PvP 流程：配對 → 抽場制 → confirm → 揀隊 → 開戰 ---------- */
  function startPvP() {
    mode = "pvp";
    aiTrainer = null;
    showMatchPanel();
  }

  function showMatchPanel() {
    document.getElementById("pvp-match-panel").style.display = "flex";
    document.getElementById("pvp-matching").style.display = "flex";
    document.getElementById("pvp-matched").style.display = "none";
    /* TODO Task 9：接 Supabase matchmaking；而家先模擬配對延遲 */
    clearTimeout(pvpMatchTimer);
    pvpMatchTimer = setTimeout(onMatched, 1600 + Math.random() * 1400);
  }

  function cancelMatch() {
    clearTimeout(pvpMatchTimer);
    document.getElementById("pvp-match-panel").style.display = "none";
  }

  function onMatched() {
    /* 配對成功 → 抽 1v1 / 3v3 / 6v6（唔會多過玩家持有數） */
    const st = loadState();
    const ownedCount = st.entries.filter(e => Array.isArray(e.ownedSpecies) && e.ownedSpecies.length).length;
    const size = Math.min([1, 3, 6][Math.floor(Math.random() * 3)], Math.max(1, ownedCount));
    pvpTeamSize = size;
    /* fallback 對手隊伍（Task 9 換成真對手隊伍） */
    foeTeamEntries = makeFallbackFoeTeam(size);
    document.getElementById("pvp-matching").style.display = "none";
    document.getElementById("pvp-matched").style.display = "flex";
    document.getElementById("pvp-format-value").textContent = size + "v" + size;
  }

  function confirmFormat() {
    document.getElementById("pvp-match-panel").style.display = "none";
    openTeamSelect(() => launchBattle(), pvpTeamSize);
  }

  /* fallback 對手：隨機 pool（Task 9 前用） */
  function makeFallbackFoeTeam(size) {
    const pool = [
      { dexId: 19, moves: ["tackle", "tail-whip"] },
      { dexId: 16, moves: ["tackle", "sand-attack"] },
      { dexId: 21, moves: ["tackle", "leer"] },
      { dexId: 43, moves: ["absorb", "growth"] },
      { dexId: 10, moves: ["tackle", "harden"] },
      { dexId: 13, moves: ["tackle", "string-shot"] }
    ];
    const team = [];
    for (let i = 0; i < size; i++) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      team.push({ dexId: p.dexId, level: 8 + Math.floor(Math.random() * 6), ivs: {}, evs: {}, nature: "hardy", moves: p.moves });
    }
    return team;
  }

  function openTeamSelect(cb, fixedSize) {
    const st = loadState();
    const owned = st.entries.filter(e => Array.isArray(e.ownedSpecies) && e.ownedSpecies.length);
    /* PvP 用抽中嘅場制；AI 隨機 1/3/6 — 都唔會多過玩家擁有嘅寶可夢數量 */
    const teamSize = Math.min(fixedSize || [1, 3, 6][Math.floor(Math.random() * 3)], owned.length);
    document.getElementById("team-size-label").textContent = teamSize;
    const grid = document.getElementById("team-select-grid");
    grid.innerHTML = owned.map((e, i) => {
      const cur = entryCurrentSpecies(e);
      return `<div class="team-slot" data-idx="${i}">
        <img src="${spriteURL(cur[0])}" alt="${cur[1]}">
        <span>${cur[1]} Lv.${e.level}</span>
      </div>`;
    }).join("");
    const chosen = new Set();
    grid.querySelectorAll(".team-slot").forEach(el => {
      el.onclick = () => {
        const idx = +el.dataset.idx;
        if (el.classList.contains("picked")) {
          el.classList.remove("picked"); chosen.delete(idx);
        } else if (chosen.size < teamSize) {
          el.classList.add("picked"); chosen.add(idx);
        }
      };
    });
    document.getElementById("team-select-confirm").onclick = () => {
      if (chosen.size !== teamSize) { toast(`Pick exactly ${teamSize} Pokémon`); return; }
      teamEntries = [...chosen].map(i => owned[i]);
      document.getElementById("team-select-modal").style.display = "none";
      cb();
    };
    document.getElementById("team-select-modal").style.display = "flex";
  }

  function launchBattle() {
    mySide = "p1"; foeSide = "p2";
    state = BattleState.create(teamEntries, foeTeamEntries);
    acting = false;
    App.showView("view-battle");
    render();
    narrate(`A wild ${foeActive().name} appeared!`);
  }

  /* ---------- helpers ---------- */
  function me() { return state[mySide]; }
  function foe() { return state[foeSide]; }
  function myActive() { return active(state, mySide); }
  function foeActive() { return active(state, foeSide); }
  function active(st, side) { return st[side].team[st[side].active]; }

  function narrate(msg) {
    const box = document.getElementById("battle-text");
    box.textContent = msg;
  }

  function hpColor(pct) { return pct > 50 ? "#5cb85c" : pct > 20 ? "#f0ad4e" : "#d9534f"; }

  /* ---------- render ---------- */
  function render() {
    const mine = myActive();
    const foe = foeActive();
    /* 敵方 HP box */
    document.getElementById("foe-name").textContent = foe.name;
    document.getElementById("foe-level").textContent = foe.level;
    const foePct = Math.max(0, (foe.hp / foe.maxHp) * 100);
    const foeBar = document.getElementById("foe-hpbar");
    foeBar.style.width = foePct + "%";
    foeBar.style.background = hpColor(foePct);
    document.getElementById("foe-sprite").src = spriteURL(foe.dexId);

    /* 我方 HP box */
    document.getElementById("my-name").textContent = mine.name;
    document.getElementById("my-level").textContent = mine.level;
    const myPct = Math.max(0, (mine.hp / mine.maxHp) * 100);
    const myBar = document.getElementById("my-hpbar");
    myBar.style.width = myPct + "%";
    myBar.style.background = hpColor(myPct);
    document.getElementById("my-sprite").src = animatedURL(mine.dexId);

    /* status icons */
    document.getElementById("my-status").textContent = statusIcon(mine.status);
    document.getElementById("foe-status").textContent = statusIcon(foe.status);
  }

  function statusIcon(s) {
    return { burn: "🔥", paralyze: "⚡", poison: "☠", toxic: "☠", sleep: "💤", freeze: "❄", confusion: "❓" }[s] || "";
  }

  /* ---------- 動作選單 ---------- */
  function showMainMenu() {
    document.getElementById("battle-action-menu").style.display = "grid";
    document.getElementById("battle-move-menu").style.display = "none";
    document.getElementById("battle-switch-menu").style.display = "none";
  }

  function showMoveMenu() {
    const mine = myActive();
    const grid = document.getElementById("battle-move-menu");
    grid.innerHTML = mine.moves.map((m, i) => {
      const info = moveInfo(m.slug);
      return `<button class="battle-move-btn" data-idx="${i}" style="--tc:${typeColor(info.type)}" ${m.pp <= 0 ? "disabled" : ""}>
        <span class="bm-name">${m.name}</span>
        <span class="bm-pp">PP ${m.pp}/${m.maxPp}</span>
      </button>`;
    }).join("");
    grid.querySelectorAll(".battle-move-btn").forEach(b => {
      b.onclick = () => chooseMove(+b.dataset.idx);
    });
    document.getElementById("battle-action-menu").style.display = "none";
    document.getElementById("battle-move-menu").style.display = "grid";
    document.getElementById("battle-switch-menu").style.display = "none";
  }

  function showSwitchMenu(force) {
    const team = me().team;
    const grid = document.getElementById("battle-switch-menu");
    grid.innerHTML = team.map((p, i) => {
      const fainted = p.hp <= 0;
      const active = i === me().active;
      return `<button class="battle-switch-btn ${fainted ? "fainted" : ""} ${active ? "active" : ""}" data-idx="${i}" ${fainted || active ? "disabled" : ""}>
        <img src="${spriteURL(p.dexId)}" alt="${p.name}">
        <span>${p.name} Lv.${p.level}</span>
        <span class="bs-hp">HP ${p.hp}/${p.maxHp} ${statusIcon(p.status)}</span>
      </button>`;
    }).join("");
    grid.querySelectorAll(".battle-switch-btn").forEach(b => {
      b.onclick = () => chooseSwitch(+b.dataset.idx);
    });
    document.getElementById("battle-action-menu").style.display = "none";
    document.getElementById("battle-move-menu").style.display = "none";
    document.getElementById("battle-switch-menu").style.display = "grid";
    pendingSwitch = !!force;
  }

  /* ---------- 玩家出招 ---------- */
  function chooseMove(idx) {
    if (acting) return;
    acting = true;
    const action = { kind: "move", moveIdx: idx };
    resolveTurn(action);
  }

  function chooseSwitch(idx) {
    if (acting) return;
    acting = true;
    const action = { kind: "switch", idx };
    resolveTurn(action);
  }

  /* ---------- 回合 resolve ---------- */
  function resolveTurn(playerAction) {
    state.turn += 1;
    const foeAction = pickAIAction();

    const myMove = playerAction.kind === "move" ? moveInfo(myActive().moves[playerAction.moveIdx].slug) : null;
    const foeMove = foeAction.kind === "move" ? moveInfo(foeActive().moves[foeAction.moveIdx].slug) : null;
    const myAct = { kind: playerAction.kind, priority: myMove ? myMove.priority : 6, speed: Battle.effectiveStat(myActive(), "spe"), player: true, action: playerAction };
    const foeAct = { kind: foeAction.kind, priority: foeMove ? foeMove.priority : 6, speed: Battle.effectiveStat(foeActive(), "spe"), player: false, action: foeAction };
    const order = Battle.turnOrder(myAct, foeAct);

    narrate("");
    (async () => {
      for (const act of order) {
        if (state.finished) break;
        const side = act.player ? mySide : foeSide;
        if (act.action.kind === "switch") {
          BattleState.switchTo(state, side, act.action.idx);
        } else {
          BattleState.executeMove(state, side, act.action.moveIdx);
        }
        render();
        narrate(state.log[state.log.length - 1]?.msg || "");
        await sleep(900);
        if (BattleState.checkFinished(state)) break;
      }
      if (!state.finished) {
        BattleState.endTurnResidual(state, mySide);
        BattleState.endTurnResidual(state, foeSide);
        render();
      }
      if (state.finished) { finishBattle(); return; }
      /* 我方暈咗要強制換 */
      if (myActive().hp <= 0 && BattleState.hasUsable(me().team)) {
        narrate(`${myActive().name} fainted! Choose your next Pokémon.`);
        showSwitchMenu(true);
        acting = false;
        return;
      }
      /* 對手暈咗：AI 自動換 */
      if (foeActive().hp <= 0 && BattleState.hasUsable(foe().team)) {
        const nextIdx = foe().team.findIndex(p => p.hp > 0);
        BattleState.switchTo(state, foeSide, nextIdx);
        render();
      }
      showMainMenu();
      acting = false;
    })();
  }

  function pickAIAction() {
    /* 簡單 AI：優先相剋高威力招；低 HP 有治療用治療 */
    const foe = foeActive();
    const target = myActive();
    const moves = foe.moves.filter(m => m.pp > 0);
    if (!moves.length) return { kind: "switch", idx: 0 };
    let best = moves[0], bestScore = -1;
    for (const m of moves) {
      const info = moveInfo(m.slug);
      let score = (info.power || 0);
      score *= (typeof typeMultiplier === "function") ? typeMultiplier(info.type, target.types) : 1;
      if (foe.types.includes(info.type)) score *= 1.5; /* STAB */
      if (info.meta && info.meta.healing && foe.hp < foe.maxHp * 0.5) score += 200;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    const idx = foe.moves.indexOf(best);
    return { kind: "move", moveIdx: idx };
  }

  /* ---------- 完結 ---------- */
  function finishBattle() {
    const won = state.winner === mySide;
    narrate(won ? "You won the battle!" : "You lost...");
    setTimeout(() => {
      if (won) applyRewards();
      App.showView("view-battle-menu");
      renderMenu();
    }, 1800);
  }

  function applyRewards() {
    const st = loadState();
    const expGain = aiTrainer ? aiTrainer.level * 12 : 30;
    const diamonds = aiTrainer ? Math.floor(aiTrainer.level * 0.8) : 5;
    /* EXP 落玩家出戰嘅 entries */
    teamEntries.forEach(entry => {
      const e = st.entries.find(x => x.uid === entry.uid);
      if (e) addEntryExp(e, expGain);
    });
    st.diamonds = (st.diamonds || 0) + diamonds;
    if (aiTrainer) {
      st.aiTrainersBeaten = st.aiTrainersBeaten || [];
      if (!st.aiTrainersBeaten.includes(aiTrainer.id)) st.aiTrainersBeaten.push(aiTrainer.id);
    }
    saveState();
    toast(`+${expGain} EXP · +${diamonds} 💎`);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---------- 綁定（app init 時 call） ---------- */
  function bind() {
    document.getElementById("btn-battle-fight").onclick = showMoveMenu;
    document.getElementById("btn-battle-bag").onclick = () => toast("BAG 暫時未開放");
    document.getElementById("btn-battle-pokemon").onclick = () => showSwitchMenu(false);
    document.getElementById("btn-battle-run").style.display = "none"; /* 冇逃跑 */
    document.getElementById("battle-menu-back").onclick = () => { App.renderHome(); App.showView("view-home"); };
    document.getElementById("team-select-cancel").onclick = () => { document.getElementById("team-select-modal").style.display = "none"; openMenu(); };
    document.getElementById("pvp-match-cancel").onclick = cancelMatch;
    document.getElementById("pvp-format-confirm").onclick = confirmFormat;
  }

  return { openMenu, bind, renderMenu, openAITrainers };
})();
