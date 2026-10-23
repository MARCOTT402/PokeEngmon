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
    /* 嘗試從 localStorage restore session */
    try {
      const raw = localStorage.getItem("pokeengmon_auth_session");
      if (raw) {
        const s = JSON.parse(raw);
        if (s.expires_at && s.expires_at > Math.floor(Date.now() / 1000)) {
          this._session = s;
        } else {
          localStorage.removeItem("pokeengmon_auth_session");
        }
      }
    } catch (e) { /* ignore */ }
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

  /* ---------- Google OAuth（popup 模式） ---------- */
  async signInWithGoogle() {
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    const url = `${this.URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}&response_type=token`;

    return new Promise((resolve, reject) => {
      /* popup window */
      const w = window.open(url, "supabase_auth", "width=520,height=640,left=100,top=100");
      if (!w) { reject(new Error("Popup blocked — allow popups for PokeEngmon")); return; }

      const pollTimer = setInterval(() => {
        try {
          if (w.closed) {
            clearInterval(pollTimer);
            reject(new Error("Popup closed before auth completed"));
            return;
          }
          const popupUrl = new URL(w.location.href);
          /* Supabase redirect 返嚟嘅 URL 會有 #access_token=... 或 ?access_token=... */
          const hash = popupUrl.hash.replace(/^#/, "");
          const query = popupUrl.search;
          let params = new URLSearchParams(hash || query);
          const token = params.get("access_token");
          const refresh = params.get("refresh_token");
          const expires = parseInt(params.get("expires_in") || "3600");

          if (token) {
            /* 拿 user info */
            fetch(`${this.URL}/auth/v1/user`, {
              headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.ok ? r.json() : null).then(user => {
              const session = {
                access_token: token,
                refresh_token: refresh,
                expires_at: Math.floor(Date.now() / 1000) + expires,
                user: user || { id: token.split(".")[1], email: null }
              };
              this.saveSession(session);
              clearInterval(pollTimer);
              w.close();
              resolve(session);
            }).catch(err => { clearInterval(pollTimer); w.close(); reject(err); });
          }
        } catch (e) {
          /* 唔同 origin 時會 cross-origin error，呢個係正常現象 — 繼續 poll */
        }
      }, 200);

      /* timeout：3 分鐘 */
      setTimeout(() => { clearInterval(pollTimer); if (!w.closed) w.close(); reject(new Error("Auth timeout")); }, 180000);
    });
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
