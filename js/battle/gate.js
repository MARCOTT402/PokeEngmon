/* ============================================================
   PokeEngmon - 每日對戰配額（純函數，無 DOM / 無狀態）
   規則（junior / standard 模式）：
     今日答題數每滿 50 題 → 解鎖 4 場對戰，每日上限 8 場
     （用「題數」唔用「回合數」，因為自訂組題可能唔夠 10 題）
   teen / adult 模式：無上限
   配額以「完成結算」計，開戰唔扣（中途斷線唔會白扣）
   ============================================================ */

const BattleGate = (() => {
  const QUESTIONS_PER_BATCH = 50;   /* 每 50 題 */
  const BATTLES_PER_BATCH = 4;      /* 換 4 場 */
  const DAILY_MAX = 8;              /* 每日封頂 */
  const LIMITED_MODES = ["junior", "standard"];

  /* 今日已答題數（local records 有 total 欄；冇記錄 = 0） */
  function questionsToday(st, day) {
    const list = (st && st.records && st.records[day]) || [];
    return list.reduce((n, r) => n + (Number(r.total) || 0), 0);
  }

  /* 配額上限：null = 無限 */
  function capFor(questions, curveMode) {
    if (!LIMITED_MODES.includes(curveMode)) return null;
    const batches = Math.floor((Number(questions) || 0) / QUESTIONS_PER_BATCH);
    return Math.min(DAILY_MAX, batches * BATTLES_PER_BATCH);
  }

  function usedToday(st, day) {
    const d = st && st.battleDays && st.battleDays[day];
    return (d && Number(d.used)) || 0;
  }

  /* 完整狀態：用嚟畫 UI 同擋入口 */
  function status(st, day, curveMode) {
    const questions = questionsToday(st, day);
    const cap = capFor(questions, curveMode);
    const used = usedToday(st, day);

    if (cap === null) {
      return { questions, cap: null, used, allowed: true, remaining: null, needQuestions: 0, unlimited: true };
    }
    const capped = cap >= DAILY_MAX;
    const nextAt = capped ? null : (Math.floor(questions / QUESTIONS_PER_BATCH) + 1) * QUESTIONS_PER_BATCH;
    return {
      questions,
      cap,
      used,
      allowed: used < cap,
      remaining: Math.max(0, cap - used),
      /* 距離下一批仲差幾多題（已封頂或未夠第一批都啱用） */
      needQuestions: nextAt === null ? 0 : Math.max(0, nextAt - questions),
      unlimited: false,
      capped
    };
  }

  /* 結算時記一場（本地；登入用戶同時由 server 記，回應會覆寫 used） */
  function record(st, day, kind) {
    if (!st.battleDays) st.battleDays = {};
    const d = st.battleDays[day] || {};
    d.used = (Number(d.used) || 0) + 1;
    d[kind] = (Number(d[kind]) || 0) + 1;
    st.battleDays[day] = d;
    /* 只保留最近 7 日，避免無限增長 */
    const keys = Object.keys(st.battleDays).sort();
    while (keys.length > 7) delete st.battleDays[keys.shift()];
    return d;
  }

  return { QUESTIONS_PER_BATCH, BATTLES_PER_BATCH, DAILY_MAX, LIMITED_MODES, questionsToday, capFor, usedToday, status, record };
})();
