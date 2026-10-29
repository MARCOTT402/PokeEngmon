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
      "Prefer": path.includes("on_conflict")
        ? "return=representation,resolution=merge-duplicates"
        : "return=representation"
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

  /* Reset Progress：丟棄未發送嘅卡片／歷史，避免 reset 後又被 queue 寫返上雲 */
  function clearQueue() {
    _pendingCards = [];
    _pendingHistory = [];
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }

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

      /* 一齊拉：account、entries、cards、practice days、practice records、答題歷史 */
      const [accountRows, entries, cards, practiceDays, practiceRecords, historyRows] = await Promise.all([
        _api("GET", `/user_account?select=*`),
        _api("GET", `/user_entries?select=*&order=obtained_at.asc`),
        _api("GET", `/user_cards?select=*`),
        _api("GET", `/user_practice_days?select=day,sets&order=day.asc`).catch(() => []),
        _api("GET", `/user_practice_records?select=day,ts,duration,score,total,results&order=ts.asc`).catch(() => []),
        /* 只拉最近 300 條：history 存喺 localStorage，全量拉會撞 5MB 配額 */
        _api("GET", `/user_history?select=card_id,ts,q_score,response_ms,levenshtein_distance,is_typo&order=ts.desc&limit=300`).catch(() => [])
      ]);

      /* ---- 1. 還原 account：diamonds / 統計 / trainer name / gym badges ---- */
      if (accountRows && accountRows[0]) {
        const acct = accountRows[0];
        const st = loadState();
        st.diamonds = acct.diamonds ?? st.diamonds;
        st.totalSets = acct.total_sets ?? st.totalSets;
        st.totalCorrect = acct.total_correct ?? st.totalCorrect;
        st.totalQuestions = acct.total_questions ?? st.totalQuestions;
        if (acct.best_streak != null) st.bestStreak = Math.max(st.bestStreak || 0, acct.best_streak | 0);
        if (Array.isArray(acct.gym_badges)) {
          const local = Array.isArray(st.gymBadges) ? st.gymBadges : [];
          st.gymBadges = Array.from(new Set([...local, ...acct.gym_badges.map(Number)]));
        }
        if (acct.trainer_name && acct.trainer_name !== st.playerName) {
          st.playerName = acct.trainer_name;
          st.nameCustomized = true;
        }
        /* 明確記住「用家改過名」，避免之後新裝置再判定錯誤 */
        if (acct.name_customized === true) st.nameCustomized = true;
        /* 背包：雲端 null = 未上過雲 → 保留本機（首次 backfill 靠呢條規則） */
        if (acct.items_food != null || acct.items_premium != null || acct.items_revive != null) {
          const bag = (st.items && typeof st.items === "object") ? st.items : { food: 0, premium: 0, revive: 0 };
          if (acct.items_food != null) bag.food = Math.max(0, Number(acct.items_food) || 0);
          if (acct.items_premium != null) bag.premium = Math.max(0, Number(acct.items_premium) || 0);
          if (acct.items_revive != null) bag.revive = Math.max(0, Number(acct.items_revive) || 0);
          st.items = bag;
        }
        saveState();
      }

      if (Array.isArray(practiceDays) && typeof mergePracticeDaysFromCloud === "function") {
        mergePracticeDaysFromCloud(practiceDays);
      }
      /* 完整明細（記得每組分數）優先過「只有組數」的占位 */
      let recordsAdded = 0;
      if (Array.isArray(practiceRecords) && typeof mergeRecordsFromCloud === "function") {
        recordsAdded = mergeRecordsFromCloud(practiceRecords);
      }
      if (recordsAdded && typeof Calendar !== "undefined") {
        /* 日曆開住嘅話即刻重畫，唔使等用戶手動返回再入 */
        const calView = document.getElementById("view-calendar");
        if (calView && !calView.hidden) { try { Calendar.render(); } catch (e) {} }
      }
      /* 答題歷史：以前只推唔拉，換機後睇唔到舊紀錄 */
      if (Array.isArray(historyRows) && typeof SM2 !== "undefined" && SM2.mergeHistory) {
        const restored = SM2.mergeHistory(historyRows);
        if (restored) console.info("[Sync] history restored:", restored);
      }

      /* ---- 2. 還原 entries：寶可夢 ----
         server 權威欄位：exp / ivs / evs / ev_points / candies / dupes / branch / active
         derived 欄位（level / stage / ownedSpecies / moves / stars）：唔信 DB，
         由 deriveEntryFields 按 (chainKey, exp, dupes, branch) 重推 —— v99 起敏感欄
         唔俾 client 直寫，derived 欄位喺 DB 只係近似值

         v113：deriveEntryFields 入面嘅 initialMoves 要讀 POKEMON_DEX，
         但 Sync.pull 可能喺 loadPokemonDex 完成前就跑（app.js init 頂部 fire-and-forget）。
         唔等嘅話 initialMoves 會回傳 [] → entry.moves 變空數組 → 永久冇招式。
         所以喺 derive 之前一定要等 POKEMON_DEX 就緒。 */
      await loadPokemonDex();
      if (Array.isArray(entries)) {
        /* v140：先把 dex_<id> 轉成 chain key，再 collect gens —— 舊碼跳過 dex_ 會漏 Gen2+ load */
        const normalized = entries.map(e => {
          if (e.chain_key && e.chain_key.startsWith("dex_")) {
            const dexId = parseInt(e.chain_key.slice(4), 10);
            const sp = SPECIES[dexId];
            if (sp) return { ...e, chain_key: sp.chainKey };
          }
          return e;
        });
        const gensNeeded = new Set();
        normalized.forEach(e => {
          if (e.chain_key) gensNeeded.add(genOfChain(e.chain_key));
        });
        for (const g of gensNeeded) {
          if (g > 1) await ensureGenDataLoaded(g);
        }
        const st = loadState();
        st.entries = normalized.map(e => localEntryFromServer(e));
        /* activeUid：邊個 entry.active = true（用未 map 前 id，同 server row） */
        const activeEntry = normalized.find(e => e.active === true);
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

  /* ---------- Push State（只推非敏感資料：trainer_name + SM-2 cards/history）----------
     v99 起：diamonds / totals / entries 全部收歸 RPC 權威（DB column grant 擋直寫），
     呢度再寫敏感欄會 403。敏感操作改用 SupabaseAuth 嘅 RPC wrapper。 */
  async function pushState() {
    const ref = _accountRef();
    if (!ref.isAuth) { console.warn("[Sync] pushState skipped — not authenticated"); return; }

    const st = loadState();
    console.log("[Sync] pushState start — account:", ref.account_id,
      "cards:", (typeof SM2!=="undefined"&&SM2.listAll)?SM2.listAll().length:0);

    /* ---- 1. Patch user_account（淨 trainer_name + name_customized —— diamonds/totals 係 RPC-only）---- */
    try {
      const acctPayload = {
        trainer_name: st.playerName || "The PokéEngmon Trainer",
        name_customized: !!st.nameCustomized,
        updated_at: Date.now()
      };
      await _api("PATCH", `/user_account?id=eq.${ref.account_id}`, acctPayload);
      console.log("[Sync] ✅ user_account patch ok (trainer_name + name_customized)");
    } catch (e) {
      /* 未執行 entry-nature / name migration 時後端未有 name_customized 欄
         → 退化為只推 trainer_name，避免連改名都同步唔到 */
      const msg = String(e.message || "");
      if (msg.indexOf("name_customized") >= 0 || msg.indexOf("schema cache") >= 0) {
        try {
          await _api("PATCH", `/user_account?id=eq.${ref.account_id}`, {
            trainer_name: st.playerName || "The PokéEngmon Trainer",
            updated_at: Date.now()
          });
          console.log("[Sync] ✅ user_account patch ok (trainer_name only, legacy schema)");
        } catch (e2) { console.warn("[Sync] ❌ patch account failed:", e2.message); }
      } else {
        console.warn("[Sync] ❌ patch account failed:", e.message);
      }
    }

    /* ---- 2. Push 所有 SM-2 cards ---- */
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

    /* ---- 3. Push 所有 SM-2 history（答題記錄）---- */
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

  /* ---------- Entry 非敏感欄位直寫（column grant 只開咗 active / updated_at / branch）---------- */
  async function patchEntry(entryId, fields) {
    const ref = _accountRef();
    if (!ref.isAuth) return;
    const body = { updated_at: Date.now() };
    if (typeof fields.active === "boolean") body.active = fields.active;
    if (fields.branch !== undefined && fields.branch !== null) body.branch = fields.branch;
    /* nature 由 v1.4.1 起可以直寫（column-level grant 只開放呢一欄，非經濟數值） */
    if (typeof fields.nature === "string" && fields.nature) body.nature = fields.nature;
    try {
      await _api("PATCH", `/user_entries?id=eq.${entryId}`, body);
    } catch (e) { console.warn("[Sync] patchEntry failed:", e.message); }
  }

  /* 拍檔切換：新 active=true、其他全部 false */
  async function pushActive(activeUid) {
    const ref = _accountRef();
    if (!ref.isAuth) return;
    try {
      await _api("PATCH", `/user_entries?id=eq.${activeUid}`, { active: true, updated_at: Date.now() });
      await _api("PATCH", `/user_entries?account_id=eq.${ref.account_id}&id=not.eq.${activeUid}&active=eq.true`, { active: false, updated_at: Date.now() });
    } catch (e) { console.warn("[Sync] pushActive failed:", e.message); }
  }

  /* ---------- 伺服器時間校正（寵物結算用 UTC+8 基準）----------
     讀 PostgREST 回應嘅 Date header；失敗就保留本機 offset，唔會拋錯。 */
  async function syncClock() {
    const c = cfg();
    if (!c || !c.restUrl || !window.Pet) return null;
    try {
      const res = await fetch(`${c.restUrl}/user_account?select=id&limit=1`, {
        headers: {
          "apikey": c.anonKey,
          "Authorization": "Bearer " + (window.SupabaseAuth && SupabaseAuth.currentToken
            ? SupabaseAuth.currentToken() : c.anonKey)
        }
      });
      const hdr = res.headers.get("date");
      if (!hdr) return null;
      const serverTs = Date.parse(hdr);
      if (!isFinite(serverTs)) return null;
      return Pet.setClockOffset(serverTs);
    } catch (e) {
      return null;
    }
  }

  /* ---------- 寵物狀態 / 背包（B 方案：前端結算，雲端只做備份）---------- */
  function petPayload(p) {
    if (!p) return null;
    return {
      pet_health: Math.max(0, Math.min(100, Number(p.health) || 0)),
      pet_streak: Number(p.streak) || 0,
      pet_last_fed_day: p.lastFedDay || null,
      pet_settled_day: p.settledDay || null,
      pet_decay_day: p.decayDay || null,
      pet_updated_at: p.updatedAt || new Date().toISOString()
    };
  }

  async function pushPet(entryId, pet) {
    const ref = _accountRef();
    if (!ref.isAuth || !entryId || !pet) return false;
    try {
      await _api("PATCH", `/user_entries?id=eq.${entryId}`, petPayload(pet));
      return true;
    } catch (e) { console.warn("[Sync] pushPet failed:", e.message); return false; }
  }

  async function pushItems(items) {
    const ref = _accountRef();
    if (!ref.isAuth || !items) return false;
    try {
      await _api("PATCH", `/user_account?id=eq.${ref.account_id}`, {
        items_food: Math.max(0, Number(items.food) || 0),
        items_premium: Math.max(0, Number(items.premium) || 0),
        items_revive: Math.max(0, Number(items.revive) || 0)
      });
      return true;
    } catch (e) { console.warn("[Sync] pushItems failed:", e.message); return false; }
  }

  return {
    queueUpsert,
    queueHistory,
    clearQueue,
    pull,
    pushState,
    patchEntry,
    pushActive,
    syncClock,
    pushPet,
    pushItems,
    flush: () => _flush(),
    isEnabled: () => !!(cfg() && cfg().anonKey && (window.SupabaseAuth ? SupabaseAuth.isEnabled() : true))
  };
})();
