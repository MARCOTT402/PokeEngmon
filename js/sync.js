/* ============================================================
   PokeEngmon — Supabase Sync（v2：綁定 auth.uid / device_id）

   本地 SM-2 操作後自動 push 去 Supabase。
   防金手指資料（diamonds / capture / exp）走 RPC，
   SM-2 cards/history 走直接 upsert（可接受前端改，但唔係貨幣）。
   ============================================================ */

window.Sync = (() => {

  const cfg = () => window.SUPABASE_CONFIG || null;

  /* ---------- Account 識別 ---------- */
  /* 登入 → { account_id, isAuth: true }；未登入 → { device_id, isAuth: false }（唔上傳） */
  function _accountRef() {
    try {
      const user = window.SupabaseAuth && SupabaseAuth.currentUser();
      if (user && user.id) return { account_id: user.id, device_id: null, isAuth: true };
    } catch (e) {}
    const st = (typeof loadState === "function") ? loadState() : { device_id: null };
    return { account_id: null, device_id: st.device_id || "unknown", isAuth: false };
  }

  /* ---------- 通用 fetch wrapper ---------- */
  async function _api(method, path, body) {
    const c = cfg();
    if (!c || !c.anonKey) throw new Error("Supabase config missing");
    const url = c.restUrl + path;
    const headers = {
      "apikey": c.anonKey,
      "Authorization": "Bearer " + (window.SupabaseAuth && SupabaseAuth.currentToken
        ? SupabaseAuth.currentToken() : c.anonKey),
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    };
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${txt.slice(0, 120)}`);
    }
    return res.json().catch(() => []);
  }

  /* ---------- 背景 queue ---------- */
  let _pendingCards = [];
  let _pendingHistory = [];
  let _flushTimer = null;

  function queueUpsert(card) {
    const ref = _accountRef();
    if (!ref.isAuth) return;   /* 匿名：RLS 唔允許寫，直接唔好送（本地已保存） */
    _pendingCards.push({
      account_id: ref.account_id,
      card_id: card.card_id,
      card_type: card.card_type,
      next_review_at: card.next_review_at,
      interval_days: card.interval_days,
      ease_factor: card.ease_factor,
      repetition: card.repetition,
      lapse_count: card.lapse_count,
      is_mastered: card.is_mastered,
      updated_at: card.updated_at
    });
    _scheduleFlush();
  }

  function queueHistory(rec) {
    const ref = _accountRef();
    if (!ref.isAuth) return;   /* 匿名：同上 */
    _pendingHistory.push({
      account_id: ref.account_id,
      card_id: rec.card_id,
      ts: rec.ts,
      q_score: rec.q_score,
      response_ms: rec.response_ms,
      levenshtein_distance: rec.levenshtein_distance,
      is_typo: rec.is_typo
    });
    _scheduleFlush();
  }

  function _scheduleFlush() {
    if (_flushTimer) return;
    _flushTimer = setTimeout(() => _flush(), 1000);
  }

  async function _flush() {
    _flushTimer = null;
    if (_pendingCards.length === 0 && _pendingHistory.length === 0) return;

    const cards = _pendingCards.splice(0, _pendingCards.length);
    const hist  = _pendingHistory.splice(0, _pendingHistory.length);

    if (cards.length > 0) {
      try {
        await _api("POST", "/user_cards", cards.map(c => ({
          ...c,
          interval_days: Number(c.interval_days),
          ease_factor: Number(c.ease_factor)
        })));
      } catch (e) {
        console.warn("[Sync] upsert cards failed (retry):", e.message);
        _pendingCards.unshift(...cards);
        _scheduleFlush();
      }
    }
    if (hist.length > 0) {
      try {
        await _api("POST", "/user_history", hist);
      } catch (e) {
        console.warn("[Sync] insert history failed (retry):", e.message);
        _pendingHistory.unshift(...hist);
        _scheduleFlush();
      }
    }
  }

  /* ---------- Pull（App 啟動時 / 登入後）---------- */
  async function pull() {
    const c = cfg();
    if (!c || !c.anonKey) return null;

    try {
      const ref = _accountRef();
      /* 匿名：RLS 用 current_setting('app.device_id')，PostgREST set 唔到 → 拉唔到嘢，直接跳過 */
      if (!ref.isAuth) return null;

      /* 一齊拉：account（鑽石+統計）、entries（寶可夢）、cards（SM-2） */
      const [accountRows, entries, cards] = await Promise.all([
        _api("GET", `/user_account?select=*`),
        _api("GET", `/user_entries?select=*&order=obtained_at.asc`),
        _api("GET", `/user_cards?select=*`)
      ]);

      /* ---- 1. 還原 account：diamonds / 統計 / trainer name ---- */
      if (accountRows && accountRows[0]) {
        const acct = accountRows[0];
        const st = loadState();
        st.diamonds = acct.diamonds ?? st.diamonds;
        st.totalSets = acct.total_sets ?? st.totalSets;
        st.totalCorrect = acct.total_correct ?? st.totalCorrect;
        st.totalQuestions = acct.total_questions ?? st.totalQuestions;
        if (acct.trainer_name && acct.trainer_name !== st.playerName) {
          st.playerName = acct.trainer_name;
          st.nameCustomized = true;
        }
        saveState();
      }

      /* ---- 2. 還原 entries：寶可夢 ---- */
      if (Array.isArray(entries)) {
        const st = loadState();
        st.entries = entries.map(e => ({
          uid: e.id,
          chainKey: e.chain_key,
          stage: e.stage ?? 1,
          exp: Number(e.exp ?? 0),
          ownedSpecies: Array.isArray(e.owned_species) ? e.owned_species.map(Number) : [],
          obtainedAt: e.obtained_at,
          ivs: e.ivs || {},
          evs: e.evs || {},
          ev_points: e.ev_points ?? 0,
          candies: e.candies ?? 0,
          dupes: e.dupes ?? 0,
          stars: e.stars ?? 1
        }));
        /* activeUid：邊個 entry.active = true */
        const activeEntry = entries.find(e => e.active === true);
        st.activeUid = activeEntry ? activeEntry.id : (st.entries.length > 0 ? st.entries[0].uid : null);
        saveState();
      }

      /* ---- 3. 還原 SM-2 cards（合併本地 vs 雲端，取較新） ---- */
      const local = SM2.listAll();
      const localMap = {};
      local.forEach(c => { localMap[c.card_id] = c; });

      const mergedCards = {};
      cards.forEach(cloud => {
        const localC = localMap[cloud.card_id];
        if (!localC) mergedCards[cloud.card_id] = cloud;
        else mergedCards[cloud.card_id] = (cloud.updated_at >= localC.updated_at) ? cloud : localC;
      });
      Object.keys(localMap).forEach(cid => {
        if (!mergedCards[cid]) mergedCards[cid] = localMap[cid];
      });

      const obj = {};
      Object.values(mergedCards).forEach(c => { obj[c.card_id] = c; });
      try { localStorage.setItem("pokeengmon_sm2_cards_v2", JSON.stringify(obj)); } catch (e) {}
      console.info("[Sync] pulled", Object.keys(mergedCards).length, "cards,", (entries?.length||0), "pokemon");
      return Object.values(mergedCards);

    } catch (e) {
      console.warn("[Sync] pull failed:", e.message);
      return null;
    }
  }

  /* ---------- Push State（首次 Connect 新帳戶時：將本地數據上傳到雲端）---------- */
  async function pushState() {
    const ref = _accountRef();
    if (!ref.isAuth) return; /* 匿名唔使 push */

    const st = loadState();
    const now = Date.now();

    /* ---- 1. Upsert user_account（diamonds + 統計 + trainer name）---- */
    try {
      await _api("POST", "/user_account?on_conflict=id", {
        id: ref.account_id,
        trainer_name: st.playerName || "The PokéEngmon Trainer",
        diamonds: st.diamonds || 0,
        total_sets: st.totalSets || 0,
        total_correct: st.totalCorrect || 0,
        total_questions: st.totalQuestions || 0,
        updated_at: now
      });
    } catch (e) { console.warn("[Sync] push account failed:", e.message); }

    /* ---- 2. Upsert 所有 user_entries（寶可夢）---- */
    if (Array.isArray(st.entries) && st.entries.length > 0) {
      try {
        const rows = st.entries.map(e => ({
          id: e.uid,
          account_id: ref.account_id,
          chain_key: e.chainKey,
          stage: e.stage ?? 1,
          exp: Number(e.exp ?? 0),
          level: 1,
          ivs: e.ivs || {},
          evs: e.evs || {},
          ev_points: e.ev_points ?? 0,
          candies: e.candies ?? 0,
          dupes: e.dupes ?? 0,
          stars: e.stars ?? 1,
          active: e.uid === st.activeUid,
          owned_species: (e.ownedSpecies || []).map(String),
          obtained_at: e.obtainedAt || now,
          updated_at: now
        }));
        await _api("POST", "/user_entries?on_conflict=id", rows);
      } catch (e) { console.warn("[Sync] push entries failed:", e.message); }
    }

    /* ---- 3. Push 所有 SM-2 cards ---- */
    try {
      const cards = SM2.listAll();
      if (cards.length > 0) {
        const rows = cards.map(c => ({
          account_id: ref.account_id,
          card_id: c.card_id,
          card_type: c.card_type,
          next_review_at: c.next_review_at,
          interval_days: Number(c.interval_days),
          ease_factor: Number(c.ease_factor),
          repetition: c.repetition,
          lapse_count: c.lapse_count,
          is_mastered: c.is_mastered,
          updated_at: c.updated_at
        }));
        await _api("POST", "/user_cards?on_conflict=account_id,card_id", rows);
      }
    } catch (e) { console.warn("[Sync] push cards failed:", e.message); }

    console.info("[Sync] pushState done — account,", (st.entries?.length||0), "entries, SM-2 cards pushed");
  }

  return {
    queueUpsert,
    queueHistory,
    pull,
    pushState,
    flush: () => _flush(),
    isEnabled: () => !!(cfg() && cfg().anonKey && (window.SupabaseAuth ? SupabaseAuth.isEnabled() : true))
  };
})();
