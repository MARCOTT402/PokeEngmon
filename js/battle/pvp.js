/* ============================================================
   PokeEngmon Battle - PvP 網絡層（Task 9）
   純 fetch + REST polling（唔用 supabase-js / websocket）。
   同步策略：battles row 存共同 seed，雙方客戶端各自模擬
   （rng.js 保證一致），每回合只交換 action：
     { turn: N, kind: "move", moveIdx } | { turn: N, kind: "switch", idx }
   只接受 turn == 本地回合+1 嘅 action，舊 turn 無視 → 唔使清 action。
   配對規則：uid 細嗰個做莊起 battle row（p1），避免撞單。
   ============================================================ */

const PvpNet = (() => {
  const MATCH_TIMEOUT_MS = 60000;   /* 配對上限 60s */
  const ACTION_TIMEOUT_MS = 45000;  /* 等對手出招上限 45s */
  const STALE_MS = 90000;           /* 配對池 90s 以上當死屍，無視 */
  const POLL_MS = 1800;

  function myUid() {
    return (window.SupabaseAuth && SupabaseAuth.currentUser && SupabaseAuth.currentUser())
      ? SupabaseAuth.currentUser().id : null;
  }

  /* ---------- REST wrapper（同 sync.js 同款） ---------- */
  async function api(method, path, body, extraPrefer) {
    const c = window.SUPABASE_CONFIG;
    if (!c || !c.anonKey) throw new Error("Supabase config missing");
    const headers = {
      "apikey": c.anonKey,
      "Authorization": "Bearer " + (window.SupabaseAuth && SupabaseAuth.currentToken
        ? SupabaseAuth.currentToken() : c.anonKey),
      "Content-Type": "application/json",
      "Prefer": extraPrefer || "return=representation"
    };
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(c.restUrl + path, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`PvP API ${res.status}: ${txt.slice(0, 160)}`);
    }
    return res.json().catch(() => []);
  }

  /* ---------- 通用輪詢：返 cancel fn ---------- */
  function poll(fn, ms) {
    let stopped = false;
    (async function loop() {
      while (!stopped) {
        try { await fn(); } catch (e) { console.warn("[PvP] poll error:", e); }
        if (stopped) break;
        await new Promise(r => setTimeout(r, ms));
      }
    })();
    return () => { stopped = true; };
  }
  function pollOnce(fn, ms, isDone) {
    /* 每 ms 跑一次 fn，isDone(result) 真就 resolve(result)；返 Promise，帶 cancel */
    let cancel;
    const p = new Promise((resolve, reject) => {
      cancel = poll(async () => {
        const r = await fn();
        if (isDone(r)) { cancel(); resolve(r); }
      }, ms);
    });
    p.cancel = () => cancel && cancel();
    return p;
  }

  /* ============================================================
     配對
     ============================================================ */
  async function leavePool() {
    const uid = myUid(); if (!uid) return;
    await api("DELETE", `/matchmaking?uid=eq.${uid}`, undefined, "return=minimal").catch(() => {});
  }

  /* 搵未過期嘅其他玩家（最早入池嗰個） */
  async function findOpponent() {
    const uid = myUid();
    const rows = await api("GET", `/matchmaking?uid=neq.${uid}&created_at=gt.${Date.now() - STALE_MS}&order=created_at.asc&limit=1`);
    return rows[0] || null;
  }

  /* 搵人哋開畀我嘅局（我係 p2） */
  async function findBattleForMe() {
    const uid = myUid();
    const rows = await api("GET", `/battles?p2_uid=eq.${uid}&state=eq.active&created_at=gt.${Date.now() - STALE_MS}&order=created_at.desc&limit=1`);
    return rows[0] || null;
  }

  /* 主流程：入池 → 輪詢。onMatched(battle, mySide, foeUid) 只會觸發一次 */
  function matchmake(teamSize, cbs) {
    const uid = myUid();
    if (!uid) { cbs.onError && cbs.onError(new Error("not logged in")); return () => {}; }
    let done = false, cancelPoll = null, myRowId = null;
    const startedAt = Date.now();

    (async () => {
      try {
        await leavePool();   /* 清走自己舊 row */
        const rows = await api("POST", "/matchmaking", { uid, team_size: teamSize });
        myRowId = rows[0] && rows[0].id;
      } catch (e) { cbs.onError && cbs.onError(e); done = true; return; }

      cancelPoll = poll(async () => {
        if (done) return;
        if (Date.now() - startedAt > MATCH_TIMEOUT_MS) {
          done = true; cancelPoll(); await leavePool();
          cbs.onTimeout && cbs.onTimeout();
          return;
        }
        /* A. 有人開咗局畀我？（我係 p2） */
        const b = await findBattleForMe();
        if (b) {
          done = true; cancelPoll(); await leavePool();
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
              team_size: teamSize, seed
            });
            done = true; cancelPoll(); await leavePool();
            cbs.onMatched(created[0], "p1", opp.uid);
          } catch (e) { cbs.onError && cbs.onError(e); done = true; cancelPoll(); }
        }
        /* C. uid 大 → 等對方開局（下個 poll A 會接到） */
      }, POLL_MS);
    })();

    return () => {   /* cancel */
      done = true;
      if (cancelPoll) cancelPoll();
      leavePool();
    };
  }

  /* ============================================================
     對戰回合交換
     ============================================================ */
  async function fetchBattle(battleId) {
    const rows = await api("GET", `/battles?id=eq.${battleId}&limit=1`);
    return rows[0] || null;
  }

  /* 交隊伍：serialized entries 陣列（chainKey/dexId/level/ivs/evs/moves/nature） */
  async function submitTeam(battleId, side, team) {
    const col = side === "p1" ? "p1_team" : "p2_team";
    await api("PATCH", `/battles?id=eq.${battleId}`, { [col]: team, updated_at: Date.now() }, "return=minimal");
  }

  /* 等雙方隊伍齊（或者對手已經投降走人） */
  function waitForTeams(battleId) {
    return pollOnce(async () => fetchBattle(battleId), POLL_MS,
      b => b && ((b.p1_team && b.p1_team.length && b.p2_team && b.p2_team.length) || b.state === "finished"));
  }

  /* 出招／換寵：寫落自己嗰欄，附 turn 防舊 action 污染 */
  async function submitAction(battleId, side, turn, action) {
    const col = side === "p1" ? "p1_action" : "p2_action";
    await api("PATCH", `/battles?id=eq.${battleId}`,
      { [col]: Object.assign({ turn }, action), updated_at: Date.now() }, "return=minimal");
  }

  /* 等對手同一 turn 嘅 action；對手投降（state finished）都會即刻返 */
  function waitForOpponentAction(battleId, foeCol, turn) {
    return pollOnce(async () => fetchBattle(battleId), POLL_MS,
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
    submitAction, waitForOpponentAction, finishBattleRow
  };
})();
