/* ============================================================
   PokeEngmon Battle - 對戰選單、配額、AI 訓練員列表、難度揀選、整對手隊伍
   由 js/battle/battle.js 拆出（總計劃 P2.5；Rule 117）。
   - 共用狀態：S = BattleUI._.S（原本閉包嘅 let）
   - 其他檔嘅函數／數據：B.xxx（B = BattleUI._）；同一個檔入面照直接 call
   載入次序：js/battle/battle.js 之後（index.html）。
   ============================================================ */

(() => {
  const B = BattleUI._;

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
    B.toast(quotaText(g));
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
      if (!havePokemon) { B.toast("You need Pokémon first! Pull or capture one."); return; }
      B.startPvP();
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
        if (!havePokemon) { B.toast("You need Pokémon first! Pull or capture one."); return; }
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
        B.startAI(trainer, el.dataset.tier);
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
    B.openMenu();
  }

  Object.assign(B, {
    gateStatus, quotaText, blockedByQuota, renderMenu, AI_TRAINERS, TIERS, TIER_META, DIFFICULTY_PRESETS, foeLevel,
    levelRangeText, infernoSyncLevel, playerSlots, trainerProgress, adoptMastery, trainerUnlockedAt, tierUnlocked,
    ivsFor, evsFor, natureFor, weakestMoves, buildFoeTeam, playInfernoUnlock, gensForTeam, tierChip,
    renderTrainerList, openTierPicker, closeTierPicker, openAITrainers
  });
})();
