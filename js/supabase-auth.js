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
    /* 防禦性清除：redirect 前抹走任何舊 session，
       避免 OAuth 失敗/取消時 restore 返上一個帳戶，顯示錯誤 email */
    this._session = null;
    localStorage.removeItem("pokeengmon_auth_session");
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

  /* ---------- RPC 共用 helper（v99 起 RPC 全部用 auth.uid()，唔再傳 account_uuid） ----------
     失敗 return null，俾前端 fallback 本地計算 */
  async _rpc(name, payload) {
    if (!this._session?.access_token) return null;
    try {
      const res = await fetch(`${this.URL}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._session.access_token}`,
          apikey: this.ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(payload || {})
      });
      if (!res.ok) throw new Error(name + " RPC failed: " + res.status);
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    } catch (e) { console.warn("[Auth RPC]", name, "failed:", e.message); return null; }
  },

  /* ---------- RPC：防金手指 diamonds server 計算 ----------
     回傳 {bonus, balance}（balance 係 server 權威）；失敗 return null */
  async awardRoundDiamonds(score, total) {
    if (!this.currentUser()) return null; /* 匿名模式 server 唔計，前端自行加 */
    return this._rpc("award_round_diamonds", { score, total });
  },

  /* ---------- RPC：捕捉日誌（log-only） ---------- */
  async settleCapture(dexId) {
    if (!this.currentUser()) return null;
    return this._rpc("settle_capture", { dex_id: dexId });
  },

  /* ---------- RPC：稀有抽（server 原子扣鑽 + roll rarity + 派寵） ----------
     回傳 {entry, rarity, is_dupe, balance}；失敗 return null（前端唔好扣本地鑽） */
  async gachaPull(initExp) {
    if (!this.currentUser()) return null;
    return this._rpc("gacha_pull", { init_exp: initExp || 0 });
  },

  /* ---------- RPC：捕捉成功拎寵（只限 normal 稀有度） ----------
     回傳 {entry, is_dupe}；失敗 return null */
  async obtainCapture(chainKey, dexId) {
    if (!this.currentUser()) return null;
    return this._rpc("obtain_capture", { chain_key: chainKey, dex_id: dexId });
  },

  /* ---------- RPC：加 EXP（回傳新 exp 總值） ---------- */
  async addEntryExp(entryId, delta) {
    if (!this.currentUser()) return null;
    return this._rpc("add_entry_exp", { entry_id: entryId, delta });
  },

  /* ---------- RPC：餵糖（回傳 {candies, exp}） ---------- */
  async useEntryCandy(entryId, count, expDelta) {
    if (!this.currentUser()) return null;
    return this._rpc("use_entry_candy", { entry_id: entryId, count, exp_delta: expDelta });
  },

  /* ---------- RPC：分配 EV（回傳 {evs, ev_points}） ---------- */
  async allocEv(entryId, stat) {
    if (!this.currentUser()) return null;
    return this._rpc("alloc_ev", { entry_id: entryId, stat });
  },

  /* ---------- RPC：清空雲端進度（Reset Progress 用；以 auth.uid() 為準） ---------- */
  async resetProgress() {
    if (!this.currentUser()) return null;
    return this._rpc("reset_progress", {});
  },

  /* ---------- RPC：首次 connect 一次性上傳本地進度（回傳 true/false） ---------- */
  async importState(payload) {
    if (!this.currentUser()) return null;
    return this._rpc("import_state", { payload });
  },

  /* ---------- RPC：登入後初始化帳戶 ----------
     回傳 true = 新建立帳戶（本地要 importState 上傳）
     回傳 false = 已有帳戶（本地要 pull 落嚟） */
  async migrateAnonymous(deviceId) {
    if (!this._session?.user?.id) return null;
    return this._rpc("migrate_anonymous_to_auth", { old_device_id: deviceId });
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
