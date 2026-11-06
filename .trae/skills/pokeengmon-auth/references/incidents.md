# PokeEngmon 登入（Auth） — 事故紀錄同原文（references）

> 由 `pokeengmon-preop-checklist` 原文搬入（2026-11-06），每條 Rule 原文照錄。主要點喺 `../SKILL.md`。

### Rule 8 — Google OAuth: in-app sign out ≠ Google sign out

The "Connected Trainer" email comes from the JWT that Google/Supabase issued — if it shows the wrong account, the OAuth flow itself completed with that Google account. It is NOT a display bug.

- In-app sign out does NOT sign the user out of Google. Without `prompt=select_account` in the `/auth/v1/authorize` URL, Google silently re-uses the browser's current/default Google session.
- NEVER remove `prompt=select_account` from `signInWithGoogle()` in `js/supabase-auth.js`.
- `signInWithGoogle()` must clear the local session (`pokeengmon_auth_session`) BEFORE redirecting, so a failed/cancelled OAuth can't restore the previous account.
- If a user reports "signed in with account X but it shows account Y": the login click most likely ran stale pre-v85 JS (old SW cache, page open since before the deploy). Have them confirm the latest version in Settings, sign out, and retry — the account chooser should appear.

### Rule 48 — Email sign up / sign in 後必須觸發 Learning Curve Mode 設定

Incident (2026-11-04)：新增 Email/Password auth 後，新用戶 sign up / Google 首次登入都冇設定 Learning Curve Mode。

- 新帳戶（`migrateAnonymous` 回 `true`）sign up / sign in 後，走 import 流程之後必須彈出 `_showCurveSetupForm()` 讓用戶揀 Junior/Standard/Teen/Adult。
- Curve mode 寫入：`setCurveMode(mode)` + `saveState()` + `Sync.pushState()`（pushState 會 patch `user_account.curve_mode`）。
- `_needsCurveSetup` flag 存喺 `loadState()` 回傳 object，`_postLogin` 完畢後檢查 → `setTimeout(() => _showCurveSetupForm(), 800)`（等 toast 顯示完）。
- signOut / 關閉 OAuth 合併流程後要重置 `_needsCurveSetup = false` + saveState。

### Rule 50 — Supabase Auth：Email provider + Manual Linking + Automatic Linking

Incident (2026-11-04)：由純 Google OAuth 變成 Email/Password +（未整 Apple）。新增三個 auth flow + 兩個 Supabase Dashboard 設定：

**Dashboard 必設（代碼無法替代）：**
1. Email Provider → Enable，**關閉 Confirm Email**（暫時）—— sign up 即拿 session
2. Authentication → Settings → Security → Enable **Manual Linking**（Email 帳戶可以連 Google identity）

**Auth Functions 規格（`js/supabase-auth.js`）：**
| Function | GoTrue Endpoint | Purpose |
|----------|-----------------|---------|
| `signUpWithEmail(email, password)` | `POST /auth/v1/signup` | 註冊 |
| `signInWithEmail(email, password)` | `POST /auth/v1/token?grant_type=password` | 登入 |
| `sendPasswordReset(email)` | `POST /auth/v1/recover` | 忘記密碼 |
| `linkGoogle()` | `/auth/v1/user/identities/authorize?provider=google`（需 Bearer token） | 已登入狀態下連接 provider |
| `getIdentities()` | `GET /auth/v1/user`（回 `identities[]`） | 顯示已連接 identities |

**Automatic Linking：** 同一 email 嘅 identities（Email + Google）Supabase 會自動 link 到同一個 `auth.users.id`。關閉 Confirm Email 令呢個行為更可靠。

### Rule 51 — Login Gate：未登入必須彈，sign out / OAuth cancel 後要自動再彈

Incident (2026-11-04)：新增強制登入邏輯後發現三個場景漏咗彈 Login Gate：

1. App 啟動時已冇 session → 要彈 Login Gate（isGate=true）
2. Sign out 後 → 500ms 後自動彈（等 toast 顯示完）
3. OAuth sign in cancel（user 拒絕合併 prompt 後 signOut）→ 同樣要彈

**實作規格：**
- `openLoginHub(isGate = false)`：`isGate = true` 時 Modal click outside 唔關閉，顯示 4 個入口（Continue with Google / Create Account / Sign In with Email + Password）。
- `Account Hub`（已登入）顯示 trainer name + identities list + Link 未連接 provider + Sign Out。
- **唔需要處理本地匿名用戶進度遺失**（product decision）。

### Rule 55 — 每個 auth 入口頁都要有 Google 選項；唔可以只喺 Login Hub 提供

Incident (2026-11-04)：Login Hub 有 `Continue with Google`，但 `_showSignInForm()` 只有 Email/Password 表單。第一次玩嘅用戶想「登入」直覺會撳 Sign In，入到去完全搵唔到 Google，要退出再返 Hub 先見到 —— 提問者一開始只睇 Hub 一頁就斷定「文字冇問題」，係被用戶指出盲點（第一手用戶心智 ≠ 設計者視角）。

- 任何「可以開始使用」嘅 auth 頁（Login Hub、Sign In、Sign Up、Account Hub）都必須列出所有 available providers，唔可以假設用戶會行到特定一頁。
- 覆核方法：逐頁問「新用戶入到呢頁，佢想用嘅 provider 喺唔喺度？」而唔係只看主入口。
- Sign In 頁現已加 `#si-google`（`btn-google` + `or Email` divider，同 Hub 一樣 layout）；新加 auth 頁要照抄同一結構，`signInWithGoogle()` 對新帳戶會自動建帳（`migrateAnonymous` 回 true → 觸發 Curve 設定，見 Rule 48）。
- ~~文案維持 `Continue with Google`~~（v1.59 起由用戶推翻，見 Rule 73）：Google 掣按所在 tab 轉名 —— Create account tab = `Sign up with Google`、Sign in tab = `Sign in with Google`（都係 Google branding 官方允許字串）。唔好改成長句或雙行；可發現性問題仍然用「每個入口都提供」解決。
- 驗證：`node tools/preview-iphone.mjs --headless --click "#btn-entry-yes" --js "doc.querySelector('#lh-signin').click()" --shot out.png`，確認 Sign In 頁見到 Google 掣 + 表單冇被裁切。

### Rule 73 — Auth UI v2：單一卡片 + Create/Sign in tab；表單一定要俾 Password Manager 用、input 16px

Incident (2026-11-05，login 商用級改版)：舊版要撳 3 下（Hub → Create/Sign in → 表單）先見到表單；Google 掣喺 Hub 同 Sign in 頁各有一份，但 Create account 頁冇。另外有兩個真 bug：
1. 全部表單 `autocomplete="off"` → iOS Keychain／Google Password Manager 唔識自動填或者儲密碼。
2. `.lh-input` 14px → iOS Safari 一 focus 就自動 zoom in。

**規格（`js/app.js` `_showAuth` 一族、`css/style.css` `.au-*`）：**
- `openLoginHub(isGate, tab)` → 已登入就 `_showAccountHub()`，否則 `_showAuth()`。冇 tab 時：`localStorage.pe_auth_last` 有記錄就開 Sign in（預填 email、對應方法標「Last used」），冇就開 Create account。`_showSignUpForm`／`_showSignInForm` 只係 wrapper。
- Google 掣兩個 tab 都有，按 tab 轉名（見 Rule 55）。
- autocomplete：sign up 用 `nickname`／`email`／`new-password`；sign in 同 forgot 用 `username`／`current-password`。email 格要 `inputmode="email" autocapitalize="off" spellcheck="false"`，加 `enterkeyhint`。
- 所有 auth input 至少 16px。新增任何表單 input 都要跟呢條，唔係淨係 auth。
- 驗證：blur 先驗證，打字就清錯誤，submit 時 focus 第一個錯嘅格。錯誤顯示喺格下面（`.au-msg.err`）；server 錯誤經 `_authError()` 對應成人話（taken／creds／unconfirmed／rate／net）。
- Loading：`F.busy()` 鎖晒成張卡，submit 掣轉 spinner。`.is-busy` 時唔俾 Esc 關。
- 只有 `(hover: hover) and (pointer: fine)` 先 autofocus。手機唔 autofocus，否則一開就彈鍵盤遮住卡。
- Gate（`data-gate="1"`）：冇 ✕、點外面唔關、Esc 唔關（Rule 51）。非 gate 可以用 ✕、Esc 或者點外面關。
- Check-inbox 頁：Resend 有 60s cooldown。confirm 用 `SupabaseAuth.resendSignup()`（`POST /auth/v1/resend`），reset 用 `sendPasswordReset()`。
- Sign up 即使要 confirm email，都要先將暱稱寫入 local `playerName`，等首次登入 `import_state` 帶上雲（舊版呢個情況會漏咗個暱稱）。
- `App.toast()` 用 `textContent`，唔好再 `escapeHTML()` 一次，否則會見到 `&amp;`。
- Curve setup modal 仍然用舊 `.login-hub`／`.lh-ball`／`.lh-sub`／`.lh-actions`，唔好刪。
- 驗收：要 stub `SupabaseAuth.*`（唔好用假帳號打 production Supabase），測 empty submit、taken、creds、forgot → check inbox、gate 唔關得、Account Hub → Sign out confirm；尺寸 440×956 同桌面都要測，`.modal-card` 唔可以有 overflow。

Skill: Rule 73 added
