/* ============================================================
   PokeEngmon Battle - UI 控制器（火紅版排版）
   依賴全域：Battle, BattleState, App, loadState, getActiveEntry,
             entryCurrentSpecies, spriteURL, animatedURL,
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
    { id: "youngster", name: "Youngster Timmy", sprite: "assets/trainers/youngster.png", level: 5, team: [{ dexId: 19, level: 5, moves: ["tackle", "tail-whip"] }] },
    { id: "bugcatcher", name: "Bug Catcher Sid", sprite: "assets/trainers/bugcatcher.png", level: 10, team: [{ dexId: 13, level: 10, moves: ["tackle", "string-shot"] }, { dexId: 10, level: 8, moves: ["tackle", "harden"] }] },
    { id: "lass", name: "Lass Dana", sprite: "assets/trainers/lass.png", level: 18, team: [{ dexId: 35, level: 18, moves: ["tackle", "tail-whip", "quick-attack"] }, { dexId: 16, level: 16, moves: ["tackle", "sand-attack"] }] },
    { id: "gentleman", name: "Gentleman Alfred", sprite: "assets/trainers/gentleman.png", level: 28, team: [{ dexId: 96, level: 28, moves: ["confusion", "disable", "psybeam"] }, { dexId: 64, level: 26, moves: ["confusion", "psybeam"] }] },
    { id: "ace", name: "Ace Trainer Kiera", sprite: "assets/trainers/ace_f.png", level: 40, team: [{ dexId: 248, level: 40, moves: ["crunch", "fire-punch", "thunder-punch", "ice-punch"] }, { dexId: 282, level: 38, moves: ["psychic", "shadow-ball", "calm-mind"] }] }
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
    /* 如果一定要全選（持有數 = 隊伍大小），預設全選，免得撳錯 toggle */
    const mustPickAll = teamSize >= owned.length;
    grid.querySelectorAll(".team-slot").forEach(el => {
      if (mustPickAll) {
        el.classList.add("picked");
        chosen.add(+el.dataset.idx);
      }
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
    acting = true;   /* intro 期間鎖住操作 */
    document.getElementById("foe-sprite").classList.remove("intro-pop");
    document.getElementById("my-sprite").classList.remove("intro-pop");
    App.showView("view-battle");
    render();
    playIntro();
  }

  /* ---------- 開場序列（FRLG：訓練家見面 → 拋球） ---------- */
  function foeTrainerName() {
    return (mode === "ai" && aiTrainer) ? aiTrainer.name.toUpperCase() : "RIVAL";
  }
  function foeTrainerSprite() {
    return (mode === "ai" && aiTrainer) ? aiTrainer.sprite : "assets/trainers/rival.png";
  }

  function introText(msg) {
    const box = document.getElementById("battle-text");
    hideCaret();
    box.innerHTML = msg.replace(/\n/g, "<br>");
  }
  function showCaret() {
    if (document.getElementById("battle-caret")) return;
    const c = document.createElement("img");
    c.className = "battle-caret"; c.id = "battle-caret";
    c.src = "assets/battle/ui/caret-red.png"; c.alt = "";
    document.getElementById("battle-text").appendChild(c);
  }
  function hideCaret() { document.getElementById("battle-caret")?.remove(); }
  function waitTap() {
    return new Promise(res => {
      const zone = document.querySelector(".battle-bottom");
      const h = () => { zone.removeEventListener("click", h); res(); };
      zone.addEventListener("click", h);
    });
  }

  function renderBallCounter(elId, teamSize) {
    const el = document.getElementById(elId);
    let html = "";
    for (let i = 0; i < 6; i++) {
      html += i < teamSize
        ? `<img src="assets/battle/ui/poke-ball-big.png" alt="">`
        : `<img src="assets/battle/ui/poke-ball-big.png" alt="" class="ball-empty">`;
    }
    el.innerHTML = html;
  }

  /* 我方訓練家 5 格拋球動畫（red_back.png sprite sheet） */
  function animateMyThrow() {
    const el = document.getElementById("intro-my-trainer");
    const frameH = el.clientHeight || 148;   /* 1 格高度（已縮放） */
    let f = 0;
    const timer = setInterval(() => {
      f++;
      if (f > 4) { clearInterval(timer); return; }
      el.style.backgroundPosition = `0 ${-frameH * f}px`;
    }, 85);
  }

  /* 拋球：弧線飛行 → 落地閃光 → 精靈彈出 */
  function throwBall(side) {
    return new Promise(res => {
      const stage = document.querySelector(".battle-stage");
      const rect = stage.getBoundingClientRect();
      const ball = document.getElementById("intro-ball");
      const flash = document.getElementById("intro-flash");
      /* 起點（訓練家手）→ 終點（精靈企位中央） */
      const foeSideThrow = side === "foe";
      const from = foeSideThrow
        ? { x: rect.width * 0.72, y: rect.height * 0.22 }
        : { x: rect.width * 0.24, y: rect.height * 0.72 };
      const to = foeSideThrow
        ? { x: rect.width - 28 - 55, y: 28 + 60 }            /* = .battle-foe-sprite 中央 */
        : { x: 30 + 65, y: rect.height - 30 - 60 };          /* = .battle-my-sprite 中央 */
      const arcH = 70;
      const t0 = performance.now(), dur = 520;
      ball.style.display = "block";
      (function fly(now) {
        const t = Math.min(1, (now - t0) / dur);
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t - arcH * 4 * t * (1 - t);
        ball.style.left = x + "px";
        ball.style.top = y + "px";
        if (t < 1) { requestAnimationFrame(fly); return; }
        /* 落地：閃光 + 精靈彈出 */
        ball.style.display = "none";
        flash.style.display = "block";
        flash.style.left = to.x + "px";
        flash.style.top = to.y + "px";
        flash.style.animation = "none"; void flash.offsetWidth; flash.style.animation = "";
        setTimeout(() => { flash.style.display = "none"; }, 400);
        const sprite = document.getElementById(foeSideThrow ? "foe-sprite" : "my-sprite");
        sprite.classList.add("intro-pop");
        setTimeout(res, 420);
      })(t0);
    });
  }

  function playIntro() {
    const view = document.getElementById("view-battle");
    view.classList.add("intro-on");
    const intro = document.getElementById("battle-intro");
    intro.style.display = "block";

    renderBallCounter("intro-balls-mine", me().team.length);
    renderBallCounter("intro-balls-foe", foe().team.length);

    const foeImg = document.getElementById("intro-foe-trainer");
    const myT = document.getElementById("intro-my-trainer");
    foeImg.src = foeTrainerSprite();
    myT.style.backgroundPosition = "0 0";
    foeImg.classList.add("off-right");
    myT.classList.add("off-left");

    introText(`${foeTrainerName()}\nwould like to battle!`);
    /* 雙方滑入：我方由左、對手由右 */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      foeImg.classList.remove("off-right");
      myT.classList.remove("off-left");
    }));

    (async () => {
      await sleep(650);
      showCaret();
      await waitTap();
      /* 對手拋球 → 精靈彈出 → 對手退場 */
      hideCaret();
      await throwBall("foe");
      foeImg.classList.add("off-right");
      introText(`${foeTrainerName()} sent out\n${foeActive().name.toUpperCase()}!`);
      showCaret();
      await waitTap();
      /* 我方拋球（5 格動畫）→ 精靈彈出 → 我方退場 */
      hideCaret();
      animateMyThrow();
      await throwBall("mine");
      myT.classList.add("off-left");
      introText(`Go! ${myActive().name.toUpperCase()}!`);
      showCaret();
      await waitTap();
      /* 完場：還原正常對戰 UI */
      hideCaret();
      intro.style.display = "none";
      view.classList.remove("intro-on");
      render();
      narrate(`What will ${myActive().name.toUpperCase()} do?`);
      showMainMenu();
      acting = false;
    })();
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

  /* FRLG HP 條顏色：綠 → 黃 → 紅 */
  function hpColor(pct) { return pct > 50 ? "#58d080" : pct > 20 ? "#f8c038" : "#f84040"; }

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
    document.getElementById("my-hp-cur").textContent = Math.max(0, mine.hp);
    document.getElementById("my-hp-max").textContent = mine.maxHp;
    document.getElementById("my-sprite").src = animatedURL(mine.dexId);

    /* status badges（FRLG 原裝 icon） */
    setStatusBadge("foe-status", foe.status);
    setStatusBadge("my-status", mine.status);
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
      const badge = TYPE_BADGE[info.type] ? `assets/battle/ui/type-${TYPE_BADGE[info.type]}.png` : "";
      return `<button class="battle-move-btn" data-idx="${i}" ${m.pp <= 0 ? "disabled" : ""}>
        <span class="bm-name">${m.name}</span>
        <span class="bm-sub">${badge ? `<img class="bm-type" src="${badge}" alt="${info.type}">` : ""}<span class="bm-pp">PP ${m.pp}/${m.maxPp}</span></span>
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
        <span class="bs-hp">HP ${p.hp}/${p.maxHp} ${statusBadge(p.status) ? `<img class="bs-status" src="assets/battle/ui/status-${statusBadge(p.status)}.png" alt="">` : ""}</span>
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
