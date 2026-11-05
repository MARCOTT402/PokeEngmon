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
  let pvpTeamSize = 3;       /* 抽中嘅場制 */
  let pvpBattle = null;      /* 真 PvP：battles row（含 seed） */
  let pvpSide = "p1";        /* 我喺 row 入面係 p1 定 p2 */
  let pvpCancel = null;      /* 配對輪詢取消 fn */
  let pvpFoeUid = null;      /* 對手 uid（隨機 PvP 用嚟加好友） */
  let pvpFoeName = null;     /* 對手名（好友局由邀請帶入） */
  let pvpIsFriend = false;   /* 好友局（is_friend = true，獎勵唔同） */
  let pvpRules = null;       /* 戰前投票結果 { size, items, switch, votes } */
  let pvpVoteTimer = null;   /* 投票倒數 interval */
  let pvpVoteWait = null;    /* 等對手票嘅 waitRow（帶 cancel） */
  const PVP_VOTE_SECONDS = 30;
  const toast = (m) => App.toast(m);

  /* ---------- 入口 ---------- */
  function openMenu() {
    levelSyncLevel = null;
    App.showView("view-battle-menu");
    renderMenu();
  }

  /* ---------- 能量點 EP（結算先扣，開戰唔扣） ---------- */
  let aiTier = "normal";       /* 目前挑戰嘅難度 */
  let levelSyncLevel = null;   /* Inferno：玩家隊伍臨時同步等級 */
  let aiPotions = 0;           /* Inferno：AI 得 1 支 Potion */
  let myFullRestores = 0;      /* Inferno：玩家得 1 支 Full Restore */

  function gateStatus() {
    return Energy.status(loadState());
  }

  function quotaText(g) {
    if (g.allowed) return `⚡ ${g.points} Energy · 1 per battle`;
    return g.claimable > 0
      ? `⚡ No Energy — claim ${g.claimable} daily quest${g.claimable === 1 ? "" : "s"}`
      : "⚡ No Energy — answer 10 questions to complete a daily quest";
  }

  /* 入口閘門：冇 EP 就 toast 講原因，唔開戰 */
  function blockedByQuota() {
    const g = gateStatus();
    if (g.allowed) return false;
    toast(quotaText(g));
    return true;
  }

  function renderMenu() {
    const st = loadState();
    const topDia = document.getElementById("topbar-diamonds-bm");
    if (topDia) topDia.textContent = st.diamonds;
    /* PvP 戰績（server 記錄，pull / settle_battle 回應入咗本地 state） */
    const pvpSub = document.getElementById("battle-menu-pvp-sub");
    if (pvpSub && window.SupabaseAuth && SupabaseAuth.isLoggedIn() && st.pvpWins != null) {
      pvpSub.textContent = `Online · ${st.pvpWins || 0}W – ${st.pvpLosses || 0}L`;
    }
    /* 好友 tile：朋友數 + 待處理邀請 badge（app.js 負責綁 click） */
    const fs = document.getElementById("battle-menu-friends-sub");
    const fb = document.getElementById("battle-menu-friends-badge");
    if (fs && fb) {
      if (window.SupabaseAuth && SupabaseAuth.isLoggedIn() && window.Friends && Friends.summary) {
        const s = Friends.summary();
        fs.textContent = `${s.friends} friend${s.friends === 1 ? "" : "s"} · ${s.requests} request${s.requests === 1 ? "" : "s"}`;
        const n = (s.requests || 0) + (s.invites || 0);
        fb.hidden = n <= 0;
        fb.textContent = String(n);
      } else {
        fs.textContent = "Log in to add friends";
        fb.hidden = true;
      }
    }
    /* 登入用戶：用 server ledger 校正 EP + 精通（跨機一致、清 cache 都保得住進度） */
    if (window.SupabaseAuth && SupabaseAuth.isLoggedIn()) {
      const q = questionsToday(st, dateKey(Date.now()));
      const pull = SupabaseAuth.battleProgress
        ? SupabaseAuth.battleProgress(q)
        : (SupabaseAuth.energyStatus ? SupabaseAuth.energyStatus(q) : null);
      if (pull) pull.then(r => {
        if (!r) return;
        const st2 = loadState();
        const e = r.energy || r;
        if (e && e.points != null && Energy.adopt) Energy.adopt(st2, e);
        if (r.mastery) adoptMastery(st2, r.mastery);
        renderTrainerList();
      }).catch(() => {});
    }

    const havePokemon = st.entries.some(e => e.ownedSpecies && e.ownedSpecies.length);
    document.getElementById("battle-menu-pvp").onclick = () => {
      if (!havePokemon) { toast("You need Pokémon first! Pull or capture one."); return; }
      startPvP();
    };
    const trainerList = document.getElementById("ai-trainer-list");
    /* 梯隊一入 Battle 頁就列出，唔使先撳 AI Trainers 先見到 */
    if (trainerList) trainerList.hidden = false;
    renderTrainerList();
  }

  /* ---------- AI Trainers 梯隊：14 位，等級同隊伍數刻意脫鈎 ---------- */
  const AI_TRAINERS = [
    { id: "youngster", name: "Youngster Timmy", sprite: "assets/trainers/ai-youngster.png", baseLevel: 5, zone: "Boot Camp", team: [
      { dexId: 19, moves: ["tackle", "tail-whip", "quick-attack", "bite"] }
    ] },
    { id: "bugcatcher", name: "Bug Catcher Wade", sprite: "assets/trainers/ai-bugcatcher.png", baseLevel: 8, zone: "Boot Camp", team: [
      { dexId: 10, moves: ["tackle", "string-shot"] },
      { dexId: 11, moves: ["tackle", "harden"] },
      { dexId: 13, moves: ["poison-sting", "string-shot", "tackle"] },
      { dexId: 14, moves: ["poison-sting", "harden"] },
      { dexId: 46, moves: ["scratch", "stun-spore", "absorb"] },
      { dexId: 48, moves: ["tackle", "confusion", "supersonic"] }
    ] },
    { id: "lass", name: "Lass Dana", sprite: "assets/trainers/ai-lass.png", baseLevel: 14, zone: "Boot Camp", team: [
      { dexId: 133, moves: ["tackle", "quick-attack", "bite", "sand-attack"] },
      { dexId: 16, moves: ["tackle", "gust", "quick-attack", "sand-attack"] }
    ] },
    { id: "hiker", name: "Hiker Marcos", sprite: "assets/trainers/ai-hiker.png", baseLevel: 22, zone: "Boot Camp", team: [
      { dexId: 74, moves: ["tackle", "rock-throw", "defense-curl", "low-kick"] },
      { dexId: 95, moves: ["tackle", "rock-throw", "harden", "screech"] },
      { dexId: 66, moves: ["low-kick", "leer", "focus-energy", "tackle"] }
    ] },
    { id: "gentleman", name: "Gentleman Alfred", sprite: "assets/trainers/ai-gentleman.png", baseLevel: 30, zone: "Local League", team: [
      { dexId: 96, moves: ["confusion", "disable", "headbutt", "hypnosis"] },
      { dexId: 41, moves: ["leech-life", "supersonic", "bite", "wing-attack"] }
    ] },
    { id: "swimmer", name: "Swimmer Barry", sprite: "assets/trainers/ai-swimmer.png", baseLevel: 38, zone: "Local League", team: [
      { dexId: 129, moves: ["splash", "tackle", "water-gun"] },
      { dexId: 60, moves: ["water-gun", "hypnosis", "body-slam", "bubble-beam"] },
      { dexId: 120, moves: ["water-gun", "swift", "recover", "bubble-beam"] },
      { dexId: 116, moves: ["water-gun", "smokescreen", "twister", "bubble-beam"] },
      { dexId: 90, moves: ["tackle", "water-gun", "icicle-spear", "clamp"] },
      { dexId: 98, moves: ["water-gun", "vice-grip", "stomp", "crabhammer"] }
    ] },
    { id: "ace", name: "Ace Trainer Kiera", sprite: "assets/trainers/ai-ace.png", baseLevel: 46, zone: "Local League", team: [
      { dexId: 359, moves: ["night-slash", "slash", "swords-dance", "quick-attack"] },
      { dexId: 282, moves: ["psychic", "calm-mind", "shadow-ball", "thunderbolt"] },
      { dexId: 306, moves: ["iron-head", "rock-slide", "earthquake", "thunder-wave"] },
      { dexId: 130, moves: ["waterfall", "crunch", "ice-fang", "dragon-dance"] }
    ] },
    { id: "jasmine", name: "Gym Leader Jasmine", sprite: "assets/trainers/ai-jasmine.png", baseLevel: 55, zone: "Gym Circuit", team: [
      { dexId: 208, moves: ["iron-tail", "earthquake", "rock-slide", "curse"] },
      { dexId: 227, moves: ["steel-wing", "air-slash", "spikes", "roost"] },
      { dexId: 82, moves: ["thunderbolt", "flash-cannon", "thunder-wave", "tri-attack"] }
    ] },
    { id: "psychic", name: "Psychic Sarah", sprite: "assets/trainers/ai-psychic.png", baseLevel: 64, zone: "Gym Circuit", team: [
      { dexId: 65, moves: ["psychic", "shadow-ball", "calm-mind", "thunder-wave"] },
      { dexId: 196, moves: ["psychic", "shadow-ball", "calm-mind", "morning-sun"] },
      { dexId: 97, moves: ["psychic", "hypnosis", "dream-eater", "thunder-wave"] },
      { dexId: 80, moves: ["surf", "psychic", "slack-off", "thunder-wave"] },
      { dexId: 121, moves: ["surf", "psychic", "ice-beam", "thunderbolt"] },
      { dexId: 282, moves: ["psychic", "shadow-ball", "thunderbolt", "calm-mind"] }
    ] },
    { id: "cynthia", name: "Champion Cynthia", sprite: "assets/trainers/ai-cynthia.png", baseLevel: 76, zone: "Champion Road", team: [
      { dexId: 445, moves: ["earthquake", "dragon-claw", "stone-edge", "swords-dance"] },
      { dexId: 448, moves: ["close-combat", "flash-cannon", "extreme-speed", "swords-dance"] },
      { dexId: 468, moves: ["air-slash", "aura-sphere", "thunder-wave", "roost"] },
      { dexId: 350, moves: ["surf", "ice-beam", "recover", "toxic"] },
      { dexId: 442, moves: ["dark-pulse", "shadow-ball", "will-o-wisp", "hypnosis"] }
    ] },
    { id: "alder", name: "Champion Alder", sprite: "assets/trainers/ai-alder.png", baseLevel: 82, zone: "Champion Road", team: [
      { dexId: 637, moves: ["fiery-dance", "bug-buzz", "psychic", "quiver-dance"] },
      { dexId: 534, moves: ["close-combat", "mach-punch", "rock-slide", "bulk-up"] },
      { dexId: 621, moves: ["dragon-claw", "crunch", "earthquake", "rock-slide"] },
      { dexId: 626, moves: ["head-charge", "earthquake", "megahorn", "zen-headbutt"] },
      { dexId: 584, moves: ["ice-beam", "blizzard", "flash-cannon", "toxic"] },
      { dexId: 571, moves: ["dark-pulse", "flamethrower", "shadow-ball", "night-slash"] }
    ] },
    { id: "drake", name: "Elite Four Drake", sprite: "assets/trainers/ai-drake.png", baseLevel: 90, zone: "Elite Road", team: [
      { dexId: 373, moves: ["dragon-claw", "earthquake", "fire-blast", "dragon-dance"] },
      { dexId: 149, moves: ["outrage", "earthquake", "thunder-punch", "extreme-speed"] },
      { dexId: 445, moves: ["earthquake", "dragon-claw", "stone-edge", "swords-dance"] },
      { dexId: 635, moves: ["dark-pulse", "dragon-claw", "flamethrower", "crunch"] },
      { dexId: 230, moves: ["surf", "ice-beam", "dragon-claw", "smokescreen"] },
      { dexId: 330, moves: ["earthquake", "dragon-claw", "rock-slide", "quick-attack"] }
    ] },
    { id: "anabel", name: "Frontier Brain Anabel", sprite: "assets/trainers/ai-anabel.png", baseLevel: 95, zone: "Elite Road", team: [
      { dexId: 65, moves: ["psychic", "shadow-ball", "calm-mind", "thunder-wave"] },
      { dexId: 381, moves: ["psychic", "dragon-claw", "ice-beam", "calm-mind"] },
      { dexId: 380, moves: ["psychic", "dragon-claw", "ice-beam", "recover"] },
      { dexId: 143, moves: ["body-slam", "earthquake", "crunch", "rest"] },
      { dexId: 245, moves: ["surf", "ice-beam", "calm-mind", "rest"] },
      { dexId: 376, moves: ["meteor-mash", "earthquake", "bullet-punch", "zen-headbutt"] }
    ] },
    { id: "red", name: "Champion Red", sprite: "assets/trainers/ai-red.png", baseLevel: 99, zone: "Elite Road", team: [
      { dexId: 25, moves: ["thunderbolt", "quick-attack", "iron-tail", "thunder-wave"] },
      { dexId: 143, moves: ["body-slam", "earthquake", "crunch", "rest"] },
      { dexId: 6, moves: ["flamethrower", "dragon-claw", "air-slash", "fire-blast"] },
      { dexId: 9, moves: ["surf", "ice-beam", "flash-cannon", "earthquake"] },
      { dexId: 3, moves: ["energy-ball", "sludge-bomb", "earthquake", "sleep-powder"] },
      { dexId: 131, moves: ["surf", "ice-beam", "thunderbolt", "body-slam"] }
    ] }
  ];

  /* ---------- 難度矩陣 ---------- */
  const TIERS = ["easy", "normal", "hard", "inferno"];
  const TIER_META = {
    easy: { label: "Easy", short: "E", mult: 0.7, note: "Warm-up · foe levels lowered" },
    normal: { label: "Normal", short: "N", mult: 1.0, note: "Standard test" },
    hard: { label: "Hard", short: "H", mult: 1.6, note: "Best nature · smarter foe" },
    inferno: { label: "Inferno", short: "I", mult: 2.5, note: "Level Sync · perfect foe" }
  };
  const DIFFICULTY_PRESETS = {
    easy: { ivs: "zero", evs: "none", nature: "neutral", moves: "weak2", iq: 0 },
    normal: { ivs: "random", evs: "none", nature: "random", moves: "full", iq: 1 },
    hard: { ivs: "random", evs: "none", nature: "best", moves: "full", iq: 2 },
    inferno: { ivs: "perfect", evs: "main", nature: "best", moves: "full", iq: 3 }
  };

  /* 難度 → 敵人等級（Easy 大隊有額外 -10% 飽和補償；Normal 喺 Junior 模式放寬到 0.95×） */
  function foeLevel(trainer, tier) {
    const base = trainer.baseLevel;
    if (tier === "easy") {
      const v = Math.round(base * 0.9 * (trainer.team.length >= 6 ? 0.9 : 1));
      return Math.max(1, Math.min(100, v));
    }
    if (tier === "hard") return Math.max(1, Math.min(100, base));
    if (tier === "normal" && typeof getCurveMode === "function" && getCurveMode() === "junior") {
      return Math.max(1, Math.min(100, Math.round(base * 0.95)));
    }
    return base;
  }
  function levelRangeText(trainer) {
    const lo = foeLevel(trainer, "easy");
    const hi = foeLevel(trainer, "hard");
    return lo === hi ? `Lv. ${lo}` : `Lv. ${lo}–${hi}`;
  }
  /* Inferno 玩家 Level Sync：敵人平均等級 +2（上限 100） */
  function infernoSyncLevel(trainer) {
    return Math.min(100, trainer.baseLevel + 2);
  }
  /* 玩家出戰數：Easy +1、Normal/Hard 同數、Inferno −1（最少 1） */
  function playerSlots(aiCount, tier) {
    if (tier === "easy") return Math.min(6, aiCount + 1);
    if (tier === "inferno") return Math.max(1, aiCount - 1);
    return aiCount;
  }

  function trainerProgress(st, id) {
    const tp = (st.trainerProgress || {})[id] || {};
    return {
      easy: Number(tp.easy) || 0, normal: Number(tp.normal) || 0,
      hard: Number(tp.hard) || 0, inferno: Number(tp.inferno) || 0,
      flawless: Array.isArray(tp.flawless) ? tp.flawless : []
    };
  }
  /* 同 server 記錄合併：次數取大、flawless 取聯集（換機／清 cache 都唔會倒退） */
  function adoptMastery(st, srv) {
    if (!srv || typeof srv !== "object") return;
    const store = st.trainerProgress || (st.trainerProgress = {});
    let changed = false;
    Object.keys(srv).forEach(id => {
      const s = srv[id] || {};
      const cur = trainerProgress(st, id);
      const merged = {
        easy: Math.max(cur.easy, Number(s.easy) || 0),
        normal: Math.max(cur.normal, Number(s.normal) || 0),
        hard: Math.max(cur.hard, Number(s.hard) || 0),
        inferno: Math.max(cur.inferno, Number(s.inferno) || 0),
        flawless: Array.from(new Set([].concat(cur.flawless, Array.isArray(s.flawless) ? s.flawless : [])))
      };
      if (JSON.stringify(merged) !== JSON.stringify(cur)) { store[id] = merged; changed = true; }
    });
    if (changed) saveState(st);
  }
  function trainerUnlockedAt(st, index) {
    if (index <= 0) return true;
    return trainerProgress(st, AI_TRAINERS[index - 1].id).normal > 0;
  }
  function tierUnlocked(st, trainer, tier) {
    if (tier === "easy" || tier === "normal") return true;
    const tp = trainerProgress(st, trainer.id);
    return tier === "hard" ? tp.normal > 0 : tp.hard > 0;
  }

  /* 敵隊生成：等級／IV／EV／性格／招式一律由 PRESET 套公式 */
  function ivsFor(mode) {
    const o = {};
    STAT_KEYS.forEach(k => {
      o[k] = mode === "perfect" ? MAX_IV : mode === "zero" ? 0 : Math.floor(Math.random() * (MAX_IV + 1));
    });
    return o;
  }
  function evsFor(mode, dexId) {
    const o = emptyEvs();
    if (mode === "main") {
      const p = dexOf(dexId) || {};
      const bs = p.baseStats || {};
      const physical = (bs.atk || 0) >= (bs.spa || 0);
      o[physical ? "atk" : "spa"] = 252;
      o.spe = 252;
      o.hp = 6;
    }
    return o;
  }
  function natureFor(mode, dexId) {
    if (mode === "random") return randomNature();
    if (mode === "neutral") return "hardy";
    const p = dexOf(dexId) || {};
    const bs = p.baseStats || {};
    const physical = (bs.atk || 0) >= (bs.spa || 0);
    const speedy = (bs.spe || 0) >= 80;
    if (physical) return speedy ? "jolly" : "adamant";
    return speedy ? "timid" : "modest";
  }
  function weakestMoves(moves, count) {
    return (moves || [])
      .slice()
      .sort((a, b) => ((moveInfo(a) || {}).power || 0) - ((moveInfo(b) || {}).power || 0))
      .slice(0, Math.min(count, (moves || []).length));
  }
  function buildFoeTeam(trainer, tier) {
    const preset = DIFFICULTY_PRESETS[tier] || DIFFICULTY_PRESETS.normal;
    const lv = foeLevel(trainer, tier);
    return trainer.team.map(mon => ({
      dexId: mon.dexId,
      level: lv,
      ivs: ivsFor(preset.ivs),
      evs: evsFor(preset.evs, mon.dexId),
      nature: natureFor(preset.nature, mon.dexId),
      moves: preset.moves === "weak2" ? weakestMoves(mon.moves, 2) : mon.moves.slice(0, 4)
    }));
  }

  /* ---------- Inferno 解鎖演出（一次性彩虹火） ---------- */
  function playInfernoUnlock(trainer) {
    const el = document.getElementById("inferno-unlock");
    if (!el) return;
    el.querySelector(".iu-name").textContent = trainer.name;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    const close = () => { el.classList.remove("show"); el.onclick = null; };
    el.onclick = close;
    setTimeout(close, 2400);
  }

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

  function tierChip(tp, tier, open) {
    const cleared = tp[tier] > 0;
    const cls = cleared ? "cleared" : open ? "open" : "unknown";
    return `<span class="at-tier ${tier} ${cls}" title="${TIER_META[tier].label}">${open ? TIER_META[tier].short : "?"}</span>`;
  }

  function renderTrainerList() {
    const st = loadState();
    const havePokemon = st.entries.some(e => e.ownedSpecies && e.ownedSpecies.length);
    const list = document.getElementById("ai-trainer-list");
    if (!list) return;
    /* 未解鎖嘅訓練家唔顯示；冇已解鎖成員嘅 zone header 亦唔顯示 */
    const visible = AI_TRAINERS.map((t, i) => ({ t, i })).filter(x => trainerUnlockedAt(st, x.i));
    let html = "";
    let lastZone = null;
    let zoneIdx = -1;
    visible.forEach(({ t, i }) => {
      /* 每個地區加一條分隔標題，令卡有層次而唔係一望無際嘅清單 */
      if (t.zone !== lastZone) {
        lastZone = t.zone;
        zoneIdx += 1;
        const inZone = AI_TRAINERS.filter(x => x.zone === t.zone);
        const lo = Math.min(...inZone.map(x => foeLevel(x, "easy")));
        const hi = Math.max(...inZone.map(x => foeLevel(x, "hard")));
        const zoneDone = inZone.filter(x => trainerProgress(st, x.id).normal > 0).length;
        html += `<div class="ladder-zone z${zoneIdx}">
          <span>${t.zone}</span>
          <small>Lv. ${lo}–${hi} · ${zoneDone}/${inZone.length} beaten</small>
        </div>`;
      }
      const tp = trainerProgress(st, t.id);
      const clearedCount = TIERS.filter(x => tp[x] > 0).length;
      /* 火焰邊框代表「已打贏」而唔係「已解鎖」，否則清完 Normal 就全場紫火 */
      const frame = tp.inferno > 0 ? "frame-rainbow" : tp.hard > 0 ? "frame-purple" : "";
      const rank = String(i + 1).padStart(2, "0");
      const mastery = `${TIERS.map(x => tierChip(tp, x, tierUnlocked(st, t, x))).join("")}<span class="at-count">${clearedCount}/4</span>`;
      return html += `<button type="button" class="ai-trainer-card ${frame}" data-id="${t.id}">
        <span class="at-portrait"><i class="at-rank">${rank}</i><img src="${t.sprite}" alt="" loading="lazy"></span>
        <span class="at-main">
          <span class="at-name">${t.name}</span>
          <span class="at-meta">
            <span class="at-lv">${levelRangeText(t)}</span>
            <span class="at-team">${t.team.length} mon${t.team.length > 1 ? "s" : ""}</span>
          </span>
          <span class="at-mastery">${mastery}</span>
        </span>
        <span class="at-go" aria-hidden="true">›</span>
        ${frame ? `<span class="fire-band" aria-hidden="true"><i></i><i></i><b></b></span>` : ""}
      </button>`;
    });
    list.innerHTML = html;
    list.querySelectorAll(".ai-trainer-card").forEach(card => {
      card.onclick = () => {
        if (!havePokemon) { toast("You need Pokémon first! Pull or capture one."); return; }
        if (card.classList.contains("locked")) return;
        openTierPicker(AI_TRAINERS.find(t => t.id === card.dataset.id));
      };
    });
  }

  /* ---------- 難度選擇（Trainer → 四級挑戰） ---------- */
  function openTierPicker(trainer) {
    if (!trainer) return;
    const st = loadState();
    const tp = trainerProgress(st, trainer.id);
    const body = document.getElementById("tier-select-body");
    const title = document.getElementById("tier-select-title");
    if (!body) return;
    if (title) title.textContent = trainer.name;

    const pips = TIERS.map(x =>
      `<span class="hero-pip ${tp[x] > 0 ? "on" : ""} ${tp.flawless.includes(x) ? "star" : ""}">${tp[x] > 0 ? "★" : "◇"}</span>`
    ).join("");
    const roster = trainer.team.map(m => {
      const p = dexOf(m.dexId) || {};
      return `<img src="${spriteURL(m.dexId)}" alt="${p.name || ""}" title="${p.name || ""}">`;
    }).join("");

    const cards = TIERS.map(tier => {
      const open = tierUnlocked(st, trainer, tier);
      const cleared = tp[tier] > 0;
      const flawless = tp.flawless.includes(tier);
      const meta = TIER_META[tier];
      const lv = foeLevel(trainer, tier);
      const slots = playerSlots(trainer.team.length, tier);
      const frame = open ? (tier === "inferno" ? "frame-rainbow" : tier === "hard" ? "frame-purple" : "") : "";
      const state = cleared ? (flawless ? "★ Flawless" : "✓ Cleared") : open ? "Challenge" : "Locked";
      const need = tier === "hard" ? "Clear Normal first" : "Clear Hard first";
      return `<button type="button" class="tier-card tier-${tier} ${frame} ${open ? "" : "locked"}" data-tier="${tier}"
          ${open ? "" : "disabled"}>
        <span class="tc-top">
          <span class="tc-name">${open ? meta.label : "???"}</span>
          <span class="tc-state ${cleared ? "done" : open ? "" : "lock"}">${open ? state : "Locked"}</span>
        </span>
        <span class="tc-stats">${open
          ? `Foe Lv. ${lv} · ${trainer.team.length} Pokémon · You bring ${slots}`
          : need}</span>
        ${open ? `<span class="tc-note">${meta.note}</span>` : ""}
        ${open && tier === "inferno" ? `<span class="tc-sync">Level Sync → Lv. ${infernoSyncLevel(trainer)} <small>(levels restored after battle)</small></span>` : ""}
        ${open ? `<span class="tc-foot"><span class="tc-reward">First clear 💎10 · EXP ×${meta.mult}</span><span class="tc-ep">⚡ 1</span></span>` : ""}
        ${frame ? `<span class="fire-band" aria-hidden="true"><i></i><i></i><b></b></span>` : ""}
      </button>`;
    }).join("");

    body.innerHTML = `
      <div class="tier-hero">
        <div class="tier-hero-portrait"><img src="${trainer.sprite}" alt=""></div>
        <div class="tier-hero-info">
          <div class="tier-hero-zone">${trainer.zone}</div>
          <div class="tier-hero-meta">${levelRangeText(trainer)} · ${trainer.team.length} Pokémon</div>
          <div class="tier-hero-pips">${pips}</div>
          <div class="tier-hero-roster">${roster}</div>
        </div>
      </div>
      <div class="tier-grid">${cards}</div>`;

    body.querySelectorAll(".tier-card").forEach(el => {
      el.onclick = () => {
        if (el.disabled) return;
        closeTierPicker();
        startAI(trainer, el.dataset.tier);
      };
    });
    document.getElementById("tier-select-modal").style.display = "flex";
  }

  function closeTierPicker() {
    const m = document.getElementById("tier-select-modal");
    if (m) m.style.display = "none";
  }

  function openAITrainers() {
    /* 同一個 Battle 選單頁，梯隊由 renderMenu 直接列出 */
    openMenu();
  }

  /* ---------- 開始對戰 ---------- */
  function startAI(trainer, tier) {
    if (!trainer) return;
    if (blockedByQuota()) return;
    mode = "ai";
    aiTrainer = trainer;
    aiTier = TIERS.includes(tier) ? tier : "normal";
    if (!tierUnlocked(loadState(), trainer, aiTier)) {
      toast(`Clear ${aiTier === "inferno" ? "Hard" : "Normal"} first to unlock this tier.`);
      return;
    }
    levelSyncLevel = aiTier === "inferno" ? infernoSyncLevel(trainer) : null;
    aiPotions = aiTier === "inferno" ? 1 : 0;
    myFullRestores = aiTier === "inferno" ? 1 : 0;
    foeTeamEntries = buildFoeTeam(trainer, aiTier);
    /* Gen 2-5 訓練家：先確保對應世代圖鑑資料載入（failed 就照開，唔好卡死揀隊） */
    const gens = gensForTeam(foeTeamEntries);
    const ready = (typeof ensureGenDataLoaded === "function")
      ? Promise.all(gens.map(g => ensureGenDataLoaded(g)))
      : Promise.resolve();
    ready.catch(() => {}).then(() => openTeamSelect(() => launchBattle()));
  }

  /* ---------- PvP 流程：配對 → 抽場制 → confirm → 揀隊 → 開戰 ---------- */
  function startPvP() {
    if (blockedByQuota()) return;
    mode = "pvp";
    aiTrainer = null;
    aiTier = "normal";
    levelSyncLevel = null;
    myFullRestores = 0;
    showMatchPanel();
  }

  function showMatchPanel() {
    /* 未登入冇得玩 PvP（auth.uid() 係 RLS 必須） */
    if (!(window.SupabaseAuth && SupabaseAuth.isLoggedIn())) {
      toast("Log in first to battle other players!");
      return;
    }
    document.getElementById("pvp-match-panel").style.display = "flex";
    document.getElementById("pvp-matching").style.display = "flex";
    document.getElementById("pvp-matched").style.display = "none";
    /* 好友局會改過標題，隨機配對要還原 */
    const foundTitle = document.querySelector(".pvp-found-title");
    if (foundTitle) foundTitle.textContent = "Opponent found!";
    /* 場制改由配對後嘅戰前投票決定；配對池／battle row 先填 3 做 placeholder */
    pvpTeamSize = 3;
    pvpRules = null;
    pvpCancel = PvpNet.matchmake(3, {
      onMatched, onTimeout: onMatchTimeout, onError: onMatchError
    });
  }

  function cancelMatch() {
    if (pvpCancel) { pvpCancel(); pvpCancel = null; }
    document.getElementById("pvp-match-panel").style.display = "none";
  }

  function onMatchTimeout() {
    pvpCancel = null;
    document.getElementById("pvp-match-panel").style.display = "none";
    toast("No opponent found. Try again later!");
  }

  function onMatchError(e) {
    console.warn("[PvP] match error:", e);
    pvpCancel = null;
    document.getElementById("pvp-match-panel").style.display = "none";
    toast("Matchmaking failed: " + (e && e.message ? e.message.slice(0, 60) : "network error"));
  }

  function onMatched(battle, side, foeUid) {
    pvpCancel = null;
    pvpBattle = battle;
    pvpSide = side;
    pvpTeamSize = battle.team_size;
    /* 隨機 PvP：記低對手，完場可以加好友 */
    pvpFoeUid = foeUid || null;
    pvpFoeName = null;
    pvpIsFriend = !!battle.is_friend;
    document.getElementById("pvp-matching").style.display = "none";
    document.getElementById("pvp-matched").style.display = "flex";
    startPvpVote(3);
  }

  /* 好友局：server 已開好 row，唔使配對，亦唔檢查每日答題配額 */
  function openFriendMatch(battle, foeName) {
    if (!battle) return;
    mode = "pvp";
    aiTrainer = null;
    aiTier = "normal";
    levelSyncLevel = null;
    myFullRestores = 0;
    pvpCancel = null;
    const me = (window.SupabaseAuth && SupabaseAuth.currentUser) ? SupabaseAuth.currentUser() : null;
    const myId = me ? me.id : null;
    pvpBattle = battle;
    pvpSide = battle.p1_uid === myId ? "p1" : "p2";
    pvpTeamSize = battle.team_size;
    pvpIsFriend = true;
    pvpFoeName = foeName || null;
    pvpFoeUid = battle.p1_uid === myId ? battle.p2_uid : battle.p1_uid;
    /* 借用隨機配對面板顯示場制；之後等玩家撳 #pvp-format-confirm */
    const panel = document.getElementById("pvp-match-panel");
    if (panel) panel.style.display = "flex";
    const matching = document.getElementById("pvp-matching");
    if (matching) matching.style.display = "none";
    const matched = document.getElementById("pvp-matched");
    if (matched) matched.style.display = "flex";
    const title = document.querySelector(".pvp-found-title");
    if (title) title.textContent = "Friend challenge!";
    /* 邀請只係叫人入場；規則同隨機 PvP 一樣由雙方投票 */
    startPvpVote(3);
  }

  /* ---------- PvP 戰前投票：出戰數量／准唔准用藥／准唔准自願換 ---------- */
  /* 可出戰數：狀態系統落地後要排除 Faint */
  function pvpUsableCount() {
    const st = loadState();
    return st.entries.filter(e => Array.isArray(e.ownedSpecies) && e.ownedSpecies.length).length;
  }

  /* 人數 1–6，唔超過自己可出戰數 */
  function pvpFitSize(size, cap) {
    return Math.max(1, Math.min(size, cap));
  }

  function stopPvpVote() {
    if (pvpVoteTimer) { clearInterval(pvpVoteTimer); pvpVoteTimer = null; }
    if (pvpVoteWait && pvpVoteWait.cancel) pvpVoteWait.cancel();
    pvpVoteWait = null;
  }

  function startPvpVote(defaultSize) {
    stopPvpVote();
    pvpRules = null;
    const cap = Math.max(1, Math.min(6, pvpUsableCount()));
    const n = Math.round(Number(defaultSize));
    const base = (n >= 1 && n <= 6) ? n : 3;
    const vote = { size: pvpFitSize(base, cap), cap, items: true, switch: true };

    const voteBox = document.getElementById("pvp-vote");
    voteBox.style.display = "flex";
    document.getElementById("pvp-vote-wait").style.display = "none";
    document.getElementById("pvp-vote-result").style.display = "none";

    const syncSeg = () => {
      voteBox.querySelectorAll(".pvp-seg").forEach(seg => {
        const key = seg.dataset.key;
        seg.querySelectorAll("button").forEach(btn => {
          const v = Number(btn.dataset.v);
          if (key === "size") {
            btn.disabled = v > cap;
            btn.classList.toggle("on", v === vote.size);
          } else {
            btn.disabled = false;
            btn.classList.toggle("on", (v === 1) === vote[key]);
          }
        });
      });
    };
    voteBox.querySelectorAll(".pvp-seg").forEach(seg => {
      seg.querySelectorAll("button").forEach(btn => {
        btn.onclick = (ev) => {
          ev.stopPropagation();
          if (btn.disabled) return;
          const v = Number(btn.dataset.v);
          if (seg.dataset.key === "size") vote.size = v; else vote[seg.dataset.key] = v === 1;
          sfx("select", .9);
          syncSeg();
        };
      });
    });
    syncSeg();

    let left = PVP_VOTE_SECONDS;
    const timerEl = document.getElementById("pvp-vote-timer");
    const paint = () => {
      timerEl.textContent = left + "s";
      timerEl.classList.toggle("urgent", left <= 5);
    };
    paint();
    let submitted = false;
    const submit = (auto) => {
      if (submitted) return;
      submitted = true;
      /* 夠鐘未投 → 預設：3 隻（唔夠就用最多可出戰數）、准用藥、准換 */
      const finalVote = auto
        ? { size: pvpFitSize(3, cap), cap, items: true, switch: true }
        : Object.assign({}, vote);
      submitPvpVote(finalVote);
    };
    pvpVoteTimer = setInterval(() => {
      left -= 1;
      paint();
      if (left <= 0) submit(true);
    }, 1000);
    document.getElementById("pvp-vote-submit").onclick = (ev) => { ev.stopPropagation(); submit(false); };
  }

  async function submitPvpVote(vote) {
    if (pvpVoteTimer) { clearInterval(pvpVoteTimer); pvpVoteTimer = null; }
    const battle = pvpBattle;
    if (!battle) return;
    document.getElementById("pvp-vote").style.display = "none";
    document.getElementById("pvp-vote-wait").style.display = "flex";
    try {
      await PvpNet.submitVote(battle.id, pvpSide, vote);
      pvpVoteWait = PvpNet.waitForVotes(battle.id);
      /* 對手自己有 30s 倒數會自動交票；再等多 45s 都冇就當走咗 */
      const b = await raceTimeout(pvpVoteWait, PvpNet.ACTION_TIMEOUT_MS + PVP_VOTE_SECONDS * 1000);
      if (pvpVoteWait && pvpVoteWait.cancel) pvpVoteWait.cancel();
      pvpVoteWait = null;
      if (pvpBattle !== battle) return;   /* 期間已經離開／換咗局 */
      if (!b || b.state === "finished" || !b.p1_vote || !b.p2_vote) {
        if (!b) await PvpNet.finishBattleRow(battle.id, pvpSide);
        abortPvpVote("Opponent left. Battle cancelled.");
        return;
      }
      const seed = (b.seed != null) ? b.seed : battle.seed;
      pvpRules = PvpNet.resolveRules(seed, b.p1_vote, b.p2_vote);
      pvpTeamSize = pvpRules.size;
      if (pvpSide === "p1") PvpNet.recordTeamSize(battle.id, pvpRules.size);
      showPvpVoteResult();
    } catch (e) {
      console.warn("[PvP] vote failed:", e);
      abortPvpVote("Network error: " + (e && e.message ? e.message.slice(0, 60) : ""));
    }
  }

  function abortPvpVote(msg) {
    stopPvpVote();
    pvpBattle = null;
    pvpRules = null;
    document.getElementById("pvp-match-panel").style.display = "none";
    toast(msg);
    openMenu();
  }

  function showPvpVoteResult() {
    const r = pvpRules;
    const mine = r.votes[pvpSide];
    const foe = r.votes[pvpSide === "p1" ? "p2" : "p1"];
    const yn = b => (b ? "Allowed" : "Off");
    const rows = [
      ["Team size", mine.size + "v" + mine.size, foe.size + "v" + foe.size, r.size + "v" + r.size, mine.size !== foe.size],
      ["Medicine", yn(mine.items), yn(foe.items), yn(r.items), mine.items !== foe.items],
      ["Switching", yn(mine.switch), yn(foe.switch), yn(r.switch), mine.switch !== foe.switch]
    ];
    document.getElementById("pvp-vote-table").innerHTML =
      "<tr><th></th><th>You</th><th>Foe</th><th>Rule</th></tr>" +
      rows.map(([k, a, b, f, rnd]) =>
        `<tr><td>${k}</td><td>${a}</td><td>${b}</td><td class="final">${rnd ? "🎲 " : ""}${f}</td></tr>`).join("");
    document.getElementById("pvp-format-value").textContent = r.size + "v" + r.size;
    document.getElementById("pvp-vote-wait").style.display = "none";
    document.getElementById("pvp-vote-result").style.display = "flex";
  }

  function confirmFormat() {
    if (!pvpRules) return;
    document.getElementById("pvp-match-panel").style.display = "none";
    openTeamSelect(() => launchBattle(), pvpTeamSize);
  }

  /* 揀隊頂部：對手預覽（訓練家 / 難度 / 敵方等級 / 敵方隊伍 / EP 成本） */
  function renderBattleInfo() {
    const box = document.getElementById("ts-battle-info");
    if (!box) return;
    if (mode !== "ai" || !aiTrainer) { box.hidden = true; box.innerHTML = ""; return; }
    const meta = TIER_META[aiTier] || TIER_META.normal;
    const frame = aiTier === "inferno" ? "frame-rainbow" : aiTier === "hard" ? "frame-purple" : "";
    const lv = foeTeamEntries.length ? foeTeamEntries[0].level : 1;
    const roster = foeTeamEntries.map(m => {
      const p = dexOf(m.dexId) || {};
      return `<img src="${spriteURL(m.dexId)}" alt="${p.name || ""}" title="${p.name || ""}">`;
    }).join("");
    box.hidden = false;
    box.innerHTML = `
      <div class="tsb-card ${frame}">
        <div class="tsb-head">
          <img class="tsb-portrait" src="${aiTrainer.sprite}" alt="">
          <div class="tsb-text">
            <div class="tsb-name">${aiTrainer.name}</div>
            <div class="tsb-meta"><span class="tsb-tier tier-${aiTier}">${meta.label}</span> Foe Lv. ${lv} · ${foeTeamEntries.length} vs you</div>
          </div>
          <div class="tsb-ep">⚡ 1</div>
        </div>
        <div class="tsb-roster">${roster}</div>
        ${levelSyncLevel ? `<div class="tsb-sync">Level Sync → Lv. ${levelSyncLevel} · levels restored after the battle</div>` : ""}
        ${frame ? `<span class="fire-band" aria-hidden="true"><i></i><i></i><b></b></span>` : ""}
      </div>`;
  }

  /* 揀隊排序：同圖鑑共用 DEXSORT 定義（預設 No.） */
  const TEAM_SORT_KEY = "pokeengmon_team_sort_v1";
  let teamSortBound = false;
  let teamPickerRebuild = null;

  function openTeamSelect(cb, fixedSize) {
    const st = loadState();
    const pool = st.entries.filter(e => Array.isArray(e.ownedSpecies) && e.ownedSpecies.length);
    /* PvP 用抽中嘅場制；AI 依難度決定出戰數（Easy +1、Normal 同數、Hard/Inferno −1） */
    const want = (mode === "ai" && aiTrainer && !fixedSize)
      ? playerSlots(foeTeamEntries.length, aiTier)
      : fixedSize;
    const teamSize = Math.min(want || 1, pool.length);
    renderBattleInfo();
    document.getElementById("team-size-label").textContent = teamSize;
    const lvSync = levelSyncLevel;
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
    teamPickerRebuild = (p) => {
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
    if (!teamSortBound) {
      teamSortBound = true;
      if (selSort) selSort.addEventListener("change", () => {
        const p = DEXSORT.load(TEAM_SORT_KEY);
        p.sort = selSort.value;
        p.dir = DEXSORT.defaultDir(p.sort);
        DEXSORT.save(TEAM_SORT_KEY, p);
        if (teamPickerRebuild) teamPickerRebuild(p);
      });
      if (dirSort) dirSort.addEventListener("click", () => {
        const p = DEXSORT.load(TEAM_SORT_KEY);
        p.dir = p.dir === "desc" ? "asc" : "desc";
        DEXSORT.save(TEAM_SORT_KEY, p);
        if (teamPickerRebuild) teamPickerRebuild(p);
      });
    }

    /* 如果一定要全選（持有數 = 隊伍大小），預設全選（次序 = 排序後次序），照樣可以調位 */
    if (teamSize >= owned.length) owned.forEach((_, i) => order.push(i));
    renderGrid();
    document.getElementById("team-select-confirm").onclick = () => {
      if (order.length !== teamSize) { toast(`Pick exactly ${teamSize} Pokémon`); return; }
      teamEntries = order.map(i => owned[i]);
      document.getElementById("team-select-modal").style.display = "none";
      cb();
    };
    document.getElementById("team-select-modal").style.display = "flex";
  }

  function launchBattle() {
    if (mode === "pvp") { launchPvpBattle(); return; }
    mySide = "p1"; foeSide = "p2";
    /* Inferno Level Sync：只降唔升（玩家 Pokemon 本身低過 target 就保持不變）；
       sync 前真實等級存入 expLevel，供 grantKOExp 以弱勝強加成計算用 */
    const myTeam = levelSyncLevel
      ? teamEntries.map(e => ({ ...e, level: Math.min(e.level, levelSyncLevel), expLevel: e.level }))
      : teamEntries;
    state = BattleState.create(myTeam, foeTeamEntries, { seed: (Math.random() * 0xFFFFFFFF) >>> 0 });
    afterLaunch();
  }

  /* PvP：交隊伍 → 等對手 → 用 row 嘅 seed 開戰（雙方模擬一致） */
  async function launchPvpBattle() {
    narrate("");
    try {
      await PvpNet.submitTeam(pvpBattle.id, pvpSide, teamEntries.map(serializeEntry));
      toast("Waiting for opponent's team…");
      const w = PvpNet.waitForTeams(pvpBattle.id);
      const b = await raceTimeout(w, PvpNet.ACTION_TIMEOUT_MS);
      w.cancel && w.cancel();
      if (!b || b.state === "finished") { toast("Opponent left. Battle cancelled."); pvpBattle = null; openMenu(); return; }
      const foeTeam = (pvpSide === "p1" ? b.p2_team : b.p1_team) || [];
      /* 對手冇交隊＝走佬：我當贏，寫完場避免 row 殘留 active */
      if (!foeTeam.length) {
        toast("Opponent left. Battle cancelled.");
        await PvpNet.finishBattleRow(pvpBattle.id, pvpSide);
        pvpBattle = null;
        openMenu();
        return;
      }
      foeTeamEntries = foeTeam;
      mySide = pvpSide; foeSide = pvpSide === "p1" ? "p2" : "p1";
      /* 注意：state 嘅 p1/p2 要跟 row（唔係跟我邊邊），兩邊客戶端先會一致 */
      const p1T = pvpSide === "p1" ? teamEntries : foeTeamEntries;
      const p2T = pvpSide === "p1" ? foeTeamEntries : teamEntries;
      state = BattleState.create(p1T, p2T, { seed: Number(b.seed) >>> 0 });
      afterLaunch();
    } catch (e) {
      console.warn("[PvP] launch error:", e);
      toast("Network error: " + (e && e.message ? e.message.slice(0, 60) : ""));
      pvpBattle = null;
      openMenu();
    }
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
      ability: (typeof e.ability === "string" && e.ability) ? e.ability : null
    };
  }

  function afterLaunch() {
    acting = true;   /* intro 期間鎖住操作 */
    forfeited = false;
    refreshBagButton();   /* BAG 只有 Inferno 先會亮起 */
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
    /* 好友局用邀請帶入嘅名，隨機 PvP 冇名就顯示 RIVAL */
    if (mode === "pvp" && pvpFoeName) return pvpFoeName.toUpperCase();
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
    const bag = document.getElementById("battle-bag-menu");
    if (bag) bag.style.display = "none";
    const bottom = document.querySelector(".battle-bottom");
    bottom.classList.remove("menu-open", "move-open");
    updateEffBox(null);
  }

  function showMainMenu() {
    document.getElementById("battle-action-menu").style.display = "grid";
    document.getElementById("battle-move-menu").style.display = "none";
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

  /* ---------- BAG：Inferno 限定，1 支 Full Restore ---------- */
  function refreshBagButton() {
    const btn = document.getElementById("btn-battle-bag");
    if (!btn) return;
    /* PvP：戰前投票准用藥先有機會亮（背包藥物系統落地前 myFullRestores 恆為 0） */
    const allowed = mode === "ai" || (mode === "pvp" && pvpRules && pvpRules.items);
    btn.disabled = !(allowed && myFullRestores > 0);
  }

  function showBagMenu() {
    if (myFullRestores <= 0) { toast("Your bag is empty for this battle."); return; }
    const list = document.getElementById("bbp-list");
    list.innerHTML = `<button class="bmp-move-btn" data-item="full-restore">
        Full Restore ×${myFullRestores}
      </button>`;
    list.querySelector(".bmp-move-btn").onclick = () => chooseItem("full-restore");
    const info = document.getElementById("bbp-info");
    info.innerHTML = `
      <div class="bmp-info-head"><span class="bmp-cat">ITEM</span></div>
      <div class="bmp-info-row"><b>Full Restore</b><span>×${myFullRestores}</span></div>
      <div class="bmp-info-row"><b>HEAL</b><span>FULL</span></div>
      <div class="bmp-info-row"><b>STATUS</b><span>CURE</span></div>
      <div class="bmp-info-row"><b>TIER</b><span>INFERNO</span></div>`;
    document.getElementById("battle-action-menu").style.display = "none";
    document.getElementById("battle-move-menu").style.display = "none";
    document.getElementById("battle-bag-menu").style.display = "flex";
    const bottom = document.querySelector(".battle-bottom");
    bottom.classList.add("menu-open", "move-open");
    updateEffBox(null);
    const back = document.getElementById("bbp-back");
    back.onclick = () => { showMainMenu(); narrate(`What will ${myActive().name.toUpperCase()} do?`); };
  }

  function chooseItem(itemId) {
    if (acting) return;
    if (myFullRestores <= 0) return;
    const me = myActive();
    if (me.hp <= 0) { toast("This Pokémon can't use an item."); return; }
    /* 滿血又冇異常狀態：唔好浪費唯一一支 */
    if (me.hp >= me.maxHp && !me.status) { toast("It won't have any effect."); return; }
    acting = true;
    myFullRestores -= 1;
    hideActionMenus();
    refreshBagButton();
    resolveTurn({ kind: "item", itemId });
  }

  /* ---------- 回合 resolve ---------- */
  function resolveTurn(playerAction) {
    state.turn += 1;
    if (mode === "pvp") { resolvePvpTurn(playerAction); return; }
    runTurnResolution(playerAction, pickAIAction());
  }

  /* PvP：交 action → 等對手同一 turn 嘅 action → 雙方各自模擬（seed 一致） */
  async function resolvePvpTurn(playerAction) {
    const turnNo = state.turn;
    narrate("Waiting for opponent…");
    /* 延遲量測：由交 action 到收到對手 row（timeout 分支唔計） */
    const tLat = (window.performance && performance.now) ? performance.now() : Date.now();
    try {
      await PvpNet.submitAction(pvpBattle.id, pvpSide, turnNo, playerAction);
      const foeCol = pvpSide === "p1" ? "p2_action" : "p1_action";
      const w = PvpNet.waitForOpponentAction(pvpBattle.id, foeCol, turnNo);
      const b = await raceTimeout(w, PvpNet.ACTION_TIMEOUT_MS);
      w.cancel && w.cancel();
      if (!b) {
        /* 對手斷線（45s 冇郁）：判我贏並寫低結果 */
        await PvpNet.finishBattleRow(pvpBattle.id, pvpSide);
        state.winner = mySide; state.finished = true;
        await say("Opponent disconnected. You win!");
        finishBattle();
        return;
      }
      /* 成功收到 row：記一次回合延遲（只留最近 20 次） */
      const nowT = (window.performance && performance.now) ? performance.now() : Date.now();
      const ms = Math.round(nowT - tLat);
      window.__pvpLatency = (window.__pvpLatency || []).concat(ms).slice(-20);
      console.debug("[PvP] turn latency", ms + "ms");
      if (b.state === "finished") {
        /* 對手投降／完場：用 row 嘅 winner */
        state.finished = true;
        state.winner = b.winner === "p1" ? "p1" : b.winner === "p2" ? "p2" : mySide;
        await say(state.winner === mySide ? "Opponent forfeited. You win!" : "The battle has ended.");
        finishBattle();
        return;
      }
      const raw = b[foeCol] || {};
      const foeAction = raw.kind === "switch" ? { kind: "switch", idx: raw.idx }
        /* 用藥：只限戰前投票准用藥，而且係引擎認得嘅道具；否則當冇效 → 出第一招 */
        : (raw.kind === "item" && pvpRules && pvpRules.items && BattleState.ITEMS[raw.itemId])
          ? { kind: "item", itemId: raw.itemId }
          : { kind: "move", moveIdx: raw.moveIdx || 0 };
      runTurnResolution(playerAction, foeAction);
    } catch (e) {
      console.warn("[PvP] turn error:", e);
      toast("Network error: " + (e && e.message ? e.message.slice(0, 60) : ""));
      acting = false;
      showMainMenu();
    }
  }

  function runTurnResolution(playerAction, foeAction) {
    const myMove = playerAction.kind === "move" ? moveInfo(myActive().moves[playerAction.moveIdx].slug) : null;
    const foeMove = foeAction.kind === "move" ? moveInfo(foeActive().moves[foeAction.moveIdx].slug) : null;
    const wName = state.weather && state.weather.name;
    const myAct = { kind: playerAction.kind, priority: myMove ? myMove.priority : 6, speed: Battle.effectiveStat(myActive(), "spe", false, wName), player: true, action: playerAction };
    const foeAct = { kind: foeAction.kind, priority: foeMove ? foeMove.priority : 6, speed: Battle.effectiveStat(foeActive(), "spe", false, wName), player: false, action: foeAction };
    /* PvP 同步關鍵：turnOrder 同速 tiebreak 食 RNG，
       兩邊客戶端必須用同一次序傳參（p1 行先），否則同一個 random 會出相反結果 */
    const firstAct = mySide === "p1" ? myAct : foeAct;
    const secondAct = mySide === "p1" ? foeAct : myAct;
    const order = Battle.turnOrder(firstAct, secondAct);

    narrate("");
    (async () => {
      for (const act of order) {
        if (state.finished) break;
        const side = act.player ? mySide : foeSide;
        /* 已經倒下：冇得再出招（後攻者被先攻招打死就唔應該反擊）；
           但換寵例外 —— 暈咗之後嘅強制換寵一定要照做，唔係會卡死喺換寵頁 */
        if ((act.action.kind === "move" || act.action.kind === "item") && active(state, side).hp <= 0) continue;
        if (act.action.kind === "switch") {
          /* FRLG 原版：收回舊寵 → 拋新球召出（animatedSwitch 自己 narrate） */
          await animatedSwitch(side, act.action.idx);
        } else if (act.action.kind === "item") {
          const logStart = state.log.length;
          const who = side === mySide ? "You" : (aiTrainer ? aiTrainer.name : (pvpFoeName || "The foe"));
          BattleState.useItem(state, side, act.action.itemId, who);
          render();
          for (const l of state.log.slice(logStart)) await say(l.msg);
          await sleep(320);
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
      /* 對手暈咗：AI 自動換（收回 → 拋球召出）；
         PvP 唔可以代揀 —— 對手客戶端會自己彈強制換寵，
         佢嘅 switch 會做下一個 turn 嘅 action 傳返嚟 */
      if (mode !== "pvp" && foeActive().hp <= 0 && BattleState.hasUsable(foe().team)) {
        const nextIdx = foe().team.findIndex(p => p.hp > 0);
        await animatedSwitch(foeSide, nextIdx);
      }
      showMainMenu();
      acting = false;
    })();
  }

  function pickAIAction() {
    /* AI：相剋／STAB／高威力優先；冇血會治療；唔會對已中狀態嘅對手再放狀態招
       IQ 分級：T0 亂打、T1 有少少隨機、T2 最佳解、T3 85% 最佳解 + 15% 亂打 */
    const foe = foeActive();
    const target = myActive();
    const usable = foe.moves.filter(m => m.pp > 0);
    if (!usable.length) return { kind: "move", moveIdx: 0 };   /* 引擎會自動變 Struggle */
    const iq = (DIFFICULTY_PRESETS[aiTier] || DIFFICULTY_PRESETS.normal).iq;
    const randomMove = () => usable[Math.floor(Math.random() * usable.length)];
    /* Inferno 專屬：血量低就用唯一一支 Potion（AI 一回合只能揀一件事） */
    if (aiPotions > 0 && foe.hp <= foe.maxHp * 0.4) {
      aiPotions -= 1;
      return { kind: "item", itemId: "potion" };
    }
    if (iq <= 0) return { kind: "move", moveIdx: foe.moves.indexOf(randomMove()) };
    if (iq >= 3 && Math.random() < 0.15) return { kind: "move", moveIdx: foe.moves.indexOf(randomMove()) };

    let best = usable[0], bestScore = -Infinity;
    for (const m of usable) {
      const info = moveInfo(m.slug) || {};
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
      if (iq <= 1) score *= 0.85 + Math.random() * 0.3;   /* 少少隨機，唔會每次都同一招 */
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return { kind: "move", moveIdx: foe.moves.indexOf(best) };
  }

  /* ---------- 完結 ---------- */
  function finishBattle() {
    /* PvP：兩邊客戶端都會行到呢度（seed 同步），寫 winner 落 row。
       兩邊寫嘅值一樣，idempotent；冇 winner（斷線個案）就 skip */
    if (mode === "pvp" && pvpBattle && state.winner) {
      const w = state.winner;   /* state 視角 = row 視角（create 時已對齊 p1/p2） */
      PvpNet.finishBattleRow(pvpBattle.id, w);
    }
    const won = state.winner === mySide;
    (async () => {
      await say(forfeited ? "You gave up and ran away..." : won ? "You won the battle!" : "You lost...");
      /* 對戰完：淡出 battle BGM，恢復全域 town BGM */
      try { if (window.CaptureScene) { CaptureScene.audio.stopBGM(400); CaptureScene.audio.startTownBGM(); } } catch (e) {}
      /* 投降都行結算（當輸；配額都照扣 —— 係打完先扣，唔係開戰扣） */
      const reward = await applyRewards(won && !forfeited);
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
    const gains = (reward && reward.expGains) || [];
    if (gains.length) {
      /* EXP 逐隻唔同（按等級比例派）：全部一樣先合併顯示，否則逐隻列 */
      const same = gains.every(g => g.gain === gains[0].gain);
      if (same) rows.push(`<div class="br-row"><span>EXP ×${gains.length}</span><b>+${gains[0].gain}</b></div>`);
      else gains.forEach(g => rows.push(`<div class="br-row"><span>${g.name}</span><b>+${g.gain} EXP</b></div>`));
    }
    if (reward && reward.diamonds > 0) {
      const tag = reward.firstClear ? " · FIRST CLEAR" : "";
      rows.push(`<div class="br-row"><span>DIAMONDS${tag}</span><b>+${reward.diamonds} 💎</b></div>`);
    }
    if (reward) reward.levelUps.forEach(lu =>
      rows.push(`<div class="br-row br-lvup"><span>${lu.name}</span><b>Lv.${lu.from} → ${lu.to}</b></div>`));
    if (!rows.length) rows.push(`<div class="br-row"><span>REWARD</span><b>None</b></div>`);
    /* 能量點（打完先扣，顯示返剩幾多） */
    if (reward && reward.energy) {
      const e = reward.energy;
      rows.push(`<div class="br-row"><span>⚡ ENERGY</span><b>${e.points} / ${e.max}</b></div>`);
    }
    document.getElementById("br-rows").innerHTML = rows.join("");
    /* 隨機 PvP 完場：可加對手做朋友（好友局已經係朋友，照 spec 只睇 foeUid） */
    const addBtn = document.getElementById("br-add-foe");
    if (addBtn) {
      if (mode === "pvp" && pvpFoeUid) {
        addBtn.style.display = "";
        addBtn.textContent = pvpFoeName ? "＋ " + pvpFoeName.toUpperCase() : "＋ ADD FRIEND";
        addBtn.onclick = () => {
          if (window.Friends && Friends.addByUid) Friends.addByUid(pvpFoeUid, pvpFoeName);
          addBtn.style.display = "none";
        };
      } else {
        addBtn.style.display = "none";
        addBtn.onclick = null;
      }
    }
    document.getElementById("battle-result").style.display = "flex";
    acting = false;
  }

  /* 撳 RUN 確認 = 投降認輸（唔派獎勵，直接當輸） */
  function forfeitBattle() {
    if (!state || acting) return;
    acting = true;
    forfeited = true;
    state.winner = foeSide;
    /* PvP：寫低完場等對手知道（唔使等佢嘅 action 先到） */
    if (mode === "pvp" && pvpBattle) {
      PvpNet.finishBattleRow(pvpBattle.id, pvpSide === "p1" ? "p2" : "p1");
    }
    hideActionMenus();
    finishBattle();
  }

  /* 結算獎勵：贏先派 EXP；鑽石 PvP 贏 3／輸 1（投降唔入嚟），
     AI 訓練家 = 每隻難度（Easy/Normal/Hard/Inferno）首通一次性 10💎、重複 0💎。
     EXP 派法（v1.15.24 起，原莊 per-enemy 制）：每擊倒一隻敵寵，凡面對過佢嘅我寵
     均分 baseExp × 敵LV / 7，以弱勝強 ×(1+等級差/50) cap ×3 —— 輸／投降都照攞（一隻一隻計）；
     AI 對戰再乘難度倍率（Easy ×0.7、Normal ×1、Hard ×1.6、Inferno ×2.5）。
     PvP 贏額外固定 30／隻（唔按敵寵計，防互讓刷 EXP）。
     登入時鑽石經 settle_battle RPC（server 計公式 + 記低邊個打過 + 權威 balance），
     EXP 經 add_entry_exp RPC；RPC 失敗唔本地加（避免同雲端脫節後 pull 打回，同 quiz 一樣）。 */
  async function applyRewards(won) {
    const st = loadState();
    const isPvp = mode === "pvp";
    const isFriend = isPvp && pvpIsFriend;   /* 好友局：賺 1／輸 0，受 server 每日 5 場上限 */
    const loggedIn = window.SupabaseAuth && SupabaseAuth.isLoggedIn();
    const tier = isPvp ? null : aiTier;
    const tpBefore = aiTrainer ? trainerProgress(st, aiTrainer.id) : null;
    const firstClear = !!(won && aiTrainer && tier && tpBefore[tier] === 0);
    const expMult = (!isPvp && tier && TIER_META[tier]) ? TIER_META[tier].mult : 1;
    let diamonds = isFriend ? (won ? 1 : 0)
      : isPvp ? (won ? 3 : 1)
      : (firstClear ? 10 : 0);
    const levelUps = [];
    const expGains = [];   /* {name, gain} 逐隻記錄，結算畫面用 */
    /* 引擎喺每隻敵寵 faint 嗰陣已記落 state[mySide].pendingExp；呢度一次過派。
       贏／輸／投降都照派（EXP 係逐隻敵寵計，唔係勝利獎勵） */
    const pending = (state && state[mySide] && state[mySide].pendingExp) || [];
    const gainByUid = {};
    pending.forEach(g => { gainByUid[g.uid] = (gainByUid[g.uid] || 0) + g.gain; });
    teamEntries.forEach(entry => {
      const e = st.entries.find(x => x.uid === entry.uid);
      if (!e) return;
      let gain = gainByUid[e.uid] || 0;
      if (isPvp && won) gain += 30;   /* PvP 贏嘅固定 30（唔按敵寵計） */
      if (gain > 0 && expMult > 1) gain = Math.round(gain * expMult);
      if (gain <= 0) return;
      const lvBefore = e.level || 1;
      const dexId = entryCurrentSpecies(e)[0];
      addEntryExp(e, gain);
      const p = (typeof dexOf === "function") ? dexOf(dexId) : null;
      const name = (p && p.name) || "Pokémon";
      expGains.push({ name, gain });
      if (e.level > lvBefore) levelUps.push({ name, from: lvBefore, to: e.level });
      if (loggedIn) SupabaseAuth.addEntryExp(e.uid, gain);
    });
    /* ---- 能量點：打完先扣 1 EP（開戰唔扣，中途斷線唔會白扣）；好友局唔扣 ---- */
    const day = dateKey(Date.now());
    const kind = isPvp ? "pvp" : "ai";
    const questionsTodayN = questionsToday(st, day);
    /* server RPC 會寫返 battleDays[day].used，所以要保證個格存在 */
    if (!st.battleDays[day]) st.battleDays[day] = { used: 0, ai: 0, pvp: 0 };
    let energySpent = false;
    if (!isFriend) energySpent = Energy.spend(st, 1);
    /* 全員無倒 = Flawless（輸／投降唔算） */
    const mineTeam = (state && state[mySide] && state[mySide].team) || [];
    const flawless = !!won && mineTeam.every(p => p.hp > 0);

    /* 登入：一律 call RPC（server 計鑽石 + 記配額 + 記累積場數）；
       匿名：本地加鑽石。AI 首通由 server 判斷（本地記錄可能跨機唔齊） */
    if (loggedIn && isFriend) {
      /* 好友局：server 專用結算（每日 5 場計鑽、唔扣答題配額） */
      const res = (window.SupabaseAuth && SupabaseAuth.settleFriendBattle)
        ? await SupabaseAuth.settleFriendBattle(won ? "win" : "lose")
        : null;
      if (res && typeof res.balance === "number") {
        diamonds = typeof res.bonus === "number" ? res.bonus : diamonds;
        st.diamonds = res.balance;
        if (res.wins != null) { st.pvpWins = res.wins; st.pvpLosses = res.losses; }
        if (typeof res.paid_today === "number") st.friendDiamondsToday = res.paid_today;
      } else {
        diamonds = 0;
        if (window.App && App.toast) App.toast("Cloud sync hiccup — battle rewards not saved");
      }
    } else if (loggedIn) {
      /* v2：server 認 (訓練家, 難度) 首通 + 扣 EP；未 migrate 就 fallback 舊 RPC */
      let v2 = null;
      if (SupabaseAuth.settleBattleV2) {
        try {
          v2 = await SupabaseAuth.settleBattleV2(
            kind, won ? "win" : "lose", aiTrainer ? aiTrainer.id : null,
            tier, questionsTodayN, flawless, false);
        } catch (e) { console.warn("[Battle] settle_battle_v2 failed:", e.message); }
      }
      const res = v2 || await SupabaseAuth.settleBattle(
        kind, won ? "win" : "lose", aiTrainer ? aiTrainer.id : null, questionsTodayN);
      if (res && typeof res.balance === "number") {
        diamonds = res.allowed === false ? 0 : res.bonus;
        if (res.allowed === false) {
          if (window.App && App.toast) App.toast("No energy left — this battle won't count");
        }
        st.diamonds = res.balance;   /* server 權威，唔係本地 += */
        if (res.wins != null) { st.pvpWins = res.wins; st.pvpLosses = res.losses; }
        if (typeof res.used === "number") st.battleDays[day].used = res.used;
        if (typeof res.ai_total === "number") st.battleAiTotal = res.ai_total;
        if (typeof res.pvp_total === "number") st.battlePvpTotal = res.pvp_total;
        /* EP ledger 用 server 做準（防止改 localStorage 刷場） */
        if (res.energy && Energy.adopt) Energy.adopt(st, res.energy);
      } else {
        diamonds = 0;
        if (window.App && App.toast) App.toast("Cloud sync hiccup — battle rewards not saved");
      }
    } else {
      st.diamonds = (st.diamonds || 0) + diamonds;
    }
    /* ---- 精通記錄：每個難度分開計；全員無倒下次再贏就標 Flawless ---- */
    let unlockedInferno = false;
    if (won && aiTrainer && tier) {
      const tp = trainerProgress(st, aiTrainer.id);
      st.trainerProgress = st.trainerProgress || {};
      if (tier === "hard" && tp.hard === 0) unlockedInferno = true;
      st.trainerProgress[aiTrainer.id] = {
        easy: tp.easy + (tier === "easy" ? 1 : 0),
        normal: tp.normal + (tier === "normal" ? 1 : 0),
        hard: tp.hard + (tier === "hard" ? 1 : 0),
        inferno: tp.inferno + (tier === "inferno" ? 1 : 0),
        flawless: tp.flawless.slice()
      };
      /* 冇任何一隻我方寶可夢倒下 = Flawless（投降／輸唔會入嚟） */
      if (flawless && !tp.flawless.includes(tier)) {
        st.trainerProgress[aiTrainer.id].flawless.push(tier);
      }
      /* 舊欄位保持向後兼容（其他頁面仍會睇） */
      st.aiTrainersBeaten = st.aiTrainersBeaten || [];
      if (!st.aiTrainersBeaten.includes(aiTrainer.id)) st.aiTrainersBeaten.push(aiTrainer.id);
    }
    saveState();
    if (unlockedInferno) playInfernoUnlock(aiTrainer);
    /* 好友局唔扣 EP，所以唔顯示能量點那行 */
    return {
      expGains, diamonds, levelUps, firstClear,
      energy: (!isFriend && energySpent) ? Energy.status(st) : null
    };
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
      /* 清走上一場嘅對手資料（加好友掣都收埋） */
      const addFoe = document.getElementById("br-add-foe");
      if (addFoe) { addFoe.style.display = "none"; addFoe.onclick = null; }
      pvpBattle = null; pvpFoeUid = null; pvpFoeName = null; pvpIsFriend = false; pvpRules = null;
      /* AI 對戰返訓練家梯隊（重建列表 → 顯示新解鎖／✓）；PvP 返對戰主選單 */
      if (mode === "ai") openAITrainers(); else openMenu();
    };
    document.getElementById("btn-battle-fight").onclick = showMoveMenu;
    document.getElementById("btn-battle-bag").onclick = () => {
      if (mode === "pvp" && !(pvpRules && pvpRules.items)) { toast("Medicine is off for this battle."); return; }
      if (myFullRestores <= 0) {
        toast(mode === "pvp" ? "Your bag is empty." : "BAG is empty — only Inferno battles give you an item.");
        return;
      }
      showBagMenu();
    };
    document.getElementById("btn-battle-pokemon").onclick = () => {
      /* 戰前投票唔准自願換：只可以喺暈咗時強制換（showSwitchMenu(true) 另一條路） */
      if (mode === "pvp" && pvpRules && !pvpRules.switch) { toast("Switching is off for this battle."); return; }
      showSwitchMenu(false);
    };
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
    /* 難度選擇彈窗：關閉／撳背景＝取消（唔會亂開戰） */
    const tierClose = document.getElementById("tier-select-close");
    if (tierClose) tierClose.onclick = closeTierPicker;
    const tierModal = document.getElementById("tier-select-modal");
    if (tierModal) {
      tierModal.onclick = (ev) => { if (ev.target === tierModal) closeTierPicker(); };
    }
    document.getElementById("team-select-cancel").onclick = () => {
      document.getElementById("team-select-modal").style.display = "none";
      levelSyncLevel = null;
      openMenu();
    };
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

  return { openMenu, bind, renderMenu, openAITrainers, openFriendMatch };
})();
