# Plan：響應式版面 第一階段（P1）

- Spec：`.trae/specs/20261106-responsive-layout.md`（Approved 2026-11-06）
- 狀態：Task 0–11 完成（2026-11-06，未 commit）；結果同偏差見 spec §13
- 範圍：外殼斷點系統、tablet 放大直向、wide 雙欄主頁、sheets、display-window overlays、modal／toast、答題、結算、轉機提示
- 唔包：圖鑑／育成／社交內頁精修（P2）、扭蛋／捕捉／戰鬥／背包內部（P3）
- 冇自動 commit：每個 Task 完成後停低等用戶驗收；commit 只喺用戶要求時用 `python tools/git_commit_push.py`。

## 開工前

- 讀 preop Rule：17、23、26、27、30、31、35、37、39–47、52、53、60、62、67、72。
- 驗證工具：Browser pane（`.claude/launch.json` 嘅 `static`，實際 serve 喺 8080）+ `resize_window`；safe-area 驗證用 `npm run preview:iphone` 同 `node tools/preview-iphone.mjs --device iphone-se`（Rule 37）。
- 改 state 嘅 JS 前 assert `location.host` 係 localhost（Rule 62）。驗收時用 JS 隱藏 Login Gate modal（唔改 state）。

## 驗收矩陣（每個 Task 都用）

| 代號 | 尺寸 | 期望 `data-layout` |
|---|---|---|
| S1 | 375×667 | phone |
| S2 | 440×956 | phone |
| S3 | 820×1180 | tablet |
| S4 | 1180×820 | wide |
| S5 | 1366×640 | wide |
| S6 | 1440×900 | wide |
| S7 | 1920×1080 | wide（frame 封頂 1240） |
| S8 | 956×440 | phone-land |
| S9 | 1000×500 | tablet（width ≥ 900 但 height < 560） |

通用檢查（一次性 JS）：`document.documentElement.scrollWidth === innerWidth`、console 冇 error、相關 overlay 同目標白螢幕區 `getBoundingClientRect` 四邊差 0。

---

## Task 0 — 基準截圖（改任何嘢之前）

1. S1–S9 每個尺寸截：主頁、每個 sheet 打開（Streak、Pokédex、Quests、Settings、Battle、Gacha）、選題、Friends、Leaderboard、結算（可用 `_seedtest.html` 種本地資料）。
2. 存去 scratchpad `baseline/`，檔名 `<頁>-<S#>.png`；同時記錄 S1／S2 主要元素 `getBoundingClientRect` 做 JSON（之後做零回歸 diff）。

**完成條件**：S1／S2 有完整 rect JSON；其他尺寸有截圖。

## Task 1 — Layout 偵測（`App.layout()` + `html[data-layout]`）

檔案：`js/app.js`、`css/style.css`（頂部加斷點對照註解）

1. `App.layout()` 用 `matchMedia` 回傳 `"phone" | "tablet" | "wide" | "phone-land"`：
   - `phone-land`：`(orientation: landscape) and (max-height: 499px) and (pointer: coarse)`（桌面矮視窗唔當手機橫向）
   - `wide`：`(min-width: 900px) and (min-height: 560px)`
   - `tablet`：`(min-width: 700px)`
   - 其餘 `phone`
2. 啟動時同 `resize`／`orientationchange`（rAF 節流）寫入 `document.documentElement.dataset.layout`；變咗就 dispatch `CustomEvent("pe:layout", { detail: { from, to } })`。
3. CSS 頂部加註解，列出同一組數值；CSS 一律用 `@media` 同樣條件（唔用 `[data-layout]` 做主要樣式，`data-layout` 只畀 JS 同少量 state-dependent 規則用）。

**驗證**：S1–S9 逐個 resize，讀 `document.documentElement.dataset.layout` 同期望表一致。

## Task 2 — 外殼幾何變數化（phone 零回歸）

檔案：`css/style.css`

1. `:root` 新增：
   - `--frame-w: 440px`
   - `--frame-left: max(0px, (100vw - var(--frame-w)) / 2)`
   - `--frame-screen-left: calc(var(--frame-left) + 6px)`、`--frame-screen-w: calc(var(--frame-w) - 12px)`（phone = 428，同現況一樣）
   - 保留 `--frame-screen-top/bottom` 現有算式（Rule 43）。
2. 替換寫死值：
   - `.pd-shell` `max-width: 440px` → `var(--frame-w)`（4379 附近；4368／4383 兩處 `max-width: 440px` 逐個睇用途再決定）
   - display-window overlay 群組（約 2470–2485）、`#gacha-scene-b, #gacha-inspect`（約 4757）：`left: 50%; transform: translateX(-50%); max-width: 428px` → `left: var(--frame-screen-left); width: var(--frame-screen-w); transform: none`。
   - **注意 Rule 47**：exit 動畫原本係 `translateX(-50%) scaleY(0)`，要同步改成 `scaleY(0)`，`transform-origin: bottom center` 保留。grep `fixed-overlay-exit` 同所有含 `translateX(-50%)` 嘅 overlay 規則一齊改。
   - `.modal-backdrop`／`.toast` 置中方式改為對齊 `--frame-screen-left/w`。
3. Grep 確認：`grep -nE "428px|translateX\(-50%\)" css/style.css` 逐條處理或註明保留原因。

**驗證**：S1／S2 rect JSON 同 Task 0 完全一致（差 0）；選題、Friends、Leaderboard、Gacha 結算卡四邊同 `.pd-screen2` 差 0；exit 動畫喺 S2 錄一次 slow-mo 確認冇橫移。

## Task 3 — tablet 放大直向（700–899）

檔案：`css/style.css`

1. `@media (min-width: 700px)`：`--frame-w: min(640px, 100vw)`。
2. 放大：拍檔 sprite、`.ph-cta` 高 64px、`.ph-bd` icon 28px＋目標 ≥ 48px、bezel `.pd-stat` 字級 +1。
3. Sheet 最大高度維持現有比例；`.ph-sheet-down`／`-up` 動畫不變。

**驗證**：S3 截圖；Overlay 四邊對齊；冇橫向 scroll。S9 都要係 tablet 版面。

## Task 4 — wide 外殼雙欄

檔案：`css/style.css`、`index.html`（可能加一個 wrapper）

1. `@media (min-width: 900px) and (min-height: 560px)`：
   - `--frame-w: min(1240px, 100vw - 48px)`
   - `--frame-h: min(100dvh - 48px, 900px)`、`--frame-top: max(24px, (100dvh - var(--frame-h)) / 2)`
   - `.pd-shell`：`top: var(--frame-top); height: var(--frame-h); bottom: auto`；四角 18px 圓角；safe-area padding 用下限 8px。
   - `--frame-screen-top` 喺 wide 改為 `calc(var(--frame-top) + deco + 48px + 6px + 8px)`；`--frame-screen-bottom` 改為 `calc(100dvh - var(--frame-top) - var(--frame-h) + 46px + 6px)`。
   - 欄寬變數：`--pane-l: clamp(340px, 30%, 400px)`、`--pane-gap: 10px`。
2. `.pd-screen2` 轉做兩欄 grid：左欄放主頁內容（`ph-sign`、`ph-today`、`ph-gym`、`ph-spacer`、CTA、`ph-bottomdock`），右欄放 `.ph-sheets`（`grid-column: 2; grid-row: 1 / -1`）。
   - 想要「兩塊獨立白螢幕＋中間紅色間隔」：`.pd-screen2` 背景透明、冇 border；左欄用 `::before` 或新增 wrapper `.ph-main` 畫白底黑邊；`.ph-sheets` 自己白底黑邊 14–16px 圓角。
   - 如要加 `.ph-main` wrapper：先 grep JS 有冇用 `.pd-screen2 > ` 或 `parentElement` 依賴主頁子元素位置；有就逐個處理。
3. Bezel 喺 wide 分左右兩端（`justify-content: space-between`），deco 品牌字置中。
4. 計出右欄 overlay 對齊用變數（wide 覆寫 Task 2 嘅變數）：
   - `--frame-screen-left: calc(var(--frame-left) + 6px + var(--pane-l) + var(--pane-gap))`
   - `--frame-screen-w: calc(var(--frame-w) - 12px - var(--pane-l) - var(--pane-gap))`
   - 要用 JS 量 `.ph-sheets` rect 同變數比較，差值 0；如果 % clamp 令 CSS 變數同 grid 計算唔一致，改用固定 `--pane-l` 數值（例如 S4 360px、≥1280 400px 分段）。

**驗證**：S4–S7 截圖；`.ph-sheets` rect 同 `--frame-screen-*` 一致；S1–S3 rect 冇變。

## Task 5 — wide sheets 行為（常駐右欄＋預設 Daily Quests）

檔案：`js/app.js`、`css/style.css`

1. CSS（wide）：`.ph-sheet` 填滿右欄（`inset: 0; max-height: none`），`transform: none`；開關改 `opacity` 150ms 淡入（`prefers-reduced-motion` 即時）；`.ph-backdrop` `display: none`；`.ph-sheet-expand`（展開箭咀）隱藏，wide 直接用 full 版內容（見第 4 點）。
2. 新增 `App._showWideDefault()`：只喺 `layout === "wide"`、冇其他 sheet `ph-open`、冇 display-window overlay active 時，**直接**將 `#sheet-quests` 設 `hidden=false` + `ph-open` + render quests 內容。**唔可以 call `_openSheet`**（佢會 `showView("view-home")`，殺咗正喺右欄嘅 overlay）。
3. 接駁點：
   - `_closeSheet`、`_closeAllSheets` 嘅 430ms timer 尾（stillOpen guard 之後）→ call `_showWideDefault()`。兩條路徑都要加（Rule 41）。
   - 啟動完成、`pe:layout` 轉入 wide → `_showWideDefault()`；轉出 wide → 收起預設 sheet、`_closeAllSheets()` 重置。
   - 下巴 Home、Esc → 關 overlay／sheet 後落返預設。
4. Sheet compact／full：wide 開 Pokédex／Streak／Quests 時直接行 full 模式（重用現有 expand 邏輯同 `_unmountSheetView`），因為右欄夠大。檢查 Rule 36（compact→full 共用頂部 unit）。
5. 「點外面關 sheet」（document click handler，約 app.js 3661）：wide 時 `return`，唔關右欄；`hit.closeBtn` 照舊處理（✕ → 返預設）。Rule 40／60 嘅 body overlay 豁免照留。
6. `binder`（約 3146）／`dockBinder`（約 3424）：wide 時「再撳同一個掣」= 返預設（toggle），撳另一個 = 直接替換，唔使等 410ms close→open 動畫（可以即時切）。保留 token cancel 機制（Rule 52）。

**驗證**（S2 同 S6 都要做，S2 確認冇回歸）：
- 開每個 sheet → ✕ → 返 Quests；撳 dock 掣兩次 → toggle；A sheet 開住撳 B → 直接換。
- 點左欄拍檔卡 → 右欄唔關（wide）；S2 照舊會關（phone）。
- 開 Gacha sheet → 抽獎 → 結算卡 TO GO（Rule 40）、下巴 Home（Rule 41）。
- 連續快撳 5 個 dock 掣，最後顯示啱嘅 sheet，冇 sheet 卡 `hidden` 但 `ph-open`（Rule 31／35）。

## Task 6 — wide display-window overlays 入右欄

檔案：`css/style.css`、`js/app.js`

1. Overlay 群組已用 `--frame-screen-*`（Task 2），wide 自動對齊右欄（Task 4 覆寫變數）。確認 Rule 39 圓角、Rule 47 黑邊、z-index 120 不變。
2. wide 時左欄要可撳：overlay 只蓋右欄，`App._setFrameLock`（答題／捕捉／對戰）照鎖 bezel stat 同下巴；左欄 dock／CTA 喺選題、Friends、Leaderboard、Battle Menu、結算時可撳 → 直接切換右欄內容（`showView` 走現有路徑）。
3. `showView("view-home")` 由 overlay 返主頁 → 完成後 `_showWideDefault()`。
4. Rule 53：由結算／overlay 開 home sheet 唔可以靠 `view-home.active` 判斷 —— 檢查 `_openSheet` 喺 wide 時嘅 `showView("view-home")` 路徑仍然正確。

**驗證**：S6 開選題、Friends、Leaderboard、Battle Menu、結算，各自 rect 同 `.ph-sheets` 差 0；overlay 開住時撳左欄 dock 另一個掣 → 正確切換；exit 動畫留喺右欄內。

## Task 7 — modal／toast 喺大屏

檔案：`css/style.css`

1. `.modal-backdrop`：wide 時 backdrop 蓋全 viewport，`.modal-card` 置中於**成部 frame**（唔係右欄），`max-width: 480px`；登入卡（`.modal-card:has(> .au)`）維持 420。
2. `.toast`：wide 時置中於右欄頂（`--frame-screen-*`）。
3. Z-order 全景（Rule 46）唔變。

**驗證**：S6 Login Gate、Rename、Import modal；觸發 toast（例如背包鎖住提示）喺答題 overlay、team-select modal 之上都睇到。

## Task 8 — 答題＋結算

檔案：`css/style.css`、`js/app.js`（`_renderSettlement` 只改 class，唔改邏輯）

1. 答題（≥600 全螢幕維持）：`.quiz-col`（或對應內容欄）`max-width: 600px`（tablet）／`720px`（wide）居中；頂部進度、底部回饋條同鍵盤跟住內容欄闊度。
2. App 鍵盤：`Quiz._syncKeyboard` 已經「非觸控隱藏」→ 只驗證 `_isTouchDevice()` 喺 laptop（滑鼠）回傳 false、iPad 回傳 true；觸控 laptop 顯示鍵盤屬預期。唔使改 code，除非驗證失敗。
3. 圖片題：S5（1366×640）驗 Rule 72 —— `#quiz-scroll` `scrollHeight - clientHeight ≤ 4`、輸入格 bottom < 鍵盤 top（鍵盤收起時只查前者）。
4. 結算：wide 喺右欄；右欄闊 ≥ 640 時分數圈＋stat 左、錯題預覽右兩欄（`@container` 或 wide media query）。Rule 44：結算出口仍然係下巴 `btn-pd-home`。

**驗證**：S1、S2、S3、S5、S6 跑一輪 10 題（文字題＋圖片題）至結算；Rule 71 鍵盤位置（觸控尺寸）；Rule 74 空格浮標唔漂。

## Task 9 — 轉機提示

檔案：`js/bag.js`、`js/battle/landscape.js`、`js/app.js`、`css/style.css`

1. `bag.js` `isPortrait()`／`fit()` 嘅「要轉機」判斷改為 `App.layout() === "phone"`（tablet 直向直接等比縮放，唔出提示、唔 rotate 90°）。`battle/landscape.js` 同樣處理（先讀佢現有邏輯）。
2. 新增 `phone-land` 提示 overlay（`#rotate-portrait`，視覺沿用 `.bag-rotate`）：`data-layout="phone-land"` 且當前 view 唔係戰鬥／背包／捕捉時顯示；z-index 低過 toast（Rule 46），掛 body 要 `stopPropagation`（Rule 60）同 `__peHit` 豁免（Rule 40）。
3. 答題中轉橫：提示蓋住但唔中斷答題 state，轉返直向即恢復。

**驗證**：S3 開背包＋戰鬥冇提示、版面等比；S2 開背包有原本轉機提示；S8 主頁／答題顯示轉返直向提示，戰鬥正常。

## Task 10 — 商用橫切要求

檔案：`css/style.css`

1. wide／tablet：主頁、sheet、overlay 嘅按鈕加 `:focus-visible` 外框（黑 2px + 黃 offset，跟現有風格）；`@media (hover:hover) and (pointer:fine)` hover 狀態（Rule 49 hover lift 已有就沿用）。
2. Esc 鍵：右欄 sheet／overlay 關閉（答題內 Esc 維持現有 settings 行為，唔覆蓋）。
3. 觸控目標：S1 量 dock、bezel stat、sheet ✕ ≥ 44×44；S3 ≥ 48。
4. 字級最細 12px（grep `font-size: (9|10|11)px` 喺 P1 觸及範圍逐個評估）。

**驗證**：S6 純鍵盤 Tab 由 bezel → 左欄 → 右欄可達、可見焦點；Esc 關右欄返 Quests。

## Task 11 — 總驗收＋文件

1. S1–S9 重跑全部頁面截圖，同 Task 0 baseline 並排；S1／S2 rect JSON 零差異。
2. Rule 重驗清單：17、23、27、31、35、36、37（`--device iphone-se`）、39、40、41、43、45、46、47、52、53、60、72。
3. 文件：
   - `CODEBASE_INDEX.md` 加「響應式斷點／`App.layout()`／wide 雙欄」一行。
   - preop checklist 加新 Rule（斷點來源、`--frame-screen-*` 唯一定位來源、wide 用 `_showWideDefault` 唔用 `_openSheet`、phone 零回歸驗證方法）。回覆結尾寫 `Skill: Rule N added`。
   - spec 狀態改 Done（P1）；寫 P2 spec 草稿題目清單。
4. 交畀用戶驗收；commit 等用戶開口。

## 風險同對策

| 風險 | 對策 |
|---|---|
| sheet 狀態機回歸（最多事故） | Task 5 每步都喺 S2＋S6 雙測；預設 sheet 用獨立函數，唔經 `_openSheet` |
| `translateX(-50%)` 移除漏咗某個 overlay | Task 2 grep 清單逐條剔；四邊 rect 差 0 檢查 |
| CSS 變數同 grid 實際欄寬唔一致 | Task 4 用 JS 量 rect 比較；唔一致就改固定分段數值 |
| wide ↔ tablet 即時切換（拖視窗） | `pe:layout` 事件重置 sheet；S4↔S9 來回 resize 測 |
| phone 回歸 | 新規則全部包喺 `min-width: 700px` media query；Task 0 rect JSON diff |
