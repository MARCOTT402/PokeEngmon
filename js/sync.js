/* ============================================================
   PokeEngmon — Supabase Sync（v2：綁定 auth.uid / device_id）

   本地 SM-2 操作後自動 push 去 Supabase。
   防金手指資料（diamonds / capture / exp）走 RPC，
   SM-2 cards/history 走直接 upsert（可接受前端改，但唔係貨幣）。
   ============================================================ */

window.Sync = (() => {

  const cfg = () => window.SUPABASE_CONFIG || null;

  /* ---------- Account 識別 ---------- */
  /* 登入 → auth.uid()；未登入 → device_id */
  function _accountRef() {
    try {
      const user = window.SupabaseAuth && SupabaseAuth.currentUser();
      if (user) return { account_uuid: user.id, isAuth: true };
    } catch (e) {}
    const st = (typeof loadState === "function") ? loadState() : { device_id: null };
    return { device_id: st.device_id || "unknown", isAuth: false };
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
    _pendingCards.push({
      account_uuid: ref.account_uuid || null,
      device_id: ref.device_id || null,
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
    _pendingHistory.push({
      account_uuid: ref.account_uuid || null,
      device_id: ref.device_id || null,
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
      const filter = ref.isAuth
        ? `account_id=eq.${ref.account_uuid}`
        : `device_id=eq.${encodeURIComponent(ref.device_id)}`;

      const [cards] = await Promise.all([
        _api("GET", `/user_cards?${filter}&select=*`)
      ]);

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
      console.info("[Sync] pulled", Object.keys(mergedCards).length, "cards");
      return Object.values(mergedCards);

    } catch (e) {
      console.warn("[Sync] pull failed:", e.message);
      return null;
    }
  }

  return {
    queueUpsert,
    queueHistory,
    pull,
    flush: () => _flush(),
    isEnabled: () => !!(cfg() && cfg().anonKey && (window.SupabaseAuth ? SupabaseAuth.isEnabled() : true))
  };
})();
