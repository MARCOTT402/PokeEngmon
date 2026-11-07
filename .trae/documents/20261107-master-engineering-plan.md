# 總計劃：商用級工程化 ＋ 現代化（合併版）— 2026-11-07

> **唯一執行依據。** 合併自：
> - `.trae/documents/20261106-commercial-grade-engineering.md`（商用級工程化計劃：測試、死碼、部署、洩漏、拆檔、門面）
> - `.trae/specs/20261107-modernization.md` ＋ `.trae/documents/20261107-modernization-phase1.md`（現代化：typecheck、z-index token、`html` helper、Store、ESM、UX、畫質）
>
> **優先次序：現代化 spec 優先（用戶 2026-11-07 定）**；衝突一律跟佢，主線次序跟佢嘅 Phase 1–4，商用級項目只做插入。本文件係兩份計劃合埋嘅執行清單（狀態、分工、次序以本文件為準）。穩定性／效能計劃 `20261106-stability-performance.md` 已全部完成，唔再列。

**目標：** 專業人士打開 repo 同正式網址，都會覺得係成熟嘅商用產品：有自動測試同 CI 把關、冇死碼同公開垃圾檔、型別檢查、冇記憶體洩漏、檔案按責任拆細、UX 同畫質有一致嘅設計語言。

**界線（兩份計劃一致）：** 唔換 framework（唔用 React／Vue）、唔加 build step（GitHub Pages 直接 serve 原檔）、唔加 CSS framework、未經你睇過唔換現有戰鬥／扭蛋畫面。

---

## 0. 執行規則（兩個 session 都要跟）

1. **同一時間只可以有一個 session 改共用檔**：`js/**`、`css/**`、`index.html`、`sw.js`、`package.json`／lock、`.github/workflows/*`、`CODEBASE_INDEX.md`、`.trae/skills/**`。開工前先 `git status`；見到有其他人未 commit 嘅改動喺同一個檔，就停低問你。
2. **每個 task 完成即 commit**（等你講先 commit），唔好兩個 task 嘅改動混埋喺 working tree。
3. 每步都要綠：`npm run lint`（0 warning）、`npm test`、`npm run typecheck`（Task M1 完成後）；改 CSS 前後要跑 `shots.mjs --compare`，而且要做像素比較；改版面要跑 `npm run test:e2e`，只可以剩已知 fail（P9b、S1）。
4. 新 Rule 編號：加之前先 `grep -oh "Rule [0-9]*" .trae/skills/*/SKILL.md | sort -t' ' -k2 -n | tail -1`，用下一個號。
5. 改 repo 檔唔好用 Git Bash 嘅 `sed -i`（會改晒行尾，Rule 108）。

---

## 1. 狀態總覽

| 項目 | 來源 | 狀態 |
|---|---|---|
| 穩定性＋效能（Guard、Net、SW、SM-2 快取、轉場、開機減重） | 穩定性計劃 | ✅ 完成 |
| A：`npm test`（node:test）、ESLint、CI 擋 release、e2e runner | 商用級 Phase A | ✅ `c12b3b1`、`4c5aa8e` |
| B4：清死碼（JS -204、CSS -286、audit 工具） | 商用級 Task 4 | ✅ `478b921` |
| B5a（P1.3 前置）：`js/core/dom.js`（統一 `escapeHTML`、`haptic`） | 商用級 Task 5 | ✅ `93a02b9` |
| P1.1 typecheck：設定（`163ffd4`）＋ `npm run typecheck`、26／43 個檔 `// @ts-check`、ratchet 測試、CI 步驟 | 現代化 Task 1 | ✅ 設定 `163ffd4`；其餘見下一個 commit |
| 其餘 | — | ⏳ 見 §3 |

**而家下一步**：P2.3 ESM bottom-up（P2.5 已完成：app／quiz／gacha／battle 全部拆好）。

---

## 2. 優先次序同已解決嘅衝突

**用戶 2026-11-07 定咗：現代化 spec（`.trae/specs/20261107-modernization.md`）嗰邊傾嘅方向優先。** 所以主線次序同做法跟現代化 spec 嘅 Phase 1–4；商用級計劃剩低嘅項目，只喺唔衝突嘅位置插入。兩份計劃有衝突嘅地方，一律跟現代化 spec。

- **D1（已解決，跟現代化 spec）**：`app.js` 照現代化 spec 2.2 拆做 classic script，掛返 `App` 上；之後照 2.3 **由底層開始轉 ES module**，過渡期保留 `window.X = X`，一路向上推。商用級計劃 §10 Q3「唔轉 ESM」作廢。spec 列明三個前置條件：Rule 75（`const` 唔會掛上 `window`）、Guard 要保持第一個 classic script（Rule 94）、`sw.js` ASSETS。另外 `tests/helpers/load.js` 要先加 ESM 路徑。
- **D2 部署**：照商用級做法用 GitHub Actions，只發佈 App 檔；同現代化 spec 冇衝突。做到嗰陣要你喺 repo Settings → Pages 將 Source 改做「GitHub Actions」。

---

## 3. 合併後嘅分期（主線 = 現代化 spec 嘅 Phase 1–4）

### P1 — 地基，唔改行為（現代化 Phase 1）

| # | 內容 | 來源 | 驗收 |
|---|---|---|---|
| P1.1 | **Typecheck**：`npm run typecheck`（`tsc -p tsconfig.json`）；喺已經乾淨嘅檔加 `// @ts-check`，清單只准加唔准減；CI 喺 lint、test 之後跑 | 現代化 T1（做緊） | ✅ 2026-11-07：26 個檔 0 錯；`tests/unit/ts-check-ratchet.test.js`；驗收改用「未定義 global → TS2304」（`Sync` 宣告做 `any`，`Sync.nope()` 唔會紅） |
| P1.2 | **全域 z-index token**：`:root` 加 `--z-*`（數值同現況一樣）；≥100 嘅字面值換做 token；JS 設 `zIndex` 嘅地方同步 | 現代化 T2 | ✅ 2026-11-07：22 個 token、25 條全域層；`check-z-tokens.mjs` 同 HEAD 逐條一樣；`tests/unit/z-tokens.test.js`；JS 冇 `zIndex` 字面值要同步 |
| P1.3 | **`html` tagged template**：新檔 `js/core/html.js`，**底層用 `dom.js` 嘅 `escapeHTML`**（唔准再寫一份 escape）。功能：`html```、`raw()`、陣列 join、`null`／`false` 變空字串、`Html.render(el, tpl)` | 現代化 T3（＋商用級 B5a） | ✅ 2026-11-07：`tests/unit/html.test.js` 8 項；瀏覽器實測 XSS 字串只顯示成文字；Rule 111 |
| P1.4 | **畫質 prototype**：`tools/prototype-battle-fx.html`（現行 vs PixiJS 特效） | 現代化 T4 | ✅ 2026-11-07：`tools/prototype-battle-fx.html`（左真 `PokeSprite`＋`MoveAnim`，右 PixiJS 7.4.2＋AdvancedBloom）；headless 錄格桌面同 440 手機都正常、0 error。2026-11-07 用戶視覺上滿意，P4 可以開 spec（按需載入、可關 bloom、reduced-motion、低階機降級） |
| P1.5 | 插入：**彎撇號判錯（bug）**：`Quiz._norm` 將 `’ ‘ ʼ` 統一做 `'` | 商用級 KNOWN | ✅ 2026-11-07：測試先紅 2 項再綠；瀏覽器輸入 `weren’t` 判啱；Rule 112 |
| P1.6 | 插入：**部署＋CI 收口**：`deploy` job（`needs: release`，`ref: main`）；`tools/deploy-files.json`；`sw-assets.test.js`、`deploy-manifest.test.js`；CI 次序 lint → test → typecheck → release → deploy。同 P1.1 一齊改 `release.yml`，唔好分兩次 | 商用級 Task 5b | ✅ code 2026-11-07：deploy job、`tools/deploy/*`、兩個測試（順帶補咗 `gym.js`、`supabase-config.js` 冇 precache）；本地模擬正式網址：內部檔 404、App 正常、SW activated。2026-11-07 Pages 已改做 GitHub Actions；`ac28387` 部署 1.71.2，正式網址內部檔 404 |

**P1.1 交接資料（2026-11-07）：**
- `checkJs: true` 開全部檔嘅話：未加 `globals.d.ts` 時 1,103 錯，加咗之後 345 錯。大部分係 DOM 型別收窄問題（`Element.value`、`EventTarget.closest`）；`app.js` 173、`battle.js` 56、`quiz.js` 28、`bag.js` 24。
- 第一批可以直接加 `// @ts-check` 嘅檔（已經 0 錯）：`js/battle/{energy,engine,moveanim,rng,sprites,state}.js`、`calendar`、`care`、`core/net`、`dex-sort`、`explain`、`gens-data`、`mega-data`、`pokemon`、`qimg-db`、`sm2`、`storage`、`sync`。加咗 cast 之後應該都乾淨，但要重跑確認：`anim-speed`、`avatars`、`pvp`、`guard`、`evolve-scene`、`gym`、`quests`。另外 `core/dom.js` 本身細，應該亦乾淨。
- 陷阱：頂層已經有 `const X` 嘅檔（App、BagUI、BattleLand、EvolveScene、Friends、GenPack、Pet、PvpRealtime、SupabaseAuth）**唔可以**喺 `globals.d.ts` 再 `declare var`，會撞 TS2451。結尾有 `module.exports` 嘅檔會被 TS 當 CommonJS，佢哋嘅 `const` 唔係 global，所以反而要 `declare var`（例如 Battle、BattleRng、BattleState、MEGA_STONES）。
- `Html` 未有定義，`declare var Html` 已經拎走；P1.3 做 `html.js` 嗰陣再加。

### P2 — 架構（現代化 Phase 2）

| # | 內容 | 來源 |
|---|---|---|
| P2.1 | ✅ 2026-11-07 **Store**：`js/store.js`（`get`／`select`／`update`／`subscribe`，Rule 115）。舊式 `saveState()` 都會通知訂閱者，所以舊 call site 留待 P2.2 拆 `app.js` 嗰陣分批換。`tests/unit/store.test.js` 11 項 | 現代化 2.1 |
| P2.2 | ✅ 2026-11-07 **拆 `app.js`**：4,149 → 72 行＋10 個 `js/app/*.js`（router、layout、home、setup-custom、settlement、settings、auth-ui、sheets、modals、boot），用 AST 搬、方法指紋證明冇改（`tests/unit/app-surface.test.js`，Rule 116）。`init`（828 行）再拆做 13 個 `_boot*` 步驟（連續語句、次序不變，110 句核對一致） | 現代化 2.2（＋商用級 Phase D） |
| P2.3 | **ES modules**：由冇副作用嘅底層開始（`data`、`pokemon`、`sm2`、`core/*`）轉 `type="module"`，過渡期 `window.X = X`，逐層向上推。前置：見 §2 D1 | 現代化 2.3 |
| P2.4 | **可取消計時**：`Timers.scope(name)` → `after(ms, fn)`／`cancel()`；離開 view 時一次過清（取代散落嘅 token 寫法，Rule 52／64） | 現代化 2.4 |
| P2.5 | ✅ 2026-11-08 `battle/battle.js` 2,690 → 159 行＋7 個 `js/battle/ui/*.js`（狀態入 `BattleUI._.S`，TS checker 自動改寫，固定 seed 重播測試證明行為不變，Rule 117）。2026-11-07 `quiz.js` 2,012 → 33 行＋9 個 `js/quiz/*.js`；`gacha.js` 1,737 → 44 行＋6 個 `js/gacha/*.js`（方法指紋證明冇改，Rule 116） | 商用級 Phase D |
| P2.6 | 插入：遷移嘅戰鬥／SM-2 測試改用 `loadScripts`（連 ESM 路徑），等 coverage 計得到 | 商用級 |

### P3 — UX／流暢度（現代化 Phase 3）

| # | 內容 | 來源 |
|---|---|---|
| P3.1 | View Transitions API 轉頁（唔支援就照舊）；全面跟 `prefers-reduced-motion` | 現代化 3.1 |
| P3.2 | 動畫 token：`--dur-*`、`--ease-*`，數值同 `App.SHEET_MS` 等對齊（Rule 100） | 現代化 3.2 |
| P3.3 | 圖鑑長列表 `content-visibility: auto` | 現代化 3.3 |
| P3.4 | Long-task 監測：`PerformanceObserver('longtask')` → `Guard.report`（類別 `perf`，抽樣） | 現代化 3.4 |
| P3.5 | 插入：**洩漏＋重複渲染量度**：`tools/perf/leak.mjs`（6 個場景各開關 10 次，量 listener、DOM node、heap、WebGL context），同 `renderHome` 等撳一個掣嘅 render 次數；超標就修 | 商用級 Task 6 |
| P3.6 | Web Push 溫習提醒（要 Edge Function ＋ VAPID）：**另開 spec** | 現代化 3.5 |

### P4 — 畫質（現代化 Phase 4，prototype 先行）

- **P4.1 MoveAnim 2.0（先做）**：招式動畫跟足 PokeRogue 原作。審計見 `.trae/documents/20261107-move-anim-fidelity-audit.md`：561 招入面有 462 招有損失，41 招睇落同 Tackle 一樣。要做嘅嘢：
  - 重新匯入原作完整資料：全部影格、出招方／受招方精靈圖層、背景事件（85 張背景圖）、敵我兩個版本，匯入腳本要入 repo。
  - 播放器支援精靈動作同背景層。
  - 原作已經有嘅自製動畫換返原作。
  - 音效（約 3–6 MB）另外決定，按需載入。
- **P4.2 PixiJS 強化接入**：P1.4 prototype 用戶視覺上滿意（2026-11-07）。開 spec 決定點接入 `js/battle/`，要求包括：
  - 同 three.js 一樣按需載入，放 `vendor/`，加入 SW 快取。
  - WebGL 用唔到時退返現行做法。
  - 低階機自動關 bloom。
  - `prefers-reduced-motion` 時只保留傷害數字。
  - 加特效介面 `BattleFx`，令兩種實作可以互換。
  - 要喺 P4.1 之後做，因為 Pixi 版都係用同一個 `MoveAnim`。
- **P4.3**：GIF → animated WebP、Three.js 按機器調畫質。

### P5 — 插入：專業門面（商用級 Phase E；排喺現代化主線之後）

- `README.md`（產品介紹、截圖、架構圖、跑法、測試、CI badge）同 `LICENSE`（要你決定用邊個 license）。
- `innerHTML` 審計：171 處分三類（靜態／已 escape／含用戶資料但未 escape），第三類改用 `html```（P1.3）。
- CSP：先開 report-only 跑一輪，再正式啟用。
- Lighthouse（mobile）目標：Performance ≥ 85、Accessibility ≥ 95、Best Practices ≥ 95、PWA 可安裝。
- Supabase security／performance advisors：error 級全部處理。
- 順手清理：guest 開機時 `sync.js:552` 嘅 401 探測；server 冇人用嘅 `alloc_ev` RPC（要你批准先刪）。

---

## 4. 次序

`commit 兩批未 commit 改動` → **P1**（P1.1 → P1.2 → P1.3 → P1.5 → P1.6；P1.4 prototype 可以並行）→ **P2**（P2.1 → P2.2 → P2.5 → P2.3 → P2.4 → P2.6）→ **P3** → **P4**（等你睇完 prototype）→ **P5**。

現代化 spec 原本嘅次序全部保留。商用級嘅項目只插喺有依賴關係嘅位：P1.6 部署同 P1.1 都要改 `release.yml`，所以一齊做；P2.5 用 P2.2 同一個拆檔方法；P3.5 量度歸入流暢度一期；門面排最後。

---

## 5. 基線同目標

| 指標 | 2026-11-07 | 目標 |
|---|---|---|
| 單元測試 | 353（node:test） | 只增唔減 |
| ESLint | 0 error／0 warning（`--max-warnings 0`） | 保持 0 |
| Typecheck | `tsc` 0 錯（`checkJs: false`）；未有檔開 `@ts-check` | 逐步加檔，清單只增 |
| 最大 JS 檔 | `app.js` 約 4,150 行 | < 1,000 |
| `innerHTML` | 171 處，未審計 | 含用戶資料嘅全部經 escape |
| z-index | 94 處字面值（≥100 有 25 處） | 全域層用 token |
| e2e 已知 fail | P9b、S1（S1 視乎抽中邊條題，0–64px） | 修 S1 |
| 洩漏 | 未量 | 開關 10 次冇線性增長 |
| 正式網址公開內部檔 | 有 | 0（P2） |
| 資產 | `assets/` 76 MB（GIF 29 MB） | P7 之後再定 |

## 6. Review Focus（測試未必捉到、最容易出事嘅位）

1. 舊存檔遷移（`storage.test.js` 有 fixture）。
2. 拆檔或者轉 ESM 之後漏咗 API，或者載入次序變咗（`app-surface.test.js`；module 會 defer）。
3. 雙重 escape：`html``` 入面嘅值唔准再自己 escape（`dom.test.js`／`html.test.js`）。
4. 答案比對寬鬆度（`quiz-answer.test.js`）。
5. SW 或者部署清單漏檔，導致離線或者正式網址白屏（P2 兩個測試）。
6. z-index token 打錯值，令 overlay 疊錯層（`check-z-tokens.mjs` ＋ e2e overlay 測試）。
