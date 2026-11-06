/* ============================================================
   PokeEngmon Battle - PvP 網絡層（Task 9）
   純 fetch + REST；等待對手改用 Supabase Realtime（WebSocket）先行，
   輪詢只做 safety fallback（realtime.js）。
   同步策略：battles row 存共同 seed，雙方客戶端各自模擬
   （rng.js 保證一致），每回合只交換 action：
     { turn: N, kind: "move", moveIdx } | { turn: N, kind: "switch", idx }
     | { turn: N, kind: "item", itemId }（只限戰前投票准用藥）
   只接受 turn == 本地回合+1 嘅 action，舊 turn 無視 → 唔使清 action。
   配對規則：uid 細嗰個做莊起 battle row（p1），避免撞單。
   好友局（battles.is_friend = true）唔會落入隨機配對池。
   ============================================================ */

const PvpNet = (() => {
  const MATCH_TIMEOUT_MS = 60000;   /* 配對上限 60s */
  const ACTION_TIMEOUT_MS = 45000;  /* 等對手出招上限 45s */
  const STALE_MS = 90000;           /* 配對池 90s 以上當死屍，無視 */
  const FIRST_POLL_MS = 500;        /* 配對首次間隔 */
  const MAX_POLL_MS = 1500;         /* 配對最大間隔 */
  const FALLBACK_FIRST_MS = 1200;   /* realtime 未到 → 第一次 safety poll */
  const FALLBACK_MAX_MS = 2200;

  /* 只攞必要欄位（回傳 payload 細啲，turn 交換更快） */
  const SELECT_BATTLE = "id,state,seed,winner,team_size,p1_uid,p2_uid,p1_action,p2_action,p1_team,p2_team,is_friend,p1_vote,p2_vote";

  function myUid() {
    return (window.SupabaseAuth && SupabaseAuth.currentUser && SupabaseAuth.currentUser())
      ? SupabaseAuth.currentUser().id : null;
  }

  /* ---------- REST wrapper（同 sync.js 同款） ---------- */
  async function api(method, path, body, extraPrefer) {
    const c = window.SUPABASE_CONFIG;
    if (!c || !c.anonKey) throw new Error("Supabase config missing");
    /* PvP 有自己嘅等待／放棄提示，網絡層唔彈 toast；10 秒 timeout 防對戰卡死 */
    const NET_OPT = { timeout: 10000, quiet: true, where: "pvp" + path.split("?")[0] };
    /* 經 SupabaseAuth.authedFetch（Rule 96）：timeout、token 續期、401 重試、冇登入用 anon key；
       舊做法 currentToken() 冇登入時會送 "Bearer null" */
    const send = (window.SupabaseAuth && SupabaseAuth.authedFetch)
      ? (u, o) => SupabaseAuth.authedFetch(u, o, NET_OPT)
      : (u, o) => fetch(u, Object.assign({}, o, { headers: Object.assign({ apikey: c.anonKey, Authorization: "Bearer " + c.anonKey }, o.headers) }));
    const headers = {
      "Content-Type": "application/json",
      "Prefer": extraPrefer || "return=representation"
    };
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await send(c.restUrl + path, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`PvP API ${res.status}: ${txt.slice(0, 160)}`);
    }
    return res.json().catch(() => []);
  }

  /* ============================================================
     配對
     ============================================================ */
  async function leavePool() {
    const uid = myUid(); if (!uid) return;
    await api("DELETE", `/matchmaking?uid=eq.${uid}`, undefined, "return=minimal").catch(() => {});
  }

  /* 搵未過期嘅其他玩家（最早入池嗰個）；好友局唔會入池 */
  async function findOpponent() {
    const uid = myUid();
    const rows = await api("GET", `/matchmaking?uid=neq.${uid}&created_at=gt.${Date.now() - STALE_MS}&order=created_at.asc&limit=1`);
    return rows[0] || null;
  }

  /* 搵人哋開畀我嘅隨機局（我係 p2）；is_friend=eq.false 防止劫走好友局 */
  async function findBattleForMe() {
    const uid = myUid();
    const rows = await api("GET",
      `/battles?p2_uid=eq.${uid}&state=eq.active&is_friend=eq.false&created_at=gt.${Date.now() - STALE_MS}&order=created_at.desc&limit=1&select=${SELECT_BATTLE}`);
    return rows[0] || null;
  }

  /* 主流程：入池 → 自適應輪詢。onMatched(battle, mySide, foeUid) 只會觸發一次 */
  function matchmake(teamSize, cbs) {
    const uid = myUid();
    if (!uid) { cbs.onError && cbs.onError(new Error("not logged in")); return () => {}; }

    let done = false;
    let timer = null;
    let myRowId = null;
    let delay = FIRST_POLL_MS;
    const startedAt = Date.now();

    function stop() {
      done = true;
      if (timer) { clearTimeout(timer); timer = null; }
      document.removeEventListener("visibilitychange", onVisibility);
    }

    function schedule() {
      if (done || document.hidden) return;
      timer = setTimeout(tick, delay);
      delay = Math.min(Math.round(delay * 1.4), MAX_POLL_MS);
    }

    async function enterPool() {
      await leavePool();
      const rows = await api("POST", "/matchmaking", { uid, team_size: teamSize });
      myRowId = (rows[0] && rows[0].id) || null;
    }

    async function tick() {
      timer = null;
      if (done || document.hidden) return;
      if (Date.now() - startedAt > MATCH_TIMEOUT_MS) {
        stop();
        await leavePool();
        cbs.onTimeout && cbs.onTimeout();
        return;
      }
      try {
        /* A. 有人開咗隨機局畀我？（我係 p2） */
        const b = await findBattleForMe();
        if (b) {
          stop();
          await leavePool();
          cbs.onMatched(b, "p2", b.p1_uid);
          return;
        }
        /* B. 池入面有人 + 我 uid 細 → 我做莊開局 */
        const opp = await findOpponent();
        if (opp && uid < opp.uid) {
          const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
          try {
            const created = await api("POST", "/battles", {
              mode: "pvp", p1_uid: uid, p2_uid: opp.uid,
              team_size: teamSize, seed, is_friend: false
            });
            stop();
            await leavePool();
            cbs.onMatched(created[0], "p1", opp.uid);
            return;
          } catch (e) {
            console.warn("[PvP] create battle failed:", e);
          }
        }
        /* C. uid 大 → 等對方開局（下個 poll A 會接到） */
      } catch (e) {
        console.warn("[PvP] poll error:", e);
      }
      schedule();
    }

    /* 分頁隱藏：停止發 request 並離開池；返嚟再入池（避免「人唔喺度但被配對」） */
    async function onVisibility() {
      if (done) return;
      if (document.hidden) {
        if (timer) { clearTimeout(timer); timer = null; }
        myRowId = null;
        await leavePool();
        return;
      }
      if (!myRowId) {
        try { await enterPool(); } catch (e) { /* 下個 tick 再試 */ }
        delay = FIRST_POLL_MS;
        schedule();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    (async () => {
      try {
        await enterPool();
      } catch (e) {
        stop();
        cbs.onError && cbs.onError(e);
        return;
      }
      schedule();
    })();

    return () => {
      stop();
      leavePool();
    };
  }

  /* ============================================================
     對戰回合交換
     ============================================================ */
  async function fetchBattle(battleId) {
    const rows = await api("GET", `/battles?id=eq.${battleId}&select=${SELECT_BATTLE}&limit=1`);
    return rows[0] || null;
  }

  /* 交隊伍：serialized entries 陣列（chainKey/dexId/level/ivs/evs/moves/nature） */
  async function submitTeam(battleId, side, team) {
    const col = side === "p1" ? "p1_team" : "p2_team";
    await api("PATCH", `/battles?id=eq.${battleId}`, { [col]: team, updated_at: Date.now() }, "return=minimal");
  }

  /* realtime 先行；safety 輪詢 1.2s → ×1.6 → cap 2.2s。
     回傳 Promise<row>，帶 .cancel() */
  function waitRow(battleId, isDone) {
    let settled = false;
    let unsub = null;
    let timer = null;
    let delay = FALLBACK_FIRST_MS;
    let resolveFn = null;

    const p = new Promise((resolve) => { resolveFn = resolve; });

    function cleanup() {
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
      if (timer) { clearTimeout(timer); timer = null; }
    }
    function settle(row) {
      if (settled) return;
      settled = true;
      cleanup();
      resolveFn(row);
    }
    function check(row) {
      if (!row || settled) return;
      if (isDone(row)) settle(row);
    }

    if (window.PvpRealtime) {
      try { unsub = PvpRealtime.subscribe(battleId, check); } catch (e) { unsub = null; }
    }

    async function pollTick() {
      timer = null;
      if (settled) return;
      let row = null;
      try { row = await fetchBattle(battleId); } catch (e) {}
      check(row);
      if (settled) return;
      delay = Math.min(Math.round(delay * 1.6), FALLBACK_MAX_MS);
      timer = setTimeout(pollTick, delay);
    }
    timer = setTimeout(pollTick, FALLBACK_FIRST_MS);

    p.cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
    };
    return p;
  }

  /* 等雙方隊伍齊（或者對手已經投降走人） */
  function waitForTeams(battleId) {
    return waitRow(battleId,
      b => b && ((b.p1_team && b.p1_team.length && b.p2_team && b.p2_team.length) || b.state === "finished"));
  }

  /* ============================================================
     戰前投票（出戰數量／准唔准用藥／准唔准自願換 Pokémon）
     vote = { size: 1–6, cap: 自己可出戰數, items: bool, switch: bool }
     ============================================================ */
  async function submitVote(battleId, side, vote) {
    const col = side === "p1" ? "p1_vote" : "p2_vote";
    await api("PATCH", `/battles?id=eq.${battleId}`, { [col]: vote, updated_at: Date.now() }, "return=minimal");
  }

  /* 等雙方票齊（或者對手已經走咗） */
  function waitForVotes(battleId) {
    return waitRow(battleId, b => b && ((b.p1_vote && b.p2_vote) || b.state === "finished"));
  }

  /* p1 將最終人數寫返 row 做紀錄（唔影響雙方各自計算） */
  async function recordTeamSize(battleId, size) {
    await api("PATCH", `/battles?id=eq.${battleId}`, { team_size: size, updated_at: Date.now() }, "return=minimal").catch(() => {});
  }

  /* seed → 獨立嘅偽隨機 bit（唔用 BattleRng，免得打亂戰鬥 RNG 序列） */
  function seedBit(seed, salt) {
    let x = ((Number(seed) >>> 0) ^ Math.imul(salt + 1, 0x9E3779B1)) >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    x = Math.imul(x ^ (x >>> 16), 0x45D9F3B) >>> 0;
    return (x >>> 7) & 1;
  }

  /* 雙方客戶端用同一條規則計最終規則：
     意見一致 → 照用；唔一致 → battle seed 喺兩個之中隨機抽（雙方結果一樣）。
     人數最後再夾喺雙方可出戰數之內。 */
  function resolveRules(seed, v1, v2) {
    const a = normVote(v1), b = normVote(v2);
    const pick = (x, y, salt) => (x === y ? x : (seedBit(seed, salt) ? y : x));
    const rawSize = pick(a.size, b.size, 1);
    const size = Math.max(1, Math.min(rawSize, a.cap, b.cap));
    return {
      size,
      items: !!pick(a.items, b.items, 2),
      switch: !!pick(a.switch, b.switch, 3),
      votes: { p1: a, p2: b }
    };
  }

  /* 缺票／壞票 → 預設：3 隻（之後夾 cap）、准用藥、准換 */
  function normVote(v) {
    v = v || {};
    const cap = Math.max(1, Math.min(6, Math.round(Number(v.cap)) || 1));
    const n = Math.round(Number(v.size));
    const size = (n >= 1 && n <= 6) ? n : 3;
    return { size, cap, items: v.items !== false, switch: v.switch !== false };
  }

  /* 出招／換寵：寫落自己嗰欄，附 turn 防舊 action 污染 */
  async function submitAction(battleId, side, turn, action) {
    const col = side === "p1" ? "p1_action" : "p2_action";
    await api("PATCH", `/battles?id=eq.${battleId}`,
      { [col]: Object.assign({ turn }, action), updated_at: Date.now() }, "return=minimal");
  }

  /* 等對手同一 turn 嘅 action；對手投降（state finished）都會即刻返 */
  function waitForOpponentAction(battleId, foeCol, turn) {
    return waitRow(battleId,
      b => b && ((b[foeCol] && b[foeCol].turn === turn) || b.state === "finished"));
  }

  /* 投降／完場：winner 係 row 視角 "p1"|"p2" */
  async function finishBattleRow(battleId, winner) {
    await api("PATCH", `/battles?id=eq.${battleId}`,
      { state: "finished", winner, updated_at: Date.now() }, "return=minimal").catch(() => {});
  }

  return {
    ACTION_TIMEOUT_MS,
    matchmake, leavePool,
    fetchBattle, submitTeam, waitForTeams,
    submitVote, waitForVotes, recordTeamSize, resolveRules, normVote,
    submitAction, waitForOpponentAction, finishBattleRow
  };
})();
