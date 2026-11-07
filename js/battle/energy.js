// @ts-check
/* ============================================================
   PokeEngmon - 能量點 Energy Points (EP)
   1 EP = 1 場對戰（AI / PvP，任何難度同價）
   唯一來源：每日任務「努力學習」——每 10 題 = 1 次結算，可 CLAIM 1⚡
   每日最多完成 8 次；能量可累積、冇持有上限；冇每日消耗上限
   （v1.25.0 起取消每日登入 +1，避免同每日任務混淆）
   純本機狀態；登入時 server ledger 權威（battle_quest_status / claim_battle_quests）
   ============================================================ */

const Energy = (() => {
  const QUEST_STEP = 10;
  const DAILY_QUEST_MAX = 8;
  const OLD_NEW_PLAYER = 5;   /* 舊帳戶相容用；新帳戶由 0 開始，只靠任務賺 */

  function today() {
    return (typeof dateKey === "function") ? dateKey(Date.now()) : "";
  }

  function bank(st) {
    if (!st.energy || typeof st.energy !== "object") {
      /* 新玩家：0 粒，必須完成每日任務先有能量 */
      st.energy = { points: 0, day: today(), quests: 0, claimed: 0, carried: 0, spent: 0 };
      return st.energy;
    }
    const e = st.energy;
    if (e.day !== today()) {
      /* 跨日：保留能量結餘，未領取嘅任務帶去下一日（carried） */
      const q = Math.max(0, Number(e.quests) || 0);
      const c = Number(e.claimed != null ? e.claimed : q) || 0;   /* 舊 ledger 冇 claimed = 已派 */
      e.carried = Math.max(0, Number(e.carried) || 0) + Math.max(0, q - c);
      e.day = today();
      e.quests = 0;
      e.claimed = 0;
      e.spent = 0;
    }
    e.points = Math.max(0, Number(e.points) || 0);
    e.quests = Math.max(0, Number(e.quests) || 0);
    e.claimed = Math.max(0, Math.min(e.quests, Number(e.claimed) || 0));
    e.carried = Math.max(0, Number(e.carried) || 0);
    e.spent = Math.max(0, Number(e.spent) || 0);
    return e;
  }

  /* 不再派登入獎勵；只保證 ledger 存在 */
  function ensure(st) {
    const had = !!(st.energy && typeof st.energy === "object");
    const e = bank(st);
    if (!had && typeof saveState === "function") saveState();
    return e;
  }

  /* 今日答題數 → 已完成任務次數；回傳今次新完成幾多個（唔會自動派獎） */
  function syncQuiz(st, questionsToday) {
    const e = bank(st);
    const q = Math.max(0, Number(questionsToday) || 0);
    const blocks = Math.min(DAILY_QUEST_MAX, Math.floor(q / QUEST_STEP));
    if (blocks <= e.quests) return 0;
    const fresh = blocks - e.quests;
    e.quests = blocks;
    if (typeof saveState === "function") saveState();
    return fresh;
  }

  /* 領取已完成任務；n 會被 clamp 到「未領取」數量，先領跨日帶落嚟嘅 */
  function claim(st, n) {
    const e = ensure(st);
    const fromCarried = Math.max(0, e.carried);
    const fromToday = Math.max(0, e.quests - e.claimed);
    const count = Math.min(Math.max(0, Number(n) || 0), fromCarried + fromToday);
    if (!count) return 0;
    const takeCarried = Math.min(count, fromCarried);
    e.carried -= takeCarried;
    e.claimed += count - takeCarried;
    e.points += count;
    if (typeof saveState === "function") saveState();
    return count;
  }

  function status(st) {
    const e = ensure(st);
    const q = (typeof questionsToday === "function")
      ? questionsToday(st, dateKey(Date.now()))
      : (Number(st.questionsTodayCache) || 0);
    const claimable = Math.max(0, e.quests - e.claimed) + Math.max(0, e.carried);
    const done = e.quests >= DAILY_QUEST_MAX;
    return {
      points: e.points,
      quests: e.quests,
      claimed: e.claimed,
      carried: e.carried,
      claimable,
      dailyMax: DAILY_QUEST_MAX,
      step: QUEST_STEP,
      done,
      questionsToday: q,
      allowed: e.points >= 1,
      noPoints: e.points < 1,
      spentToday: e.spent,
      needQuestions: done ? 0 : QUEST_STEP - (q % QUEST_STEP),
      energy: e
    };
  }

  /* 結算扣 1 EP；回傳 true = 扣成功（冇每日消耗上限） */
  function spend(st, n) {
    const e = ensure(st);
    const cost = Math.max(1, Number(n) || 1);
    if (e.points < cost) return false;
    e.points -= cost;
    e.spent += cost;
    if (typeof saveState === "function") saveState();
    return true;
  }

  /* 用 server ledger 覆寫本地（防改 localStorage 刷能量） */
  function adopt(st, srv) {
    if (!srv || typeof srv.points !== "number") return;
    const e = bank(st);
    e.points = Math.max(0, Number(srv.points) || 0);
    if (typeof srv.day === "string" && srv.day) e.day = srv.day;
    e.quests = Math.max(0, Number(srv.quests) || 0);
    /* 舊 schema 冇 claimed：當舊 quests 已經派過，避免重複派 */
    e.claimed = Number(srv.claimed != null ? srv.claimed : srv.quests) || 0;
    e.claimed = Math.max(0, Math.min(e.quests, e.claimed));
    e.carried = Math.max(0, Number(srv.carried) || 0);
    e.spent = Number(srv.spent != null ? srv.spent : srv.spent_today) || 0;
    if (typeof saveState === "function") saveState();
  }

  return {
    QUEST_STEP,
    DAILY_QUEST_MAX,
    QUEST_MAX: DAILY_QUEST_MAX,   /* 舊程式相容 */
    NEW_PLAYER: OLD_NEW_PLAYER,
    ensure, status, spend, syncQuiz, claim, adopt
  };
})();
