/* ============================================================
   PokeEngmon - Supabase Auth（Google OAuth redirect 模式）
   零依賴、純 fetch + localStorage
   Session 存 pokeengmon_auth_session
   ============================================================ */

const SupabaseAuth = {
  _session: null,
  URL: "https://gcfoeaxxeerqixaistaf.supabase.co",
  ANON_KEY: window.__SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjZm9lYXh4ZWVycWl4YWlzdGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MzU2NDQsImV4cCI6MjEwODMxMTY0NH0.w1tqs-Q-qEKASs63eVOt0OhLO2mKaHnAzM15w6OtGZc",

  _now() { return Math.floor(Date.now() / 1000); },

  /* OAuth 返回用嘅乾淨 URL（唔含 hash / query） */
  _cleanURL() {
    const p = window.location.pathname.replace(/index\.html$/i, "");
    return window.location.origin + p + window.location.search;
  },

  /* 解 JWT payload：唔需要網絡就拿到 uid / email（hash 未必有 user_id） */
  _decodeJWT(token) {
    try {
      const part = token.split(".")[1] || "";
      const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const bin = atob(padded);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  },

  init() {
    console.log("[Auth] init — landing:", window.location.href);

    /* 0. OAuth 失敗：Supabase 會 redirect 返嚟帶 #error=... */
    const hash = window.location.hash || "";
    if (hash.includes("error=")) {
      const p = new URLSearchParams(hash.replace(/^#/, ""));
      window.__oauthError = (p.get("error_description") || p.get("error") || "unknown error").replace(/\+/g, " ");
      console.warn("[Auth] ❌ OAuth error:", window.__oauthError);
      window.history.replaceState({}, "", this._cleanURL());
      return;
    }

    /* 1. 優先檢查 OAuth redirect 嘅 hash fragment（登入完 Supabase redirect 返嚟） */
    if (this.tryParseSessionFromURL()) {
      console.log("[Auth] ✅ Parsed session from redirect hash");
      this._hydrateUser();
      return;
    }

    /* 2. 嘗試從 localStorage restore */
    try {
      const raw = localStorage.getItem("pokeengmon_auth_session");
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.access_token) {
          this._session = s;
          console.log("[Auth] ✅ Restored session from localStorage — expires_at:", s.expires_at);
          if (s.expires_at && s.expires_at <= this._now()) this.ensureFreshSession();
        }
      }
    } catch (e) { console.warn("[Auth] init error:", e); }
  },

  isLoggedIn() {
    /* 只要有 access_token 就當已登入（uid 由 JWT decode 補上，唔靠網絡） */
    return !!(this._session && this._session.access_token);
  },

  /* Auth 功能是否啟用（有 URL + anon key 就算，供 sync.js 判斷） */
  isEnabled() {
    return !!this.URL && !!this.ANON_KEY;
  },

  currentUser() {
    return this._session?.user || null;
  },

  currentToken() {
    return this._session?.access_token || null;
  },

  saveSession(session) {
    this._session = session;
    localStorage.setItem("pokeengmon_auth_session", JSON.stringify(session));
  },

  /* 用 access_token 向 GoTrue 拎最新 user（失敗唔影響登入狀態） */
  async _hydrateUser() {
    const token = this._session?.access_token;
    if (!token) return;
    try {
      const r = await fetch(`${this.URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: this.ANON_KEY }
      });
      if (!r.ok) return;
      const user = await r.json();
      if (user && user.id) {
        this._session.user = { id: user.id, email: user.email, user_metadata: user.user_metadata };
        this.saveSession(this._session);
      }
    } catch (e) { /* offline — JWT 已提供 uid，可照用 */ }
  },

  /* access_token 過期 → 用 refresh_token 換新（返回新 session 或 null） */
  async ensureFreshSession() {
    const s = this._session;
    if (!s || !s.access_token) return null;
    if (s.expires_at && s.expires_at > this._now() + 120) return s;
    if (!s.refresh_token) return null;
    try {
      const r = await fetch(`${this.URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: this.ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      if (!r.ok) throw new Error("refresh " + r.status);
      const d = await r.json();
      const claims = this._decodeJWT(d.access_token) || {};
      this.saveSession({
        access_token: d.access_token,
        refresh_token: d.refresh_token || s.refresh_token,
        expires_at: this._now() + (d.expires_in || 3600),
        user: {
          id: claims.sub || s.user?.id || null,
          email: claims.email || s.user?.email || null
        }
      });
      console.log("[Auth] ✅ Token refreshed");
      return this._session;
    } catch (e) {
      console.warn("[Auth] ⚠️ Refresh failed:", e.message);
      return null;
    }
  },

  /* ---------- Google OAuth（redirect 模式，零 popup） ---------- */
  async signInWithGoogle() {
    const redirectUrl = this._cleanURL();
    const url = `${this.URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}&response_type=token&scope=email+profile&prompt=select_account`;
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
    /* hash 未必有 user_id → 由 JWT payload 直接拿 sub / email（同步、零網絡） */
    const claims = this._decodeJWT(token) || {};
    const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
    const expiresAt = parseInt(params.get("expires_at") || "", 10);
    const session = {
      access_token: token,
      refresh_token: params.get("refresh_token"),
      expires_at: expiresAt || (this._now() + expiresIn),
      user: {
        id: params.get("user_id") || claims.sub || null,
        email: claims.email || params.get("email") || null
      }
    };
    this.saveSession(session);
    console.log("[Auth] session saved — uid:", session.user.id, "expires_at:", session.expires_at);
    /* 清理 URL hash */
    window.history.replaceState({}, "", this._cleanURL());
    return session;
  },

  async signOut() {
    /* 通知 server 撤銷 session（fire-and-forget，唔好等網絡 reply 阻塞 UI） */
    if (this._session?.access_token) {
      fetch(`${this.URL}/auth/v1/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._session.access_token}`,
          apikey: this.ANON_KEY
        }
      }).catch(() => {});
    }
    this._session = null;
    localStorage.removeItem("pokeengmon_auth_session");
  },

  /* ---------- RPC：防金手指 diamonds server 計算 ----------
     失敗 return null（唔係 0），俾前端 fallback 本地計算 */
  async awardRoundDiamonds(score, total) {
    const user = this.currentUser();
    if (!user) return null; /* 匿名模式 server 唔計，前端自行加 */
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
    } catch (e) { console.warn("awardRoundDiamonds failed:", e.message); return null; }
  },

  /* ---------- RPC：捕捉結算（防金手指，server 記錄） ---------- */
  async settleCapture(dexId, attempts) {
    const user = this.currentUser();
    if (!user) return null;
    try {
      const res = await fetch(`${this.URL}/rest/v1/rpc/settle_capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._session.access_token}`,
          apikey: this.ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({ account_uuid: user.id, dex_id: dexId, attempts: attempts || 1 })
      });
      if (!res.ok) throw new Error("settle RPC failed: " + res.status);
      return await res.json();
    } catch (e) { console.warn("settleCapture failed:", e.message); return null; }
  },

  /* ---------- RPC：匿名資料 migrate 到 auth uid ----------
     回傳 true = 新建立帳戶（本地要 push 上去）
     回傳 false = 已有匿名資料已搬移（本地要 pull 落嚟） */
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
      const data = await res.json();
      /* RPC 回傳 boolean（PostgREST 會包成 [true] / [false]） */
      return Array.isArray(data) ? data[0] : data;
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

/* 關鍵：top-level const 唔會自動掛上 window，必須手動暴露
   （app.js / sync.js 都用 window.SupabaseAuth 判斷） */
window.SupabaseAuth = SupabaseAuth;
