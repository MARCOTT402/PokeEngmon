/* ============================================================
   PokeEngmon — Supabase Sync（背景同步，零依賴）

   職責：
     1. 本地 SM-2 操作後自動 push 去 Supabase（queued + debounced）
     2. App 啟動時 pull 最新狀態（跨裝置同步）
     3. 合併邏輯：每張卡取 updated_at 較新嘅版本

   技術：純 fetch() 調 Supabase PostgREST，零 SDK 零額外打包。
   Key 安全：key 放 supabase-config.local.js（.gitignore 追蹤）。
   ============================================================ */

window.Sync = (() => {

  /* ---------- Config ---------- */
  const cfg = () => window.SUPABASE_CONFIG || null;

  /* ---------- Device ID ---------- */
  function deviceId() {
    const st = (typeof loadState === "function") ? loadState() : { device_id: null };
    return st.device_id || "unknown";
  }

  /* ---------- 通用 fetch wrapper ---------- */
  async function _api(method, path, body) {
    const c = cfg();
    if (!c || !c.anonKey) throw new Error("Supabase config missing");
    const url = c.restUrl + path;
    const headers = {
      "apikey": c.anonKey,
      "Authorization": "Bearer " + c.anonKey,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    };
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}: ${txt.slice(0, 120)}`);
    }
    return res.json().catch(() => []);
  }

  /* ---------- 背景 queue ---------- */
  let _pendingCards = [];       /* [{...card}] — 待 upsert */
  let _pendingHistory = [];     /* [{...history}] — 待 insert */
  let _flushTimer = null;

  function queueUpsert(card) {
    _pendingCards.push({
      device_id: deviceId(),
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
    _pendingHistory.push({
      device_id: deviceId(),
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
    _flushTimer = setTimeout(() => { _flush(); }, 1000);   /* 1s debounce 合併 */
  }

  async function _flush() {
    _flushTimer = null;
    if (_pendingCards.length === 0 && _pendingHistory.length === 0) return;

    const cards = _pendingCards.splice(0, _pendingCards.length);
    const hist  = _pendingHistory.splice(0, _pendingHistory.length);

    /* upsert cards — Prefer: resolution=merge-duplicates */
    if (cards.length > 0) {
      try {
        await _api("POST", "/user_cards", cards.map(c => ({
          ...c,
          /* Supabase 要 numeric 型 */
          interval_days: Number(c.interval_days),
          ease_factor: Number(c.ease_factor)
        })));
      } catch (e) {
        console.warn("[Sync] upsert cards failed (will retry):", e.message);
        /* 失敗歸隊 */
        _pendingCards.unshift(...cards);
        _scheduleFlush();
      }
    }

    /* insert history — 純 append，唔 upsert */
    if (hist.length > 0) {
      try {
        await _api("POST", "/user_history", hist);
      } catch (e) {
        console.warn("[Sync] insert history failed (will retry):", e.message);
        _pendingHistory.unshift(...hist);
        _scheduleFlush();
      }
    }
  }

  /* ---------- Pull（App 啟動時）---------- */
  async function pull() {
    const c = cfg();
    if (!c || !c.anonKey) {
      console.info("[Sync] no Supabase config — pull skipped");
      return null;
    }

    try {
      const dev = deviceId();
      const [cards, history] = await Promise.all([
        _api("GET", "/user_cards?device_id=eq." + encodeURIComponent(dev) + "&select=*"),
        _api("GET", "/user_history?device_id=eq." + encodeURIComponent(dev) + "&order=ts.desc&limit=1000")
      ]);

      /* 合併邏輯：LocalStorage 每張卡 vs cloud → 取 updated_at 較新嘅 */
      const local = SM2.listAll();
      const localMap = {};
      local.forEach(c => { localMap[c.card_id] = c; });

      const mergedCards = {};

      cards.forEach(cloud => {
        const localC = localMap[cloud.card_id];
        if (!localC) {
          /* 雲端有、本地冇 → 直接用雲端 */
          mergedCards[cloud.card_id] = cloud;
        } else {
          /* 都有 → 取 updated_at 較新 */
          mergedCards[cloud.card_id] = (cloud.updated_at >= localC.updated_at) ? cloud : localC;
        }
      });

      /* 本地有、雲端冇 → 保留本地（之後會 push）*/
      Object.keys(localMap).forEach(cid => {
        if (!mergedCards[cid]) mergedCards[cid] = localMap[cid];
      });

      /* 寫回 LocalStorage */
      const obj = {};
      Object.values(mergedCards).forEach(c => { obj[c.card_id] = c; });
      try { localStorage.setItem("pokeengmon_sm2_cards_v2", JSON.stringify(obj)); } catch (e) {}

      console.info("[Sync] pulled", cards.length, "cards, merged into", Object.keys(mergedCards).length);
      return { cards: Object.values(mergedCards), history };

    } catch (e) {
      console.warn("[Sync] pull failed:", e.message);
      return null;
    }
  }

  /* ---------- Public API ---------- */
  return {
    queueUpsert,
    queueHistory,
    pull,
    flush: () => _flush(),
    /* 外部檢查：Supabase 有冇配置 */
    isEnabled: () => !!(cfg() && cfg().anonKey && cfg().url)
  };
})();
