/* ============================================================
   PokeEngmon — SM-2 Spaced Repetition Core
   （P.2 校準版，藍圖演算法完整實作）

   演算法層（純函數，零副作用）：
     levenshtein / isPrefix / expectedTime / computeQ
     computeEF / nextInterval / nextRepetition

   Storage 層（LocalStorage adapter，之後換 Dexie/Supabase
              只需改這一節，上層 code 唔使改）：
     getOrCreateCard / upsertCard / listDue / listNew / listAll
     appendHistory

   Session Pool Builder：
     buildSession(allQuestions, topicKeys, size) → 最多 10 題
       只抽到期卡：過期最耐未見優先 → 全新題隨機補尾 → Fisher-Yates 洗牌
       未到期卡一律唔抽（唔夠就出細 set，逼用戶揀其他課題）
   ============================================================ */

window.SM2 = (() => {

  /* ============ 參數常量 ============ */
  const LADDER          = [1, 3, 7, 15, 30];   // 答對後遞增（天）
  const MAX_REP         = 5;                    // repetition = 5 畢業
  const INITIAL_EF      = 2.50;
  const MIN_EF          = 1.30;
  const SET_SIZE        = 10;

  /* ============ 演算法 1：Levenshtein Distance（DP 矩陣）============ */
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const n = a.length, m = b.length;
    const dp = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
      dp[i] = new Array(m + 1);
      dp[i][0] = i;
    }
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,        // delete
          dp[i][j - 1] + 1,        // insert
          dp[i - 1][j - 1] + cost  // substitute
        );
      }
    }
    return dp[n][m];
  }

  /* ============ 演算法 2：前綴檢查（過早提交保護用）============ */
  function isPrefix(input, target) {
    if (input.length === 0) return true;
    return target.toLowerCase().substring(0, input.length) === input.toLowerCase();
  }

  /* ============ 演算法 3：動態時間期望（ms）============ */
  function expectedTime(target) {
    return 3500 + target.length * 1200;   // 3.5s base + 1.2s/char
  }

  /* ============ 演算法 4：Q 值完整分支判定 ============
     回傳 { q, reason, dist, lenRatio, premature }
     （efDelta 由 computeEF 再計，避免死欄位） */
  function computeQ(input, target, response_ms) {
    const normInput = String(input || "").trim().toLowerCase();
    const normTarget = String(target || "").trim().toLowerCase();
    const dist = levenshtein(normInput, normTarget);
    const lenRatio = normTarget.length > 0 ? normInput.length / normTarget.length : 0;

    /* 過早提交保護（優先檢查）：
       Dist>=1 + 長度 < 50% + 輸入係正確前綴 */
    if (dist >= 1 && lenRatio < 0.5 && isPrefix(normInput, normTarget)) {
      return { q: 1, reason: "premature_submit", dist, lenRatio, premature: true };
    }

    if (dist === 0) {
      const exp = expectedTime(normTarget);
      if (response_ms <= 0.5 * exp)
        return { q: 5, reason: "perfect_fast", dist, lenRatio, premature: false };
      if (response_ms <= 1.5 * exp)
        return { q: 4, reason: "good_normal",  dist, lenRatio, premature: false };
      return { q: 3, reason: "hard_slow",     dist, lenRatio, premature: false };
    }

    if (dist === 1)
      return { q: 2, reason: "soft_fail_typo", dist, lenRatio, premature: false };

    /* dist >= 2：一律 Hard Fail，唔加保護 */
    return { q: 1, reason: "hard_fail", dist, lenRatio, premature: false };
  }

  /* ============ 多個可接受答案：逐個計分，取最高 Q ============
     同分時取較短編輯距離；回傳值附加 target 方便記錄實際命中嘅答案 */
  function computeBestQ(input, targets, response_ms) {
    const list = (Array.isArray(targets) ? targets : [targets]).filter(t => t != null);
    const pool = list.length ? list : [""];
    let best = null;
    pool.forEach(t => {
      const j = computeQ(input || "", t || "", response_ms);
      if (!best || j.q > best.q || (j.q === best.q && j.dist < best.dist)) {
        best = { ...j, target: t };
      }
    });
    return best;
  }

  /* ============ 演算法 5：Ease Factor ============ */
  function computeEF(oldEF, reason) {
    /* 保護例外：premature_submit / soft_fail_typo / good_normal 唔扣 EF */
    if (reason === "premature_submit" || reason === "soft_fail_typo" || reason === "good_normal")
      return oldEF;
    if (reason === "perfect_fast")  return Math.min(3.0, oldEF + 0.10);
    if (reason === "hard_slow")     return Math.max(MIN_EF, oldEF - 0.14);
    if (reason === "hard_fail")     return Math.max(MIN_EF, oldEF - 0.20);
    return oldEF;
  }

  /* ============ 演算法 6：下次間隔（天）============ */
  function nextInterval(repetition, q) {
    if (q >= 3) {
      if (repetition <= 0) return 1;
      if (repetition <= MAX_REP) return LADDER[repetition - 1];
      return 30;
    }
    /* 答錯後統一 1 天後 */
    return 1;
  }

  /* ============ 演算法 7：repetition 狀態轉換 ============ */
  function nextRepetition(currentRep, q) {
    if (q >= 3) return Math.min(MAX_REP, currentRep + 1);
    /* 答錯 */
    if (currentRep === 0) return 0;        /* 未學過保持 0 */
    if (currentRep >= MAX_REP) return 4;   /* 畢業後答錯降級到 4 */
    return 1;                              /* 其餘重置到 1 */
  }

  /* ============ SM-2 完整卡片更新（包裝函數）============ */
  function updateCard(card, q, response_ms) {
    const newRep = nextRepetition(card.repetition, q);
    const newEF  = computeEF(card.ease_factor, card._lastReason || (q >= 3 ? "good_normal" : "hard_fail"));
    const newInt = nextInterval(newRep, q);
    const now = Date.now();
    return {
      ...card,
      repetition: newRep,
      ease_factor: newEF,
      interval_days: newInt,
      next_review_at: now + newInt * 24 * 60 * 60 * 1000,
      lapse_count: q <= 2 ? (card.lapse_count || 0) + 1 : (card.lapse_count || 0),
      is_mastered: newRep >= MAX_REP,
      updated_at: now,
      _lastReason: card._lastReason || null    /* 清除 temporary */
    };
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
    delete clean._lastReason;
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
    levenshtein, isPrefix, expectedTime,
    computeQ, computeBestQ, computeEF, nextInterval, nextRepetition, updateCard,
    /* Storage adapter */
    getOrCreateCard, upsertCard, listDue, listNew, listAll, listHistory, appendHistory, mergeHistory,
    /* Session */
    buildSession,
    /* 常量 */
    LADDER, INITIAL_EF, MIN_EF, MAX_REP, SET_SIZE
  };
})();
