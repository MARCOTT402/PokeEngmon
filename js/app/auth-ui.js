/* ============================================================
   PokeEngmon - App：登入同帳戶畫面（登入／註冊／忘記密碼、帳戶中心、改名、免責聲明）
   由 js/app.js 拆出（總計劃 P2.2；Rule 116）。同 app.js 共用同一個 App 物件：
   Object.assign 只係將方法掛返上去，this／App.xxx 用法完全唔變。
   載入次序：js/app.js 之後（index.html），App.init() 喺 DOMContentLoaded 先跑。
   ============================================================ */

Object.assign(App, {
  /* ---------- Login Hub（Poké Ball 風格） ---------- */
  _markLoggedIn() {
    const v = document.getElementById("login-state");
    if (!v) return;
    const user = window.SupabaseAuth?.currentUser();
    const email = user?.email || "";
    v.textContent = email ? "Connected" : "Connected";
    v.title = email || "Connected — tap to manage";
    /* 登入後先開始好友背景輪詢（帶來新邀請／請求數） */
    if (window.Friends && Friends.startPolling) Friends.startPolling();
  },

  /* 還原登入狀態文字（sign out 後用） */
  _markLoggedOut() {
    const v = document.getElementById("login-state");
    if (!v) return;
    v.textContent = "Sign in";
    v.title = "";
  },

  /* OAuth redirect 返嚟之後嘅雲端合併。一定要等首屏 render 完、loading 淡出後才跑：
     舊版喺 init() 內 await 呢段，一旦彈出「Overwrite local progress?」確認窗，
     modal（z-index 50）會被 loading overlay（99999）完全遮住 → 撳唔到掣
     → promise 永遠 pending → init() 唔 resolve → 卡死喺 loading 頁。
     改為非阻塞：首屏照出，確認窗浮喺正常畫面上面，用戶一定撳得到。 */
  async _postLogin(st) {
    try {
      await SupabaseAuth.ensureFreshSession();
      if (!st._googleMigrated) {
        const deviceId = ensureDeviceId();
        const isNewAccount = await SupabaseAuth.migrateAnonymous(deviceId);
        console.log("[OAuth] migrate result — isNewAccount:", isNewAccount);
        if (isNewAccount === true) {
          /* 新帳戶：本地進度經 import_state 一次性上傳（v106 server 收緊：
             diamonds 唔過界——固定派 20 粒 welcome bonus；entries ≤151、
             exp ≤1.25M、candies ≤99、dupes ≤100；每帳戶一生一次
             imported_at 鎖 + user_imports audit log），之後 pull 正規化
             （server 行先係權威） */
          const payload = {
            diamonds: st.diamonds || 0,
            total_sets: st.totalSets || 0,
            total_correct: st.totalCorrect || 0,
            total_questions: st.totalQuestions || 0,
            trainer_name: st.playerName || "The PokéEngmon Trainer",
            entries: (st.entries || []).map(e => ({
              id: e.uid,
              chain_key: e.chainKey,
              exp: Number(e.exp ?? 0),
              ivs: e.ivs || {},
              evs: e.evs || {},
              ev_points: e.evPoints ?? 0,
              candies: e.candies ?? 0,
              dupes: e.dupes ?? 0,
              branch: (e.branch === 0 || e.branch) ? e.branch : null,
              active: e.uid === st.activeUid,
              obtained_at: e.obtainedAt || Date.now()
            }))
          };
          const imported = await SupabaseAuth.importState(payload);
          console.log("[OAuth] importState result:", imported);
          /* SM-2 cards/history 維持直推（非敏感學習數據） */
          await Sync.pushState();
          await Sync.pull();
          console.log("[OAuth] ✅ Local progress imported to new Google account");
          st._googleMigrated = true;
          st._needsCurveSetup = true;  /* 新帳戶 → 彈 curve setup */
          saveState();
        } else if (isNewAccount === false) {
          /* 舊帳戶：從雲端拉下來；本地有進度先問用戶（呢個窗而家一定撳得到） */
          const hasLocalProgress = this._localHasProgress();
          if (hasLocalProgress) {
            const confirmed = await this._confirmOverwrite();
            if (!confirmed) {
              /* 用戶拒絕 → sign out，保留本地進度 */
              await SupabaseAuth.signOut();
              if (window.Friends && Friends.stopPolling) Friends.stopPolling();
              st._googleMigrated = false;
              saveState();
              this.renderHome();
              this.toast("Sign-in cancelled — your local progress is kept.");
              /* 取消 OAuth sign in 後 → 自動彈 Login Gate */
              setTimeout(() => { this.openLoginHub(true); }, 500);
              return;
            }
          }
          await Sync.pull();
          console.log("[OAuth] ✅ Existing account data pulled from cloud");
          st._googleMigrated = true;
          saveState();
        } else {
          /* migrate 失敗 / 未知狀態：保守起見 pull（雲端有就用雲端） */
          try { await Sync.pull(); } catch (e) {}
          st._googleMigrated = true;
          saveState();
        }
      } else {
        /* 已 migrate 過（之前登入過）：拉雲端最新數據 */
        try { await Sync.pull(); } catch (e) {}
      }
      this.renderHome();
      /* 顯示實際登入嘅 email，萬一 Google 選錯帳戶用戶可以即刻發現 */
      const signedEmail = SupabaseAuth.currentUser()?.email;
      this.toast(signedEmail
        ? `✅ Signed in as ${signedEmail}`
        : "✅ Signed in! Your progress is cloud-synced.");

      /* 新帳戶 → 彈 Learning Curve Mode 設定 */
      if (st._needsCurveSetup) {
        st._needsCurveSetup = false;
        saveState();
        /* 等 toast 顯示完先彈 curve setup modal */
        setTimeout(() => { this._showCurveSetupForm(); }, 800);
      }
    } catch (e) { console.warn("[OAuth] post-login failed:", e.message); }
  },

  /* 檢查本地係咪有遊玩進度（用嚟決定 connect 舊帳戶時使唔使彈 overwrite 警告） */
  _localHasProgress() {
    const st = loadState();
    const cardCount = (typeof SM2 !== "undefined" && SM2.listAll) ? SM2.listAll().length : 0;
    return (st.diamonds || 0) > 0
      || (st.entries && Object.keys(st.entries).length > 0)
      || cardCount > 0
      || (st.totalSets || 0) > 0;
  },

  /* 彈出「覆蓋本地進度」確認視窗，回傳 Promise<boolean> */
  _confirmOverwrite() {
    return new Promise((resolve) => {
      const existing = document.getElementById("overwrite-modal");
      if (existing) existing.remove();
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.id = "overwrite-modal";
      backdrop.innerHTML = `
        <div class="modal-card">
          <div class="modal-icon">⚠️</div>
          <h3>Overwrite local progress?</h3>
          <p style="font-size:.85rem;line-height:1.5;margin:6px 0;color:#6b7280;">
            This Google account already has saved progress in the cloud.<br>
            Connecting will <strong>overwrite your current local progress</strong> with the cloud data.
          </p>
          <p style="font-size:.78rem;color:#ef4444;font-weight:700;margin:8px 0 14px;">
            Your local diamonds, Pokémon and study records will be replaced.
          </p>
          <div style="display:flex;gap:10px;">
            <button class="btn-secondary" style="flex:1;" data-act="cancel">Cancel</button>
            <button class="btn-primary" style="flex:1;background:#ef4444;" data-act="confirm">Overwrite &amp; Connect</button>
          </div>
        </div>`;
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop || e.target.closest("[data-act=cancel]")) {
          backdrop.remove();
          resolve(false);
        } else if (e.target.closest("[data-act=confirm]")) {
          backdrop.remove();
          resolve(true);
        }
      });
      document.body.appendChild(backdrop);
    });
  },

  /* ================= Auth UI v2（v1.59：單一卡片 + Create account / Sign in tab） =================
     - Google 掣喺兩個 tab 都有，按 tab 轉名（Sign up / Sign in with Google）—— Rule 55 / Rule 73
     - isGate=true → 首次進入嘅強制登入 gate：唔俾點外面、Esc 關，亦冇 ✕（Rule 51）
     - 所有 email/password input 用正確 autocomplete，俾 iOS Keychain／Password Manager 自動填
     - input 一律 16px 字，防 iOS focus 自動 zoom */
  _authLast() {
    try { return JSON.parse(localStorage.getItem("pe_auth_last") || "null") || {}; } catch (e) { return {}; }
  },
  _authRemember(method, email) {
    try {
      const prev = this._authLast();
      localStorage.setItem("pe_auth_last", JSON.stringify({ method, email: email || prev.email || "" }));
    } catch (e) {}
  },
  /* 只有滑鼠／觸控板裝置先 autofocus；手機一開就彈鍵盤會遮住半張卡 */
  _authFinePointer() {
    try { return window.matchMedia("(hover: hover) and (pointer: fine)").matches; } catch (e) { return false; }
  },
  _authIcon(name) {
    if (name === "google") return `<svg class="au-gicon" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.2 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c3 0 5.8 1.1 7.9 3l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15 19 12.5 24 12.5c3 0 5.8 1.1 7.9 3l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 16.3 4.5 9.6 8.8 6.3 14.1z"/><path fill="#4CAF50" d="M24 43.5c5 0 9.6-1.9 13-5l-6-4.8c-2.1 1.4-4.8 2.3-7.9 2.3-5.2 0-9.7-3.1-11.3-7.4l-6.5 5C9.3 39.2 16.1 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6 4.8C42 33.9 43.5 29.2 43.5 24c0-1.2-.1-2.4-.4-3.5z"/></svg>`;
    if (name === "eye") return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
    if (name === "eyeOff") return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
    if (name === "mail") return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`;
    return "";
  },
  _authSpinner(label) { return `<span class="au-spin" aria-hidden="true"></span><span>${label}</span>`; },
  _authCloseBtn(isGate) {
    return isGate ? "" : `<button type="button" class="au-iconbtn au-x" data-act="close" aria-label="Close">✕</button>`;
  },

  /* GoTrue 原始錯誤 → 用戶睇得明嘅文案（field = 要標紅邊一格） */
  _authError(raw) {
    const m = String(raw || "");
    if (/already (been )?registered|already exists/i.test(m)) return { code: "taken", field: "email", msg: "This email already has an account." };
    if (/invalid login credentials|invalid grant/i.test(m)) return { code: "creds", field: "pass", msg: "Incorrect email or password." };
    if (/not confirmed/i.test(m)) return { code: "unconfirmed", msg: "Please confirm your email first — check your inbox for the activation link." };
    if (/rate limit|too many|security purposes/i.test(m)) return { code: "rate", msg: "Too many attempts. Please wait a minute and try again." };
    if (/password/i.test(m) && /(should|weak|least|characters)/i.test(m)) return { code: "weak", field: "pass", msg: m };
    if (/failed to fetch|network|load failed/i.test(m)) return { code: "net", msg: "Can't reach the server. Check your connection and try again." };
    return { code: "other", msg: m || "Something went wrong. Please try again." };
  },

  _authFieldHTML(o) {
    const pw = o.type === "password";
    return `
      <div class="au-field${pw ? " has-eye" : ""}" data-f="${o.key}">
        <div class="au-lab"><label for="${o.id}">${o.label}</label>${o.aside || ""}</div>
        <div class="au-wrap">
          <input id="${o.id}" class="au-input" type="${o.type || "text"}" name="${o.name}" autocomplete="${o.ac}" ${o.attrs || ""}
            placeholder="${o.ph || ""}" value="${escapeHTML(o.value || "")}" aria-describedby="${o.id}-m">
          ${pw ? `<button type="button" class="au-eye" data-act="eye" aria-label="Show password" aria-pressed="false">${this._authIcon("eye")}</button>` : ""}
        </div>
        ${o.meter ? `<div class="au-meter" data-s="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>` : ""}
        <div class="au-msg${o.hint ? " hint" : ""}" id="${o.id}-m" data-hint="${escapeHTML(o.hint || "")}">${o.hint || ""}</div>
      </div>`;
  },

  /* 表單 helper：inline 驗證、錯誤、banner、loading 鎖定 */
  _authForm(root, mode) {
    const self = this;
    const field = k => root.querySelector(`.au-field[data-f="${k}"]`);
    const F = {
      val(k) { const i = field(k)?.querySelector("input"); return i ? (k === "pass" ? i.value : i.value.trim()) : ""; },
      setErr(k, msg) {
        const f = field(k); if (!f) return;
        f.classList.add("invalid"); f.classList.remove("valid");
        f.querySelector("input").setAttribute("aria-invalid", "true");
        const m = f.querySelector(".au-msg"); m.className = "au-msg err"; m.textContent = msg; m.dataset.err = "1";
      },
      clearErr(k) {
        const f = field(k); if (!f) return;
        f.classList.remove("invalid");
        f.querySelector("input").removeAttribute("aria-invalid");
        const m = f.querySelector(".au-msg");
        if (m.dataset.err) { m.dataset.err = ""; m.className = "au-msg" + (m.dataset.hint ? " hint" : ""); m.textContent = m.dataset.hint || ""; }
      },
      check(k) {
        const v = F.val(k);
        let err = "";
        if (k === "name") err = !v ? "Pick a trainer name." : (v.length < 2 ? "Use at least 2 characters." : "");
        if (k === "email") err = !v ? "Enter your email." : (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "That doesn't look like an email — check for typos." : "");
        if (k === "pass") err = !v ? (mode === "signup" ? "Create a password." : "Enter your password.") : (mode === "signup" && v.length < 8 ? "Password needs at least 8 characters." : "");
        if (err) { F.setErr(k, err); return false; }
        F.clearErr(k);
        if (k !== "pass") field(k)?.classList.add("valid");
        return true;
      },
      checkAll(keys) {
        let first = null;
        keys.forEach(k => { if (!F.check(k) && !first) first = k; });
        if (first) field(first).querySelector("input").focus();
        return !first;
      },
      banner(html, kind) {
        const b = root.querySelector("#au-banner");
        if (b) b.innerHTML = html ? `<div class="au-banner ${kind || ""}" role="alert">${html}</div>` : "";
      },
      busy(on, label) {
        root.classList.toggle("is-busy", on);
        root.querySelectorAll("input, button").forEach(x => { if (x.id !== "au-submit") x.disabled = on; });
        const b = root.querySelector("#au-submit");
        if (!b) return;
        if (!b.dataset.label) b.dataset.label = b.textContent.trim();
        b.disabled = on;
        b.innerHTML = on ? self._authSpinner(label) : b.dataset.label;
      },
      focusFirst() {
        if (!self._authFinePointer()) return;
        const ins = [...root.querySelectorAll(".au-field input")];
        const i = ins.find(x => !x.value) || ins[0];
        if (i) i.focus();
      }
    };
    /* blur 先驗證（唔好一打字就鬧）；再打字即清錯誤 */
    root.querySelectorAll(".au-field input").forEach(inp => {
      const k = inp.closest(".au-field").dataset.f;
      inp.addEventListener("blur", () => { if (inp.value && !root.classList.contains("is-busy")) F.check(k); });
      inp.addEventListener("input", () => { F.clearErr(k); F.banner(""); });
    });
    /* 顯示／隱藏密碼 */
    root.querySelectorAll("[data-act=eye]").forEach(btn => {
      btn.onclick = () => {
        const inp = btn.parentElement.querySelector("input");
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        btn.innerHTML = self._authIcon(show ? "eyeOff" : "eye");
        btn.setAttribute("aria-pressed", String(show));
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      };
    });
    const close = root.querySelector("[data-act=close]");
    if (close) close.onclick = () => this.closeModal();
    this._authBindEsc();
    return F;
  },

  _authBindEsc() {
    if (this._authEscBound) return;
    this._authEscBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const au = document.querySelector("#modal-root .au");
      if (!au || au.dataset.gate === "1" || au.classList.contains("is-busy")) return;
      this.closeModal();
    });
  },

  /* isGate=true 時代表首次進入 App 嘅強制登入 gate，唔俾 click outside 關閉 */
  openLoginHub(isGate, tab) {
    const user = window.SupabaseAuth ? SupabaseAuth.currentUser() : null;
    if (user) { this._showAccountHub(); return; }
    this._showAuth(isGate, tab);
  },

  /* ---------- 主 Auth 卡：Create account / Sign in ---------- */
  _showAuth(isGate, tab, opts = {}) {
    const last = this._authLast();
    const t = (tab === "signin" || tab === "signup") ? tab : (last.method ? "signin" : "signup");
    const up = t === "signup";
    const email = opts.email != null ? opts.email : (up ? "" : (last.email || ""));
    const lastG = !up && last.method === "google";
    const lastE = !up && last.method === "email";

    this.showModal(`
      <div class="login-hub au" data-gate="${isGate ? 1 : 0}" role="dialog" aria-labelledby="au-title">
        ${this._authCloseBtn(isGate)}
        <div class="au-brand">
          <div class="lh-ball au-ball" aria-hidden="true"></div>
          <h2 class="au-title" id="au-title">${up ? "Create your Trainer account" : "Welcome back, Trainer"}</h2>
          <p class="au-sub">${up ? "Save your Pokémon and progress across all your devices." : "Sign in to continue where you left off."}</p>
        </div>

        <div class="au-seg" role="tablist" aria-label="Account" data-tab="${t}">
          <span class="au-seg-pill" aria-hidden="true"></span>
          <button type="button" role="tab" id="au-tab-signup" aria-selected="${up}" tabindex="${up ? 0 : -1}" data-tab-btn="signup">Create account</button>
          <button type="button" role="tab" id="au-tab-signin" aria-selected="${!up}" tabindex="${up ? -1 : 0}" data-tab-btn="signin">Sign in</button>
        </div>

        <button type="button" class="au-btn au-btn-google" id="au-google">
          ${lastG ? `<span class="au-last">Last used</span>` : ""}
          ${this._authIcon("google")}<span>${up ? "Sign up with Google" : "Sign in with Google"}</span>
        </button>

        <div class="au-divider"><span>or with email</span></div>

        <div id="au-banner" aria-live="polite"></div>
        <form id="au-form" class="au-form" novalidate>
          ${up ? this._authFieldHTML({ key: "name", id: "au-name", label: "Trainer name", name: "nickname", ac: "nickname",
                   attrs: 'maxlength="24" enterkeyhint="next" autocapitalize="words"', ph: "e.g. Ash" }) : ""}
          ${this._authFieldHTML({ key: "email", id: "au-email", type: "email", name: "email", ac: up ? "email" : "username",
              label: `Email${lastE ? ' <span class="au-last-inline">Last used</span>' : ""}`,
              attrs: 'inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next"',
              ph: "you@example.com", value: email })}
          ${this._authFieldHTML({ key: "pass", id: "au-pass", type: "password", name: "password", ac: up ? "new-password" : "current-password",
              label: "Password",
              aside: up ? "" : `<button type="button" class="au-link au-link-sm" data-act="forgot">Forgot password?</button>`,
              attrs: `enterkeyhint="${up ? "done" : "go"}"${up ? ' minlength="8"' : ""}`,
              ph: up ? "At least 8 characters" : "Your password",
              meter: up,
              hint: up ? "Use 8+ characters. Mix letters and numbers to make it stronger." : "" })}
          <button type="submit" class="au-btn au-btn-primary" id="au-submit">${up ? "Create account" : "Sign in"}</button>
        </form>

        <p class="au-foot">${up
          ? "Your trainer data, Pokémon and diamonds are saved to the cloud and sync across devices."
          : `New here? <button type="button" class="au-link" data-tab-btn="signup">Create an account</button>`}</p>
      </div>`, !!isGate);

    const root = document.querySelector("#modal-root .au");
    const q = s => root.querySelector(s);
    const F = this._authForm(root, t);
    const curEmail = () => (q("#au-email")?.value || "").trim();

    /* Tab 切換：保留已打嘅 email */
    root.querySelectorAll("[data-tab-btn]").forEach(b => {
      b.onclick = () => {
        const nt = b.dataset.tabBtn;
        if (nt === t) return;
        this._showAuth(isGate, nt, { email: curEmail(), dir: nt === "signin" ? 1 : -1 });
      };
    });
    q(".au-seg").onkeydown = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const nt = up ? "signin" : "signup";
      this._showAuth(isGate, nt, { email: curEmail(), keepTabFocus: true });
    };
    if (opts.dir) root.style.setProperty("--au-dx", (opts.dir * 14) + "px");

    q("#au-google").onclick = () => this._authGoogle(q("#au-google"));

    const fg = q("[data-act=forgot]");
    if (fg) fg.onclick = () => this._showForgot(isGate, curEmail());

    const pass = q("#au-pass");
    if (up) {
      const meter = q(".au-meter");
      const msg = q("#au-pass-m");
      pass.addEventListener("input", () => {
        const p = pass.value;
        let s = 0;
        if (p) {
          if (p.length >= 8) s++;
          if (/[a-z]/i.test(p) && /\d/.test(p)) s++;
          if (/[^a-z0-9]/i.test(p) || (/[A-Z]/.test(p) && /[a-z]/.test(p))) s++;
          if (p.length >= 12) s++;
          s = Math.max(1, s);
        }
        meter.dataset.s = String(s);
        if (!msg.dataset.err) {
          const left = 8 - p.length;
          msg.textContent = p && left > 0 ? `${left} more character${left > 1 ? "s" : ""}` : msg.dataset.hint;
        }
      });
    } else {
      /* Caps Lock 提示（淨係桌面鍵盤有用） */
      const msg = q("#au-pass-m");
      const caps = (e) => {
        if (!e.getModifierState || msg.dataset.err) return;
        const on = e.getModifierState("CapsLock");
        msg.className = "au-msg" + (on ? " warn" : "");
        msg.textContent = on ? "Caps Lock is on" : "";
      };
      pass.addEventListener("keyup", caps);
      pass.addEventListener("keydown", caps);
    }

    q("#au-form").onsubmit = (e) => {
      e.preventDefault();
      if (root.classList.contains("is-busy")) return;
      F.banner("");
      if (!F.checkAll(up ? ["name", "email", "pass"] : ["email", "pass"])) return;
      if (up) this._authDoSignup(root, F, isGate);
      else this._authDoSignin(root, F, isGate);
    };

    if (opts.keepTabFocus) q(`#au-tab-${t}`).focus();
    else F.focusFirst();
  },

  _authGoogle(btn) {
    const html = btn.innerHTML;
    this._authRemember("google");
    btn.disabled = true;
    btn.innerHTML = this._authSpinner("Opening Google…");
    /* signInWithGoogle 會 redirect 走，正常唔會 resolve；失敗先還原掣 */
    Promise.resolve()
      .then(() => SupabaseAuth.signInWithGoogle())
      .catch((e) => {
        console.warn("Google sign-in failed:", e);
        btn.disabled = false; btn.innerHTML = html;
        this.toast("Couldn't open Google sign-in. Please try again.");
      });
  },

  async _authDoSignup(root, F, isGate) {
    const email = F.val("email"), nick = F.val("name"), pass = F.val("pass");
    F.busy(true, "Creating account…");
    const res = await SupabaseAuth.signUpWithEmail(email, pass);
    if (!res.ok) {
      F.busy(false);
      const er = this._authError(res.error);
      if (er.code === "taken") {
        F.setErr("email", er.msg);
        F.banner(`Already registered? <button type="button" class="au-link" data-go="signin">Sign in instead</button>`, "info");
        root.querySelector("[data-go=signin]").onclick = () => this._showAuth(isGate, "signin", { email });
      } else if (er.field) {
        F.setErr(er.field, er.msg);
      } else {
        F.banner(escapeHTML(er.msg));
      }
      return;
    }
    this._authRemember("email", email);
    /* 暱稱即刻寫入 local（需要 confirm email 嘅情況都保留），首次登入時 import_state 帶上雲 */
    if (nick) {
      const st = loadState();
      st.playerName = nick;
      st.nameCustomized = true;
      saveState();
    }
    if (res.needConfirm) { this._showCheckEmail(email, "confirm", isGate); return; }

    await SupabaseAuth.ensureFreshSession();
    /* _postLogin 可能需要彈 overwrite 確認窗（掛 body，唔係 modal-root），所以完咗先 closeModal */
    try { await this._postLogin(loadState()); } catch (err) {}
    this._markLoggedIn();
    this.closeModal();
    this.renderHome();
    this.toast(`✅ Welcome, ${nick}! Your progress is saved.`);
  },

  async _authDoSignin(root, F, isGate) {
    const email = F.val("email"), pass = F.val("pass");
    F.busy(true, "Signing in…");
    const res = await SupabaseAuth.signInWithEmail(email, pass);
    if (!res.ok) {
      F.busy(false);
      const er = this._authError(res.error);
      if (er.code === "creds") {
        F.setErr("pass", er.msg);
        F.banner(`Couldn't sign you in. Check your password or <button type="button" class="au-link" data-go="forgot">reset it</button>.`);
        root.querySelector("[data-go=forgot]").onclick = () => this._showForgot(isGate, email);
        const p = root.querySelector("#au-pass");
        if (p) { p.focus(); p.select(); }
      } else if (er.code === "unconfirmed") {
        F.banner(`${escapeHTML(er.msg)} <button type="button" class="au-link" data-go="resend">Resend link</button>`, "info");
        root.querySelector("[data-go=resend]").onclick = () => this._showCheckEmail(email, "confirm", isGate, true);
      } else if (er.field) {
        F.setErr(er.field, er.msg);
      } else {
        F.banner(escapeHTML(er.msg));
      }
      return;
    }
    this._authRemember("email", email);
    this.closeModal();
    try { await this._postLogin(loadState()); } catch (err) {}
    this._markLoggedIn();
    this.closeModal();
    this.renderHome();
    this.toast(`✅ Signed in as ${email}`);
  },

  /* ---------- Forgot Password ---------- */
  _showForgot(isGate, email = "") {
    this.showModal(`
      <div class="login-hub au" data-gate="${isGate ? 1 : 0}" role="dialog" aria-labelledby="au-title">
        <button type="button" class="au-iconbtn au-back" data-act="back" aria-label="Back">←</button>
        ${this._authCloseBtn(isGate)}
        <div class="au-brand au-brand-pad">
          <div class="au-art" aria-hidden="true">🔑</div>
          <h2 class="au-title" id="au-title">Reset your password</h2>
          <p class="au-sub">Enter the email you signed up with and we'll send you a secure link to set a new password.</p>
        </div>
        <div id="au-banner" aria-live="polite"></div>
        <form id="au-form" class="au-form" novalidate>
          ${this._authFieldHTML({ key: "email", id: "au-email", type: "email", name: "email", ac: "username", label: "Email",
              attrs: 'inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"',
              ph: "you@example.com", value: email })}
          <button type="submit" class="au-btn au-btn-primary" id="au-submit">Send reset link</button>
        </form>
      </div>`, !!isGate);

    const root = document.querySelector("#modal-root .au");
    const F = this._authForm(root, "forgot");
    root.querySelector("[data-act=back]").onclick = () =>
      this._showAuth(isGate, "signin", { email: F.val("email"), dir: -1 });
    root.querySelector("#au-form").onsubmit = async (e) => {
      e.preventDefault();
      if (root.classList.contains("is-busy")) return;
      if (!F.checkAll(["email"])) return;
      const em = F.val("email");
      F.busy(true, "Sending…");
      const res = await SupabaseAuth.sendPasswordReset(em);
      if (!res.ok) {
        const er = this._authError(res.error);
        if (er.code === "rate" || er.code === "net") { F.busy(false); F.banner(escapeHTML(er.msg)); return; }
      }
      /* Supabase 防 user enumeration：有冇呢個 email 都當成功 */
      this._showCheckEmail(em, "reset", isGate);
    };
    F.focusFirst();
  },

  /* ---------- Check your inbox（sign up confirm / reset） ----------
     sendNow=true：入嚟即刻再寄一次（例如 sign in 時發現 email 未 confirm） */
  _showCheckEmail(email, kind, isGate, sendNow) {
    const reset = kind === "reset";
    this.showModal(`
      <div class="login-hub au au-center" data-gate="${isGate ? 1 : 0}" role="dialog" aria-labelledby="au-title">
        ${this._authCloseBtn(isGate)}
        <div class="au-art" aria-hidden="true">✉️</div>
        <h2 class="au-title" id="au-title">Check your inbox</h2>
        <p class="au-sub">${reset ? "If an account exists for" : "We sent a confirmation link to"}<br><strong>${escapeHTML(email)}</strong></p>
        <p class="au-hint">${reset
          ? "Open the link in the email to choose a new password."
          : "Tap the link in the email to activate your account, then come back and sign in."} Can't find it? Check your Spam or Promotions folder.</p>
        <div class="au-stack">
          <button type="button" class="au-btn au-btn-primary" data-act="done">${reset ? "Back to sign in" : "I've confirmed — Sign in"}</button>
          <button type="button" class="au-btn au-btn-ghost" data-act="resend">Resend email</button>
          <button type="button" class="au-link au-link-sm au-center-link" data-act="change">Wrong email? Change it</button>
        </div>
      </div>`, !!isGate);

    const root = document.querySelector("#modal-root .au");
    this._authForm(root, "check");
    root.querySelector("[data-act=done]").onclick = () => this._showAuth(isGate, "signin", { email });
    root.querySelector("[data-act=change]").onclick = () =>
      reset ? this._showForgot(isGate, email) : this._showAuth(isGate, "signup", { email });

    const rb = root.querySelector("[data-act=resend]");
    const cooldown = (sec) => {
      let n = sec;
      rb.disabled = true;
      rb.textContent = `Resend email in ${n}s`;
      const tm = setInterval(() => {
        if (!document.body.contains(rb)) { clearInterval(tm); return; }
        n--;
        if (n <= 0) { clearInterval(tm); rb.disabled = false; rb.textContent = "Resend email"; }
        else rb.textContent = `Resend email in ${n}s`;
      }, 1000);
    };
    const send = async () => {
      rb.disabled = true;
      rb.innerHTML = this._authSpinner("Sending…");
      const res = reset ? await SupabaseAuth.sendPasswordReset(email) : await SupabaseAuth.resendSignup(email);
      if (!document.body.contains(rb)) return;
      if (res && res.ok) { this.toast("📧 Email sent again"); cooldown(60); }
      else {
        const er = this._authError(res && res.error);
        this.toast(er.msg);
        cooldown(er.code === "rate" ? 60 : 5);
      }
    };
    rb.onclick = send;
    if (sendNow) send(); else cooldown(60);
  },

  /* ---------- 已登入狀態 Account Hub ---------- */
  async _showAccountHub() {
    const user = SupabaseAuth.currentUser();
    let identities = [];
    try { identities = (await SupabaseAuth.getIdentities()) || []; } catch (e) {}
    const emailIdent = identities.find(i => i.provider === "email");
    const googleIdent = identities.find(i => i.provider === "google");
    const hasGoogle = !!googleIdent;
    const hasEmail = !!emailIdent;
    const name = loadState().playerName || "The PokéEngmon Trainer";
    const initial = (name.trim()[0] || "T").toUpperCase();
    const gMail = googleIdent?.identity_data?.email || "";
    const eMail = emailIdent?.identity_data?.email || "";
    const hint = !hasGoogle
      ? "Connect Google so you can sign in with one tap — and never get locked out."
      : (!hasEmail ? "You sign in with your Google account." : "You can sign in with either method.");

    this.showModal(`
      <div class="login-hub au" data-gate="0" role="dialog" aria-labelledby="au-title">
        ${this._authCloseBtn(false)}
        <div class="au-acct">
          <div class="au-avatar" aria-hidden="true">${escapeHTML(initial)}</div>
          <div class="au-acct-info">
            <div class="au-acct-name" id="au-title">${escapeHTML(name)}</div>
            <div class="au-acct-email">${escapeHTML(user?.email || gMail || eMail || "")}</div>
            <div class="au-synced">Progress synced</div>
          </div>
        </div>
        <div class="au-sec">Sign-in methods</div>
        <div class="au-list">
          <div class="au-li">
            <span class="au-li-ic">${this._authIcon("google")}</span>
            <span class="au-li-t">Google${gMail ? `<small>${escapeHTML(gMail)}</small>` : ""}</span>
            ${hasGoogle ? `<span class="au-pill-ok">Connected</span>` : `<button type="button" class="au-link" id="au-link-google">Connect</button>`}
          </div>
          <div class="au-li">
            <span class="au-li-ic">${this._authIcon("mail")}</span>
            <span class="au-li-t">Email &amp; password${eMail ? `<small>${escapeHTML(eMail)}</small>` : ""}</span>
            ${hasEmail ? `<span class="au-pill-ok">Connected</span>` : `<span class="au-muted">Not set</span>`}
          </div>
        </div>
        <p class="au-hint au-hint-left">${hint}</p>
        <div class="au-stack">
          <button type="button" class="au-btn au-btn-danger-ghost" id="au-signout">Sign out</button>
        </div>
      </div>`, false);

    const root = document.querySelector("#modal-root .au");
    this._authForm(root, "account");

    const lg = root.querySelector("#au-link-google");
    if (lg) {
      lg.onclick = Guard.asyncClick(async () => {
        lg.disabled = true;
        lg.innerHTML = this._authSpinner("Connecting…");
        const res = await SupabaseAuth.linkGoogle();
        if (res && !res.ok) {
          lg.disabled = false; lg.textContent = "Connect";
          if (res.error === "manual_linking_disabled") {
            this.toast("Please enable Manual Linking in Supabase Dashboard (Auth → Settings → Security)");
          } else {
            this.toast("Failed to connect Google: " + (res.error || "unknown"));
          }
        }
      }, "link-google");
    }
    root.querySelector("#au-signout").onclick = () => this._confirmSignOut();
  },

  _confirmSignOut() {
    this.showModal(`
      <div class="login-hub au au-center" data-gate="0" role="alertdialog" aria-labelledby="au-title">
        <div class="au-art" aria-hidden="true">👋</div>
        <h2 class="au-title" id="au-title">Sign out?</h2>
        <p class="au-sub">Your progress is safe in the cloud. Progress on this device will be cleared until you sign in again.</p>
        <div class="au-stack">
          <button type="button" class="au-btn au-btn-danger" id="au-submit">Sign out</button>
          <button type="button" class="au-btn au-btn-ghost" data-act="cancel">Cancel</button>
        </div>
      </div>`, false);
    const root = document.querySelector("#modal-root .au");
    const F = this._authForm(root, "signout");
    root.querySelector("[data-act=cancel]").onclick = () => this._showAccountHub();
    root.querySelector("#au-submit").onclick = Guard.asyncClick(async () => {
      F.busy(true, "Signing out…");
      try {
        await SupabaseAuth.signOut();
        if (window.Friends && Friends.stopPolling) Friends.stopPolling();
        clearGameProgress();
        const fresh = loadState();
        fresh._googleMigrated = false;
        saveState();
        try { await Sync.pull(); } catch (e) {}
        this._markLoggedOut();
        this.closeModal();
        this.renderHome();
        this.toast("Signed out — local progress cleared");
        /* Sign out 後 → 自動彈 Login Gate（Rule 51；500ms 等 toast 顯示） */
        setTimeout(() => { this.openLoginHub(true, "signin"); }, 500);
      } catch (e) {
        console.error("[SignOut] failed:", e);
        F.busy(false);
        this.toast("Sign out failed: " + e.message);
      }
    }, "sign-out");
  },

  /* ---------- 首次登入 Learning Curve Mode 設定 ---------- */
  _showCurveSetupForm() {
    const modeOpts = [
      { v: "junior", label: "🧒 Junior", desc: "Gentle curve with extra attempts & hints" },
      { v: "standard", label: "📘 Standard", desc: "Balanced review for most learners" },
      { v: "teen", label: "🎓 Teen", desc: "Steadier pace for secondary learners" },
      { v: "adult", label: "🧑 Adult", desc: "Longer intervals for faster recall" }
    ];
    const modeHtml = modeOpts.map(o => `
      <label class="curve-mode-opt${o.v === "standard" ? " active" : ""}">
        <input type="radio" name="curveModeSetup" value="${o.v}" ${o.v === "standard" ? "checked" : ""}>
        <span class="cm-label">${o.label}</span>
        <small class="cm-desc">${o.desc}</small>
      </label>`).join("");

    this.showModal(`
      <div class="login-hub curve-setup-hub">
        <div class="lh-ball" aria-hidden="true"></div>
        <h3>📈 Pick Your Learning Curve</h3>
        <p class="lh-sub">This controls how aggressively we schedule reviews. You can change it anytime in Settings.</p>
        <div class="curve-mode-grid">${modeHtml}</div>
        <div class="lh-actions">
          <button id="lh-curve-continue" class="btn-big btn-primary">Start Playing →</button>
        </div>
      </div>`, false);  /* 呢個 modal 可以關，但最好俾用戶揀完先關 */

    /* Setup form 嘅 active 切換（之前漏咗！） */
    document.querySelectorAll('input[name="curveModeSetup"]').forEach(r => {
      r.onchange = () => {
        document.querySelectorAll(".curve-mode-opt").forEach(l => l.classList.remove("active"));
        r.closest(".curve-mode-opt").classList.add("active");
      };
    });

    document.getElementById("lh-curve-continue").onclick = Guard.asyncClick(async () => {
      const sel = document.querySelector('input[name="curveModeSetup"]:checked');
      const mode = sel ? sel.value : "standard";
      /* 寫入本地 state + SM2 */
      if (typeof setCurveMode === "function") setCurveMode(mode);
      saveState();
      /* 寫入 DB（pushState 會自動 patch user_account.curve_mode） */
      try { await Sync.pushState(); } catch (e) { console.warn("Curve mode DB patch failed:", e); }
      this.closeModal();
      this.toast(`📈 Curve mode: ${mode}`);
    }, "curve-continue");
  },

  /* ---------- 改訓練員名 ---------- */
  openRename() {
    const st = loadState();
    this.showModal(`
      <div class="rename-box">
        <h3 class="rename-title">Trainer Name</h3>
        <p class="rename-sub">Type a name for your trainer.</p>
        <input id="rename-input" class="rename-input" type="text" maxlength="24"
               autocomplete="off" autocapitalize="words" spellcheck="false"
               value="${escapeHTML(st.playerName)}">
        <div class="confirm-row">
          <button id="rename-save" class="btn-big btn-primary">Save</button>
          <button id="rename-cancel" class="btn-big btn-plain">Cancel</button>
        </div>
      </div>`);
    const input = document.getElementById("rename-input");
    input.focus();
    input.select();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("rename-save").click();
    });
    document.getElementById("rename-save").onclick = () => {
      const name = input.value.trim().slice(0, 24) || "The PokéEngmon Trainer";
      st.playerName = name;
      st.nameCustomized = true;
      saveState();
      /* trainer_name 係唯一仲直寫嘅 account 欄位 */
      if (window.Sync && Sync.isEnabled()) Sync.pushState();
      this.closeModal();
      this.renderHome();
      this.toast(`Trainer name saved: ${name}`);
    };
    document.getElementById("rename-cancel").onclick = () => this.closeModal();
  },

  /* ---------- 版權 / 免責聲明 ---------- */
  openDisclaimer() {
    this.showModal(`
      <div class="disclaimer-box">
        <h3>Copyright &amp; Disclaimer</h3>
        <p>This website is an unofficial, non-commercial educational and reward tool. It is <b>NOT</b> affiliated with, endorsed, sponsored, or approved by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company.</p>
        <p>Pokémon and Pokémon character names, images, sprites, cries, music, and related game assets are trademarks of © Nintendo, Creatures Inc., and GAME FREAK inc. All rights belong to their respective owners.</p>
        <p>All assets are used only for non-commercial educational, learning-reward, and motivational purposes.</p>

        <h4>Data &amp; Image Credits</h4>
        <p>Pokémon base stats, moves, evolution data, sprites, and type icons are provided by <a href="https://pokeapi.co" target="_blank" rel="noopener">PokéAPI</a>.</p>
        <p>Pokémon cries are provided by the Pokémon Showdown community.</p>
        <p>The quiz progress runner mascot is a custom, non-commercial fan illustration supplied for this project (Pikachu-inspired). Pokémon-related rights remain with © Nintendo / Creatures Inc. / GAME FREAK inc.</p>
        <p>Battle UI frames, HP boxes, battle backgrounds, trainer sprites, Poké Ball graphics, and move attack-effect sprites are original assets from Pokémon FireRed/LeafGreen (© Nintendo / Creatures Inc. / GAME FREAK inc.), ripped from <a href="https://www.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen/" target="_blank" rel="noopener">The Spriters Resource</a> (rippers: redblueyellow, desgardes, Superjustinbros, Spherical Ice, EternalLight, wormintheworks) and the pret/pokefirered decompilation project.</p>
        <p>Per-move battle animations (frame data + spritesheets), in-battle Pokémon sprite animations, the battle dialogue window, the party (switch Pokémon) screen UI, the "emerald" dialogue font and battle sound effects are adapted from the open-source assets of the Pokémon fan games <a href="https://www.pokerogue.net/" target="_blank" rel="noopener">PokeRogue</a> and Pokémon Reborn (<a href="https://github.com/pagefaultgames/pokerogue-assets" target="_blank" rel="noopener">pokerogue-assets</a>, beta branch). All Pokémon-related artwork remains © Nintendo / Creatures Inc. / GAME FREAK inc.</p>

        <h4>Font</h4>
        <p><i>Inter</i> by Rasmus Andersson, licensed under the SIL Open Font License 1.1.</p>
        <p>Battle screen font: <i>pokemon-emerald-pro</i> (PokeRogue's "emerald" font), with <i>DotGothic16</i> by Fontworks Inc. (SIL Open Font License 1.1) as a fallback.</p>

        <h4>Music &amp; Sound Credits</h4>
        <p>Background music: <i>Flat Water</i> by BGM channel (official music video). All rights belong to their respective owners.</p>
        <p>Battle/jingle/evolution tracks (<i>Battle! (Wild Pokémon)</i>, <i>Obtained a Pokémon!</i>, <i>Obtained a Berry!</i>, <i>Evolution</i>, <i>Fanfare — Evolution</i>, from Pokémon Red/Green/Blue/Yellow) are from the original Pokémon game soundtracks, composed by Junichi Masuda, Gō Ichinose, Morikazu Aoki, Shota Kageyama and others. © Nintendo / Creatures Inc. / GAME FREAK inc.</p>
        <p>Pokémon soundtrack resources referenced from <a href="https://downloads.khinsider.com" target="_blank" rel="noopener">KHInsider Video Game Music</a> (unofficial fan archive).</p>

        <h4>In-Game Items</h4>
        <p>All diamonds, pull tickets, candies, cards, and Pokémon in this app are virtual learning rewards. They have no real-world value and cannot be exchanged for money or physical goods. There is no real-money trading.</p>

        <button id="btn-disclaimer-close" class="btn-big btn-primary">Close</button>
      </div>`);
    document.getElementById("btn-disclaimer-close").onclick = () => this.closeModal();
  }
});
