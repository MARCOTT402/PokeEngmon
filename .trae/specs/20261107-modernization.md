# Spec：全面現代化（做法／流暢度／維護／UX）＋ 畫質 prototype

> ⚠ **2026-11-07：本 spec 係主線，優先於商用級計劃（用戶定）。** 執行清單、狀態、分工喺 `.trae/documents/20261107-master-engineering-plan.md`（主線次序照本 spec，商用級項目只做插入）。

> 日期：2026-11-07｜狀態：用戶已確認方向（唔上架、唔換 framework、Phase 0–3 直接做；畫質先 prototype，用戶過咗先取代）

## 1. 目標同界線

| 要 | 唔要 |
|---|---|
| 降低維護成本（global、巨檔、CSS 疊層打交） | 轉 React／Vue／React Native |
| 流暢度：轉頁、長列表、平價機 | 加 build step（GitHub Pages 直接 serve 原檔） |
| UX：一致嘅 token、動畫語言、提醒 | 加 Tailwind 或 CSS framework |
| 畫質：HD-2D 方向，先 prototype | 未經用戶睇過就換掉現有戰鬥／扭蛋畫面 |

**硬性條件**：手機 440×956 零回歸（responsive Rule §1）；每步 `npm run lint`、`npm test` 綠；改 CSS 前後 `shots.mjs` 比較；冇自動 commit（用戶要求先 commit）。

## 2. 量度基線（2026-11-07）

| 指標 | 數值 |
|---|---|
| JS | 42 檔、30,918 行；`app.js` 4,149 行 |
| `<script>` | 45 個，classic script 共用 global（221 個名） |
| CSS | `style.css` 6,084 行；`z-index` 94 處（全域層 ≥100 有 25 處）；`!important` 49 |
| 狀態 | `loadState`／`saveState` 239 處 |
| 模板 | `innerHTML` 171 處 |
| 計時 | `setTimeout` 118 處 |
| 類型檢查 | 全部檔一齊 `tsc --checkJs`：1,103 錯（~85% 係 `window.X` global 未宣告） |
| 資產 | `assets/` 76 MB，GIF 29 MB |

## 3. 分期

### Phase 1 — 地基（唔改行為）
1. **類型檢查**：`tsconfig.json`（noEmit、classic script 共用 global）＋ `types/globals.d.ts`（`window.X` 模組）＋ `npm run typecheck`。逐檔加 `// @ts-check`，清單只准加（ratchet）；CI release 前跑。
2. **全域 z-index token**：`:root` `--z-*`（數值同現況一樣），全域層（≥100）改用 token；JS 設 `zIndex` 嘅地方同步。Z-order 全景（responsive §4）以 token 為準。
3. **`html` tagged template**（`js/core/html.js`）：自動 escape、`raw()` 明確標記可信 HTML、`render(el, tpl)`。新 code 用佢；舊 `innerHTML` 遇到改就順手換，唔做大搬遷。

### Phase 2 — 架構
1. **Store**：`Store.get()`／`Store.update(fn)`／`Store.subscribe(key, fn)` 包住 `storage.js`（`saveState` 150ms 合併照用，Rule 102）。新 code 經 Store；舊 call site 分批換。
2. **拆 `app.js`**：按職責拆 `js/app/{router,layout,settlement,modals,boot}.js`（仍係 classic script，掛返 `App` 上），每拆一塊跑 e2e。
3. **ES modules**：由底層開始（`data`、`pokemon`、`sm2`、`core/*`）轉 `type="module"`，過渡期 `window.X = X` 兼容；`tests/helpers/load.js` 加 ESM 路徑。三個前置：Rule 75（const 唔喺 window）、Guard 載入次序（Rule 94）、SW ASSETS。
4. **可取消計時**：`Timers.scope(name)` → `after(ms, fn)`／`cancel()`；離開 view 一次過清（取代散落 `setTimeout` 嘅 token pattern，Rule 52／64）。

### Phase 3 — UX／流暢度
1. View Transitions API 轉頁（唔支援就照舊）；`prefers-reduced-motion` 全面跟。
2. 動畫 token：`--dur-*`、`--ease-*`（同 `App.SHEET_MS` 等對齊，Rule 100）。
3. 圖鑑長列表 `content-visibility: auto`。
4. Long-task 監測：`PerformanceObserver('longtask')` 落 `Guard.report`（類別 `perf`，抽樣）。
5. Web Push 溫習提醒（iOS 16.4+ 主畫面 PWA）— 要 Supabase Edge Function＋VAPID，另開 spec。

### Phase 4 — 畫質（prototype 先行）
- `tools/prototype-battle-fx.html`：PixiJS（WebGL 2D）戰鬥特效層 vs 現行做法對照。內容：hit-stop、震屏、白閃、屬性粒子、傷害數字、HP ghost bar、bloom、整數倍 pixel 放大。
- 用戶睇過 OK → 另開 spec 決定點接入 `js/battle/`（按需載入，同 three 一樣）。
- GIF → animated WebP、Three.js 按機調畫質，喺 prototype 通過後一齊做。

## 4. 驗收
- 每期：lint（warning 唔加）、`npm test`、`npm run typecheck`、`npm run test:e2e` 只剩已知 fail、CSS 改動 `shots.mjs --compare` 零差異（440×956）。
- 新邏輯有 `tests/unit/` 測試。

## 5. 風險
| 風險 | 對策 |
|---|---|
| 轉 module 改咗執行次序（module 係 defer） | 由冇副作用嘅底層開始；每檔轉完跑 e2e；Guard 保持第一個 classic script |
| z-index token 打錯值 | 只換數值相同嘅字面值；腳本核對替換前後 computed z-index |
| `@ts-check` 逼人改 code | 只喺已經乾淨或者只差 JSDoc cast 嘅檔開；唔為過 check 改行為 |
