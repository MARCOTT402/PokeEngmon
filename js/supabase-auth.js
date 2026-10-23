/* ============================================================
   PokeEngmon - Supabase Auth（Google OAuth popup 模式）
   零依賴、純 fetch + localStorage
   Session 存 pokeengmon_auth_session
   ============================================================ */

const SupabaseAuth = {
  _session: null,
  URL: "https://gcfoeaxxeerqixaistaf.supabase.co",
  ANON_KEY: window.__SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjZm9lYXh4ZWVycWl4YWlzdGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MzU2NDQsImV4cCI6MjEwODMxMTY0NH0.w1tqs-Q-qEKASs63eVOt0OhLO2mKaHnAzM15w6OtGZc",

  init() {
    /* 1. 優先檢查 OAuth redirect 嘅 hash fragment（登入完 Supabase redirect 返嚟） */
    if (this.tryParseSessionFromURL()) {
      console.log("[Auth] ✅ Parsed session from redirect hash");
      return;
    }
    /* 2. 嘗試從 localStorage restore */
    try {
      const raw = localStorage.getItem("pokeengmon_auth_session");
      if (raw) {
        const s = JSON.parse(raw);
        if (s.expires_at && s.expires_at > Math.floor(Date.now() / 1000)) {
          this._session = s;
          console.log("[Auth] ✅ Restored session from localStorage");
        } else {
          localStorage.removeItem("pokeengmon_auth_session");
          console.log("[Auth] ⚠️ Session expired, cleared");
        }
      }
    } catch (e) { console.warn("[Auth] init error:", e); }
  },

  isLoggedIn() {
    return this._session && this._session.user && this._session.user.id;
  },

  currentUser() {
    return this._session?.user || null;
  },

  saveSession(session) {
    this._session = session;
    localStorage.setItem("pokeengmon_auth_session", JSON.stringify(session));
  },

  /* ---------- Google OAuth（redirect 模式，零 popup） ---------- */
  async signInWithGoogle() {
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    const url = `${this.URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}&response_type=token&scope=email+profile`;
    /* redirect 去 Supabase OAuth → 完成後 Supabase redirect 返嚟帶 hash fragment */
    window.location.href = url;
    /* 下面嘅代碼永遠唔會執行（redirect 會中斷），但留住俾 await 語義 */
    return new Promise(() => {});
  },

  /* ---------- 從 URL hash fragment 解析 session ---------- */
  tryParseSessionFromURL() {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.includes("access_token=")) return null;
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    if (!token) return null;
    const session = {
      access_token: token,
      refresh_token: params.get("refresh_token"),
      expires_at: Math.floor(Date.now() / 1000) + parseInt(params.get("expires_in") || "3600"),
      user: { id: params.get("user_id"), email: null }
    };
    /* 嘗試用 access_token 拿 user info（Supabase /auth/v1/user） */
    fetch(`${this.URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (user) session.user = { id: user.id, email: user.email, user_metadata: user.user_metadata };
        this.saveSession(session);
      }).catch(() => { this.saveSession(session); });
    /* 先 save 一個 partial session（user info async 補充） */
    this.saveSession(session);
    /* 清理 URL hash */
    window.history.replaceState({}, "", window.location.pathname);
    return session;
  },

  async signOut() {
    if (this._session?.access_token) {
      try {
        await fetch(`${this.URL}/auth/v1/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this._session.access_token}`,
            apikey: this.ANON_KEY
          }
        });
      } catch (e) { /* ignore network error */ }
    }
    this._session = null;
    localStorage.removeItem("pokeengmon_auth_session");
  },

  /* ---------- RPC：防金手指 diamonds server 計算 ---------- */
  async awardRoundDiamonds(score, total) {
    const user = this.currentUser();
    if (!user) return 0; /* 匿名模式 server 唔計，前端自行加 */
    try {
      const res = await fetch(`${this.URL}/rest/v1/rpc/award_round_diamonds`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._session.access_token}`,
          apikey: this.ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({ account_uuid: user.id, score, total })
      });
      if (!res.ok) throw new Error("award RPC failed: " + res.status);
      const data = await res.json();
      return typeof data === "number" ? data : (data[0]?.diamonds ?? 0);
    } catch (e) { console.warn("awardRoundDiamonds failed:", e.message); return 0; }
  },

  /* ---------- RPC：匿名資料 migrate 到 auth uid ---------- */
  async migrateAnonymous(deviceId) {
    if (!this._session?.user?.id) return null;
    try {
      const res = await fetch(`${this.URL}/rest/v1/rpc/migrate_anonymous_to_auth`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._session.access_token}`,
          apikey: this.ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          new_auth_uuid: this._session.user.id,
          old_device_id: deviceId
        })
      });
      if (!res.ok) throw new Error("migrate RPC failed: " + res.status);
      return await res.json();
    } catch (e) { console.warn("migrateAnonymous failed:", e.message); return null; }
  },

  /* ---------- 通用 fetch wrapper（附 auth header） ---------- */
  async fetch(path, options = {}) {
    const headers = {
      apikey: this.ANON_KEY,
      ...(options.headers || {})
    };
    if (this._session?.access_token) {
      headers.Authorization = `Bearer ${this._session.access_token}`;
    }
    return fetch(`${this.URL}${path}`, { ...options, headers });
  }
};

/* 自動 init */
SupabaseAuth.init();
