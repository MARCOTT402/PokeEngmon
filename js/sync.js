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
  async function _api(method, path, body, extra) {
    const c = cfg();
    if (!c || !c.anonKey) throw new Error("Supabase config missing");
    const url = c.restUrl + path;
    const NET_OPT = { timeout: 20000, quiet: true, where: "sync" + path.split("?")[0] };
    /* 經 SupabaseAuth.authedFetch（Rule 96）：timeout、token 續期、401 重試、冇登入用 anon key；
       舊做法 currentToken() 冇登入時會送 "Bearer null" */
    const send = (window.SupabaseAuth && SupabaseAuth.authedFetch)
      ? (u, o) => SupabaseAuth.authedFetch(u, o, NET_OPT)
      : (u, o) => fetch(u, Object.assign({}, o, { headers: Object.assign({ apikey: c.anonKey, Authorization: "Bearer " + c.anonKey }, o.headers) }));
    const headers = {
      "Content-Type": "application/json",
      "Prefer": path.includes("on_conflict")
        ? "return=representation,resolution=merge-duplicates"
        : "return=representation"
    };
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    if (extra && extra.keepalive) opts.keepalive = true;   /* 頁面隱藏時送（body 上限 64 KB） */
    const res = await send(url, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${txt.slice(0, 120)}`);
    }
    return res.json().catch(() => []);
  }

  /* ---------- 背景 queue（Rule 98）----------
     - 持久化：寫入 localStorage（pokeengmon_sync_queue_v1），iOS 殺 App／斷網都唔會唔見；開 App 自動補送
     - 每行帶 account_id；flush 只送目前登入帳戶嘅行（其他帳戶嘅留低，等返佢登入）
     - 卡片按 card_id 去重（新嘅蓋舊）；history 上限 2000
     - 失敗 exponential backoff 1s → 2 → 4 … 上限 60s；離線唔試，online 事件即刻試
     - 4xx（除 401／408／429）＝資料本身有問題：成批丟棄＋Guard.report，唔好無限重試卡住後面
     - 頁面隱藏（visibilitychange hidden／pagehide）用 keepalive 送（iOS PWA 唯一可靠時機；beforeunload 唔 fire） */
  const QUEUE_KEY = "pokeengmon_sync_queue_v1";
  const MAX_HIST = 2000;
  let _pendingCards = [];
  let _pendingHistory = [];
  let _flushTimer = null;
  let _flushing = false;
  let _failures = 0;

  function _saveQueue() {
    try {
      if (!_pendingCards.length && !_pendingHistory.length) localStorage.removeItem(QUEUE_KEY);
      else localStorage.setItem(QUEUE_KEY, JSON.stringify({ cards: _pendingCards, history: _pendingHistory }));
    } catch (e) {}
  }
  function _loadQueue() {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "null");
      if (q && Array.isArray(q.cards)) _pendingCards = q.cards.filter(r => r && r.account_id && r.card_id);
      if (q && Array.isArray(q.history)) _pendingHistory = q.history.filter(r => r && r.account_id && r.card_id).slice(-MAX_HIST);
    } catch (e) { _pendingCards = []; _pendingHistory = []; }
  }
  _loadQueue();

  /* Reset Progress：丟棄未發送嘅卡片／歷史，避免 reset 後又被 queue 寫返上雲 */
  function clearQueue() {
    _pendingCards = [];
    _pendingHistory = [];
    clearTimeout(_flushTimer);
    _flushTimer = null;
    _failures = 0;
    _saveQueue();
  }

  function queueUpsert(card) {
    const ref = _accountRef();
    if (!ref.isAuth) { console.log("[Sync] queueUpsert skipped — not auth"); return; }
    const row = {
      account_id: ref.account_id,
      card_id: card.card_id,
      card_type: card.card_type,
      next_review_at: card.next_review_at,
      interval_days: card.interval_days,
      ease_factor: card.ease_factor,
      repetition: card.repetition,
      lapse_count: card.lapse_count,
      is_mastered: card.is_mastered,
      last_review_at: card.last_review_at || 0,
      updated_at: card.updated_at
    };
    /* 同一帳戶同一張卡只留最新（舊行仲未送都唔使送） */
    _pendingCards = _pendingCards.filter(r => !(r.account_id === row.account_id && r.card_id === row.card_id));
    _pendingCards.push(row);
    _saveQueue();
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
    if (_pendingHistory.length > MAX_HIST) _pendingHistory = _pendingHistory.slice(-MAX_HIST);
    _saveQueue();
    console.log("[Sync] queueHistory — card:", rec.card_id, "pending:", _pendingHistory.length);
    _scheduleFlush();
  }

  function _scheduleFlush(delay) {
    if (_flushTimer) return;
    const ms = delay != null ? delay : (_failures ? Math.min(60000, 1000 * Math.pow(2, _failures)) : 1000);
    _flushTimer = setTimeout(() => _flush(), ms);
  }

  /* 錯誤 message 由 _api 嘅 `${status}: …` 開頭；4xx 業務錯誤（除 401／408／429）重試都冇用 */
  function _isPoison(e) {
    const m = /^(\d{3}):/.exec((e && e.message) || "");
    const s = m ? Number(m[1]) : 0;
    return s >= 400 && s < 500 && s !== 401 && s !== 408 && s !== 429;
  }

  async function _flush(keepalive) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
    if (_flushing) return;
    const ref = _accountRef();
    if (!ref.isAuth) return;                                   /* 未登入：留低，等登入再送 */
    if (navigator.onLine === false) return;                    /* 離線：等 online 事件 */
    const mine = r => r.account_id === ref.account_id;
    const cards = _pendingCards.filter(mine);
    const hist = _pendingHistory.filter(mine);
    if (cards.length === 0 && hist.length === 0) return;

    _flushing = true;
    let failed = false;
    console.log("[Sync] _flush — cards:", cards.length, "history:", hist.length, keepalive ? "(keepalive)" : "");

    const drop = (list, sent) => list.filter(r => !sent.includes(r));
    if (cards.length > 0) {
      try {
        /* 用 on_conflict 做 upsert，避免重複 card 導致成批失敗 */
        await _api("POST", "/user_cards?on_conflict=account_id,card_id", cards.map(c => ({
          ...c,
          interval_days: Number(c.interval_days),
          ease_factor: Number(c.ease_factor),
          last_review_at: Number(c.last_review_at || 0)
        })), { keepalive });
        _pendingCards = drop(_pendingCards, cards);
        console.log("[Sync] ✅ flush cards ok:", cards.length);
      } catch (e) {
        if (_isPoison(e)) {
          _pendingCards = drop(_pendingCards, cards);
          if (window.Guard) Guard.report(e, { where: "sync/cards", kind: "net", silent: true });
        } else failed = true;
        console.warn("[Sync] ❌ flush cards failed:", e.message);
      }
    }
    if (hist.length > 0) {
      try {
        await _api("POST", "/user_history", hist, { keepalive });
        _pendingHistory = drop(_pendingHistory, hist);
        console.log("[Sync] ✅ flush history ok:", hist.length);
      } catch (e) {
        if (_isPoison(e)) {
          _pendingHistory = drop(_pendingHistory, hist);
          if (window.Guard) Guard.report(e, { where: "sync/history", kind: "net", silent: true });
        } else failed = true;
        console.warn("[Sync] ❌ flush history failed:", e.message);
      }
    }
    _saveQueue();
    _flushing = false;
    _failures = failed ? Math.min(_failures + 1, 6) : 0;
    if (failed || _pendingCards.some(mine) || _pendingHistory.some(mine)) _scheduleFlush();
  }

  function pendingCount() {
    return { cards: _pendingCards.length, history: _pendingHistory.length, failures: _failures };
  }

  /* 返回線上即刻補送；頁面隱藏用 keepalive 送（取代 beforeunload，iOS 唔會 fire） */
  window.addEventListener("online", () => { _failures = 0; _scheduleFlush(300); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") _flush(true);
  });
  window.addEventListener("pagehide", () => _flush(true));
  /* 開 App 時有上次未送完嘅（等 auth init 完先試） */
  if (_pendingCards.length || _pendingHistory.length) _scheduleFlush(3000);

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
        /* PvP 戰績（settle_battle RPC 喺 server 累積；本地只讀顯示用） */
        st.pvpWins = acct.pvp_wins ?? st.pvpWins ?? 0;
        st.pvpLosses = acct.pvp_losses ?? st.pvpLosses ?? 0;
        /* 每日對戰配額（server 記，跨機一致）＋累積場數（leaderboard / friends 用） */
        if (acct.battle_days && typeof acct.battle_days === "object") st.battleDays = acct.battle_days;
        if (acct.battle_ai_total != null) st.battleAiTotal = acct.battle_ai_total | 0;
        if (acct.battle_pvp_total != null) st.battlePvpTotal = acct.battle_pvp_total | 0;
        if (acct.trainer_avatar && /^[a-z0-9-]{1,32}$/.test(acct.trainer_avatar)) st.trainerAvatar = acct.trainer_avatar;
        else if (!acct.trainer_avatar && st.trainerAvatar && "trainer_avatar" in acct) setTimeout(() => pushAvatar(st.trainerAvatar), 0);
        if (acct.trainer_name && acct.trainer_name !== st.playerName) {
          st.playerName = acct.trainer_name;
          st.nameCustomized = true;
        }
        /* 明確記住「用家改過名」，避免之後新裝置再判定錯誤 */
        if (acct.name_customized === true) st.nameCustomized = true;
        /* 遺忘曲線模式 */
        if (acct.curve_mode && ["standard","junior","teen","adult"].indexOf(acct.curve_mode) >= 0) {
          st.curveMode = acct.curve_mode;
          try { if (window.SM2 && SM2.setMode) SM2.setMode(acct.curve_mode); } catch (e) {}
        }
        /* 背景音樂選擇：雲端有值就跟雲端；雲端 null（未揀過）但本機揀過 → backfill 上去 */
        if (typeof BGM_TRACKS !== "undefined") {
          if (acct.bgm_track && BGM_TRACKS[acct.bgm_track]) {
            if (st.bgmTrack !== acct.bgm_track) {
              st.bgmTrack = acct.bgm_track;
              setTimeout(() => { try { if (window.CaptureScene && CaptureScene.audio.switchTownTrack) CaptureScene.audio.switchTownTrack(); } catch (e) {} }, 0);
            }
          } else if (!acct.bgm_track && "bgm_track" in acct && st.bgmTrack && st.bgmTrack !== "flat-water" && BGM_TRACKS[st.bgmTrack]) {
            const local = st.bgmTrack;
            setTimeout(() => patchAccount({ bgm_track: local }), 0);
          }
        }
        /* Mega 石（第 4c 段）：只經 RPC 寫，雲端就係權威 */
        if (acct.items_mega && typeof acct.items_mega === "object") st.megaStones = Object.assign({}, acct.items_mega);
        /* 背包：雲端 null = 未上過雲 → 保留本機（首次 backfill 靠呢條規則） */
        if (acct.items_food != null || acct.items_premium != null || acct.items_revive != null || acct.items_stones != null) {
          const bag = (st.items && typeof st.items === "object") ? st.items : { food: 0, premium: 0, revive: 0 };
          if (acct.items_food != null) bag.food = Math.max(0, Number(acct.items_food) || 0);
          if (acct.items_premium != null) bag.premium = Math.max(0, Number(acct.items_premium) || 0);
          if (acct.items_revive != null) bag.revive = Math.max(0, Number(acct.items_revive) || 0);
          /* 樹果（第 3b 段）：雲端有 items_berries 就以雲端為準；food／premium 已一換一轉晒，本地歸 0 免得 pushItems 寫返上去 */
          if (acct.items_berries && typeof acct.items_berries === "object") {
            st.berries = Object.assign({}, acct.items_berries);
            bag.food = 0; bag.premium = 0;
          }
          /* 7 種藥：只經 RPC 寫，雲端數量就係權威 */
          if (acct.items_meds && typeof acct.items_meds === "object" && window.Pet && Pet.MED_KINDS) {
            Pet.MED_KINDS.forEach(k => { bag[k] = Math.max(0, Number(acct.items_meds[k]) || 0); });
          }
          const cloudStones = acct.items_stones;
          if (cloudStones && typeof cloudStones === "object") {
            STONE_KINDS.forEach(k => {
              if (cloudStones[k] != null) bag[k] = Math.max(0, Number(cloudStones[k]) || 0);
            });
          }
          st.items = bag;
        }
        /* 背包第 2 段：我的隊伍／背包設定（雲端 null = 未上過雲 → 保留本機） */
        if (Array.isArray(acct.my_team)) st.myTeam = acct.my_team.map(String).slice(0, 6);
        if (acct.bag_prefs && typeof acct.bag_prefs === "object") st.bagPrefs = acct.bag_prefs;
        if (Array.isArray(acct.dex_caught)) st.dexCaught = acct.dex_caught.map(Number).filter(n => n > 0);
        /* likes（trade 進化條件）：雲端未上過就保留本機 */
        if (acct.trainer_likes != null) {
          st.trainerLikes = Math.max(0, Number(acct.trainer_likes) || 0);
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
        /* 玩家自訂配招：雲端 move_loadout 優先；雲端未有但本地有（上雲前嘅舊配招）→ 補推上雲 */
        st.entries.forEach((ent, i) => {
          const cloudPref = normalized[i] && normalized[i].move_loadout;
          try { applyMoveLoadout(ent, cloudPref); } catch (e) {}
          if (!(Array.isArray(cloudPref) && cloudPref.length)) {
            const localPref = st.moveLoadouts && st.moveLoadouts[ent.uid];
            if (Array.isArray(localPref) && localPref.length && localPref.every(m => (ent.moves || []).includes(m))) {
              try { patchEntry(ent.uid, { move_loadout: localPref }); } catch (e) {}
            }
          }
        });
        /* activeUid：邊個 entry.active = true（用未 map 前 id，同 server row） */
        const activeEntry = normalized.find(e => e.active === true);
        st.activeUid = activeEntry ? activeEntry.id : (st.entries.length > 0 ? st.entries[0].uid : null);
        saveState();
        /* is_final backfill：舊 row 預設 false，本地 derive 話完全進化就補寫上雲，
           等 server RPC 唔會再將同鏈新寵當 dupe 落入呢啲舊 entry */
        st.entries.forEach((ent, i) => {
          if (ent.isFinal && normalized[i] && normalized[i].is_final !== true) {
            try { patchEntry(ent.uid, { is_final: true }); } catch (e) {}
          }
        });
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

    /* ---- 1. Patch user_account（淨 trainer_name + name_customized + curve_mode —— diamonds/totals 係 RPC-only）---- */
    try {
      const acctPayload = {
        trainer_name: st.playerName || "The PokéEngmon Trainer",
        name_customized: !!st.nameCustomized,
        curve_mode: st.curveMode || "standard",
        updated_at: Date.now()
      };
      await _api("PATCH", `/user_account?id=eq.${ref.account_id}`, acctPayload);
      console.log("[Sync] ✅ user_account patch ok (trainer_name + name_customized + curve_mode)");
    } catch (e) {
      /* 未執行 entry-nature / name / curve-mode migration 時後端未有對應欄
         → 退化為只推 trainer_name，避免連改名都同步唔到 */
      const msg = String(e.message || "");
      if (msg.indexOf("name_customized") >= 0 || msg.indexOf("curve_mode") >= 0 || msg.indexOf("schema cache") >= 0) {
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
            last_review_at: c.last_review_at || 0,
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
    /* 特性（非經濟數值）：同 nature 一樣開放直寫 */
    if (typeof fields.ability === "string" && fields.ability) body.ability = fields.ability;
    /* stone_used 唔再直寫：migration 20261106 收回 grant，只經 use_stone RPC（Rule 76：唔好留喺 PATCH body） */
    /* 完全進化旗幟：server RPC 靠佢決定同鏈再獲得係 dupe 定開新 row */
    if (typeof fields.is_final === "boolean") body.is_final = fields.is_final;
    if (typeof fields.favorite === "boolean") body.favorite = fields.favorite;
    /* 攜帶道具（held_item）唔再直寫：migration 20261105k 收回 grant，只經 hold_item RPC */
    /* 自訂配招（1–4 個招式 slug）：非經濟數值，column-level grant 開放直寫 */
    if (Array.isArray(fields.move_loadout) && fields.move_loadout.length) {
      body.move_loadout = fields.move_loadout.slice(0, 4).map(String);
    }
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
      const opt = { timeout: 8000, quiet: true, where: "sync/clock" };
      const res = (window.SupabaseAuth && SupabaseAuth.authedFetch)
        ? await SupabaseAuth.authedFetch(`${c.restUrl}/user_account?select=id&limit=1`, {}, opt)
        : await fetch(`${c.restUrl}/user_account?select=id&limit=1`, { headers: { apikey: c.anonKey, Authorization: "Bearer " + c.anonKey } });
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
  /* 舊 petPayload（pet_streak／pet_last_fed_day／pet_settled_day／pet_decay_day）已刪：migration 20261105i 拎走咗呢幾欄 */
  /* 狀態系統第一期：飽肚值／HP／狀態改由 care RPC 寫（client 冇 update 權），呢個 push 停用 */
  async function pushPet() { return false; }

  /* 背包第 2 段：my_team／bag_prefs（非經濟數值，column-level grant 開放直寫） */
  async function patchAccount(fields) {
    const ref = _accountRef();
    if (!ref.isAuth || !fields) return false;
    const body = {};
    if (Array.isArray(fields.my_team)) body.my_team = fields.my_team.slice(0, 6).map(String);
    if (typeof fields.trainer_avatar === "string" && /^[a-z0-9-]{1,32}$/.test(fields.trainer_avatar)) body.trainer_avatar = fields.trainer_avatar;
    if (fields.bag_prefs && typeof fields.bag_prefs === "object") body.bag_prefs = fields.bag_prefs;
    if (typeof fields.bgm_track === "string" && typeof BGM_TRACKS !== "undefined" && BGM_TRACKS[fields.bgm_track]) body.bgm_track = fields.bgm_track;
    if (!Object.keys(body).length) return false;
    try {
      await _api("PATCH", `/user_account?id=eq.${ref.account_id}`, body);
      return true;
    } catch (e) { console.warn("[Sync] patchAccount failed:", e.message); return false; }
  }

  /* 第 14 項：Trainer Avatar（user_account.trainer_avatar，column grant + check） */
  async function pushAvatar(id) { return patchAccount({ trainer_avatar: id }); }

  /* 背包數量（items_food／items_premium／items_revive／items_stones）唔再由 client 寫：
     migration 20261106／20261106b 收回 grant，只經 award_*／use_* RPC。保留空函數俾舊 call site 唔會爆 */
  async function pushItems() { return true; }

  return {
    queueUpsert,
    queueHistory,
    clearQueue,
    pull,
    pushState,
    pushAvatar,
    patchEntry,
    pushActive,
    syncClock,
    pushPet,
    pushItems,
    patchAccount,
    flush: () => _flush(),
    pendingCount,
    isEnabled: () => !!(cfg() && cfg().anonKey && (window.SupabaseAuth ? SupabaseAuth.isEnabled() : true))
  };
})();
