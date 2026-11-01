/* ============================================================
   PokeEngmon - 能量點 Energy Points (EP)
   1 EP = 1 場對戰（AI / PvP，任何難度同價）
   獲取：每日登入 +1；每完成 10 題 +1（每日最多 3 次）
   每日獲取上限 4、持有上限 8、每日消耗上限 4
   新手初始 5 點（由 ensure() 首次補上）
   純本機狀態；server 權威版本留待 settle_battle_v2 / spend_energy
   ============================================================ */

const Energy = (() => {
  const POOL_MAX = 8;
  const DAILY_EARN_MAX = 4;
  const DAILY_SPEND_MAX = 4;
  const QUEST_STEP = 10;
  const QUEST_MAX = 3;
  const NEW_PLAYER = 5;

  function today() {
    return (typeof dateKey === "function") ? dateKey(Date.now()) : "";
  }

  function bank(st) {
    if (!st.energy || typeof st.energy !== "object") {
      /* 新玩家：直接派 5 點，當日登入獎勵已計（唔會即刻變 6） */
      st.energy = { points: NEW_PLAYER, day: today(), earned: 0, spent: 0, quests: 0, login: true };
    }
    const e = st.energy;
    if (!Number.isFinite(Number(e.points))) e.points = NEW_PLAYER;
    e.points = Math.max(0, Math.min(POOL_MAX, Number(e.points)));
    if (e.day !== today()) {
      e.day = today();
      e.earned = 0;
      e.spent = 0;
      e.quests = 0;
      e.login = false;
    }
    e.earned = Math.max(0, Number(e.earned) || 0);
    e.spent = Math.max(0, Number(e.spent) || 0);
    e.quests = Math.max(0, Number(e.quests) || 0);
    return e;
  }

  function ensure(st) {
    const e = bank(st);
    /* 每日登入 +1（每日第一次開啟 app 時） */
    if (!e.login) {
      e.login = true;
      add(e, 1);
      if (typeof saveState === "function") saveState();
    }
    return e;
  }

  function add(e, n) {
    const room = Math.max(0, DAILY_EARN_MAX - e.earned);
    const gain = Math.min(n, room, Math.max(0, POOL_MAX - e.points));
    e.points += gain;
    e.earned += gain;
    return gain;
  }

  /* 答題進度：今日每滿 10 題派 1 EP（最多 3 次／日），唔會重複派 */
  function syncQuiz(st, questionsToday) {
    const e = bank(st);
    const blocks = Math.min(QUEST_MAX, Math.floor((Number(questionsToday) || 0) / QUEST_STEP));
    if (blocks > e.quests) {
      const diff = blocks - e.quests;
      e.quests = blocks;
      add(e, diff);
      if (typeof saveState === "function") saveState();
      return true;
    }
    return false;
  }

  function status(st) {
    const e = ensure(st);
    const spendCapped = e.spent >= DAILY_SPEND_MAX;
    const noPoints = e.points <= 0;
    return {
      points: e.points,
      max: POOL_MAX,
      spentToday: e.spent,
      earnedToday: e.earned,
      quests: e.quests,
      spendCap: DAILY_SPEND_MAX,
      allowed: !spendCapped && !noPoints,
      noPoints,
      spendCapped,
      needQuestions: QUEST_STEP - ((Number(st.questionsTodayCache) || 0) % QUEST_STEP)
    };
  }

  /* 結算時扣 1 EP；回傳 true = 扣成功 */
  function spend(st, n) {
    const e = ensure(st);
    const cost = Math.max(1, Number(n) || 1);
    if (e.spent >= DAILY_SPEND_MAX) return false;
    if (e.points < cost) return false;
    e.points -= cost;
    e.spent += cost;
    if (typeof saveState === "function") saveState();
    return true;
  }

  /* 用 server 嘅 ledger 覆寫本地（登入時 server 權威，防改 localStorage 刷場） */
  function adopt(st, srv) {
    if (!srv || typeof srv.points !== "number") return;
    const e = bank(st);
    e.points = Math.max(0, Math.min(POOL_MAX, srv.points));
    if (typeof srv.day === "string" && srv.day) e.day = srv.day;
    e.earned = Number(srv.earned != null ? srv.earned : srv.earned_today) || 0;
    e.spent = Number(srv.spent != null ? srv.spent : srv.spent_today) || 0;
    e.quests = Number(srv.quests) || 0;
    e.login = true;
    if (typeof saveState === "function") saveState();
  }

  return { POOL_MAX, DAILY_EARN_MAX, DAILY_SPEND_MAX, QUEST_STEP, QUEST_MAX, NEW_PLAYER, ensure, status, spend, syncQuiz, adopt };
})();
