/* ============================================================
   PokeEngmon - PvP Realtime（原生 WebSocket，零依賴）

   Supabase Realtime（Phoenix protocol）直接訂閱 battles 表嘅 UPDATE：
     postgres_changes filter = id=eq.<battleId>
   收到新 row 即刻通知 subscriber，唔使等輪詢。
   RLS 仍然生效：join 用登入 access_token，只會收到自己有份嘅 row。

   設計重點：
   - 每個 battleId 一條 channel，多個 subscriber 共用同一條 WS
   - 心跳 25s；斷線指數退避重連（1→2→4→8→cap 10s）
   - join 失敗 / 連續失敗 → degraded=true（pvp.js 會繼續用輪詢 fallback）
   - 最後一個 subscriber 走咗 60s 才關 WS（回合之間唔使反覆握手）
   - 任何錯誤都唔 throw，唔會影響對戰流程
   ============================================================ */

const PvpRealtime = (() => {
  const HEARTBEAT_MS = 25000;
  const IDLE_CLOSE_MS = 60000;
  const MAX_BACKOFF_MS = 10000;

  const channels = new Map(); /* battleId → channel */

  function wsURL() {
    const c = window.SUPABASE_CONFIG;
    if (!c || !c.url || !c.anonKey) return null;
    const host = String(c.url).replace(/^https?:\/\//, "");
    const ref = host.split(".")[0];
    if (!ref) return null;
    return `wss://${ref}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(c.anonKey)}&vsn=1.0.0`;
  }

  function token() {
    return (window.SupabaseAuth && SupabaseAuth.currentToken)
      ? SupabaseAuth.currentToken() : null;
  }

  function send(ch, event, payload, topic) {
    if (!ch.ws || ch.ws.readyState !== 1) return false;
    ch.refSeq += 1;
    try {
      ch.ws.send(JSON.stringify({
        topic: topic || ch.topic,
        event,
        payload: payload || {},
        ref: String(ch.refSeq)
      }));
      return true;
    } catch (e) { return false; }
  }

  function deliver(ch, record) {
    if (!record || !record.id) return;
    ch.lastRecord = record;
    ch.subs.forEach(cb => {
      try { cb(record); } catch (e) { console.warn("[Realtime] subscriber error:", e); }
    });
  }

  function stopHeartbeat(ch) {
    if (ch.hb) { clearInterval(ch.hb); ch.hb = null; }
  }

  function connect(ch) {
    if (ch.closed) return;
    const url = wsURL();
    if (!url) { ch.degraded = true; return; }

    let ws;
    try { ws = new WebSocket(url); } catch (e) {
      console.warn("[Realtime] WebSocket unavailable:", e && e.message);
      ch.degraded = true;
      return;
    }
    ch.ws = ws;

    ws.onopen = () => {
      ch.retries = 0;
      const tk = token();
      send(ch, "phx_join", {
        config: {
          postgres_changes: [{
            event: "UPDATE",
            schema: "public",
            table: "battles",
            filter: "id=eq." + ch.battleId
          }]
        },
        access_token: tk || undefined
      });
      stopHeartbeat(ch);
      ch.hb = setInterval(() => {
        send(ch, "heartbeat", {}, "phoenix");
      }, HEARTBEAT_MS);
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }

      if (msg.event === "postgres_changes") {
        const p = msg.payload || {};
        const d = p.data || p;
        const rec = d.record || p.record;
        if (rec) deliver(ch, rec);
        return;
      }

      if (msg.event === "phx_reply" && msg.payload && msg.payload.status === "error") {
        /* join 被拒（RLS / token 過期）→ 唔再靠 realtime，交返輪詢 */
        ch.degraded = true;
        console.warn("[Realtime] join failed:", msg.payload.response || msg.payload);
        try { ws.close(); } catch (e) {}
      }
    };

    ws.onerror = () => { /* onclose 會處理重連 */ };

    ws.onclose = () => {
      stopHeartbeat(ch);
      if (ch.closed) return;
      ch.retries += 1;
      if (ch.retries >= 3) ch.degraded = true;
      const backoff = Math.min(1000 * Math.pow(2, ch.retries - 1), MAX_BACKOFF_MS);
      ch.retryTimer = setTimeout(() => connect(ch), backoff);
    };
  }

  function closeChannel(ch) {
    ch.closed = true;
    stopHeartbeat(ch);
    if (ch.retryTimer) { clearTimeout(ch.retryTimer); ch.retryTimer = null; }
    if (ch.idleTimer) { clearTimeout(ch.idleTimer); ch.idleTimer = null; }
    try { if (ch.ws) ch.ws.close(); } catch (e) {}
    channels.delete(ch.battleId);
  }

  /* 訂閱某場 battle 嘅 UPDATE；回傳 unsubscribe */
  function subscribe(battleId, cb) {
    if (!battleId || typeof cb !== "function") return () => {};

    let ch = channels.get(battleId);
    if (!ch) {
      ch = {
        battleId,
        topic: "realtime:pvp:" + battleId,
        ws: null,
        subs: new Set(),
        lastRecord: null,
        refSeq: 0,
        retries: 0,
        degraded: false,
        closed: false,
        hb: null,
        retryTimer: null,
        idleTimer: null
      };
      channels.set(battleId, ch);
      connect(ch);
    }

    if (ch.idleTimer) { clearTimeout(ch.idleTimer); ch.idleTimer = null; }
    ch.subs.add(cb);

    /* 已經有最新 row（例如上一個 turn）→ 即刻遞交，caller 自己用 turn/state 判斷 */
    if (ch.lastRecord) {
      const cached = ch.lastRecord;
      setTimeout(() => {
        try { if (ch.subs.has(cb)) cb(cached); } catch (e) {}
      }, 0);
    }

    return () => {
      ch.subs.delete(cb);
      if (ch.subs.size === 0 && !ch.closed) {
        ch.idleTimer = setTimeout(() => closeChannel(ch), IDLE_CLOSE_MS);
      }
    };
  }

  function isDegraded(battleId) {
    const ch = channels.get(battleId);
    return !!(ch && ch.degraded);
  }

  return { subscribe, isDegraded };
})();

window.PvpRealtime = PvpRealtime;

/* ES module 過渡期（總計劃 P2.3；Rule 119）：index.html 用 type="module" 載入，頂層名唔會自動變全域 → 明確掛上 globalThis，classic script 照用 */
Object.assign(globalThis, { PvpRealtime });
