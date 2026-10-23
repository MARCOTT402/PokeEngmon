/* ============================================================
   PokeEngmon — Supabase Auth + RPC（零 SDK，純 fetch PostgREST）

   職責：
     1. Google OAuth popup 登入
     2. Email + Password 登入／註冊
     3. getSession / signOut / migrateAnonymous
     4. RPC 調用（防金手指核心：award_round_diamonds / settle_capture / add_exp）

   所有敏感操作走 RPC（server-side security definer），
   前端唔可以直接寫 user_account.diamonds 等受保護欄位。
   ============================================================ */

window.SupabaseAuth = (() => {

  /* ---------- Config ---------- */
  const cfg = () => window.SUPABASE_CONFIG || null;

  function _authHeaders() {
    const c = cfg();
    return {
      "apikey": c.anonKey,
      "Authorization": "Bearer " + (currentToken() || c.anonKey),
      "Content-Type": "application/json"
    };
  }

  /* ---------- Session token（存 LocalStorage）---------- */
  function _sessionKey() { return "pokeengmon_auth_session"; }

  function saveSession(session) {
    try { localStorage.setItem(_sessionKey(), JSON.stringify(session)); } catch (e) {}
  }
  function loadSession() {
    try {
      const raw = localStorage.getItem(_sessionKey());
      if (!raw) return null;
      const s = JSON.parse(raw);
      /* 過期檢查：Supabase JWT 一般 3600s */
      if (s.expires_at && s.expires_at * 1000 < Date.now()) return null;
      return s;
    } catch (e) { return null; }
  }
  function clearSession() {
    try { localStorage.removeItem(_sessionKey()); } catch (e) {}
  }
  function currentToken() {
    const s = loadSession();
    return s ? s.access_token : null;
  }
  function currentUser() {
    const s = loadSession();
    return s ? s.user : null;
  }

  /* ---------- OAuth (Google) ---------- */
  /* Supabase OAuth：popup window → callback 自行解析 */
  async function signInWithGoogle() {
    const c = cfg();
    /* 用 redirectTo + provider=google popup */
    const url = `${c.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(window.location.href)}&skip_http_redirect=false`;
    const w = window.open(url, "pokeengmon-google", "width=500,height=600");

    /* Poll popup 直到關閉 */
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        try {
          if (w.closed) {
            clearInterval(timer);
            resolve(loadSession());
          }
        } catch (e) {}
      }, 500);
      setTimeout(() => {
        if (!w.closed) { w.close(); clearInterval(timer); reject(new Error("timeout")); }
      }, 60000);
    });
  }

  /* ---------- Email + Password ---------- */
  async function signInWithEmail(email, password) {
    const c = cfg();
    const res = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "apikey": c.anonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error("Login failed: " + res.status);
    const session = await res.json();
    saveSession(session);
    return session;
  }

  async function signUpWithEmail(email, password) {
    const c = cfg();
    const res = await fetch(`${c.url}/auth/v1/signup`, {
      method: "POST",
      headers: { "apikey": c.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error("Sign up failed: " + res.status);
    const session = await res.json();
    saveSession(session);
    return session;
  }

  /* ---------- Sign Out ---------- */
  async function signOut() {
    const c = cfg();
    try {
      await fetch(`${c.url}/auth/v1/logout`, {
        method: "POST",
        headers: _authHeaders()
      });
    } catch (e) {}
    clearSession();
  }

  /* ---------- RPC 調用（防金手指核心）---------- */
  async function rpc(fnName, args) {
    const c = cfg();
    const res = await fetch(`${c.restUrl}/rpc/${fnName}`, {
      method: "POST",
      headers: _authHeaders(),
      body: JSON.stringify(args || {})
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`RPC ${fnName} failed: ${res.status} ${txt.slice(0, 120)}`);
    }
    return res.json().catch(() => null);
  }

  /* 防金手指 RPC 包裝：獎勵 diamonds（server 計算，前端唔可以硬寫）*/
  async function awardRoundDiamonds(score, total) {
    const user = currentUser();
    if (!user) return 0;   /* 未登入 → diamonds 唔走 RPC（本地）*/
    try {
      return await rpc("award_round_diamonds", {
        account_uuid: user.id,
        score: score,
        total: total
      });
    } catch (e) {
      console.warn("[RPC] award_round_diamonds failed (fallback local):", e.message);
      return null;
    }
  }

  /* 防金手指 RPC：捕捉結算（server 決定成功／失敗）*/
  async function settleCapture(dexId, attempts) {
    const user = currentUser();
    if (!user) return null;   /* 未登入 → 本地 80% 邏輯 */
    try {
      return await rpc("settle_capture", {
        account_uuid: user.id,
        dex_id: dexId,
        attempts: attempts
      });
    } catch (e) {
      console.warn("[RPC] settle_capture failed (fallback local):", e.message);
      return null;
    }
  }

  /* Migrate：匿名 device_id 嘅資料搬到 auth.uid */
  async function migrateAnonymous(deviceId) {
    const user = currentUser();
    if (!user || !deviceId) return null;
    try {
      await rpc("migrate_anonymous_to_auth", {
        new_auth_uuid: user.id,
        old_device_id: deviceId
      });
      return true;
    } catch (e) {
      console.warn("[RPC] migrate_anonymous failed:", e.message);
      return null;
    }
  }

  /* ---------- Public API ---------- */
  return {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    currentUser,
    loadSession,
    awardRoundDiamonds,
    settleCapture,
    migrateAnonymous,
    isLoggedIn: () => !!currentUser(),
    isEnabled: () => !!(cfg() && cfg().anonKey)
  };
})();
