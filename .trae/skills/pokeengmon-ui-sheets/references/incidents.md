# PokeEngmon UI：sheet／overlay 狀態機同元件 — 事故紀錄同原文（references）

> 由 `pokeengmon-preop-checklist` 原文搬入（2026-11-06），每條 Rule 原文照錄。主要點喺 `../SKILL.md`。

### Rule 17 — Feature hubs must close when clicking outside

`App.showModal(html)` installs a backdrop-click handler that closes the modal. Passing a second argument `true` (`App.showModal(html, true)`) disables it.

- Feature hubs / panels (Report a problem, Partner Care, Login Hub, Pokedex detail, My Questions, etc.) MUST stay dismissable by tapping the backdrop — call `App.showModal(html)` WITHOUT `true`.
- Only destructive or blocking confirmations (Reset Progress name confirmation, quit-quiz confirmation, cloud-overwrite warning) may pass `true`, because an accidental backdrop tap must not wipe or overwrite progress.
- When adding a new hub, also wire its Cancel/close button to `App.closeModal()` so both dismissal paths exist.

### Rule 23 — A class with `display:flex` defeats the `hidden` attribute; visible-by-default lists don't need a reveal tap

Incident (Battle menu): `#ai-trainer-list` was only filled when the "AI Trainers" tile was tapped, so the ladder looked empty on entry. It now renders inside `renderMenu()` and the tile just collapses/expands it.

- Any repo element whose class sets `display` (e.g. `.ai-trainer-list{display:flex}`) IGNORES `el.hidden = true` (author styles beat the UA `[hidden]{display:none}` rule). Add an explicit `.<class>[hidden]{display:none}` pair in `css/style.css` before using `hidden` as a toggle.
- Content lists that are the point of a screen MUST be rendered when the view opens (in `renderMenu()` / the view's render fn), not behind a second tap. Keep the tile as a collapse/expand affordance only.
- Guard generated-item click handlers against missing prerequisites (e.g. no owned Pokémon) inside the handler too — once a list renders unconditionally, its click path is reachable in states the old reveal-flow never allowed.

### Rule 28 — 手寫 SVG 圖示一定要帶 `fill` 或 `stroke`，否則變黑塊或完全隱形

Incident (同上，同一輪): 由原型搬去正式碼時，部分 `<svg>` 漏了 `fill`/`stroke` 屬性。`<rect>`/`<circle>` 默認 fill 黑色 → Pokedex 與 Quest 圖示變成實心黑塊；純線段 `<path>`（交叉劍）默認 fill 但無面積 → 完全睇唔到，底部 dock 明明 5 格只見到 4 格。

- 線稿圖示統一寫齊：`fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`。
- 實心圖示必須明寫 `fill`（例如火焰 `fill="#ff7a00"`），並補 `stroke` 描邊以配合手繪風。
- 同一組（頂 dock / 底 dock）圖示用同一 stroke-width 與 viewBox 尺寸，否則視覺重量不一致。
- 驗收：截圖後逐格數目對數（5 格要見到 5 個圖示），唔係只看「有冇紅屏」。

### Rule 29 — 唔好對「按鈕本身」寫 textContent；圖鑑總數用 `TOTAL_SPECIES`

Incident (v1.29 home dock 改版, 2026-11-03): `renderHome()` 寫 `document.getElementById("td-streak").textContent = "x" + calcStreak();`。`td-streak` 按鈕內同時有 `<svg>` 火焰圖示同 `<span id="home-streak-label">`，一行 textContent 就把整個 SVG 清掉，圖示變文字。同一輪亦寫了 `POKEMON_DEX.length` —— 呢個全域根本唔存在，dock 顯示 `0/undefined`。

- 更新 dock 數值時只寫**內部 label span**（`home-streak-label`、`home-dex-progress`、`topbar-diamonds`），永遠唔郁按鈕本身。
- 圖鑑總數（Gen 1-5，649）係 `js/data.js` 的 `TOTAL_SPECIES`；單一世代 151 只係 `SPECIES` 篩選結果。
- 新寫任何 `getElementById(...).textContent =` 前，先確認該元素**只含文字**；含 SVG 或子元素就要改寫目標 span。

### Rule 31 — `_closeAllSheets()` 唔好立即設 `hidden=true`，要等 transform 動畫跑完

Incident 1 (Home sheet close, v1.30): `_closeAllSheets()` 直接 `s.hidden = true`，結果所有 sheet 關閉時「閃一下就冇咗」—— transform `translateY(-100%)` 動畫被 `hidden` 立即中斷。

Incident 2 (cross-button transition, v1.30): 點閃電 → 再點電池，新 sheet 直接彈出冇動畫。根因：`_closeAllSheets` timer (410ms) 同 binder timer (410ms) 同時 race，新 sheet 可能被舊 timer 設 `hidden=true`。

Incident 3 (rapid toggle lock, v1.30): 快速來回點擊 5+ 次 icon 捲開捲收後，主頁 window 鎖住 — `.ph-backdrop` 留喺 DOM 有 `ph-open` + `pointer-events:auto`，遮晒主頁所有 element。根因鏈：
(a) `_closeSheet`（單獨關）冇 remove backdrop.ph-open（只有 `_closeAllSheets` 有）→ toggle close 時 backdrop 永遠留喺度
(b) 快速 cross-button → 多個 close timer 同時排 → 每個 timer 見到 stillOpen 就 skip → 冇 timer 真正執行 hidden
(c) `_openSheet` 入面 `backdrop.ph-open` 係同步加，但 `sheet.ph-open` 係 rAF 加 → cleanup timer 跑時檢查 sheet.ph-open（rAF 未跑）→ null → 唔 retry，但 backdrop.ph-open 已經喺度 → 遺留

Incident 4 (setting→diamond cross-button, v1.30): 點 setting → 點寶石，寶石 gacha 捲出來後立即消失。根因：之前加嘅 **retry + force-close loop**（retry 3×200ms = 600ms）— cleanup timer 430ms 跑時見到 gacha.ph-open → retry → 再見到 → retry → attempts>=3 強制 remove 所有 ph-open + hidden！**Force close 唔應該存在！** 如果有合法 sheet 開住（binder 410ms 後開嘅），就 skip，唔好強關。

最終正確做法（v1.30 commit `b54712f`）：
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

**仍然未解決：** 快速 cross-button（間隔 < 410ms）時，後續 click 會被 `_sheetSwitching` flag skip。如果要完全解決，需要用 **last-click-wins 模式**（新 click 會 cancel 舊 timer）而唔係 debounce skip。

完整規格見 `.trae/skills/webapp-mobile-dev/SKILL.md` Rule 6。

### Rule 32 — Render 函數新增選項後，要審查所有「內部再 render」入口

Incident (2026-11-03 Calendar): `Calendar.render()` 曾加咗 `disableClick` option，但月切換 nav 的 handler 寫成 `this.render(containerId)`（冇帶 options），令同一 option 喺另一個入口失效（該 option 後來因需求改變而移除，但教訓通用）。

- 為 render 加任何 option 時，逐一列出所有會再次呼叫它嘅入口：內部 nav/pagination、sync pull 後 refresh、resize、動畫結束後 re-render。每個入口都必須傳回同一份 options（或把 options 存在 root 上）。
- 事件 handler 唔好在首次注入時 bind 一次就算；每次 render 都重綁，令 closure 永遠帶住最新 options。
- 驗收方法：用 headless 打開該情境，實際 click 一次確認行為同預期一致，而唔止係讀 code。

### Rule 34 — 手勢（swipe / drag）實作要點

Incident (2026-11-03 Calendar): 加左右掃轉月 + 拖曳箭咀展合 sheet，容易踩以下幾點。

- 用 pointer events（`pointerdown/move/up/cancel`）+ 每次 render 用 `AbortController` 重綁，避免舊 handler 疊加。
- CSS `touch-action`：可捲動區域用 `pan-y`（保留垂直捲動、自己處理橫掃）；純拖曳 handle 用 `none`。
- 一定要做 **axis lock**（例如 6px 後判斷橫向定縱向）：縱向就即刻放手指手，交返俾 sheet 捲動，否則會搶走 scroll。
- 掃完要 suppress click，而且 flag 要**跨 re-render 保存**（掛喺 DOM element 上，例如 `grid._swipeSuppress`）；因為轉月後 `render()` 會重建 listener，local flag 會失效，synthetic click 就會誤觸日期格。
- height 由 auto ↔ 100% 係唔可以 transition 嘅：先量目標高度 → 設返起點 px → 下一 frame animate 去目標 px → 完成後才改回 `auto` / `100%`，否則會直接跳。
- **拖曳方向要跟 panel 嘅 anchor**：`.ph-sheet-down` 係 `top: 0`、由頂部向下展開，所以 **向下拖 = 展開、向上拖 = 收起**（height 增加時 handle 會向下行）。照抄「向上展開」會同手指方向相反 — 2026-11-03 實際做錯過一次要改返。Bottom-anchored sheet 才係向上拖展開。
- Headless 驗證手勢要用 CDP `Input.dispatchTouchEvent`；用 JS 合成 `PointerEvent` 會令 `setPointerCapture` 拋 `NotFoundError`，驗唔到真實行為。

### Rule 35 — sheet 內 click handler 即時 re-render 會令 document click 誤關 sheet

Incident (2026-11-03 Pokédex compact preview): 喺 sheet 入面嘅 chip／按鈕 handler 直接 `container.innerHTML = ...` 重繪，`event.target` 會變成 detached node；跟住 document 嘅 bubble click handler 做 `e.target.closest("#view-home .ph-sheet")` 會攞到 null，誤判「點咗 sheet 外面」而 `_closeAllSheets()`。症狀係撳 chip 之後內容有更新，但 sheet 已經靜靜雞關咗，之後再撳箭咀就會出現 full class 但冇內容嘅怪狀態。

- 任何 sheet 內 handler 會**同步** re-render（尤其清空 container）都要 `ev.stopPropagation()`。
- 或者延後 re-render（`setTimeout 0` / `requestAnimationFrame`），等 click 冒泡完先換 DOM。
- **最穩妥（現已採用，Rule 35 更新）**：document 嘅 click handler 喺 **capture phase** 先用 `e.target.closest()` 記低 backdrop / sheet / close button 命中結果，bubble 階段只讀呢個記錄。咁就算 handler 中途 re-render 令 target detach，判斷仍然正確 — 唔使逐個 handler 補 `stopPropagation`。
- 測試唔好只驗內容有冇更新，要同時驗返 sheet 仍然 `ph-open`。

### Rule 36 — sheet compact → full 要共用同一個頂部 unit，唔好各整一份

Incident (2026-11-03 Pokédex): 初版用自製 compact preview markup，full 再搬成個 view 入去；兩個 gen hub 係唔同 DOM，展開時頂部會 re-render／跳位，睇落似 overlap。用戶要求「上部份係同一個 unit，下部份由上部份展開出去」。

- 做法：mount 時只搬「頂部 unit」element（例如 `#gen-hub`、`#dex-progress`）入 sheet host 並 render 一次；**展開時**才把其餘 childNodes append 落去；**收起時**把其餘 nodes 搬返 view，頂部 element 完全唔動 → 同一個 unit、位置不變。
- `_unmountSheetView` 要用 `prepend`（收起狀態下 lower 內容已搬返 view，頂部 unit 要放返最前），否則次序會變。
- `expandArrow` 支援 opts `onDragStart` / `onDragEnd`：拖曳期間先放出 lower content（避免拉出空白），未夠力就收起返。
- `renderHub()` 嘅 `scrollIntoView` 喺 sheet mount 時要 skip（flag），否則一開 sheet 就橫向捲走第一格；mount 完再 `scrollLeft = 0`。

### Rule 40 — body 級 overlay 要豁免「點外面關 sheet」全域 handler

Incident (2026-11-04)：gacha 結算卡撳「×3 TO GO!」會跳返主頁而唔係再抽。原因：`#gacha-inspect` / `#gacha-scene-b` 係 `document.body.appendChild` 掛嘅 fixed overlay，**唔喺** `#view-home .ph-sheet` DOM 入面；app.js 嘅全域 document click handler 見「click 唔喺 sheet 內」就 `_closeAllSheets()`，於是 TO GO 嘅 click 順手將 gacha sheet 關埋。

- 任何掛喺 body、但邏輯上屬於某個 sheet 流程嘅 overlay，都要喺 `e.__peHit` capture 階段加 hit-test（見 `gachaOverlay`），並喺 bubble handler 豁免。
- 日後新增 body 級 overlay（唔喺 sheet DOM 內），即刻問：「佢嘅 click 會唔會誤觸 _closeAllSheets？」

### Rule 41 — 關 sheet 有兩條路徑：改一條就要同步另一條

Incident (2026-11-04)：gacha 結算卡撳下巴 Home 掣「冇反應」——其實 Home 掣有行到 `_closeAllSheets()`，但佢只係逐個 sheet `remove("ph-open")`，**冇**好似 `_closeSheet()` 咁呼叫 `Gacha.abort()`，於是 body 級嘅 `#gacha-inspect` 結算卡冇收到、繼續蓋住成個畫面，用戶以為掣壞咗。

- `_closeSheet()`（逐個關）有 sheet-specific hooks（gacha → `Gacha.abort()`）；`_closeAllSheets()`（全部關，例如下巴 Home、戰敗跳走）必須做同樣嘅 hook，依家已加 `if sheet-gacha is open → Gacha.abort()`。
- 日後任何「關閉時要做清理」嘅 sheet（stop BGM、收 overlay、補結算），hook 要同時存在兩個函數；更好係 `_closeAllSheets` 內部逐個 call `_closeSheet`。
- body 級 overlay 嘅清理永遠要靠 abort/close hook，唔好假設 sheet 關咗佢就會自己消失。

### Rule 49 — Duolingo 風格按鈕動畫：pressed 彈出 + hover lift + vibration

Incident (2026-11-04)：用戶要求所有按鈕加 Duolingo 風格互動。

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

Incident (2026-11-04, 同 Rule 47 Bug 3)：binder 入面同時做 `showView("view-home")` 同 `setTimeout(openFn, 410)` 會引發 token self-cancel。

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

Incident (2026-11-04，用戶話「成日見到」)：捕捉結算頁撳 Lucky Draw 冇反應，唔會去精靈球捲出嚟嗰頁。

- **Root cause：** 結算頁等 display-window overlay 會刻意保持 `#view-home` active（紅框要留喺後面）。`openGachaSheet()` 舊 code 係 `if (!view-home.active) showView("view-home")` → active 已 true，跳過切頁 → gacha sheet 開喺結算 overlay（z-index 120）後面，用戶完全睇唔到。
- **必做：** `App._openSheet(id)` 已加 universal guard：`view-home.active` 但仲有 `.view.active:not(#view-home)` → 先 `showView("view-home")` 再開 sheet。任何新 `open*Sheet()` 都唔好再自己寫 `active` guard，直接 `showView("view-home")` 再 `_openSheet`（或交畀 `_openSheet` guard）。
- **測試路徑：** `App.showView("view-settlement")` → click `#btn-pull-rare` → 斷言 `#view-settlement` 唔再 active、`#sheet-gacha` visible；同樣試 Streak／Dex／Energy sheet 由結算頁開。
- 呢個 bug class 會影響所有「overlay 保持 home active」嘅頁：結算、選題（quiz-setup）、Battle Menu、Friends、Leaderboard。新增 page 時要當 `_openSheet` 係唯一入口。

### Rule 56 — 換進度條星星做動畫跑手：sprite sheet 化 + `flex: none` + 光暈 + 邊界淨空

Incident (2026-11-04 Quiz progress mascot)：用戶提供 500×354 / 4 幀 / 80ms 嘅 GIF，要求換掉答題頁進度條嘅 ★。

- **唔好直接放大 GIF**：畫布四邊大量透明位、1-bit alpha 邊緣粗糙、`prefers-reduced-motion` 停唔到動畫。做法：Pillow 逐幀 `convert("RGBA")` → 用**全部幀 union bbox** 一次裁切（保留幀間彈跳位移，唔好逐幀自己裁，否則跑動會抖）→ LANCZOS 縮到 3×（實測 132×90/幀）→ 橫向拼成 528×90 PNG（32 KB），CSS `background-size: 176px 30px` + `steps(4)` 播 0.32s，配 `@media (prefers-reduced-motion: reduce) { animation: none }`。
- **flex column 內嘅進度條一定要 `flex: none`**：實測 `#view-quiz` `scrollHeight 721 > clientHeight 710` 時，14px 高嘅 `.progressbar` 被 flex-shrink 壓成 **0px**（整條進度條消失、跑手浮喺半空）。同 Rule 42 同一類問題，但唔限於「滾動清單」——任何有明確高度、又想永遠睇得見嘅 flex 子項都要 `flex: none`。
- 黃色跑手疊黃色進度條：`filter: drop-shadow(0 0 1.5px #fffdf7) drop-shadow(0 2px 2px rgba(0,0,0,.35))`，否則下半身同 `var(--yellow)` 融合。
- 邊界淨空：跑手 44×30、半寬 22px；`.progressbar` 用 `margin: 0 14px`（14 + view padding 12 = 26 ≥ 22）。實測 440×956 同 375×667，0% / 100% 都仍有 3.5px 淨空，冇被 display window 裁邊。
- 換走文字 glyph：跑手要 `aria-hidden="true"`；新 asset 要入 `sw.js ASSETS`，並且按 Rule 12 更新免責聲明／版權。
- 驗收：連續採樣 `getComputedStyle(runner).backgroundPosition` 要見到 `0 → -44 → -88 → -132` 循環（證明四幀真係播）；位置用 `getBoundingClientRect` 對 `#view-quiz` 內邊，唔好只靠肉眼睇截圖。

Skill: Rule 56 added

### Rule 58 — `_prompt()` 用 textContent：唔可以傳含 SVG 嘅字串

Incident (2026-11-04)：10 連「寶石不足」提示原本寫 `_prompt(\`Need ${GACHA_GEM_SVG} ×30\`)`，但 `_prompt` 係 `el.textContent = text`（Rule 29 同類陷阱），會將整段 `<svg …>` 原碼顯示出嚟。

- `_prompt()` 只放純文字；需要 gem icon 嘅位置（成本 chip、按鈕）用 `innerHTML` 自己砌。
- 新增任何「文字 + icon」提示前，先確認該容器係 textContent 定 innerHTML。

### Rule 60 — 掛喺 body 嘅 overlay 必須 `stopPropagation`，否則 sheet 外部點擊 handler 會誤關

Incident (2026-11-04)：`#gacha-multi` 係 `document.body.appendChild` 嘅 fixed overlay。點 10 連結果卡想睇詳情時，click 冒泡到 `document`，命中 `#sheet-gacha` 嘅「點外面關閉」handler → `Gacha.abort()` → `_resetStage()` 收埋 overlay，畫面直接彈返 home。Debug 見到 AFTER: `phase:"idle"`, `sheetOpen:false`。

- 任何掛 body 嘅 overlay／modal root，建立時即加：
  `["pointerdown","pointerup","click","touchstart"].forEach(t => el.addEventListener(t, e => e.stopPropagation()))`
- 內部按鈕（開啟詳情／撳卡）嘅 listener 要綁喺子元素，先執行再被 root 截停冒泡。
- 驗收時必須真正 `cell.click()` 一次並截圖，唔好只驗「overlay 出到」。單靠 DOM 存在唔會發現呢類關閉 bug。

### Rule 64 — 同時跑幾個 setInterval／setTimeout 動畫：每個用自己嘅 local handle，唔好共用一個變數

Incident (2026-11-05，背包 prototype 戰鬥文字框)：自己畫面同對手畫面兩個框同時打字，共用一個 `typing` 變數存 interval。第一個框打完 `clearInterval(typing)` 清咗第二個框嘅 timer → 對手框得半句、`Promise.all` 永遠唔 resolve，撳極都唔去下一句。

- 每個動畫用 `const t = setInterval(...)` 自己清自己；「仲有冇動畫跑緊」用計數器（`typing++`／`typing--`）。
- 用 `Promise.all` 等幾個動畫時，要測「一長一短」兩段文字，短嗰個先完都唔可以影響長嗰個。

### Rule 65 — 喺有 Rule 60 stopPropagation 嘅 overlay 入面做拖放：pointermove／pointerup 要掛 window capture

Incident (2026-11-05，背包第 2 段)：`#bag-root` 跟 Rule 60 截停 `pointerdown／pointerup／click` 冒泡。拖放模組將 `pointerup` 掛喺 `document` → 永遠收唔到 → 拎起咗放唔低，隊伍冇變；滑鼠拖捲 chip 列都一樣卡住。

- overlay 入面嘅拖放／拖捲／撳住連加：`window.addEventListener("pointermove"|"pointerup"|"pointercancel", h, true)`（capture 階段，喺 overlay 截停之前已經收到）。
- 唔好掛 `document` bubble；亦唔好為咗拖放拎走 Rule 60 嘅 stopPropagation（會令 sheet 外部點擊 handler 誤關）。
- 驗收一定要用真滑鼠拖（`left_click_drag`）一次，唔好只 call JS 函數。
