/* ============================================================
   PokeEngmon — SM-2 Spaced Repetition Core (v3)

   演算法層（純函數，零副作用）：
     efForClean / efForHint / efForCheckFail
     intervalForClean
     applyClean / applyHint / applyCheckFail   （卡片更新）

   Storage 層（LocalStorage adapter，之後換 Dexie/Supabase
              只需改這一節，上層 code 唔使改）：
     getOrCreateCard / upsertCard / listDue / listNew / listAll
     appendHistory / mergeHistory

   Session Pool Builder：
     buildSession(allQuestions, topicKeys, size) → 最多 10 題
       只抽到期卡：過期最耐未見優先 → 全新題隨機補尾 → Fisher-Yates 洗牌
       未到期卡一律唔抽（唔夠就出細 set，逼用戶揀其他課題）

   v3 校準（2026-10）：
     - 取消速度分流：無提示答對 q=5、✓ 錯誤 q=3（只扣 EF）、用提示 q=0
     - EF0 = 2.5，下限 1.8，上限 3.0
     - 無提示答對：EF +0.15、interval = round(上次 interval × 新 EF × 0.6)，1–60 天
     - 用提示：EF 第 1 次 −0.2、同一次第 2 次再 −0.3；interval = 1 天、rep = 0
     - ✓ 錯誤：只扣 EF −0.14，不動 rep / interval / next_review
     - 新增 last_review_at（chip 顯示實際經過時間）
   ============================================================ */

window.SM2 = (() => {

  /* ============ 參數常量 ============ */
  const INITIAL_EF        = 2.50;
  const MIN_EF            = 1.80;
  const MAX_EF            = 3.00;
  const MAX_INTERVAL_DAYS = 60;
  const MAX_REP           = 5;          // repetition = 5 畢業
  const SET_SIZE          = 10;
  const DAY               = 24 * 60 * 60 * 1000;

  const CLEAN_Q       = 5;   // 無提示答對
  const CHECK_FAIL_Q  = 3;   // ✓ 錯誤（只扣 EF，唔寫 history）
  const HINT_Q        = 0;   // 用提示答對

  /* ============ 小工具 ============ */
  function _round2(n) { return Math.round(n * 100) / 100; }
  function _clampEF(ef) {
    const v = Number(ef);
    const base = isFinite(v) && v > 0 ? v : INITIAL_EF;
    return _round2(Math.min(MAX_EF, Math.max(MIN_EF, base)));
  }
  function _clampInterval(days) {
    const v = Math.round(Number(days) || 0);
    return Math.min(MAX_INTERVAL_DAYS, Math.max(1, v));
  }

  /* ============ 演算法 1：EF ============ */
  function efForClean(ef)      { return _clampEF((Number(ef) || INITIAL_EF) + 0.15); }
  function efForHint(ef, hintCount) {
    let v = Number(ef) || INITIAL_EF;
    if (hintCount >= 1) v -= 0.20;
    if (hintCount >= 2) v -= 0.30;
    return _clampEF(v);
  }
  function efForCheckFail(ef)  { return _clampEF((Number(ef) || INITIAL_EF) - 0.14); }

  /* ============ 演算法 2：間隔（天）============ */
  function intervalForClean(prevIntervalDays, ef) {
    const prev = Math.max(0, Number(prevIntervalDays) || 0);
    const efv = Number(ef) || INITIAL_EF;
    /* 新卡 prev=0 → round(0)=0 → 最少 1 天 */
    return _clampInterval(Math.round(prev * efv * 0.6));
  }

  /* ============ 演算法 3：卡片更新 ============ */
  function applyClean(card, now) {
    const t = now || Date.now();
    const newEF = efForClean(card.ease_factor);
    const newInterval = intervalForClean(card.interval_days, newEF);
    const newRep = Math.min(MAX_REP, (Number(card.repetition) || 0) + 1);
    return {
      ...card,
      repetition: newRep,
      ease_factor: newEF,
      interval_days: newInterval,
      next_review_at: t + newInterval * DAY,
      last_review_at: t,
      is_mastered: newRep >= MAX_REP,
      updated_at: t
    };
  }

  function applyHint(card, hintCount, now) {
    const t = now || Date.now();
    return {
      ...card,
      repetition: 0,
      ease_factor: efForHint(card.ease_factor, Math.max(1, hintCount || 1)),
      interval_days: 1,
      next_review_at: t + DAY,
      last_review_at: t,
      is_mastered: false,
      updated_at: t
    };
  }

  /* ✓ 錯誤確認：只扣 EF，其他一律不動（亦唔會寫 history）*/
  function applyCheckFail(card, now) {
    return {
      ...card,
      ease_factor: efForCheckFail(card.ease_factor),
      updated_at: now || Date.now()
    };
  }

  /* ============ 顯示用：實際經過時間 ============ */
  /* 舊卡冇 last_review_at → 用 next_review_at − interval_days 推算 */
  function lastReviewedMs(card) {
    if (!card) return 0;
    const direct = Number(card.last_review_at || 0);
    if (direct > 0) return direct;
    const next = Number(card.next_review_at || 0);
    const iv = Number(card.interval_days || 0);
    if (next > 0 && iv > 0) return next - iv * DAY;
    return 0;
  }

  /* < 1 小時 → 分鐘；<= 2 天 → 小時；> 2 天 → 天 */
  function formatSpan(ms) {
    const value = Math.max(0, Number(ms) || 0);
    if (value < 60 * 60 * 1000) {
      return { value: Math.max(1, Math.round(value / (60 * 1000))), unit: "minute" };
    }
    if (value <= 2 * DAY) {
      return { value: Math.max(1, Math.round(value / (60 * 60 * 1000))), unit: "hour" };
    }
    return { value: Math.max(1, Math.round(value / DAY)), unit: "day" };
  }

  /* ============ Storage 層（LocalStorage adapter）============ */
  const LS_CARDS = "pokeengmon_sm2_cards_v2";
  const LS_HIST  = "pokeengmon_sm2_history_v2";

  /* 題目 → card_id（w: 前綴防撞）*/
  function _cardId(q) {
    if (q && q.type === "word") return `w\u0001${String(q.word).toLowerCase()}`;
    return `${q.topic}\u0001${q.sentence}\u0001${q.answer}`;
  }

  function _loadCards() {
    try { return JSON.parse(localStorage.getItem(LS_CARDS)) || {}; }
    catch (e) { return {}; }
  }
  function _saveCards(obj) {
    try { localStorage.setItem(LS_CARDS, JSON.stringify(obj)); } catch (e) {}
  }
  function _loadHistory() {
    try { return JSON.parse(localStorage.getItem(LS_HIST)) || []; }
    catch (e) { return []; }
  }
  function _saveHistory(arr) {
    try { localStorage.setItem(LS_HIST, JSON.stringify(arr.slice(-2000))); } catch (e) {}
  }

  /* 獲取卡片；冇就 create 新卡 */
  function getOrCreateCard(q) {
    const key = _cardId(q);
    const cards = _loadCards();
    if (cards[key]) return { ...cards[key], _key: key };
    const card = {
      card_id: key,
      card_type: q.type || "sentence",
      next_review_at: 0,              /* 即時可答 */
      interval_days: 0,
      ease_factor: INITIAL_EF,
      repetition: 0,
      lapse_count: 0,
      is_mastered: false,
      last_review_at: 0,
      updated_at: Date.now()
    };
    cards[key] = card;
    _saveCards(cards);
    return { ...card, _key: key };
  }

  function upsertCard(card) {
    const cards = _loadCards();
    const key = card._key || card.card_id;
    const { _key, ...clean } = card;
    cards[key] = clean;
    _saveCards(cards);
    /* 背景同步去 Supabase（有 config 先啟動）*/
    try { if (window.Sync && window.Sync.isEnabled()) Sync.queueUpsert(clean); } catch (e) {}
    return { ...clean, _key: key };
  }

  function listDue(now) {
    const t = now || Date.now();
    return Object.values(_loadCards())
      .filter(c => c.next_review_at <= t)
      .sort((a, b) => a.next_review_at - b.next_review_at);
  }

  function listNew() {
    return Object.values(_loadCards()).filter(c => c.repetition === 0);
  }

  function listAll() {
    return Object.values(_loadCards());
  }

  function listHistory() {
    return _loadHistory();
  }

  function appendHistory(rec) {
    const hist = _loadHistory();
    hist.push(rec);
    _saveHistory(hist);
    /* 背景同步去 Supabase */
    try { if (window.Sync && window.Sync.isEnabled()) Sync.queueHistory(rec); } catch (e) {}
  }

  /* 由雲端還原答題歷史：以 ts + card_id 去重；唔會再 queue 返上 server（避免回音） */
  function mergeHistory(rows) {
    if (!Array.isArray(rows) || !rows.length) return 0;
    const hist = _loadHistory();
    const seen = new Set(hist.map(h => Number(h.ts) + "|" + h.card_id));
    let added = 0;
    rows.forEach(r => {
      const ts = Number(r.ts);
      if (!ts || !isFinite(ts) || !r.card_id) return;
      const k = ts + "|" + r.card_id;
      if (seen.has(k)) return;
      seen.add(k);
      hist.push({
        card_id: r.card_id,
        ts,
        q_score: Number(r.q_score ?? 0),
        response_ms: Number(r.response_ms ?? 0),
        levenshtein_distance: Number(r.levenshtein_distance ?? 0),
        is_typo: !!r.is_typo
      });
      added++;
    });
    if (added) {
      hist.sort((a, b) => Number(a.ts) - Number(b.ts));
      _saveHistory(hist);
    }
    return added;
  }

  /* ============ 一次性遷移（v3 校準）============
     - 先備份玩家 state / cards / history
     - EF 夾到 1.8–3.0
     - interval 用新乘數重算（以推算嘅 last_review_at 為基準）
     - 補 last_review_at                                                  */
  const MIGRATE_MARK = "pokeengmon_sm2_v3_migrated";
  const BACKUP_KEY   = "pokeengmon_sm2_v3_backup";

  function migrateV3() {
    try {
      if (localStorage.getItem(MIGRATE_MARK)) return false;

      const cards = _loadCards();
      const ids = Object.keys(cards);

      /* 無論有冇卡都做備份（玩家 state 係最重要嗰份） */
      try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify({
          ts: Date.now(),
          state: localStorage.getItem("pokeengmon_state_v1"),
          cards,
          history: _loadHistory()
        }));
      } catch (e) {}

      let changed = false;
      const migratedAt = Date.now();
      ids.forEach(k => {
        const c = cards[k];
        const ef = _clampEF(c.ease_factor);
        const last = lastReviewedMs(c);
        let interval = Math.max(0, Number(c.interval_days) || 0);
        if (interval > 0) interval = intervalForClean(interval, ef);
        const rec = {
          ...c,
          ease_factor: ef,
          interval_days: interval,
          last_review_at: last > 0 ? last : 0,
          next_review_at: last > 0 ? last + interval * DAY : (Number(c.next_review_at) || 0),
          is_mastered: (Number(c.repetition) || 0) >= MAX_REP,
          /* 用遷移時間做 updated_at，令重算結果喺 pull 時贏過舊雲端卡，再推返上雲 */
          updated_at: migratedAt
        };
        cards[k] = rec;
        changed = true;
      });

      _saveCards(cards);
      localStorage.setItem(MIGRATE_MARK, String(Date.now()));
      return changed;
    } catch (e) {
      return false;
    }
  }

  /* ============ Session Pool Builder ============ */
  /* allQuestions: getAllQuestions() 結果
     topicKeys: Set of topic keys（null 表示全選）
     size: 目標題數（預設 SET_SIZE=10）*/
  function buildSession(allQuestions, topicKeys, size) {
    const s = size || SET_SIZE;
    let pool = allQuestions || [];

    /* topicKeys 可能係 Set 或 Array — 統一做 Set 處理 */
    const tkSet = (topicKeys instanceof Set) ? topicKeys : new Set(topicKeys || []);

    /* 按 topicKeys 篩選；用 questionTopicKey(q) 統一 key format */
    if (tkSet.size > 0) {
      pool = pool.filter(q => {
        const tk = (typeof questionTopicKey === "function") ? questionTopicKey(q) : q.topic;
        return tkSet.has(tk);
      });
    }
    if (pool.length === 0) return [];

    /* 先確保每題都有對應 card（lazy create，repetition=0）*/
    const withCard = pool.map(q => {
      const card = getOrCreateCard(q);
      return { q, card };
    });

    const now = Date.now();
    /* 只抽到期的卡，未到期嘅（無論新舊）一律唔抽：唔夠 10 題就出細 set，
       逼用戶去揀其他課題，唔俾死做一個課題重複刷啱啱做過嘅題 */
    const due = withCard.filter(x => x.card.next_review_at <= now);

    /* 過期卡最耐未見優先；全新題（next_review_at=0）隨機補尾 */
    const overdue = due.filter(x => x.card.next_review_at > 0)
      .sort((a, b) => a.card.next_review_at - b.card.next_review_at);
    const fresh = due.filter(x => x.card.next_review_at === 0);
    fresh.sort(() => Math.random() - 0.5);

    const picked = overdue.concat(fresh).slice(0, s);

    /* Fisher-Yates 完全隨機 */
    const arr = picked.slice(0, s);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.map(x => x.q);
  }

  /* ============ Public API ============ */
  return {
    /* 演算法（純函數，方便測試）*/
    efForClean, efForHint, efForCheckFail, intervalForClean,
    applyClean, applyHint, applyCheckFail,
    lastReviewedMs, formatSpan,
    /* Storage adapter */
    getOrCreateCard, upsertCard, listDue, listNew, listAll, listHistory, appendHistory, mergeHistory,
    /* 一次性遷移 */
    migrateV3,
    /* Session */
    buildSession,
    /* 常量 */
    INITIAL_EF, MIN_EF, MAX_EF, MAX_INTERVAL_DAYS, MAX_REP, SET_SIZE,
    CLEAN_Q, CHECK_FAIL_Q, HINT_Q
  };
})();
