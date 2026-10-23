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
    if (!ref.isAuth) { console.log("[Sync] queueUpsert skipped — not auth"); return; }
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
    console.log("[Sync] queueUpsert — card:", card.card_id, "pending:", _pendingCards.length);
    _scheduleFlush();
  }

  function queueHistory(rec) {
    const ref = _accountRef();
    if (!ref.isAuth) { console.log("[Sync] queueHistory skipped — not auth"); return; }
    _pendingHistory.push({
      account_id: ref.account_id,
      card_id: rec.card_id,
      ts: rec.ts,
      q_score: rec.q_score,
      response_ms: rec.response_ms,
      levenshtein_distance: rec.levenshtein_distance,
      is_typo: rec.is_typo
    });
    console.log("[Sync] queueHistory — card:", rec.card_id, "pending:", _pendingHistory.length);
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

    console.log("[Sync] _flush — cards:", cards.length, "history:", hist.length);

    if (cards.length > 0) {
      try {
        /* 用 on_conflict 做 upsert，避免重複 card 導致成批失敗 */
        await _api("POST", "/user_cards?on_conflict=account_id,card_id", cards.map(c => ({
          ...c,
          interval_days: Number(c.interval_days),
          ease_factor: Number(c.ease_factor)
        })));
        console.log("[Sync] ✅ flush cards ok:", cards.length);
      } catch (e) {
        console.warn("[Sync] ❌ flush cards failed (retry):", e.message);
        _pendingCards.unshift(...cards);
        _scheduleFlush();
      }
    }
    if (hist.length > 0) {
      try {
        await _api("POST", "/user_history", hist);
        console.log("[Sync] ✅ flush history ok:", hist.length);
      } catch (e) {
        console.warn("[Sync] ❌ flush history failed (retry):", e.message);
        _pendingHistory.unshift(...hist);
        _scheduleFlush();
      }
    }
  }

  /* 頁面卸載前 flush（避免 1 秒內轉頁遺失數據） */
  window.addEventListener("beforeunload", () => {
    if (_pendingCards.length > 0 || _pendingHistory.length > 0) {
      _flush();
    }
  });

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
        st.entries = entries.map(e => {
          /* settle_capture RPC 會用 'dex_<id>' 做 chain_key，要轉返正確 chain key */
          let chainKey = e.chain_key;
          if (chainKey && chainKey.startsWith("dex_")) {
            const dexId = parseInt(chainKey.slice(4), 10);
            const sp = SPECIES[dexId];
            if (sp) chainKey = sp.chainKey;
          }
          return {
            uid: e.id,
            chainKey: chainKey,
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
          };
        });
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
    if (!ref.isAuth) { console.warn("[Sync] pushState skipped — not authenticated"); return; }

    const st = loadState();
    const now = Date.now();
    console.log("[Sync] pushState start — account:", ref.account_id,
      "diamonds:", st.diamonds, "entries:", st.entries?.length||0,
      "cards:", (typeof SM2!=="undefined"&&SM2.listAll)?SM2.listAll().length:0);

    /* ---- 1. Upsert user_account（diamonds + 統計 + trainer name）---- */
    /* migrateAnonymous 一定已經 create 咗呢個 row → 用 PATCH 更新最穩陣，
       避免 INSERT ON CONFLICT DO UPDATE 喺 RLS 下嘅潛在問題 */
    try {
      const acctPayload = {
        trainer_name: st.playerName || "The PokéEngmon Trainer",
        diamonds: st.diamonds || 0,
        total_sets: st.totalSets || 0,
        total_correct: st.totalCorrect || 0,
        total_questions: st.totalQuestions || 0,
        updated_at: now
      };
      console.log("[Sync] patching user_account:", JSON.stringify(acctPayload));
      /* PATCH with id filter — row 由 migrateAnonymous 建立，一定存在 */
      const acctRes = await _api("PATCH", `/user_account?id=eq.${ref.account_id}`, acctPayload);
      console.log("[Sync] ✅ user_account patch ok:", JSON.stringify(acctRes).slice(0, 200));
    } catch (e) {
      console.warn("[Sync] ❌ patch account failed:", e.message, "— fallback to upsert");
      /* Fallback：如果 PATCH 失敗（row 唔存在），用 POST upsert */
      try {
        const fbPayload = {
          id: ref.account_id,
          trainer_name: st.playerName || "The PokéEngmon Trainer",
          diamonds: st.diamonds || 0,
          total_sets: st.totalSets || 0,
          total_correct: st.totalCorrect || 0,
          total_questions: st.totalQuestions || 0,
          updated_at: now
        };
        const fbRes = await _api("POST", "/user_account?on_conflict=id", fbPayload);
        console.log("[Sync] ✅ user_account fallback upsert ok:", JSON.stringify(fbRes).slice(0, 200));
      } catch (e2) { console.warn("[Sync] ❌ user_account fallback also failed:", e2.message); }
    }

    /* ---- 2. Upsert 所有 user_entries（寶可夢）---- */
    if (Array.isArray(st.entries) && st.entries.length > 0) {
      try {
        const rows = st.entries.map(e => ({
          id: e.uid,
          account_id: ref.account_id,
          chain_key: e.chainKey,
          stage: e.stage ?? 1,
          exp: Number(e.exp ?? 0),
          level: e.level ?? 1,
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
        console.log("[Sync] pushing user_entries count:", rows.length);
        const entriesRes = await _api("POST", "/user_entries?on_conflict=id", rows);
        console.log("[Sync] ✅ user_entries upsert ok, rows:", entriesRes.length);
      } catch (e) { console.warn("[Sync] ❌ push entries failed:", e.message); }
    } else {
      console.log("[Sync] no entries to push");
    }

    /* ---- 3. Push 所有 SM-2 cards ---- */
    try {
      const cards = (typeof SM2 !== "undefined" && SM2.listAll) ? SM2.listAll() : [];
      console.log("[Sync] pushing user_cards count:", cards.length);
      if (cards.length > 0) {
        /* Dedup by card_id（batch 入面唔可以有重複 PK） */
        const seen = new Set();
        const rows = cards
          .filter(c => {
            if (seen.has(c.card_id)) return false;
            seen.add(c.card_id);
            return true;
          })
          .map(c => ({
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
        const cardsRes = await _api("POST", "/user_cards?on_conflict=account_id,card_id", rows);
        console.log("[Sync] ✅ user_cards upsert ok, rows:", cardsRes.length);
      }
    } catch (e) { console.warn("[Sync] ❌ push cards failed:", e.message); }

    /* ---- 4. Push 所有 SM-2 history（答題記錄）---- */
    try {
      const hist = (typeof SM2 !== "undefined" && SM2.listHistory) ? SM2.listHistory() : [];
      console.log("[Sync] pushing user_history count:", hist.length);
      if (hist.length > 0) {
        const rows = hist.map(h => ({
          account_id: ref.account_id,
          card_id: h.card_id,
          ts: h.ts,
          q_score: Number(h.q_score ?? 0),
          response_ms: Number(h.response_ms ?? 0),
          levenshtein_distance: Number(h.levenshtein_distance ?? 0),
          is_typo: !!h.is_typo
        }));
        const histRes = await _api("POST", "/user_history", rows);
        console.log("[Sync] ✅ user_history insert ok, rows:", histRes.length);
      }
    } catch (e) { console.warn("[Sync] ❌ push history failed:", e.message); }

    console.info("[Sync] pushState done");
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
