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
  let forfeited = false;   /* 玩家撳 RUN 投降 */
  let pendingSwitch = false;
  let battleSpeed = 1;      /* 1 = NORMAL、2 = FAST（只限 AI 對戰） */
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
    { id: "ace", name: "Ace Trainer Kiera", sprite: "assets/trainers/ace_f.png", level: 40, team: [{ dexId: 248, level: 40, moves: ["crunch", "fire-punch", "thunder-punch", "ice-punch"] }, { dexId: 282, level: 38, moves: ["psychic", "shadow-ball", "calm-mind"] }] },
    /* --- Gen 2-5 梯隊（承接 Kiera 之後逐個解鎖） --- */
    { id: "rival_ethan", name: "Rival Ethan", sprite: "assets/trainers/rival.png", level: 50, team: [
      { dexId: 154, level: 50, moves: ["razor-leaf", "synthesis", "earthquake", "sludge-bomb"] },
      { dexId: 164, level: 48, moves: ["air-slash", "psychic", "hypnosis", "dream-eater"] },
      { dexId: 214, level: 50, moves: ["megahorn", "close-combat", "rock-slide", "night-slash"] }
    ] },
    { id: "jasmine", name: "Gym Leader Jasmine", sprite: "assets/trainers/lass.png", level: 58, team: [
      { dexId: 208, level: 58, moves: ["iron-tail", "earthquake", "rock-slide", "curse"] },
      { dexId: 227, level: 56, moves: ["steel-wing", "air-slash", "spikes", "roost"] },
      { dexId: 82, level: 56, moves: ["thunderbolt", "flash-cannon", "thunder-wave", "tri-attack"] }
    ] },
    { id: "steven", name: "Champion Steven", sprite: "assets/trainers/gentleman.png", level: 66, team: [
      { dexId: 376, level: 68, moves: ["meteor-mash", "psychic", "earthquake", "bullet-punch"] },
      { dexId: 306, level: 66, moves: ["iron-head", "earthquake", "stone-edge", "thunder-wave"] },
      { dexId: 344, level: 64, moves: ["earth-power", "psychic", "ice-beam", "toxic"] },
      { dexId: 227, level: 64, moves: ["steel-wing", "air-slash", "spikes", "roost"] }
    ] },
    { id: "cynthia", name: "Champion Cynthia", sprite: "assets/trainers/ace_f.png", level: 74, team: [
      { dexId: 445, level: 78, moves: ["earthquake", "dragon-claw", "stone-edge", "swords-dance"] },
      { dexId: 448, level: 74, moves: ["close-combat", "flash-cannon", "extreme-speed", "swords-dance"] },
      { dexId: 468, level: 72, moves: ["air-slash", "aura-sphere", "thunder-wave", "roost"] },
      { dexId: 350, level: 74, moves: ["surf", "ice-beam", "recover", "toxic"] },
      { dexId: 442, level: 72, moves: ["dark-pulse", "shadow-ball", "will-o-wisp", "hypnosis"] }
    ] },
    { id: "alder", name: "Champion Alder", sprite: "assets/trainers/gentleman.png", level: 82, team: [
      { dexId: 637, level: 84, moves: ["fiery-dance", "bug-buzz", "psychic", "quiver-dance"] },
      { dexId: 534, level: 80, moves: ["close-combat", "mach-punch", "rock-slide", "bulk-up"] },
      { dexId: 621, level: 80, moves: ["dragon-claw", "crunch", "earthquake", "rock-slide"] },
      { dexId: 626, level: 80, moves: ["head-charge", "earthquake", "megahorn", "zen-headbutt"] },
      { dexId: 584, level: 80, moves: ["ice-beam", "blizzard", "flash-cannon", "toxic"] }
    ] }
  ];

  /* 隊伍可能跨代（Gen 2-5）→ 開戰前要確保該代圖鑑資料已載入，否則算唔到 stats / types */
  function gensForTeam(team) {
    if (typeof GENS === "undefined") return [];
    const gens = new Set();
    team.forEach(m => {
      const g = GENS.find(x => m.dexId >= x.range[0] && m.dexId <= x.range[1]);
      if (g) gens.add(g.gen);
    });
    return Array.from(gens);
  }

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
    /* Gen 2-5 訓練家：先確保對應世代圖鑑資料載入（failed 就照開，唔好卡死揀隊） */
    const gens = gensForTeam(trainer.team);
    const ready = (typeof ensureGenDataLoaded === "function")
      ? Promise.all(gens.map(g => ensureGenDataLoaded(g)))
      : Promise.resolve();
    ready.catch(() => {}).then(() => openTeamSelect(() => launchBattle()));
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
        <span class="ts-order" hidden></span>
        <img src="${spriteURL(cur[0])}" alt="${cur[1]}">
        <span>${cur[1]} Lv.${e.level}</span>
      </div>`;
    }).join("");
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
    /* 如果一定要全選（持有數 = 隊伍大小），預設全選（次序 = 持有次序），照樣可以調位 */
    if (teamSize >= owned.length) owned.forEach((_, i) => order.push(i));
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
    document.getElementById("team-select-confirm").onclick = () => {
      if (order.length !== teamSize) { toast(`Pick exactly ${teamSize} Pokémon`); return; }
      teamEntries = order.map(i => owned[i]);
      document.getElementById("team-select-modal").style.display = "none";
      cb();
    };
    document.getElementById("team-select-modal").style.display = "flex";
  }

  function launchBattle() {
    mySide = "p1"; foeSide = "p2";
    state = BattleState.create(teamEntries, foeTeamEntries);
    acting = true;   /* intro 期間鎖住操作 */
    forfeited = false;
    /* 速度切換只限 AI 對戰；結算畫面重設 */
    battleSpeed = (mode === "ai" && localStorage.getItem("pokeengmon_battle_speed") === "2") ? 2 : 1;
    syncSpeedButton();
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
    render();
    /* 對戰 BGM（Battle! Wild Pokémon）：接管 town BGM，完場先交返 */
    try { if (window.CaptureScene) CaptureScene.audio.startBGM(); } catch (e) {}
    playIntro();
  }

  /* ---------- 開場序列（FRLG：訓練家見面 → 拋球） ---------- */
  function foeTrainerName() {
    return (mode === "ai" && aiTrainer) ? aiTrainer.name.toUpperCase() : "RIVAL";
  }
  function foeTrainerSprite() {
    return (mode === "ai" && aiTrainer) ? aiTrainer.sprite : "assets/trainers/rival.png";
  }

  /* ---------- 打字機文字（FRLG 逐字彈出 + tick 聲；打字中撳一下即時補完） ---------- */
  let _typeTimer = null;
  let _typeFull = "";
  let _typeDone = null;
  function typewrite(msg, done) {
    const box = document.getElementById("battle-text");
    if (_typeTimer) { clearInterval(_typeTimer); _typeTimer = null; }
    _typeFull = msg || "";
    _typeDone = done || null;
    box.textContent = "";
    if (!_typeFull) { const d = _typeDone; _typeDone = null; if (d) d(); return; }
    let i = 0;
    _typeTimer = setInterval(() => {
      i++;
      box.textContent = _typeFull.slice(0, i);
      if (i >= _typeFull.length) _finishType();
    }, 20 / battleSpeed);   /* PokeRogue MessageUiHandler 預設 delay = 20ms／字 */
  }
  /* 即時補完打字；回傳 true = 啱啱補完咗（上層用嚟做「第一撳補字、第二撳先推進」） */
  function _finishType() {
    if (!_typeTimer) return false;
    clearInterval(_typeTimer); _typeTimer = null;
    document.getElementById("battle-text").textContent = _typeFull;
    const d = _typeDone; _typeDone = null;
    if (d) d();
    return true;
  }

  function introText(msg) {
    narrate(msg);   /* 同一般訊息一樣：音效 + 打字機 + 打完出 prompt */
  }
  function showCaret() {
    if (document.getElementById("battle-caret")) return;
    const c = document.createElement("div");
    c.className = "battle-caret"; c.id = "battle-caret";
    document.getElementById("battle-text").appendChild(c);
  }
  function hideCaret() { document.getElementById("battle-caret")?.remove(); }
  function waitTap() {
    return new Promise(res => {
      const zone = document.querySelector(".battle-bottom");
      const h = () => {
        if (_finishType()) return;   /* 打字中：第一撳只補完文字，唔推進 */
        zone.removeEventListener("click", h); res();
      };
      zone.addEventListener("click", h);
    });
  }

  /* 一句對話：打完字等玩家 click 先跳下一句（唔會自動計時跳） */
  async function say(msg) {
    narrate(msg);
    await waitTap();
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

  /* 對戰中途重用 intro 層（球/閃光）：收埋訓練家同球計數，唔擋點擊 */
  function introLayerOn() {
    const intro = document.getElementById("battle-intro");
    intro.classList.add("mid-only");
    intro.style.display = "block";
  }
  function introLayerOff() {
    const intro = document.getElementById("battle-intro");
    intro.classList.remove("mid-only");
    intro.style.display = "none";
  }

  /* 拋球（抄 PokeRogue SummonPhase 節奏）：
     650ms 水平飛 → 150ms 微微落下（Cubic.easeOut）→ 500ms 自轉 1440° 跌落（Cubic.easeIn）
     → 開球（閃光 + 音效）→ 精靈 scale 0.5→1（250ms Sine.easeIn）+ 球色 tint 淡出 */
  function throwBall(side, mid) {
    return new Promise(res => {
      if (mid) introLayerOn();
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
      const P1 = 650, P2 = 150, P3 = 500;
      const total = P1 + P2 + P3;
      const rise = 14;                        /* 球起飛時微微升高 */
      const ballOpenAudio = () => sfx("pb_rel", .9);   /* PokeRogue pb_rel.wav：球開 */
      ball.style.display = "block";
      try { sfx("pb_throw", .85); } catch (e) {}   /* PokeRogue pb_throw.wav：拋球 */
      const t0 = performance.now();
      (function fly(now) {
        const t = Math.min(total, now - t0);
        let x, y, rot;
        if (t <= P1) {                        /* 1. 水平飛去目標上方 */
          const k = t / P1;
          x = from.x + (to.x - from.x) * k;
          y = from.y + (to.y - from.y - rise) * k;
          rot = 0;
        } else if (t <= P1 + P2) {            /* 2. 輕輕落定 */
          const k = (t - P1) / P2;
          const e = 1 - Math.pow(1 - k, 3);   /* Cubic.easeOut */
          x = to.x;
          y = (to.y - rise) + (rise * 0.55) * e;
          rot = 0;
        } else {                              /* 3. 自轉跌落 */
          const k = (t - P1 - P2) / P3;
          const e = Math.pow(k, 3);           /* Cubic.easeIn */
          x = to.x;
          y = (to.y - rise * 0.45) + (rise * 0.45) * e;
          rot = 1440 * e;
        }
        ball.style.left = x + "px";
        ball.style.top = y + "px";
        ball.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
        if (t < total) { requestAnimationFrame(fly); return; }
        /* 落地：閃光 + 開球聲 + 精靈 scale 0.5→1 彈出 */
        ball.style.display = "none";
        flash.style.display = "block";
        flash.style.left = to.x + "px";
        flash.style.top = to.y + "px";
        flash.style.animation = "none"; void flash.offsetWidth; flash.style.animation = "";
        ballOpenAudio();
        setTimeout(() => { flash.style.display = "none"; if (mid) introLayerOff(); }, 400);
        const sprite = document.getElementById(foeSideThrow ? "foe-sprite" : "my-sprite");
        sprite.classList.remove("intro-pop");
        void sprite.offsetWidth;
        sprite.classList.add("intro-pop");
        setTimeout(res, 420);
      })(t0);
    });
  }

  /* ---------- HP 資訊框滑入／滑走（PokeRogue showInfo / hideInfo） ---------- */
  function hpBoxEl(side) {
    return document.querySelector(side === "mine" ? ".battle-hpbox-mine" : ".battle-hpbox-foe");
  }
  function hpSlideIn(side, instant) {
    const b = hpBoxEl(side);
    if (!b) return;
    b.style.setProperty("--hp-slide", instant ? "0ms" : (1000 / battleSpeed) + "ms");
    b.style.setProperty("--hp-ease", "cubic-bezier(.33,1,.68,1)");   /* Cubic.easeOut */
    b.style.transform = "translateX(0)";
  }
  function hpSlideOut(side) {
    const b = hpBoxEl(side);
    if (!b) return;
    b.style.setProperty("--hp-slide", (500 / battleSpeed) + "ms");
    b.style.setProperty("--hp-ease", "cubic-bezier(.32,0,.67,0)");     /* Cubic.easeIn */
    b.style.transform = side === "mine" ? "translateX(112%)" : "translateX(-112%)";
  }

  /* ---------- 招式特效（FRLG 原裝 Attack Effects sheet 裁圖） ---------- */
  /* 屬性 → 預設特效；個別招式再按名 override（例如 Growl 用眼睛、Smokescreen 用煙） */
  const FX_BY_TYPE = {
    normal: "fx-normal", fire: "fx-fire", water: "fx-water", electric: "fx-electric",
    grass: "fx-grass", ice: "fx-ice", fighting: "fx-fighting", poison: "fx-poison",
    ground: "fx-rock2", flying: "fx-flying", psychic: "fx-psychic", bug: "fx-bug",
    rock: "fx-rock", ghost: "fx-ghost", dragon: "fx-dragon", dark: "fx-dark",
    steel: "fx-steel", fairy: "fx-fairy", "???": "fx-normal"
  };
  const FX_BY_NAME = {
    growl: "fx-eyes", leer: "fx-eyes", "tail-whip": "fx-eyes",
    "sand-attack": "fx-smoke", smokescreen: "fx-smoke",
    "string-shot": "fx-bug", absorb: "fx-grass", growth: "fx-grass",
    confusion: "fx-psychic", psybeam: "fx-psychic", "calm-mind": "fx-psychic",
    disable: "fx-ghost", "shadow-ball": "fx-ghost",
    "fire-punch": "fx-fire", "thunder-punch": "fx-electric", "ice-punch": "fx-ice",
    crunch: "fx-dark", scratch: "fx-normal", slash: "fx-normal",
    "quick-attack": "fx-normal", ember: "fx-fire", tackle: "fx-normal"
  };
  /* 每個屬性嘅粒子走向 / 大小（度身訂造，跟原版感覺：火向上、水向下、雷橫閃…） */
  const FX_MOTION = {
    "fx-fire": { w: 46, dx: 0, dy: -30, rot: -12 },
    "fx-fire-ring": { w: 46, dx: 0, dy: -6, rot: 0 },
    "fx-electric": { w: 62, dx: 6, dy: -4, rot: 8 },
    "fx-ice": { w: 42, dx: -10, dy: 16, rot: 20 },
    "fx-ice2": { w: 40, dx: 12, dy: 18, rot: -18 },
    "fx-water": { w: 44, dx: 0, dy: 22, rot: 0 },
    "fx-water2": { w: 40, dx: -12, dy: 18, rot: 16 },
    "fx-grass": { w: 54, dx: -18, dy: -10, rot: -24 },
    "fx-bug": { w: 50, dx: 0, dy: -16, rot: 0 },
    "fx-normal": { w: 44, dx: 0, dy: -8, rot: 10 },
    "fx-rock": { w: 46, dx: 10, dy: 14, rot: -30 },
    "fx-rock2": { w: 44, dx: -10, dy: 12, rot: 24 },
    "fx-steel": { w: 40, dx: 8, dy: -18, rot: -12 },
    "fx-fighting": { w: 42, dx: 14, dy: -6, rot: 8 },
    "fx-dark": { w: 46, dx: 0, dy: 0, rot: -20 },
    "fx-poison": { w: 46, dx: 0, dy: -14, rot: 0 },
    "fx-ghost": { w: 44, dx: 0, dy: -12, rot: 0 },
    "fx-fairy": { w: 48, dx: 0, dy: -20, rot: 0 },
    "fx-psychic": { w: 44, dx: 0, dy: -18, rot: 0 },
    "fx-flying": { w: 46, dx: 0, dy: -14, rot: 0 },
    "fx-dragon": { w: 44, dx: 0, dy: 0, rot: -10 },
    "fx-smoke": { w: 52, dx: 0, dy: -22, rot: 0 },
    "fx-eyes": { w: 44, dx: 0, dy: -10, rot: 0 },
    "fx-wave": { w: 56, dx: 0, dy: 16, rot: 0 }
  };

  function fxSpriteFor(type, slug) {
    return FX_BY_NAME[slug] || FX_BY_TYPE[type] || "fx-normal";
  }

  /* 喺目標身上播屬性特效（跟原版：火、水、雷等都係打喺對方身上） */
  function playMoveFx(type, slug, targetEl) {
    return new Promise(res => {
      const layer = document.getElementById("move-fx");
      const stage = document.querySelector(".battle-stage");
      const sRect = stage.getBoundingClientRect();
      const tRect = targetEl.getBoundingClientRect();
      const cx = tRect.left - sRect.left + tRect.width / 2;
      const cy = tRect.top - sRect.top + tRect.height / 2;
      const key = fxSpriteFor(type, slug);
      const motion = FX_MOTION[key] || FX_MOTION["fx-normal"];
      const w = motion.w;
      layer.innerHTML = "";
      for (let i = 0; i < 3; i++) {
        const img = document.createElement("img");
        img.src = `assets/battle/fx/${key}.png`;
        img.alt = "";
        const spread = i === 0 ? 0 : 16;
        const ang = i === 0 ? 0 : (i === 1 ? -1 : 1);
        img.style.width = (i === 0 ? w : w * 0.7) * 2 + "px";
        img.style.left = (cx + ang * spread) + "px";
        img.style.top = (cy + (i === 0 ? 0 : ang * 9)) + "px";
        img.style.setProperty("--fx-x", motion.dx + "px");
        img.style.setProperty("--fx-y", motion.dy + "px");
        img.style.setProperty("--fx-r", (motion.rot + ang * 10) + "deg");
        img.style.setProperty("--fx-s", (i === 0 ? 1.15 : 0.9) + "");
        img.style.animationDelay = (i * 40) + "ms";
        layer.appendChild(img);
      }
      setTimeout(() => { layer.innerHTML = ""; res(); }, 640);
    });
  }

  /* 招式動畫：攻方衝前（lunge）→ 播原裝逐招動畫（MoveAnim）+ 震動 + 命中音效
     冇該招資源（index.json 冇 / 載入失敗）先 fallback 去屬性特效 */
  function moveAnim(attackerIsPlayer, damaging, type, slug, eff) {
    return (async () => {
      const atkEl = document.getElementById(attackerIsPlayer ? "my-sprite" : "foe-sprite");
      const defEl = document.getElementById(attackerIsPlayer ? "foe-sprite" : "my-sprite");
      const lungeCls = attackerIsPlayer ? "anim-lunge-mine" : "anim-lunge-foe";
      atkEl.classList.remove(lungeCls); void atkEl.offsetWidth;
      atkEl.classList.add(lungeCls);
      await sleep(180);
      if (damaging) {
        defEl.classList.remove("anim-hit"); void defEl.offsetWidth;
        defEl.classList.add("anim-hit");
      }
      /* PokeRogue se/：命中音效按相剋強弱分 hit_strong / hit / hit_weak */
      if (damaging) sfx(eff > 1 ? "hit_strong" : eff < 1 && eff > 0 ? "hit_weak" : "hit", .9);
      let dur = 0;
      if (typeof MoveAnim !== "undefined") {
        try {
          dur = await MoveAnim.play(slug, {
            layer: document.getElementById("move-fx"),
            stageEl: document.querySelector(".battle-stage"),
            attackerEl: atkEl,
            defenderEl: defEl,
            frameMs: battleSpeed > 1 ? 8 : undefined   /* FAST：逐幀動畫加速 */
          });
        } catch (e) { dur = 0; }
      }
      if (!dur) await playMoveFx(type, slug, defEl);
      atkEl.classList.remove(lungeCls);
      if (damaging) setTimeout(() => defEl.classList.remove("anim-hit"), 250);
      await sleep(60);
    })();
  }

  /* 換寵（PokeRogue 做法）：舊寵即刻消失 + HP 框滑走 → 拋出新球召出 + HP 框滑入 */
  function animatedSwitch(side, idx) {
    return (async () => {
      const spriteId = side === mySide ? "my-sprite" : "foe-sprite";
      const sprite = document.getElementById(spriteId);
      const who = side === mySide ? "mine" : "foe";   /* hpBoxEl 只認 mine / foe，唔可以傳 p1 / p2 */
      const out = active(state, side);
      /* 1. 離場：PokeRogue leaveField 直接隱藏精靈，再 hideInfo 滑走（500ms） */
      if (out.hp > 0) {
        const tap1 = waitTap();
        narrate(side === mySide ? `${out.name}, come back!` : `${foeTrainerName()} withdrew ${out.name.toUpperCase()}!`);
        sprite.classList.remove("anim-faint", "intro-pop", "anim-recall");
        sprite.style.visibility = "hidden";
        PokeSprite.hide(sprite);
        hpSlideOut(who);
        await sleep(500);
        await tap1;
      }
      sprite.classList.remove("anim-faint", "intro-pop");
      sprite.style.visibility = "hidden";
      /* 2. 換入 + 拋球召出 + HP 框滑入 */
      BattleState.switchTo(state, side, idx);
      render();
      const inn = active(state, side);
      const tap2 = waitTap();
      narrate(side === mySide ? `Go! ${inn.name.toUpperCase()}!` : `${foeTrainerName()} sent out\n${inn.name.toUpperCase()}!`);
      await throwBall(side === mySide ? "mine" : "foe", true);
      sprite.style.visibility = "";
      hpSlideIn(who);
      await tap2;
      /* 入場釘子（spikes / stealth-rock）：先食傷害，之後先輪到上場特性（Gen 順序） */
      for (const m of BattleState.applyEntryHazards(state, side)) {
        render();
        await say(m);
      }
      if (inn.hp <= 0) {
        sprite.classList.add("anim-faint");
        await sleep(600);
        return;   /* 釘死：由外層 faint 流程接力（強制換／AI 換） */
      }
      /* 上場特性（Intimidate）：逐句出訊息等玩家 click */
      for (const m of BattleState.onSwitchIn(state, side)) await say(m);
    })();
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
      await waitTap();
      /* 對手拋球 → 精靈彈出 → 對手退場 */
      hideCaret();
      await throwBall("foe");
      foeImg.classList.add("off-right");
      introText(`${foeTrainerName()} sent out\n${foeActive().name.toUpperCase()}!`);
      await waitTap();
      /* 我方拋球（5 格動畫）→ 精靈彈出 → 我方退場 */
      hideCaret();
      animateMyThrow();
      await throwBall("mine");
      myT.classList.add("off-left");
      introText(`Go! ${myActive().name.toUpperCase()}!`);
      await waitTap();
      /* 開場上場特性（Intimidate）：按出場次序觸發（對手先、我方後） */
      for (const m of BattleState.onSwitchIn(state, foeSide)) await say(m);
      for (const m of BattleState.onSwitchIn(state, mySide)) await say(m);
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
    hideCaret();
    /* PokeRogue：每句新訊息播 ui/select.wav；倒下／能力變化用專屬音效 */
    const m = msg || "";
    if (/fainted!/.test(m)) sfx("faint", .9);
    else if (/ rose!/.test(m)) sfx("stat_up", .9);
    else if (/ fell!/.test(m)) sfx("stat_down", .9);
    else sfx("select", .9);
    typewrite(msg, showCaret);   /* 打完字先出提示三角，等玩家撳一下繼續 */
  }

  /* PokeRogue 音效（assets/battle/sfx/*.wav，經 CaptureAudio.playOnce 走 sfxBus） */
  function sfx(name, vol) {
    try {
      if (!window.CaptureScene || !CaptureScene.audio) return;
      CaptureScene.audio.playOnce("assets/battle/sfx/" + name + ".wav", vol == null ? 1 : vol);
    } catch (e) {}
  }

  /* FRLG HP 條顏色：綠 → 黃 → 紅 */
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
    const foePct = Math.max(0, (foe.hp / foe.maxHp) * 100);
    const foeBar = document.getElementById("foe-hpbar");
    foeBar.style.width = foePct + "%";
    foeBar.style.background = hpColor(foePct);
    if (typeof PokeSprite !== "undefined") {
      PokeSprite.show(document.getElementById("foe-sprite"), foe.dexId, "front");
    }
    /* 我方 HP box */
    document.getElementById("my-name").textContent = mine.name;
    document.getElementById("my-level").textContent = mine.level;
    const myPct = Math.max(0, (mine.hp / mine.maxHp) * 100);
    const myBar = document.getElementById("my-hpbar");
    myBar.style.width = myPct + "%";
    myBar.style.background = hpColor(myPct);
    document.getElementById("my-hp-cur").textContent = Math.max(0, mine.hp);
    document.getElementById("my-hp-max").textContent = mine.maxHp;
    if (typeof PokeSprite !== "undefined") {
      PokeSprite.show(document.getElementById("my-sprite"), mine.dexId, "back");
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
    if (!el || !state) return;
    const rows = [];
    if (state.weather) {
      const icon = { sun: "☀", rain: "🌧", sandstorm: "🌪", hail: "❄" }[state.weather.name] || "";
      const label = { sun: "SUN", rain: "RAIN", sandstorm: "SANDSTORM", hail: "HAIL" }[state.weather.name];
      rows.push(`<div class="bf-row"><span class="bf-chip bf-weather">${icon} ${label} ${state.weather.turns}</span></div>`);
    }
    const sideChips = (side, cls) => {
      const s = state[side].side;
      const chips = [];
      if (s.reflect > 0) chips.push(`Reflect ${s.reflect}`);
      if (s.lightScreen > 0) chips.push(`Light Screen ${s.lightScreen}`);
      if (s.spikes > 0) chips.push(`Spikes ×${s.spikes}`);
      if (s.stealthRock) chips.push("S. Rock");
      return chips.length ? `<div class="bf-row">${chips.map(c => `<span class="bf-chip ${cls}">${c}</span>`).join("")}</div>` : "";
    };
    const foeRow = sideChips(foeSide, "bf-foe");
    const myRow = sideChips(mySide, "bf-mine");
    if (foeRow) rows.push(foeRow);
    if (myRow) rows.push(myRow);
    el.innerHTML = rows.join("");
    el.style.display = rows.length ? "flex" : "none";
  }

  /* EXP 條：同主頁一樣顯示「呢一級入面行咗幾多」（into / span），唔係齋得個殼 */
  function updateMyExpBar() {
    const bar = document.getElementById("my-expbar");
    const e = teamEntries[me().active];
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
    const bottom = document.querySelector(".battle-bottom");
    bottom.classList.remove("menu-open", "move-open");
    updateEffBox(null);
  }

  function showMainMenu() {
    document.getElementById("battle-action-menu").style.display = "grid";
    document.getElementById("battle-move-menu").style.display = "none";
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
  let partySel = -1;        /* 揀中咗嘅 team index（options 開緊） */
  let partyForced = false;  /* 強制換寵（暈咗）：冇 CANCEL */

  function partyMsg(t) {
    document.getElementById("party-msg-text").textContent = t;
  }

  function showSwitchMenu(force) {
    pendingSwitch = !!force;
    partyForced = !!force;
    partySel = -1;
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
    partySel = -1;
  }

  function closePartyOptions() {
    document.getElementById("party-options").style.display = "none";
    partySel = -1;
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
      const ratio = Math.max(0, p.hp / p.maxHp);
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
    partySel = ti;
    partyMsg(`Do what with ${p.name}?`);
    document.getElementById("party-options").style.display = "flex";
  }

  /* ---------- 玩家出招 ---------- */
  function chooseMove(idx) {
    if (acting) return;
    acting = true;
    /* 即刻收埋選單，免得等緊 click 講對話時誤撳到招式掣 */
    hideActionMenus();
    const action = { kind: "move", moveIdx: idx };
    resolveTurn(action);
  }

  function chooseSwitch(idx) {
    if (acting) return;
    acting = true;
    closeParty();
    hideActionMenus();
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
        /* 已經倒下：冇得再行動（後攻者被先攻招打死就唔應該反擊） */
        if (active(state, side).hp <= 0) continue;
        if (act.action.kind === "switch") {
          /* FRLG 原版：收回舊寵 → 拋新球召出（animatedSwitch 自己 narrate） */
          await animatedSwitch(side, act.action.idx);
        } else {
          const moveObj = active(state, side).moves[act.action.moveIdx];
          /* 全招冇 PP → 引擎會出 Struggle，動畫都用 Struggle 嘅無屬性特效 */
          const struggling = active(state, side).moves.every(m => m.pp <= 0);
          const info = struggling ? { type: "???", power: 50 } : (moveObj ? moveInfo(moveObj.slug) : null);
          const animSlug = struggling ? "struggle" : (moveObj ? moveObj.slug : "");
          const damaging = !!(info && (info.power || 0) > 0);
          const logStart = state.log.length;
          BattleState.executeMove(state, side, act.action.moveIdx);
          const newLogs = state.log.slice(logStart);
          /* 第一句（used X! / is fast asleep. 等）同動畫一齊出，之後等玩家 click */
          const tapFirst = waitTap();
          narrate(newLogs[0]?.msg || "");
          const didAttack = newLogs.some(l => l.msg.includes("used "));
          const missed = newLogs.some(l => l.msg.includes("missed"));
          const critHit = newLogs.some(l => l.msg === "A critical hit!");
          const eff = newLogs.some(l => l.msg.includes("super effective")) ? 1.5
            : newLogs.some(l => l.msg.includes("not very effective")) ? 0.5 : 1;
          if (didAttack) await moveAnim(act.player, damaging && !missed, info ? info.type : "normal", animSlug, eff);
          else await sleep(450);
          render();   /* HP 條跟住跌（CSS transition） */
          /* 暴擊：成個舞台震一震，玩家一睇就知點解特別痛 */
          if (critHit) {
            const stage = document.querySelector(".battle-stage");
            stage.classList.remove("anim-crit"); void stage.offsetWidth;
            stage.classList.add("anim-crit");
            setTimeout(() => stage.classList.remove("anim-crit"), 420);
          }
          /* 倒下動畫 */
          for (const s of [mySide, foeSide]) {
            if (active(state, s).hp <= 0)
              document.getElementById(s === mySide ? "my-sprite" : "foe-sprite").classList.add("anim-faint");
          }
          await tapFirst;
          for (let i = 1; i < newLogs.length; i++) {
            await say(newLogs[i].msg);
          }
        }
        if (BattleState.checkFinished(state)) break;
      }
      if (!state.finished) {
        const resStart = state.log.length;
        BattleState.endTurnResidual(state, mySide);
        BattleState.endTurnResidual(state, foeSide);
        BattleState.endTurnField(state);
        render();
        /* residual（燒傷/毒）打死都要播倒下 */
        let residualFaint = false;
        for (const s of [mySide, foeSide]) {
          if (active(state, s).hp <= 0) {
            document.getElementById(s === mySide ? "my-sprite" : "foe-sprite").classList.add("anim-faint");
            residualFaint = true;
          }
        }
        if (residualFaint) await sleep(600);
        /* 殘餘傷害訊息都要玩家 click 先跳 */
        for (const l of state.log.slice(resStart)) await say(l.msg);
      }
      if (state.finished) { finishBattle(); return; }
      /* 我方暈咗要強制換 */
      if (myActive().hp <= 0 && BattleState.hasUsable(me().team)) {
        await say(`${myActive().name} fainted! Choose your next Pokémon.`);
        showSwitchMenu(true);
        acting = false;
        return;
      }
      /* 對手暈咗：AI 自動換（收回 → 拋球召出） */
      if (foeActive().hp <= 0 && BattleState.hasUsable(foe().team)) {
        const nextIdx = foe().team.findIndex(p => p.hp > 0);
        await animatedSwitch(foeSide, nextIdx);
      }
      showMainMenu();
      acting = false;
    })();
  }

  function pickAIAction() {
    /* AI：相剋／STAB／高威力優先；冇血會治療；唔會對已中狀態嘅對手再放狀態招 */
    const foe = foeActive();
    const target = myActive();
    const usable = foe.moves.filter(m => m.pp > 0);
    if (!usable.length) return { kind: "move", moveIdx: 0 };   /* 引擎會自動變 Struggle */
    let best = usable[0], bestScore = -Infinity;
    for (const m of usable) {
      const info = moveInfo(m.slug);
      let score;
      if (info.damage_class === "status") {
        if (info.meta && info.meta.healing) score = foe.hp < foe.maxHp * 0.5 ? 260 : 20;
        else if (info.meta && info.meta.ailment && info.meta.ailment !== "none" && target.status) score = 20;
        else score = 45;
      } else {
        score = (info.power || 0);
        score *= (typeof typeMultiplier === "function") ? typeMultiplier(info.type, target.types) : 1;
        if (foe.types.includes(info.type)) score *= 1.5; /* STAB */
      }
      score *= 0.85 + Math.random() * 0.3;   /* 少少隨機，唔會每次都同一招 */
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return { kind: "move", moveIdx: foe.moves.indexOf(best) };
  }

  /* ---------- 完結 ---------- */
  function finishBattle() {
    const won = state.winner === mySide;
    (async () => {
      await say(forfeited ? "You gave up and ran away..." : won ? "You won the battle!" : "You lost...");
      /* 對戰完：淡出 battle BGM，恢復全域 town BGM */
      try { if (window.CaptureScene) { CaptureScene.audio.stopBGM(400); CaptureScene.audio.startTownBGM(); } } catch (e) {}
      const reward = (won && !forfeited) ? applyRewards() : null;
      showResult(won && !forfeited, forfeited, reward);
    })();
  }

  /* 結算畫面（PokeRogue：WIN／LOSE ＋ EXP／💎／升級明細）；撳 CONTINUE 先返列表 */
  function showResult(win, wasForfeit, reward) {
    document.getElementById("br-title").textContent = wasForfeit ? "FORFEIT" : win ? "WIN" : "LOSE";
    document.getElementById("br-title").className = "br-title " + (win ? "br-win" : "br-lose");
    document.getElementById("br-sub").textContent = wasForfeit
      ? "You ran away from the battle."
      : win ? `${foeTrainerName()} was defeated!` : "You lost the battle...";
    const rows = [];
    if (reward) {
      rows.push(`<div class="br-row"><span>EXP</span><b>+${reward.exp}</b></div>`);
      rows.push(`<div class="br-row"><span>DIAMONDS</span><b>+${reward.diamonds} 💎</b></div>`);
      reward.levelUps.forEach(lu =>
        rows.push(`<div class="br-row br-lvup"><span>${lu.name}</span><b>Lv.${lu.from} → ${lu.to}</b></div>`));
    } else {
      rows.push(`<div class="br-row"><span>REWARD</span><b>None</b></div>`);
    }
    document.getElementById("br-rows").innerHTML = rows.join("");
    document.getElementById("battle-result").style.display = "flex";
    acting = false;
  }

  /* 撳 RUN 確認 = 投降認輸（唔派獎勵，直接當輸） */
  function forfeitBattle() {
    if (!state || acting) return;
    acting = true;
    forfeited = true;
    state.winner = foeSide;
    hideActionMenus();
    finishBattle();
  }

  function applyRewards() {
    const st = loadState();
    const expGain = aiTrainer ? aiTrainer.level * 12 : 30;
    const diamonds = aiTrainer ? Math.floor(aiTrainer.level * 0.8) : 5;
    const levelUps = [];
    /* EXP 落玩家出戰嘅 entries（順便記錄升級，結算畫面用） */
    teamEntries.forEach(entry => {
      const e = st.entries.find(x => x.uid === entry.uid);
      if (!e) return;
      const lvBefore = e.level || 1;
      const dexBefore = entryCurrentSpecies(e)[0];
      addEntryExp(e, expGain);
      if (e.level > lvBefore) {
        const p = (typeof dexOf === "function") ? dexOf(dexBefore) : null;
        levelUps.push({ name: (p && p.name) || "Pokémon", from: lvBefore, to: e.level });
      }
    });
    st.diamonds = (st.diamonds || 0) + diamonds;
    if (aiTrainer) {
      st.aiTrainersBeaten = st.aiTrainersBeaten || [];
      if (!st.aiTrainersBeaten.includes(aiTrainer.id)) st.aiTrainersBeaten.push(aiTrainer.id);
    }
    saveState();
    return { exp: expGain, diamonds, levelUps };
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms / battleSpeed)); }

  /* AI 對戰速度掣（PvP 隱藏）；記住玩家選擇 */
  function syncSpeedButton() {
    const btn = document.getElementById("btn-battle-speed");
    if (!btn) return;
    btn.hidden = mode !== "ai";
    btn.textContent = battleSpeed > 1 ? "FAST 2×" : "NORMAL 1×";
    btn.classList.toggle("fast", battleSpeed > 1);
  }

  /* ---------- 綁定（app init 時 call） ---------- */
  function bind() {
    document.getElementById("btn-battle-speed").onclick = () => {
      battleSpeed = battleSpeed > 1 ? 1 : 2;
      try { localStorage.setItem("pokeengmon_battle_speed", String(battleSpeed)); } catch (e) {}
      syncSpeedButton();
    };
    document.getElementById("br-continue").onclick = () => {
      document.getElementById("battle-result").style.display = "none";
      /* AI 對戰返訓練家梯隊（重建列表 → 顯示新解鎖／✓）；PvP 返對戰主選單 */
      if (mode === "ai") openAITrainers(); else openMenu();
    };
    document.getElementById("btn-battle-fight").onclick = showMoveMenu;
    document.getElementById("btn-battle-bag").onclick = () => toast("BAG is not available yet.");
    document.getElementById("btn-battle-pokemon").onclick = () => showSwitchMenu(false);
    /* RUN：撳一下彈確認窗（modal 唔可以撳外面關），再撳 RUN 先算投降認輸 */
    document.getElementById("btn-battle-run").onclick = () => {
      if (acting || !state) return;
      sfx("select", .9);
      App.showModal(`
        <div class="confirm-box">
          <p>Run away and <b>forfeit</b> this battle?</p>
          <p class="settings-note">A forfeit counts as a loss — no EXP or 💎.</p>
          <div class="confirm-row">
            <button id="run-confirm-yes" class="btn-big btn-danger">RUN</button>
            <button id="run-confirm-no" class="btn-big btn-plain">CANCEL</button>
          </div>
        </div>`, true);
      document.getElementById("run-confirm-no").onclick = () => App.closeModal();
      document.getElementById("run-confirm-yes").onclick = () => {
        App.closeModal();
        forfeitBattle();
      };
    };
    document.getElementById("battle-menu-back").onclick = () => { App.renderHome(); App.showView("view-home"); };
    document.getElementById("team-select-cancel").onclick = () => { document.getElementById("team-select-modal").style.display = "none"; openMenu(); };
    document.getElementById("pvp-match-cancel").onclick = cancelMatch;
    document.getElementById("pvp-format-confirm").onclick = confirmFormat;
    /* PokeRogue 換精靈頁：options（SEND OUT / CANCEL）+ 右下 CANCEL 掣 */
    document.getElementById("party-opt-send").onclick = () => {
      if (partySel < 0) return;
      chooseSwitch(partySel);
    };
    document.getElementById("party-opt-cancel").onclick = () => {
      sfx("select", .9);
      closePartyOptions();
      selectPartySlot(-1);
      partyMsg("Choose a Pokémon.");
    };
    document.getElementById("party-cancel").onclick = () => {
      if (partyForced) return;   /* 強制換寵冇得走 */
      sfx("select", .9);
      closeParty();
      showMainMenu();
      narrate(`What will ${myActive().name.toUpperCase()} do?`);
    };
  }

  return { openMenu, bind, renderMenu, openAITrainers };
})();
