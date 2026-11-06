# 穩定性＋效能優化計劃（商用級）— 2026-11-06

> 範圍：成個 App（純前端 + Supabase）。目標：**任何未預期錯誤／斷網都唔可以白屏、唔可以卡死，一定有兜底提示**；同時解決「入題卡一陣」「轉介面慢」。
> 狀態（2026-11-06）：§9 四個決定已確認。
> - ✅ §5.7 bench + §5.1 SM-2 快取（commit 253d320，Rule 93）
> - ✅ §2 全域錯誤邊界 + 兜底畫面 + async 掣 + 題庫載入失敗提示 + `client_errors` 上報（Rule 94；migration 已 apply）
> - ✅ §3.1–3.3 Net timeout＋token 續期（single-flight）＋401 重試（Rule 96）
> - ✅ §3.4–3.7 sync queue 持久化＋backoff＋keepalive、存檔防損、loading 出口（Net timeout 已解決）、離線 pill（Rule 98）
> - ⏭ 下一步：§4 數值兜底（NaN／undefined）
> 本 project 冇 framework（冇 React／Vue Error Boundary），所以「Error Boundary」要用原生方式自己做：全域 handler + 開機邊界 + 每個 view 嘅 render 邊界。

---

## 0. 審查結論（先答「係設計問題定未優化」）

**兩樣都有，但主因係幾個具體效能 bug，唔係架構本身唔得。** 純 HTML/JS + Supabase 呢個架構完全撐得起商用 PWA；問題係幾個熱點寫法係 O(N²)、同埋轉場動畫刻意「排隊」。

### 0.1 實測證據（localhost，桌面 CPU，未做 CPU 降速）

| 量度 | 結果 | 手機估計（4–6× 慢） |
|---|---|---|
| 選「全部課題」撳 Start → `Quiz.start()` 同步阻塞 | **627 ms**（第一次全新用戶 **870 ms**） | **2.5–5 秒** |
| `getAllQuestions()` | 0.3 ms | 唔係問題 |
| `App.openSetup()` | 2 ms | 唔係問題 |
| 題庫大小 | 1,380 題；SM-2 cards blob **359 KB** | — |
| 首次開 App 下載 | 1.5 MB transfer／**8 MB decoded**（兩首 BGM 4.3 MB + three.js 1.2 MB 開機就載） | 4G 慢網要等好耐 |

### 0.2 「入題卡」根因（已定位）

`js/sm2.js` `getOrCreateCard()` 每次都 `JSON.parse(localStorage)` 成個 cards blob；新卡仲要 `JSON.stringify` + `setItem` 成個 blob。`SM2.buildSession()` 對 pool 入面**每一題**都 call 一次 → 1,380 × parse 359 KB（新用戶仲加 1,380 次寫入，越寫越大）＝ O(N²)。
同一問題亦影響每答一題：`upsertCard()`、`appendHistory()`（2,000 筆）每次都 parse + stringify 成個 blob。

### 0.3 「轉介面慢」根因（設計層面）

- Sheet 切換係**串行**：舊 sheet 收 400 ms → `setTimeout 410` → 新 sheet 開 400 ms ≈ **0.8 秒先見到內容**（`js/app.js` binder）。
- Friends／Leaderboard／Battle Menu 返主頁：先播 400 ms exit 動畫**先**切 view（`showView` 入面 `setTimeout 400`），期間撳咩都冇反應。
- `.ph-sheet` 用 `height` transition（觸發 layout，唔係 GPU 合成）→ 中低階手機掉幀。
- 開機同時 fetch + decode 4.3 MB BGM、載 1.2 MB three.js，搶頻寬同主線程。
- Service Worker 同源檔案用「network-first + `cache: reload`」且**冇 timeout**：每次開 App 都要網絡下載 40 幾個 JS；網絡差（有訊號但好慢）時唔會 fallback 去 cache，會一直等。

### 0.4 穩定性死角（已定位）

| # | 問題 | 位置 | 後果 |
|---|---|---|---|
| S1 | 冇 `window.onerror`／`unhandledrejection` | 全 App | 錯誤無記錄、無提示 |
| S2 | `App.init()` 失敗只係收走 loading | `js/app.js` 尾 | 留低半殘主頁＝變相白屏 |
| S3 | view render 中途 throw → `_setFrameLock(true)` 唔會解 | `showView`／`Quiz`／`Battle` | 下巴 Home 掣 disabled ＝ **卡死** |
| S4 | 全部 `fetch` 冇 timeout | `supabase-auth.js`、`sync.js`、`pvp.js`、`friends.js` | 慢網時掣一直 disabled／Loading… 永遠轉 |
| S5 | RPC 前冇 refresh token | `SupabaseAuth._rpc` | 用超過 1 粒鐘 → 全部 RPC 401 → 靜靜 return null（鑽石／EXP 唔入帳） |
| S6 | Sync queue 失敗每 1 秒無限 retry；queue 只喺記憶體 | `sync.js` `_flush` | 斷網狂 retry 食電；iOS 殺 App（`beforeunload` 唔 fire）→ 進度未上雲就冇咗 |
| S7 | `loadState()` parse 失敗 → `defaultState()`，下一次 `saveState()` 覆蓋 | `storage.js:84` | localStorage 損壞時**靜靜洗咗玩家存檔** |
| S8 | 題庫／資料檔載入失敗靜靜 return 0 | `data.js` `loadSiteQuestions`、`pokemon.js` | 用戶見到「All caught up!」誤導，唔知係網絡問題 |
| S9 | async 掣 `b.disabled = true` 之後冇 `finally` | `friends.js`、`leaderboard.js` 等 16 處 `onclick = async` | 出錯後掣永遠灰 |
| S10 | SW precache key 冇 `?v=`，但頁面 request 有 `?v=1.65.0` | `sw.js` | 第一次離線開 App，precache 對唔上 |

### 0.5 數值（NaN／undefined）風險點

- JS 幾何：`bag.js fit()`、`battle/landscape.js fit()`（iOS 轉機瞬間 `innerWidth` 可能係 0 → `scale(0)`／除 0）、`quiz.js` 精靈球物理（`_computePlayfield`、速度）、sheet 拖拉高度（`app.js` ~3479–3541）、`capture.js` renderer size。
- Task 2 外殼幾何（`--frame-w`／`--frame-screen-*`）係 CSS `calc()`，唔會 throw，但 JS 寫入 CSS 變數（`--bl-s`、`--bl-w`）如果係 `NaN` 會令成條規則失效。
- RPC 回傳數值（diamonds balance、exp、level、HP）直接用，server 回 `null`／字串時會變 `NaN` 顯示或者寫入 state。
- 戰鬥傷害公式（`battle/engine.js`）任何一個 stat 係 `undefined` → HP `NaN` → 永遠唔會 ≤ 0 → **戰鬥卡死**。

---

## 1. 商用級驗收標準（SLO）

| 指標 | 目標 | 量度方法 |
|---|---|---|
| 撳 Start → 第一題出現（主線程阻塞） | **< 50 ms**（桌面）／< 200 ms（4× CPU 降速） | `tools/perf/bench.mjs` |
| Sheet／overlay 切換到新內容可見 | **≤ 250 ms** | 同上（量 class 變化 → transitionend） |
| 任何 API | 10 秒內一定有結果（成功／錯誤提示） | Net 層 timeout + DevTools offline 測試 |
| 未捕捉錯誤 | 0 白屏；100% 有記錄；Home 掣永遠可用 | 故意注入錯誤測試（見 §7） |
| 首屏（4G 慢網，第二次開） | 可互動 < 2 秒 | SW cache-first + bench |
| 首次開 App 下載量 | < 1.5 MB decoded 先到主頁（BGM／three.js 延後） | bench resource 統計 |

---

## 2. Phase 1 — 防白屏（全域錯誤邊界）

### 2.1 新檔 `js/core/guard.js`（第一個載入，喺 `supabase-config.js` 之前）

- `window.addEventListener("error")` + `window.addEventListener("unhandledrejection")`。
- `ErrorLog`：
  - ring buffer 存 localStorage `pokeengmon_errlog_v1`（最多 50 筆：時間、版本、view、message、stack 頭 5 行、UA 簡寫）。
  - 同一 message 60 秒內去重。
  - 上報：Supabase `client_errors`（見 §9 Q1）。
- 非致命錯誤：toast「Something went wrong — please try again.」（10 秒內最多 1 次，唔好洗版）。
- 致命錯誤（開機失敗、核心 global 唔存在）→ 顯示 `#fatal-screen`。
- 用 `<script onerror>` 偵測 JS 檔載入失敗（例如 SW 舊 cache／網絡斷）。
- 對外 API：`Guard.safe(name, fn)`、`Guard.safeAsync(name, fn)`、`Guard.report(err, ctx)`、`Guard.fatal(reason)`。

### 2.2 兜底畫面 `#fatal-screen`（`index.html`，inline CSS）

- 寫死喺 `index.html`、style inline：即使 `style.css` 都載唔到都顯示到。
- 內容：「System busy — please retry」+ **Retry** 掣（`location.reload()`）+ 細字 **Repair app** 掣（unregister SW + `caches.delete` 全部 + reload；**唔掂 localStorage 存檔**）。
- 跟 `pokeengmon-responsive` 規則：喺紅框白螢幕區內置中、safe-area、觸控 ≥ 44px；加入 `tools/responsive/shots.mjs` 截圖。

### 2.3 開機邊界（`App.init`）

- 每個子模組 init 用 `Guard.safe("gacha", …)` 包住，一個模組壞唔會拖冧其他。
- `App.init()` reject → `Guard.fatal("boot")`，唔再淨係收 loading。
- Loading watchdog 由 20 秒改 12 秒，提示 Retry + Repair app。
- 核心資料（題庫、pokemon-151、moves、type-chart）載入失敗 → 有限重試（2 次）→ 仍失敗就喺選題頁顯示「Couldn't load questions — Retry」，**唔再顯示 All caught up**（修 S8）。

### 2.4 View 邊界（修 S3「卡死」）

- `App.showView(id)` → `_doShowView` 用 try/catch 包；`Quiz._renderQuestion`、`Battle` 每回合 render、`renderHome`、Pokedex／Bag／Gacha render 都包。
- 出錯時：
  1. `_setFrameLock(false)`、`_setSettleLock(false)`（Home 掣一定可以撳）；
  2. 喺嗰個 view 入面顯示 inline 錯誤卡：「This screen hit a problem」+ **Retry**（重 render）+ **Back to Home**；
  3. `Guard.report`。
- 答題中出錯：保留已答進度（`Quiz.answers` 已寫入 SM-2 嘅唔受影響），Back to Home 前問「Leave this round?」。

### 2.5 事件 handler 邊界（修 S9）

- 新 helper `Guard.busy(btn, asyncFn)`：disable → await → `finally` 一定 re-enable；出錯 toast。
- 逐個改 16 處 `onclick = async`（`app.js` 10、`friends.js` 3、`gym.js`、`leaderboard.js`、`quiz.js` 各 1）。

---

## 3. Phase 2 — API／異步容錯

### 3.1 新檔 `js/core/net.js`：統一 `Net.fetch`

- `AbortController` timeout：RPC 10 秒、pull／大 GET 15 秒、auth 10 秒。
- 只有冪等 GET 自動重試（2 次，backoff 0.5 s → 1.5 s）；POST／RPC **唔自動重試**（防重複發鑽石，Rule 5 精神）。
- `navigator.onLine === false` → 即刻 fail（唔使等 timeout）。
- 統一錯誤分類：`offline`／`timeout`／`auth`（401）／`server`（5xx）／`client`（4xx）。
- 派 `pe:net-error` 事件 → 中央 toast：「Connection problem — please try again.」（同類 15 秒內只出一次）。
- **保留現有 return 契約**（`_rpc` 失敗仍然 return `null`），只係加 timeout + 提示，唔郁 caller 邏輯 → 回歸風險最低。

### 3.2 接駁點

- `SupabaseAuth._rpc`／`_rpcTable`／auth endpoints／`submitReport`／`fetch()` helper。
- `Sync._api`、`PvP.api`、`friends.js`、`leaderboard.js`。
- `data.js`／`pokemon.js`／`genpack.js` 資料檔 fetch（GET → 有重試）。

### 3.3 Token 自動續期（修 S5）

- `_rpc`／`_rpcTable`／`Sync._api`／`PvP.api` 發請求前 `await ensureFreshSession()`（已有 120 秒提前量）。
- 收到 401 → refresh 一次再試一次；仍然 401 → 提示「Session expired — please log in again」，唔好靜靜失敗。
- 跟 `pokeengmon-auth` skill（Rule 8／48／50／51／55／73）檢查。

### 3.4 Sync queue 持久化（修 S6）

- `_pendingCards`／`_pendingHistory` 寫入 localStorage（`pokeengmon_sync_queue_v1`），開 App 時讀返繼續 flush。
- 失敗 exponential backoff（1 s → 2 → 4 → … 上限 60 s）；`online` 事件即刻 flush；offline 時唔試。
- `visibilitychange: hidden`／`pagehide` 用 `fetch(..., { keepalive: true })` flush（iOS PWA 唯一可靠時機），取代 `beforeunload`。

### 3.5 JSON 解析＋存檔防損（修 S7）

- 新 helper `safeJSON(raw, fallback)`。
- `loadState()` parse 失敗：先將原始字串備份去 `pokeengmon_state_corrupt_<ts>`（保留最近 3 份），再用 default，並 `Guard.report`；登入用戶提示「Restoring from cloud…」行 `Sync.pull`。
- 套用：`storage.js`、`sm2.js`、`pet.js`、`supabase-auth.js`（session／JWT decode）、`quiz.js:1817`。

### 3.6 Loading 狀態一律有出口

- 所有「Loading…」／spinner（`friends.js` 336／616、`app.js` 2772 Connecting…、PvP Waiting…）加上限：超時 → 換成「Couldn't load — Retry」。
- PvP 配對／等對手已有部分 `Promise.race` timeout（`battle.js:1030`），補齊其餘 `new Promise` 等待（`battle.js` 1233／1288／1424／1936）嘅取消路徑（離開戰鬥時 resolve）。

### 3.7 離線提示

- `online`／`offline` 事件 → 頂部細 banner「Offline — progress saved on this device」（用現有 `.sync-banner`）。

---

## 4. Phase 3 — 數值兜底（NaN／undefined）

### 4.1 Helper（放 `js/core/guard.js`）

```js
num(v, fallback = 0)            // Number(v)，唔係有限數就 fallback
clamp(v, min, max, fallback)    // 先 num 再夾
posDim(v, fallback)             // 幾何用：必須 > 0
```

### 4.2 套用清單

| 範圍 | 位置 | 做法 |
|---|---|---|
| 轉機 fit | `bag.js fit()`、`battle/landscape.js fit()` | `innerWidth/Height` 用 `posDim`，0 就下一個 rAF 再 fit；scale 夾 0.3–3 |
| 戰鬥 CSS 變數 | `landscape.js` `--bl-s`／`--bl-w` | 寫入前 `isFinite` 檢查 |
| 答題物理 | `quiz.js` `_computePlayfield`、球速度、`_measureText` | `num`／`posDim`，host 寬高 0 時暫停 tick |
| Sheet 拖拉 | `app.js` ~3479–3541 | 高度用 `posDim` |
| Capture | `capture.js` renderer size、WebGL 失敗 | size `posDim`；加 `webglcontextlost` → 提示並返主頁 |
| RPC 數值 | `supabase-auth.js` award 系列、leaderboard、friends | 回傳 balance／exp／level 經 `num` |
| 戰鬥核心 | `battle/engine.js` 傷害公式、`state.js` HP | stat 用 `num(…, 1)`；每回合後 assert HP 有限，`NaN` → 夾回 0–maxHP + report（防戰鬥卡死） |
| Task 2 CSS 幾何 | `css/style.css` `:root` | 所有 `var(--frame-*)` 用處加 fallback：`var(--frame-w, 440px)` |

### 4.3 測試

- 新增一次性 Node script `tools/_test_numeric_guards.js`：餵 `undefined`／`NaN`／`"abc"`／`Infinity`／`0` 入 helper 同戰鬥傷害函數，確認結果有限（跟現有 `tools/_test_*.js` 模式）。

---

## 5. Phase 4 — 效能（順滑度）

### 5.1 SM-2 記憶體快取（入題卡主因，預計 627 ms → < 10 ms）

- `sm2.js`：cards／history 開機 parse **一次**入記憶體；`getOrCreateCard` 讀記憶體。
- 寫入改 write-through + debounce（300 ms 合併一次 `setItem`），`pagehide`／`visibilitychange: hidden` 即刻 flush。
- `storage` 事件（第二個分頁改咗）→ 作廢快取。
- `buildSession` 唔再為**每一題** create card：未有 card 嘅題視為「新題（到期）」，只為抽中嗰 10 題 create。
- 保持 Rule 7（只抽到期卡）同 Rule 77（Fisher-Yates 全 pool 洗牌）行為不變。

### 5.2 `saveState()` 合併寫入

- 全 App 約 90 處 `saveState()`；改成 debounce（150 ms）+ `pagehide` flush。涉及鑽石／捕捉等 RPC 嘅照舊即時（server 係權威，Rule 5）。

### 5.3 轉場重做（介面轉換慢）

- Sheet 切換：舊 sheet 收同新 sheet 開**同時進行**（唔再等 410 ms）；時長 400 ms → **220 ms**。
- Overlay 返主頁：**即刻**切 view，exit 動畫喺背景同時播（唔阻塞輸入），400 ms → 200 ms。
- 只 animate `transform`／`opacity`；`.ph-sheet` 嘅 `height` transition 改 `transform: scaleY` 或直接唔 animate 高度。
- 動畫中嘅元素減 `box-shadow`／`backdrop-filter`；加 `will-change` 只喺動畫期間。
- 撳掣即時 `:active` 回饋（< 16 ms）。
- 改完要跑 `tools/responsive/test-sheets.mjs`、`test-overlay-switch.mjs`、`test-pane-locks.mjs`（Rule 41／47／53／84／85）。

### 5.4 開機瘦身

- `capture.js`（three.js 1.2 MB）改為第一次需要（入捕捉／gacha 3D）先 `import()`；開機後 idle 時預載。
- BGM：開機只載主頁 BGM；`wild-battle.mp3`（2 MB）喺入 Battle Menu 或 idle 5 秒後先載。
- `gsap` 加 `defer`；`data/moves.json`（241 KB）如非主頁必需，改為入戰鬥先載。
- `assets/gacha/dragonite.png` 325 KB → WebP。

### 5.5 Service Worker 策略（修 S10＋慢網）

- 帶 `?v=` 嘅檔案（版本化）→ **cache-first**（版本變 URL 就變，唔會食舊）。
- `index.html`／`./` → network-first **加 3 秒 timeout**，超時用 cache。
- precache 用同頁面一致嘅 `?v=` URL（或 `caches.match(req, { ignoreSearch: true })` 作 fallback）。
- 跟 `pokeengmon-workflow` Rule 10（skip 非 http scheme）、Rule 62／70。

### 5.6 答題中預載

- 答緊第 N 題時預載第 N+1 題嘅圖片（`findQuestionImage` probe）同單字語音。
- `findQuestionImage` 逐個副檔名 probe（最多 5 次 404）→ 改為 CSV 寫明副檔名或者建 manifest，減少 404。

### 5.7 量度工具

- 新增 `tools/perf/bench.mjs`（headless Chrome，跟 `tools/responsive/` 一樣用法）：CPU 4× 降速、量首屏、`Quiz.start` 阻塞、sheet 切換時長、Long Task 數量；輸出 JSON，改前改後對比。

---

## 6. 執行次序（建議）

| 次序 | 內容 | 原因 | 風險 |
|---|---|---|---|
| 1 | §5.7 bench 基線 | 先有數字先改 | 低 |
| 2 | §5.1 SM-2 快取 | 用戶最有感、改動集中一個檔 | 中（要守 Rule 7／77） |
| 3 | §2 Guard + 兜底畫面 + view 邊界 | 防白屏／卡死 | 低–中 |
| 4 | §3.1–3.3 Net timeout + token 續期 | 修 S4／S5 實質 bug | 中（auth 敏感） |
| 5 | §3.4–3.7 sync queue、存檔防損、loading 出口 | 防數據遺失 | 中 |
| 6 | §4 數值兜底 | 防戰鬥／版面卡死 | 低 |
| 7 | §5.3 轉場 | 改視覺感受（已獲確認） | 中（版面 Rule 多） |
| 8 | §5.2、5.4–5.6 | 開機／SW／預載 | 中（SW 出錯影響全部用戶） |

每一步獨立可 release（每步一個 commit，用戶要求先 commit）。

---

## 7. 驗證方法

- **錯誤注入**（console 執行）：`throw` 喺 `Quiz._renderQuestion`、`Promise.reject()`、`localStorage` 寫入壞 JSON、刪 `window.Pokedex` → 確認兜底畫面／inline 錯誤卡、Home 掣可用、ErrorLog 有記錄。
- **網絡**：DevTools offline、Slow 3G、block `*.supabase.co` → 每個 API 10 秒內有提示；sync queue 斷網唔狂 retry，上返網自動補送；kill 頁面再開 queue 仲喺度。
- **Token**：手改 session `expires_at` 做過期 → RPC 自動 refresh 成功。
- **數值**：`tools/_test_numeric_guards.js`、現有 `tools/_test_*.js` 全過。
- **版面**：`tools/responsive/` 全部測試 + shots（phone／tablet／wide）零回歸。
- **效能**：bench 改前改後對比，達到 §1 SLO。
- Console 冇新 error。

---

## 8. 同步文件／規則

- 新檔 `js/core/guard.js`、`js/core/net.js`、`tools/perf/bench.mjs` → 更新 `CODEBASE_INDEX.md`、`sw.js` ASSETS、`index.html` script 次序（guard 第一、net 第二）。
- Supabase migration：`supabase/migrations/supabase-migrate-20261106c-client-errors.sql`（table + insert-only RPC + rate limit + column grant，Rule 54）。
- Skill：新 Rule 喺 `pokeengmon-workflow`（Guard／Net／SW 策略／bench）、`pokeengmon-quiz`（SM-2 快取）、`pokeengmon-supabase`（token 續期、sync queue）、`pokeengmon-responsive`（轉場時長、兜底畫面定位）；preop 總索引加標題。

---

## 9. 已確認決定（2026-11-06）

- **Q1 錯誤上報**：Supabase `client_errors` table。設計：
  - 欄位：`id`、`created_at`、`account_id`（nullable，guest 用 device id）、`app_version`、`view`、`kind`（error／rejection／boot／net）、`message`（截 300 字）、`stack`（截 1,000 字）、`ua`（截 120 字）。**唔收**題目答案、名字、email 等個人資料。
  - 只經 RPC `log_client_error(...)` insert（`security definer`，同一 account／device 每分鐘最多 10 筆、每日 200 筆）；`anon`／`authenticated` 冇 table 直接 select／update 權限（Rule 5／54）。
  - 前端：本地 ring buffer 照留；上報用 `keepalive`、離線時排隊，上返網先送；同一 message 去重。
  - 保留 30 日（之後用戶自己喺 Supabase 開 cron 或者手動清）。
- **Q2 轉場**：改快兼同時進行（§5.3 照做，時長約 200–220 ms）。
- **Q3 開機瘦身**：three.js／戰鬥 BGM 延後載 + 主頁 idle 時預載（§5.4 照做）。
- **Q4 文案**：英文，同現有 UI 一致。
