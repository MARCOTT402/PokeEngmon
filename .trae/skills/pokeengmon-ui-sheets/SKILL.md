---
name: pokeengmon-ui-sheets
description: PokeEngmon UI interaction rules: home sheets (open/close paths, binder token cancel, compact/full, click-outside), body-level overlays and stopPropagation, gestures and drag, button press animation, SVG icons, textContent pitfalls, timers and render entry points. Read before touching sheets, binders, overlays' click handling, gestures, home buttons or UI widgets. Layout/positioning lives in pokeengmon-responsive.
---

# PokeEngmon UI：sheet／overlay 狀態機同元件

> 幾時讀：改 home sheet、binder／dockBinder、overlay 嘅點擊處理、手勢、按鈕動畫、icon、UI 元件之前。版面定位睇 `pokeengmon-responsive`。
> 由 `pokeengmon-preop-checklist` 按題目拆出（2026-11-06）。下面係每條 Rule 嘅**現行要點**（原文條列照抄）；事故經過、code 範例、原因分析喺 `references/incidents.md`，要查來龍去脈先開。
> 新事故：寫入 `references/incidents.md`（`### Rule N — 標題` 加喺尾），呢度加要點；preop checklist 加 `## Rule N — 標題` 一行指向（跟 `post-fix-lesson-capture`）。

## Sheet 規格摘要（完整規格見 `references/sheet-spec.md`，原 `webapp-mobile-dev` Rule 6.2–7）

- **✕ 關閉鍵一律喺右上角**：bottom-up sheet 用 flex（title `flex:1`）；top-down sheet title 置中、✕ `position:absolute; right:14px`（長 title 唔會推走 ✕）。✕ 最少 34×34（可撳範圍由 `::after` 擴大，見 `pokeengmon-responsive` §10），`aria-label="Close"`。
- **捲動時間統一 0.4s**（`transform .4s cubic-bezier(.25,1,.5,1)`）；唔好唔同 sheet 唔同時間。
- **按鈕三種狀態**：冇 sheet → 開；同一個開住 → 關（toggle）；另一個開住 → 先關再開（binder＋debounce＋token，Rule 52）。
- **子按鈕唔好用 binder**：sheet 內展開用 `expandArrow()`（accordion），handler 要 `e.stopPropagation()`；唔好用 `overflow: visible` 解決裁切（有 transform 嘅元素會出事）。
- **兩條 close 路徑一致**（`_closeSheet`／`_closeAllSheets`）：只 remove `ph-open`，430ms timer＋stillOpen guard 先設 `hidden`（Rule 31、41）。
- **切 view 自動捲回**；**四種關閉路徑**（✕、backdrop、點外面、Esc）全部經 `_closeSheet`／`_closeAllSheets`，唔好直接 `classList.remove`。
- **Bezel stat 數值 pill**：用 `left: calc(50% + 2px)` 貼 icon，唔好 `right:-8px`。
- **手勢**：左右掃分頁、箭咀拖曳展合；驗收用 CDP `Input.dispatchTouchEvent`（Rule 34、65）。
- wide（≥900×560）右欄行為（預設 Daily Quests、即時切換、Esc）見 `pokeengmon-responsive` §6。

## Rules

### Rule 17 — Feature hubs must close when clicking outside

- Feature hubs / panels (Report a problem, Partner Care, Login Hub, Pokedex detail, My Questions, etc.) MUST stay dismissable by tapping the backdrop — call `App.showModal(html)` WITHOUT `true`.
- Only destructive or blocking confirmations (Reset Progress name confirmation, quit-quiz confirmation, cloud-overwrite warning) may pass `true`, because an accidental backdrop tap must not wipe or overwrite progress.
- When adding a new hub, also wire its Cancel/close button to `App.closeModal()` so both dismissal paths exist.

### Rule 23 — A class with `display:flex` defeats the `hidden` attribute; visible-by-default lists don't need a reveal tap

- Any repo element whose class sets `display` (e.g. `.ai-trainer-list{display:flex}`) IGNORES `el.hidden = true` (author styles beat the UA `[hidden]{display:none}` rule). Add an explicit `.<class>[hidden]{display:none}` pair in `css/style.css` before using `hidden` as a toggle.
- Content lists that are the point of a screen MUST be rendered when the view opens (in `renderMenu()` / the view's render fn), not behind a second tap. Keep the tile as a collapse/expand affordance only.
- Guard generated-item click handlers against missing prerequisites (e.g. no owned Pokémon) inside the handler too — once a list renders unconditionally, its click path is reachable in states the old reveal-flow never allowed.

### Rule 28 — 手寫 SVG 圖示一定要帶 `fill` 或 `stroke`，否則變黑塊或完全隱形

- 線稿圖示統一寫齊：`fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`。
- 實心圖示必須明寫 `fill`（例如火焰 `fill="#ff7a00"`），並補 `stroke` 描邊以配合手繪風。
- 同一組（頂 dock / 底 dock）圖示用同一 stroke-width 與 viewBox 尺寸，否則視覺重量不一致。
- 驗收：截圖後逐格數目對數（5 格要見到 5 個圖示），唔係只看「有冇紅屏」。

### Rule 29 — 唔好對「按鈕本身」寫 textContent；圖鑑總數用 `TOTAL_SPECIES`

- 更新 dock 數值時只寫**內部 label span**（`home-streak-label`、`home-dex-progress`、`topbar-diamonds`），永遠唔郁按鈕本身。
- 圖鑑總數（Gen 1-5，649）係 `js/data.js` 的 `TOTAL_SPECIES`；單一世代 151 只係 `SPECIES` 篩選結果。
- 新寫任何 `getElementById(...).textContent =` 前，先確認該元素**只含文字**；含 SVG 或子元素就要改寫目標 span。

### Rule 31 — `_closeAllSheets()` 唔好立即設 `hidden=true`，要等 transform 動畫跑完

- **移除 retry + force-close loop！** 如果 `stillOpen` 存在，代表有合法 sheet 開緊 → 直接 skip，唔好 retry 唔好 force close
- 兩條 close 路徑（`_closeSheet` / `_closeAllSheets`）**完全一致**：
  1. 只 remove `ph-open` class（動畫自然播）
  2. setTimeout 430ms（比 transition 400ms + binder open 410ms 遲 20ms）
  3. 雙重 `requestAnimationFrame(() => requestAnimationFrame(...))` 確保 `_openSheet` 嘅 rAF 已經跑完
  4. 檢查 **`sheet.ph-open`** → 有 → `return`（skip，唔好 force close）；冇 → 清理所有 `.ph-open=false` 嘅 sheet + backdrop hidden
- `_closeSheet` remove 自己後即刻檢查 `anyOpen` → 冇其他 sheet 開住就一併 remove backdrop.ph-open
- 移除 `_checkCloseAllSheets()`（舊時單獨 close 完再 call closeAll → 雙 timer race）
- Binder pattern：`_sheetSwitching` debounce flag（cross-button path 先設，toggle path 唔設）
- 切換 view 時 `showView()` 最頂部 call `_closeAllSheets()`（唔等動畫）

### Rule 32 — Render 函數新增選項後，要審查所有「內部再 render」入口

- 為 render 加任何 option 時，逐一列出所有會再次呼叫它嘅入口：內部 nav/pagination、sync pull 後 refresh、resize、動畫結束後 re-render。每個入口都必須傳回同一份 options（或把 options 存在 root 上）。
- 事件 handler 唔好在首次注入時 bind 一次就算；每次 render 都重綁，令 closure 永遠帶住最新 options。
- 驗收方法：用 headless 打開該情境，實際 click 一次確認行為同預期一致，而唔止係讀 code。

### Rule 34 — 手勢（swipe / drag）實作要點

- 用 pointer events（`pointerdown/move/up/cancel`）+ 每次 render 用 `AbortController` 重綁，避免舊 handler 疊加。
- CSS `touch-action`：可捲動區域用 `pan-y`（保留垂直捲動、自己處理橫掃）；純拖曳 handle 用 `none`。
- 一定要做 **axis lock**（例如 6px 後判斷橫向定縱向）：縱向就即刻放手指手，交返俾 sheet 捲動，否則會搶走 scroll。
- 掃完要 suppress click，而且 flag 要**跨 re-render 保存**（掛喺 DOM element 上，例如 `grid._swipeSuppress`）；因為轉月後 `render()` 會重建 listener，local flag 會失效，synthetic click 就會誤觸日期格。
- height 由 auto ↔ 100% 係唔可以 transition 嘅：先量目標高度 → 設返起點 px → 下一 frame animate 去目標 px → 完成後才改回 `auto` / `100%`，否則會直接跳。
- **拖曳方向要跟 panel 嘅 anchor**：`.ph-sheet-down` 係 `top: 0`、由頂部向下展開，所以 **向下拖 = 展開、向上拖 = 收起**（height 增加時 handle 會向下行）。照抄「向上展開」會同手指方向相反 — 2026-11-03 實際做錯過一次要改返。Bottom-anchored sheet 才係向上拖展開。
- Headless 驗證手勢要用 CDP `Input.dispatchTouchEvent`；用 JS 合成 `PointerEvent` 會令 `setPointerCapture` 拋 `NotFoundError`，驗唔到真實行為。

### Rule 35 — sheet 內 click handler 即時 re-render 會令 document click 誤關 sheet

- 任何 sheet 內 handler 會**同步** re-render（尤其清空 container）都要 `ev.stopPropagation()`。
- 或者延後 re-render（`setTimeout 0` / `requestAnimationFrame`），等 click 冒泡完先換 DOM。
- **最穩妥（現已採用，Rule 35 更新）**：document 嘅 click handler 喺 **capture phase** 先用 `e.target.closest()` 記低 backdrop / sheet / close button 命中結果，bubble 階段只讀呢個記錄。咁就算 handler 中途 re-render 令 target detach，判斷仍然正確 — 唔使逐個 handler 補 `stopPropagation`。
- 測試唔好只驗內容有冇更新，要同時驗返 sheet 仍然 `ph-open`。

### Rule 36 — sheet compact → full 要共用同一個頂部 unit，唔好各整一份

- 做法：mount 時只搬「頂部 unit」element（例如 `#gen-hub`、`#dex-progress`）入 sheet host 並 render 一次；**展開時**才把其餘 childNodes append 落去；**收起時**把其餘 nodes 搬返 view，頂部 element 完全唔動 → 同一個 unit、位置不變。
- `_unmountSheetView` 要用 `prepend`（收起狀態下 lower 內容已搬返 view，頂部 unit 要放返最前），否則次序會變。
- `expandArrow` 支援 opts `onDragStart` / `onDragEnd`：拖曳期間先放出 lower content（避免拉出空白），未夠力就收起返。
- `renderHub()` 嘅 `scrollIntoView` 喺 sheet mount 時要 skip（flag），否則一開 sheet 就橫向捲走第一格；mount 完再 `scrollLeft = 0`。

### Rule 40 — body 級 overlay 要豁免「點外面關 sheet」全域 handler

- 任何掛喺 body、但邏輯上屬於某個 sheet 流程嘅 overlay，都要喺 `e.__peHit` capture 階段加 hit-test（見 `gachaOverlay`），並喺 bubble handler 豁免。
- 日後新增 body 級 overlay（唔喺 sheet DOM 內），即刻問：「佢嘅 click 會唔會誤觸 _closeAllSheets？」

### Rule 41 — 關 sheet 有兩條路徑：改一條就要同步另一條

- `_closeSheet()`（逐個關）有 sheet-specific hooks（gacha → `Gacha.abort()`）；`_closeAllSheets()`（全部關，例如下巴 Home、戰敗跳走）必須做同樣嘅 hook，依家已加 `if sheet-gacha is open → Gacha.abort()`。
- 日後任何「關閉時要做清理」嘅 sheet（stop BGM、收 overlay、補結算），hook 要同時存在兩個函數；更好係 `_closeAllSheets` 內部逐個 call `_closeSheet`。
- body 級 overlay 嘅清理永遠要靠 abort/close hook，唔好假設 sheet 關咗佢就會自己消失。

### Rule 49 — Duolingo 風格按鈕動畫：pressed 彈出 + hover lift + vibration

**CSS 規格：**
```css
.btn-big:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,.15); }
.btn-big:active { transform: scale(.92); box-shadow: 0 1px 2px rgba(0,0,0,.2); transition-duration: 60ms; }
@keyframes btn-pop { 0%{scale(.92);} 50%{scale(1.04);} 100%{scale(1);} }
.btn-big.pressed { animation: btn-pop 280ms cubic-bezier(.25,1,.5,1); }
@media (prefers-reduced-motion: reduce) { .pressed { animation: none; } }
```

**JS 委派：** 現有 document click SFX 委派入面加 `.pressed` class + `navigator.vibrate(12)`。用 `void btn.offsetWidth` 強制 reflow 防抖動。覆蓋範圍：`.btn-big, .btn-google, .pd-menu-btn, .icon-btn, .btn-nav, .chip-btn, .icon-link`。

### Rule 52 — binder / dockBinder token cancel pattern：先 showView，再 bump 自己 token

**標準 pattern（binder 同 dockBinder 都要用）：**
```js
if (hasFixedOverlay || curSheet) {
  if (hasFixedOverlay) this.showView("view-home");  // ← 先 call（佢會 bump _sheetSwitchToken）
  const token = (App._sheetSwitchToken = (App._sheetSwitchToken || 0) + 1);  // ← 再 bump
  App._sheetSwitching = true;
  this._closeAllSheets();
  setTimeout(() => {
    if (App._sheetSwitchToken !== token) return;  // 外部切 view bump 咗 → cancel
    App._sheetSwitching = false;
    openFn();
  }, 410);
}
```

**改 closure var 時必須同時改兩個 closure**（`binder` = 頂部 bezel，`dockBinder` = 底部 dockbar），佢哋係獨立 closure，漏改一個就 ReferenceError 全壞。

### Rule 53 — 由結算／display-window overlay 開 home sheet：唔可以用 `view-home.active` 做判斷

- **Root cause：** 結算頁等 display-window overlay 會刻意保持 `#view-home` active（紅框要留喺後面）。`openGachaSheet()` 舊 code 係 `if (!view-home.active) showView("view-home")` → active 已 true，跳過切頁 → gacha sheet 開喺結算 overlay（z-index 120）後面，用戶完全睇唔到。
- **必做：** `App._openSheet(id)` 已加 universal guard：`view-home.active` 但仲有 `.view.active:not(#view-home)` → 先 `showView("view-home")` 再開 sheet。任何新 `open*Sheet()` 都唔好再自己寫 `active` guard，直接 `showView("view-home")` 再 `_openSheet`（或交畀 `_openSheet` guard）。
- **測試路徑：** `App.showView("view-settlement")` → click `#btn-pull-rare` → 斷言 `#view-settlement` 唔再 active、`#sheet-gacha` visible；同樣試 Streak／Dex／Energy sheet 由結算頁開。
- 呢個 bug class 會影響所有「overlay 保持 home active」嘅頁：結算、選題（quiz-setup）、Battle Menu、Friends、Leaderboard。新增 page 時要當 `_openSheet` 係唯一入口。

### Rule 56 — 換進度條星星做動畫跑手：sprite sheet 化 + `flex: none` + 光暈 + 邊界淨空

- **唔好直接放大 GIF**：畫布四邊大量透明位、1-bit alpha 邊緣粗糙、`prefers-reduced-motion` 停唔到動畫。做法：Pillow 逐幀 `convert("RGBA")` → 用**全部幀 union bbox** 一次裁切（保留幀間彈跳位移，唔好逐幀自己裁，否則跑動會抖）→ LANCZOS 縮到 3×（實測 132×90/幀）→ 橫向拼成 528×90 PNG（32 KB），CSS `background-size: 176px 30px` + `steps(4)` 播 0.32s，配 `@media (prefers-reduced-motion: reduce) { animation: none }`。
- **flex column 內嘅進度條一定要 `flex: none`**：實測 `#view-quiz` `scrollHeight 721 > clientHeight 710` 時，14px 高嘅 `.progressbar` 被 flex-shrink 壓成 **0px**（整條進度條消失、跑手浮喺半空）。同 Rule 42 同一類問題，但唔限於「滾動清單」——任何有明確高度、又想永遠睇得見嘅 flex 子項都要 `flex: none`。
- 黃色跑手疊黃色進度條：`filter: drop-shadow(0 0 1.5px #fffdf7) drop-shadow(0 2px 2px rgba(0,0,0,.35))`，否則下半身同 `var(--yellow)` 融合。
- 邊界淨空：跑手 44×30、半寬 22px；`.progressbar` 用 `margin: 0 14px`（14 + view padding 12 = 26 ≥ 22）。實測 440×956 同 375×667，0% / 100% 都仍有 3.5px 淨空，冇被 display window 裁邊。
- 換走文字 glyph：跑手要 `aria-hidden="true"`；新 asset 要入 `sw.js ASSETS`，並且按 Rule 12 更新免責聲明／版權。
- 驗收：連續採樣 `getComputedStyle(runner).backgroundPosition` 要見到 `0 → -44 → -88 → -132` 循環（證明四幀真係播）；位置用 `getBoundingClientRect` 對 `#view-quiz` 內邊，唔好只靠肉眼睇截圖。

### Rule 58 — `_prompt()` 用 textContent：唔可以傳含 SVG 嘅字串

- `_prompt()` 只放純文字；需要 gem icon 嘅位置（成本 chip、按鈕）用 `innerHTML` 自己砌。
- 新增任何「文字 + icon」提示前，先確認該容器係 textContent 定 innerHTML。

### Rule 60 — 掛喺 body 嘅 overlay 必須 `stopPropagation`，否則 sheet 外部點擊 handler 會誤關

- 任何掛 body 嘅 overlay／modal root，建立時即加：
- 內部按鈕（開啟詳情／撳卡）嘅 listener 要綁喺子元素，先執行再被 root 截停冒泡。
- 驗收時必須真正 `cell.click()` 一次並截圖，唔好只驗「overlay 出到」。單靠 DOM 存在唔會發現呢類關閉 bug。

### Rule 64 — 同時跑幾個 setInterval／setTimeout 動畫：每個用自己嘅 local handle，唔好共用一個變數

- 每個動畫用 `const t = setInterval(...)` 自己清自己；「仲有冇動畫跑緊」用計數器（`typing++`／`typing--`）。
- 用 `Promise.all` 等幾個動畫時，要測「一長一短」兩段文字，短嗰個先完都唔可以影響長嗰個。

### Rule 65 — 喺有 Rule 60 stopPropagation 嘅 overlay 入面做拖放：pointermove／pointerup 要掛 window capture

- overlay 入面嘅拖放／拖捲／撳住連加：`window.addEventListener("pointermove"|"pointerup"|"pointercancel", h, true)`（capture 階段，喺 overlay 截停之前已經收到）。
- 唔好掛 `document` bubble；亦唔好為咗拖放拎走 Rule 60 嘅 stopPropagation（會令 sheet 外部點擊 handler 誤關）。
- 驗收一定要用真滑鼠拖（`left_click_drag`）一次，唔好只 call JS 函數。

### Rule 91 — 重構拆 DOM 時，被保留／搬去 sheet 嘅元素，佢嘅 render 寫入要一齊搬；唔好沿用舊 id 而冇人寫

- 拆舊容器（例如舊頂 dock）之前，先 Grep 每個被保留或搬走嘅 `id`，睇 JS 有冇 `getElementById("<id>")` 寫入；寫入要同元素一齊搬，唔好跟舊容器一齊刪。
- 搬去新位置嘅元素要改用反映新位置嘅 id（例如 `setting-name`），唔好沿用舊名（`topbar-name`），否則 Grep 會以為仲有人用緊。
- HTML 預設佔位字（`—`、`0`）要當成「未 render」嘅訊號：驗收時打開該 sheet，確認顯示嘅係真資料，唔係佔位字。
- 顯示用戶輸入（名、email）嘅值欄位要有 `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`，用最長允許長度（名字 24 字）測一次。
