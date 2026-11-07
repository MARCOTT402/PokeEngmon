# 商用級工程化總計劃（測試／死碼／洩漏／拆檔／門面）— 2026-11-06（2026-11-07 review 版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 PokeEngmon 提升到「專業人士打開 repo 同正式網址都覺得成熟」嘅商用級水平：自動測試做安全網、CI 擋住壞 commit、冇死碼同公開垃圾檔、冇記憶體洩漏、大檔按責任拆細。

**Architecture:** 唔換架構（原生 HTML/CSS/JS + Supabase + GitHub Pages，無 build step）。先起測試安全網（Node 內建 `node:test`，零 runtime 依賴），再清死碼同部署衛生，量度洩漏／重複渲染，最後先拆大檔（保留 global 物件，用 `Object.assign` mixin 檔拆，唔做 ESM 大搬遷）。

**Tech Stack:** Node 24（本機）／22（CI）`node:test` + `node:vm`；ESLint 9 flat config（devDependency）；headless Chrome + CDP（現有 `tools/responsive/`、`tools/perf/bench.mjs`）；GitHub Actions。

**Spec:** 本文件 §1（審查結果）。效能／穩定性另見 `20261106-stability-performance.md`（**已全部完成**）。

---

## 進度

- ✅ **Phase A（Task 1–3）2026-11-07 完成，未 commit**：`npm test`（347 項）、`npm run lint`（0 error／20 warning 上限）、`npm run test:e2e`、CI release 前跑 lint + test。用戶已確認 §10 Q1–Q4 全部照建議。
- 執行決定（rulings）：舊 script 實際係 10 個（多咗 `_test_sync_queue.js`）；遷移時只換 pass/fail helper、vm 設定原封保留；loader 將 timer `unref`（否則測試 process 唔會完）；`MAX_LEVEL` = 99 係設計；`eslint.globals.json` 由 `prelint` 生成、gitignore；ESLint `no-redeclare` 要 `builtinGlobals: false`。
- e2e 基線（`npm run test:e2e`，2026-11-07，working tree 包括另一個 session 未 commit 嘅鍵盤改動）：10 個檔 7 過。失敗：`test-sheets` P9b（同一 tick 連撳 3 下，已知舊問題）、`test-quiz-fit` S1 375×667 文字題捲 21px（已知）、`test-pane-locks` W2／W4。三項全部係 `pokeengmon-responsive` SKILL.md 測試表記錄咗嘅已知 fail。W2／W4 已用 headless 證實原因係 guest 狀態：W2 撳 Friends → 「Log in first」toast＋登入框；W4 CTA 中心點 `elementFromPoint` = `lb-login-modal`（Leaderboard 嘅 guest 登入提示蓋住成個畫面）。唔係 regression。之後已將 W2／W4 改成識分 guest（21/21 pass；mutation：Friends 唔出登入提示 → W2 紅），所以而家 e2e 已知 fail 只剩 P9b 同 S1。（較早一版誤寫成「唔喺已知清單」，因為只對咗 memory，冇對 skill 表。）
- **Task 5 注意**：`tools/responsive/test-*.mjs` 靠 `_seedtest.html` → 部署衛生只可以「唔發佈」佢，唔可以刪。
- ✅ **Phase B Task 4（清死碼）2026-11-07 完成，未 commit**：
  - JS：11 個檔 -204 行，ESLint 由 0 error／20 warning 變成 0／0，`--max-warnings 0`。刪咗嘅包括 8 個冇人 call 嘅 function、Pokédex 配招／EV 殘骸（`7b7e45b` 搬去背包後留低），同埋第二輪先出現嘅 `addEvPoint`、`SupabaseAuth.allocEv`（server 嘅 `alloc_ev` RPC 仲喺度，client 已經冇用）。
  - CSS：-286 行（136 條 rule + 3 個 `@keyframes`）。前後 144 張 shots，rects 零差異；像素差異 62 張，抽查全部係動畫 GIF 唔同幀或者隨機抽題。
  - Asset：冇引用嘅只剩 5 個戰鬥 UI 原始 atlas（54 KB），保留。新工具：`tools/audit/unused-css.mjs`、`unused-assets.mjs`（Rule 108）。
  - 驗證：`npm test` 347 全過；e2e 11 個檔過 9 個，失敗嗰 2 個係已知 P9b、S1。
  - 新發現：S1 溢出量取決於隨機抽到邊條題（之前記錄 21px；最長嗰條題係 64px，HEAD CSS 一樣）。原本 known fail 低估咗，屬舊有問題。
  - 另外：guest 開機時 `js/sync.js:552` 用 anon key 探測 `user_account` 會 401（RLS），係舊有 console 噪音。
- ⏭ 下一步：Task 5（合併重複 helper ＋ 部署衛生，部署要你喺 GitHub 改 Pages Source）或 Task 6（洩漏量度）。

## 0. Review 記錄（2026-11-07）

第一版（11-06）寫完之後，另一個 session 一晚做完咗好多嘢，加上自我審查，改咗以下各點：

| # | 第一版問題 | 改動 |
|---|---|---|
| R1 | Phase 0（動畫倍速）同 Phase C（穩定性／效能）其實已經完成（`633e1d2`、`84b0ac4`、`6d3bde3`、`ee59776`、`2a40676`） | 刪 Phase 0；Phase C 改為「已完成，只剩選做兩項」 |
| R2 | 數字過時：`capture.js` 已拆出 `js/audio.js`（2,293 → 1,482 行）、新增 `js/keys.js`、`js/core/net.js`；`tools/_test_*.js` 由 7 個變 9 個；死碼清單 `closeGachaSheet`（`keys.js` 用緊）、`_ensureBGM`（搬咗去 `audio.js`）已唔係死碼 | §1 全部重新量 |
| R3 | **用戶要求嘅「記憶體洩漏」「不必要重複渲染」完全冇 task** | 新增 Phase C'：CDP runtime 量度（Task 6） |
| R4 | 測試 loader 冇處理 `fetch`（`pokemon.js`／`data.js` 開機要 fetch JSON／CSV）同模組級快取（`storage.js` `_state`）→ 測試會互相污染 | Task 1 loader 加 disk-backed `fetch` stub；每個 test 用新 context |
| R5 | 「壞 JSON → 回 default」已經唔係現行為（Rule 98 先備份 `_backupCorruptState`） | Task 2 斷言改為備份存在 |
| R6 | 舊存檔 fixture 要用戶匯出 localStorage → 卡住進度、可能帶個人資料 | 改為由 git 舊版 `defaultState()` 生成 |
| R7 | **部署陷阱**：semantic-release 嘅 release commit 帶 `[skip ci]`，而版本號（`js/app.js`／`sw.js`／`index.html`）係喺嗰個 commit 先 bump → 獨立 deploy workflow 唔會跑，網站會停喺舊版本號 | deploy 做成同一個 workflow 入面 release 之後嘅 job，checkout 最新 `main` |
| R8 | ESLint：`no-undef` 要手寫幾百個跨檔 global（`data.js` 單檔就 40 幾個 top-level function）；`no-unused-vars` 預設會將「俾其他檔用」嘅 top-level 當 unused | globals 由 script 自動生成；`no-unused-vars` 用 `vars: "local"` |
| R9 | `node --test tests/unit/`（目錄參數）喺 Node 22 唔可靠 | 改用 glob `"tests/unit/*.test.js"`（Node 21+ 自己展開，Windows cmd 都得） |
| R10 | Phase D 切檔表用行號，已經移位 | 改用方法名做邊界 |
| R11 | Phase D 話要抽 `boot.js` 解決載入次序 — 其實 `App.init()` 喺 `DOMContentLoaded` 先跑（`js/app.js` 尾），所有同步 script 一定已載完 | 刪該步；mixin 檔只要排喺 `app.js` 之後 |
| R12 | 另一個 session 有未 commit 改動（`bag.js`、`battle.js`、`capture.js`、`keys.js`、`pokedex.js`、`style.css`、`index.html`） | 加檔案擁有權約束：Phase A 只新增檔；Phase B 起要等嗰批 commit 咗先郁 |
| R13 | 冇工作量估計、冇 rollback 方法、冇 Supabase 端檢查 | §4 加估計；Task 5 加 rollback；Phase E 加 Supabase advisors |

---

## 1. 審查結果（2026-11-07 重新量）

### 1.1 語法 — 唔使「現代化」
全部 JS `var` = 0，已用 `const`／`let`、arrow、`async/await`、class。真正要做嘅係結構：

| 問題 | 證據 |
|---|---|
| 超大檔 | `js/app.js` 4,241 行（`App.init()` 由 3369 行起約 860 行單一函數）、`js/battle/battle.js` 2,698、`js/quiz.js` 1,990、`js/gacha.js` 1,738、`js/capture.js` 1,482、`css/style.css` 6,370 |
| 全 global | 45 個 `<script>`，靠載入次序 |
| 重複 helper | HTML escape 8 份定義（`explain.js escapeHTML`、`app.js` 內 `esc`×2／`escAttr`、`bag.js`、`friends.js`、`quests.js` 各一） |
| `innerHTML` | 170 處賦值，用戶可控字串（訓練員名、好友名、自訂題）未審計 |

### 1.2 死碼（`js/`+`index.html`+`tools/` 全文只出現 1 次）
`js/app.js`：`_initBoltCanvas`、`_showSignUpForm`、`_showSignInForm`、`_checkCloseAllSheets`、`_bindSheetBtn`、`showSyncBanner`；`js/storage.js`：`getEntry`；`js/core/guard.js`：`clearLog`（debug API，保留加註解）。CSS selector／asset 未掃（Task 4）。

### 1.3 部署衛生
Pages 由 `main` root 直出 → `_seedtest.html`、`_seed_battle_test.html`、`prototype/`、`tools/`、`.trae/`、`CLAUDE.md`、`supabase/migrations/`、內部 md 全部喺正式網址公開。冇對外 README、冇 LICENSE。

### 1.4 測試
9 個一次性 Node script（`tools/_test_{battle,battle_care,care,held_berries,mega,mega_abilities,numeric_guards,sm2_cache,sw_strategy}.js`），冇 `npm test`，CI（`.github/workflows/release.yml`）只係 `npm ci` + semantic-release。另有 `tools/responsive/test-*.mjs`（headless Chrome，需 `localhost:8080`）同 `tools/perf/bench.mjs`。

### 1.5 洩漏／重複渲染（靜態掃描，未實測）
- `window`／`document` 級 listener 大部分有 bind-once guard（`_hubBound`、`_fitBound`、bag 一次性 build）— 靜態睇唔到明顯洩漏，**要 runtime 量先算數**（Task 6）。
- `renderHome()` 有 40 個 call site；pokedex filter 每次 `this.render()` 全量 `innerHTML` 重畫 → 可能重複渲染，要量。
- three.js：`capture.js` 有 8 處 `dispose`，但冇 `forceContextLoss` → 反覆入捕捉可能累積 WebGL context（瀏覽器上限 ~16）。

### 1.6 效能／穩定性 — 已完成
`20261106-stability-performance.md` 全部 ✅（quiz start 4,586→31 ms、sheet 新內容出現 124 ms @4× CPU、開機 JS 393 KB gzip、SW 分流、Net timeout、token 續期、sync queue 持久化）。剩選做：capture renderer 尺寸兜底、`user_history` server 端去重。

---

## 2. Global Constraints

- 無 build step；production 檔案 = repo 原檔。
- 新 devDependency 只限 `eslint@^9`、`globals@^15`。
- 唔手動 bump 版本；commit 只喺用戶要求時用 `python tools/git_commit_push.py`，Conventional Commits（測試用 `test:`、CI 用 `ci:`，兩者唔觸發 release）。
- **檔案擁有權**：另一個 session 未 commit 嘅檔（R12）喺佢 commit 之前，本計劃唔改。
- 所有 refactor **行為零改變**：前後 `npm test` 全綠、`tools/responsive/` 全部結果一致、console 冇新 error。
- 新 JS 檔：加入 `sw.js` `ASSETS`、`index.html` script 次序、`CODEBASE_INDEX.md`、ESLint globals（自動生成）。
- 修 bug／被糾正：跟 `post-fix-lesson-capture` 加 Rule N。
- Rule 5（server 權威）、Rule 7／77（SM-2）、Rule 54（column grant）不變。

## 3. Review Focus

1. **舊存檔遷移**：舊版 state 缺欄位 → `loadState()`／`migrateEntries()` 後欄位有效、唔洗檔。→ Task 2 Step 1。
2. **拆檔後 API 漏咗**：mixin 檔漏搬方法 → `App.xxx is not a function`。→ Task 7 `app-surface.test.js`。
3. **escape 統一後雙重 escape**：畫面出 `&amp;`。→ Task 5 `dom-esc.test.js` + e2e 好友名含 `&`。
4. **答案比對**：大小寫、`’` vs `'`、前後空格、多答案 → 重構後判錯。→ Task 2 Step 4。
5. **SW／部署漏檔**：新檔冇入 `ASSETS` 或 deploy 清單 → 離線／正式網址白屏。→ Task 5 `sw-assets.test.js`、`deploy-manifest.test.js`。

---

## 4. Phase 總覽

| Phase | 內容 | 依賴 | 風險 | 估計 |
|---|---|---|---|---|
| **A** | 測試基建＋ESLint＋CI 擋 release（Task 1–3） | — | 低（只新增檔） | 1–1.5 日 |
| **B** | 死碼、重複 helper、部署衛生（Task 4–5） | A；R12 嗰批已 commit | 低–中 | 1 日 |
| **C'** | 洩漏＋重複渲染量度同修正（Task 6） | A | 中 | 0.5–1 日 |
| **D** | 拆大檔（Task 7，逐檔一個 commit） | A、B | 中 | 2–3 日 |
| **E** | 門面：README、LICENSE、`innerHTML` 審計＋CSP、Lighthouse、Supabase advisors（Task 8） | B | 低–中 | 1 日 |

Phase A 下面寫到逐步；B 之後開工前按當時代碼再展開細節（行號會變）。

---

## 5. Phase A — 測試基建

### Task 1: `npm test` + 共用 loader + 遷移 9 個舊測試

**Files:**
- Create: `tests/helpers/load.js`、`tests/unit/{battle,battle-care,care,held-berries,mega,mega-abilities,numeric-guards,sm2-cache,sw-strategy}.test.js`
- Modify: `package.json`、`CLAUDE.md`（「TDD／驗證」段改為：`npm test` 跑單元測試；UI 用 `npm run test:e2e`；新邏輯要加 `tests/unit/*.test.js`）、`CODEBASE_INDEX.md`、引用舊路徑嘅 skill／文件（`grep -rl "_test_" .trae .cursor CODEBASE_INDEX.md`）
- Delete: `tools/_test_*.js`（9 個）

**Interfaces:**
- Produces: `loadScripts(files: string[], opts?: { expose?: string[], localStorage?: Record<string,string>, globals?: object }) => object`
  - 每次 call 建**全新** `vm` context（防 `_state` 等模組級快取污染）。
  - context：`window === globalThis`、`localStorage`（`makeLocalStorage`）、`console`、`Date`、`Math`、`JSON`、`setTimeout`／`clearTimeout`、`structuredClone`、`URL`；`document` 最少 stub（`getElementById`／`querySelector` → `null`、`addEventListener` no-op、`readyState: "complete"`）；`navigator: { onLine: true }`。
  - `fetch(url)` stub：相對路徑讀 repo 檔案（去 `?query`），回 `{ ok, status, json(), text() }`；搵唔到 → `{ ok: false, status: 404 }`。
  - 頂層 `const`／`let` 唔會掛上 global → 最後喺同一 context 跑 `({ ${expose.join(",")} })` 取值，連同 `ctx` 一齊回傳：`{ ctx, ...exposed }`。
- Produces: `makeLocalStorage(initial?: Record<string,string>) => Storage-like`（`getItem`／`setItem`／`removeItem`／`clear`／`key`／`length`／`_map`）。**`Object.keys(localStorage)` 要列出已存 key**（`storage.js` `_backupCorruptState` 靠佢清舊備份）→ 用 `Proxy`，`ownKeys` 回 map 嘅 key、方法放 prototype。

- [ ] **Step 1:** 先跑一次 9 個舊 script，記低各自 pass 數同總數。
- [ ] **Step 2:** 寫 `tests/helpers/load.js`。
- [ ] **Step 3:** 逐個改寫做 `tests/unit/*.test.js`（`node:test` + `node:assert/strict`）；每個舊 `ok(cond, name)` 變一個 `test(name, …)`。**fixture 同斷言數值原封不動**。`sw-strategy` 如果載入 `sw.js` 需要 `self`／`caches` stub，照舊 script 嘅 stub 搬入該 test 檔，唔放入共用 loader。
- [ ] **Step 4:** `package.json` scripts：
  ```json
  "test": "node --test \"tests/unit/*.test.js\"",
  "test:coverage": "node --test --experimental-test-coverage \"tests/unit/*.test.js\"",
  "test:e2e": "node tools/responsive/run-all.mjs",
  "lint": "eslint js tests"
  ```
- [ ] **Step 5:** `npm test` → Expected：全 pass，test 數 = Step 1 總數。
- [ ] **Step 6:** 刪舊 script、更新引用。用戶要求先 commit：`test: move one-off node scripts to a node:test suite`。

### Task 2: 純邏輯 characterization tests（重構前安全網）

**Files:**
- Create: `tests/unit/{storage,pokemon-stats,data-csv,quiz-answer,dex-sort}.test.js`、`tests/fixtures/state-old.json`、`tools/make-old-state-fixture.mjs`

**Interfaces:**
- Consumes: Task 1 `loadScripts`、`makeLocalStorage`

原則：記錄**現行為**（包括怪行為）。疑似 bug 寫 `// KNOWN:` 註解並列入本文件 §9，唔喺測試 task 改產品碼。

- [ ] **Step 1: `storage.test.js`**（載入 `js/core/guard.js`、`js/gens-data.js`、`js/data.js`、`js/pokemon.js`、`js/storage.js`）
  - 空 localStorage → `loadState()` `deepStrictEqual(defaultState())`。
  - `tools/make-old-state-fixture.mjs`：用 `git show 79f9378:js/storage.js` 喺 vm 跑 `defaultState()`，加 2 隻 entry（等級進化鏈＋石進化鏈），寫出 `tests/fixtures/state-old.json`（冇個人資料）。斷言：載入後每隻 entry 有 `uid`，`level`／`exp` 為有限數，`deriveEntryFields` 唔 throw。
  - 壞 JSON `"{"` → 唔 throw、回 default，**而且** localStorage 有 `pokeengmon_state_corrupt_*` 備份（Rule 98）。
  - `localEntryFromServer`／`mergePet`：舊欄位 `pet_health`／`pet_updated_at` 同新欄位 `fullness`／`fullness_at` 結果一致。
  - `addEntryExp` 跨級：`entry.level === levelFromExp(...)`。
  - `canEvolveNow`／`entryNextEvolution`：等級進化、石進化、分支各一 case。
  - `calcStreak`：連續 3 日、斷 1 日、跨月。
- [ ] **Step 2: `pokemon-stats.test.js`**（`fetch` stub 讀 `data/*.json`，先 `await loadPokemonDex()`）：`expAtLevel` 隨等級單調遞增；`levelFromExp(expAtLevel(n)) === n`（n = 1, 50, 100）；`calcStats` Pikachu Lv50、IV 全 31、EV 0、Hardy → 先跑一次記低數值寫死做 snapshot；`typeMultiplier("ground","flying") === 0`、`("water","fire") === 2`；`randomIvs()` 六項都喺 0–31。
- [ ] **Step 3: `data-csv.test.js`**：`parseCSV` — 引號內逗號、`""` 轉義、CRLF、尾空行；`questionsFromCSV(fs.readFileSync("Q_folder/grammar/grammar.csv"))` 題數 = 非空資料行數；`normalizeQuestion` 缺 `answer` 嘅現行為；`drawMixedSet(10, keys)` 長度 ≤ 10 且全部屬 `keys`。
- [ ] **Step 4: `quiz-answer.test.js`**（載入 `quiz.js` 前確認頂層冇 DOM 副作用；`Quiz` 係 object literal，只 call 純方法）：`Quiz._norm`、`Quiz._cellMatch`、`Quiz._fullAnswerVariants` — 大小寫、`’` vs `'`、前後空格、`/` 多答案，記錄現行為。
- [ ] **Step 5: `dex-sort.test.js`**：`DEXSORT.sortList` 每個 key asc／desc，同分次序穩定。
- [ ] **Step 6:** `npm run test:coverage`，將 `sm2`／`storage`／`pokemon`／`battle/engine`／`battle/state`／`care` line coverage 填入 §9 基線（目標 ≥ 70%，唔強制）。
- [ ] **Step 7:** Commit `test: characterization tests for storage, stats, csv, answer matching`。

### Task 3: ESLint + e2e runner + CI 擋 release

**Files:**
- Create: `eslint.config.mjs`、`tools/audit/gen-eslint-globals.mjs`、`eslint.globals.json`（生成檔）、`tools/responsive/run-all.mjs`
- Modify: `package.json`（devDeps）、`.github/workflows/release.yml`

- [ ] **Step 1:** `gen-eslint-globals.mjs`：讀 `index.html` 本地 `<script src>` 次序，逐檔抽頂層 `const`／`let`／`function`／`class` 名同 `window.X =`，寫 `eslint.globals.json`（`{ name: "readonly" }`）。`npm run lint` 前自動跑（`"prelint"`）。
- [ ] **Step 2:** `eslint.config.mjs`：`sourceType: "script"`（`js/capture.js` 單獨 `"module"`；`tests/**` 用 `globals.node` + CommonJS）；`globals.browser` + `eslint.globals.json`。Rules：`no-undef`、`no-unused-vars: ["warn", { vars: "local", args: "none" }]`、`no-redeclare`、`no-dupe-keys`、`no-unreachable`、`eqeqeq: ["warn","smart"]`。唔開 style rules（唔 reformat）。
- [ ] **Step 3:** 跑 `npm run lint` **只記錄**：error 類（`no-undef`、`no-dupe-keys`、`no-unreachable`）每一個都係真 bug 或死碼 → 列入 Task 4；warning 總數填 §9，script 加 `--max-warnings <該數>`，之後只准減。若 error 唔係 0，CI 暫時只跑 `npm test`，lint 等 Task 4 清完 error 先加入 CI。
- [ ] **Step 4:** `run-all.mjs`：檢查 `http://localhost:8080` 有冇 server（冇就提示「先 preview_start static」並 exit 1）；順序 spawn 每個 `tools/responsive/test-*.mjs`，任一非 0 → exit 1，最後印總表。
- [ ] **Step 5:** `release.yml`：`npm ci` 之後加 `npm test`（同 Step 3 允許時加 `npm run lint`），失敗就唔行 semantic-release。
- [ ] **Step 6:** Commit `ci: run unit tests before semantic-release`。

---

## 6. Phase B — 死碼、重複、部署衛生（開工前展開）

### Task 4: 刪死碼
- 輸入：§1.2 清單 + Task 3 lint error + `tools/audit/unused-css.mjs`（CSS 有定義、`js/`／`index.html` 冇出現嘅 class／id；動態拼接如 `` `rarity-${r}` `` 前綴列做「人手確認」唔自動刪）+ `assets/` 冇被引用嘅檔。
- 每批：`npm test`、`test:e2e`、preview console。一批一個 `refactor:` commit。

### Task 5: 合併重複 helper + 部署衛生
- 新 `js/core/dom.js`：`Dom.esc(s)`（`& < > " '`）；取代 8 份 escape。`explain.js` 嘅 global `escapeHTML` 留做 alias 一個版本。`tests/unit/dom-esc.test.js`：`Dom.esc('Tom & "Jerry" <b>')`、`Dom.esc(null) === ""`、已 escape 字串唔會再被呼叫（grep 確認冇 `esc(esc(`）。
- 統一 `toast`、`_haptic`（gacha／capture 各一）、localStorage JSON 讀取改 `Guard.safeJSON`。
- **部署（§10 Q2）**：
  - `release.yml` 加第二個 job `deploy`（`needs: release`）：`actions/checkout` **`ref: main`**（攞到 release commit 嘅新版本號）→ copy `index.html`、`manifest.json`、`sw.js`、`css/`、`js/`、`vendor/`、`assets/`、`icons/`、`data/`、`Q_folder/`、`supabase/supabase-config.js` 去 `_site/` → `actions/upload-pages-artifact` → `actions/deploy-pages`。非 release 嘅 push（`docs:`、`test:`）都會 deploy。
  - 用戶要手動做一次：repo Settings → Pages → Source 改「GitHub Actions」。網址、Supabase OAuth redirect 不變。
  - Rollback：Source 改返「Deploy from branch: main」即刻還原。
  - `tests/unit/sw-assets.test.js`：`index.html` 每個本地 `<script src>`／`<link href>`（去 `?v=`）都喺 `sw.js` `ASSETS`。`tests/unit/deploy-manifest.test.js`：同一批檔案全部落喺 deploy copy 清單（清單抽出做 `tools/deploy-files.json`，workflow 同 test 共用）。

---

## 7. Phase C' — 洩漏＋重複渲染（Task 6）

**Files:** Create `tools/perf/leak.mjs`；修正按結果決定。

- [ ] **Step 1:** `leak.mjs`（同 bench 一樣 headless Chrome + CDP）：每個場景做 1 次 warm-up，然後記 `Performance.getMetrics` 嘅 `JSEventListeners`、`Nodes`、`JSHeapUsedSize`（先 `HeapProfiler.collectGarbage`），再重複 10 次，再記一次。場景：開／關 Bag、Pokédex（含切 filter）、Gacha 單抽、Capture 完整一次（`?dev` 快速模式）、AI Battle 入／出、Quiz 一輪 10 題。
- [ ] **Step 2:** 判斷標準：10 次後 `JSEventListeners`、`Nodes` 增長 ≤ 1 次場景嘅量（即冇線性累積）；heap 增長 < 2 MB；Capture 10 次之後仍然有 WebGL（冇 "Too many active WebGL contexts" warning）。
- [ ] **Step 3:** 重複渲染：bench 加 counter — 用 CDP 喺 `App.renderHome`、`Pokedex.render`、`BagUI` render 函數包一層計數，量「撳一個掣」觸發幾多次；> 1 次嘅列出 call chain。
- [ ] **Step 4:** 超標項目逐個修（例如 capture 離開時 `renderer.forceContextLoss()`；`renderHome` 合併做 rAF 一次）；每個修正加 Rule N（`pokeengmon-workflow`）＋ 把 leak.mjs 結果寫入 §9。
- [ ] **Step 5:** Commit `perf: fix listener/node growth found by leak benchmark`（如冇超標就只 commit 工具：`test: add leak benchmark`）。

---

## 8. Phase D／E（大綱）

### Task 7（Phase D）— 拆大檔，行為零改變
做法：新檔內容係 `Object.assign(App, { 方法… })`，`<script>` 排喺 `js/app.js` 之後（`App.init()` 喺 `DOMContentLoaded` 先跑，所以全部同步 script 已載完）。`this` 照用；`App` 冇 getter（`layout()` 係普通方法），`Object.assign` 安全。每拆一個檔先加 `tests/unit/app-surface.test.js`：載入全部 App 檔後 `Object.keys(App).sort()` 等於拆檔前 snapshot。

| 新檔 | 搬入嘅方法（邊界用方法名） |
|---|---|
| `js/app/layout.js` | `layout` → `_applyPaneLock`；`_onLayoutChange`、`_syncRotateHint` |
| `js/app/home.js` | `_unlockedSpeciesCount` → `_syncPetCare` |
| `js/app/setup-custom.js` | `openSetup` → `openParentGuide` |
| `js/app/settlement.js` | `onQuizFinished` → `showEvolveModal` |
| `js/app/auth-ui.js` | `_markLoggedIn` → `openDisclaimer` |
| `js/app/sheets.js` | `_openSheet` → `closeGachaSheet`（扣 layout 兩個） |
| `js/app/settings.js` | `openSettings`；`_syncAudioSliders` → `_syncCurveMode` |
| `js/app.js` 保留 | `APP_VERSION`、`App` 骨架、`showView`／`_doShowView`、`showModal`、`toast`、`init`（`init` 內部再拆成具名 `_boot*` 步驟，每步 < 150 行） |

之後同法：`battle/battle.js` → `battle/prebattle.js`、`battle/pvp-flow.js`、`battle/turn-ui.js`；`quiz.js` → `quiz/catch-mode.js`、`quiz/keyboard.js`；`gacha.js` → `gacha/multi.js`。
CSS：只喺用戶確認後先拆（每多一個檔＝首次載入多一個 request）；如拆，最多 8 個檔、`<link>` 次序＝原檔次序、每拆一段 `tools/responsive/shots.mjs` 同基線零差異。

每個檔驗收：`app-surface.test.js`、`npm test`、`npm run lint`、`test:e2e`、`sw-assets.test.js`、preview console 冇 error。一個檔一個 `refactor:` commit。

### Task 8（Phase E）— 專業門面
- `README.md`（產品簡介、截圖、架構圖、本地跑法、測試、release 流程、CI badge）、`LICENSE`（用戶決定）。
- `innerHTML` 審計：170 處分「靜態模板／已 escape／含用戶資料未 escape」，第三類改 `Dom.esc` 或 `textContent`；`<meta http-equiv="Content-Security-Policy">` 先 report-only 一輪（`script-src 'self'` + importmap hash；`connect-src` Supabase origin）。
- Lighthouse mobile 目標：Performance ≥ 85、Accessibility ≥ 95、Best Practices ≥ 95、PWA installable；結果存 `tools/perf/lighthouse-<date>.json`。
- Supabase：跑 security／performance advisors，error 級全部處理或記錄理由。

---

## 9. 基線數字（執行時填）

| 項目 | 2026-11-07 開工前 | Phase A 後（2026-11-07） | 目標 |
|---|---|---|---|
| 單元測試數 | 0（10 個一次性 script，合共 308 項） | **347**（308 遷移 + 39 新 characterization），`npm test` ≈ 7 s | 只增唔減 |
| Line coverage（loader 載入嘅檔） | — | storage 46%、pokemon 69%、care 53%、data 49%、dex-sort 67%、guard 54%、quiz 17% | ≥ 70%（純邏輯檔） |
| Coverage 盲點 | — | 遷移嘅戰鬥／SM-2／sync 測試用「字串拼接」載入 → coverage 冇計 `battle/*`、`sm2.js`、`sync.js`；Phase D 改用 `loadScripts` 後先計到 | |
| ESLint errors／warnings | — | 0 / 20 → **0 / 0**（Task 4 後） | 0 / 0 |
| 最大 JS 檔行數 | 4,241（app.js） | 不變 | < 1,000 |
| 10 次開關後 listener／node 增長 | 未量 | 未量 | 無線性增長 |
| 正式網址公開內部檔案 | 有 | 有（Task 5） | 0 |

**KNOWN（測試記錄、未修）：**
- 答案比對：彎撇號 `’` ≠ 直撇號 `'`（iOS 鍵盤預設會打 `’`）→ 學生打 `don’t` 會判錯。**建議 Phase B 修**（`_norm` 統一撇號），修時改 `quiz-answer.test.js` 對應斷言。
- 舊存檔 uid 唔係 UUID → 開機會換新 UUID（`activeUid` 跟住換，已測）。
- 舊存檔 `exp` 可能係字串（`"4000"`），`loadState` 唔轉型，靠之後 `Number()` 容錯。

**Phase A 已知限制：** CI 失敗只會擋 semantic-release（版本號／CHANGELOG），**唔會擋 GitHub Pages**——Pages 而家由 `main` 直出，壞 code push 咗照樣上線。要真正擋住，要做 Task 5 嘅 Actions deploy（deploy job `needs: release`）。

## 10. 需要用戶決定

- **Q1 測試 runner**：建議 Node 內建 `node:test`（零依賴）；會改 CLAUDE.md「唔好起 test framework」嗰句。
- **Q2 部署**：建議 GitHub Actions 只發佈 App 檔（要你喺 repo Settings 改一次 Pages Source）；或者保持 `main` root，只刪／搬 `_seed*.html`、`prototype/`（`tools/`、`.trae/` 等仍然公開）。
- **Q3 拆檔方式**：建議 `Object.assign` mixin；ES module 全面遷移風險高好多。
- **Q4 CSS 拆唔拆**：建議暫時唔拆（只整理分段註解），收益細、多 request。
