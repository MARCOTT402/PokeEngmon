---
name: pokeengmon-responsive
description: SINGLE SOURCE for PokeEngmon responsive layout (phone / tablet / desktop). Read before touching layout, the red Pokédex frame, safe-area, sheets positioning, display-window overlays, modals/toasts, rotate prompts, touch targets or viewport sizing — and before adding any new view, sheet, overlay or popup. Covers decisions already made, breakpoints, frame CSS variables, the wide two-pane right pane, short-viewport rules, verification tools (phone-frame simulator, headless CDP shots, interaction tests) and links to every past incident in references/incidents.md.
---

# PokeEngmon 響應式版面（唯一來源）

> 呢份整合晒 repo 入面所有同響應式／版面／viewport 有關嘅規則（2026-11-06）：
> - 原 `webapp-mobile-dev` Rule 1、2、4、5、6.1 → 本文 §2、§3、§5、§12；原文存 `references/incidents.md` **A 部分**。
> - 原 preop checklist Rule 20、26、27、30、37、38、39、42、43、45、46、47、59、67、72、80–88 → 本文各節；原文（事故紀錄）存 `references/incidents.md` **B 部分**，preop 只留標題同指向。
> - 衝突時以**本文正文**為準（`references/incidents.md` 係歷史紀錄，部分數值已過時，有標註；平時唔使讀，查某條 Rule 來龍去脈先開）。
> 改完同一輪：撞板／被糾正就喺 `references/incidents.md` B 部分加新條目（規則本身有變先改正文），preop checklist 加 Rule N 標題指向本文，跟 `post-fix-lesson-capture`。

相關但唔喺本文：sheet 互動機制（binder、debounce、手勢、四種關閉路徑）→ `pokeengmon-ui-sheets`（Rule 17、31、35、36、40、41、52、53、60、65；sheet 規格原文 `references/sheet-spec.md`）；答題鍵盤用戶指定版面 → `pokeengmon-quiz`（Rule 71、74）；Three.js canvas resize → `threejs-scene-setup`。

---

## 1. 已定決策（唔好推翻，要改先問用戶）

| 項目 | 決定（2026-11-06 用戶確認） |
|---|---|
| 大屏策略 | **橫向 Pokédex 雙欄**：左欄拍檔＋START QUIZ＋dock 常駐；右欄 = sheet／overlay 內容區 |
| 平板方向 | 按**可用闊度**，唔按方向／裝置。iOS PWA 鎖唔到方向；iPad Split View 會變手機闊度 |
| 手機橫向 | 只有戰鬥／背包／捕捉用橫向；其他畫面出「Turn your phone upright」（可 Continue anyway） |
| 右欄預設 | 冇開任何嘢時顯示 **Daily Quests** |
| 實體鍵盤 | `pointer: fine` 時答題唔顯示 App 鍵盤（`Quiz._syncKeyboard` 已做） |
| 推進方式 | 分階段：P1 外殼＋主頁＋sheets＋答題＋結算（**已完成**）→ P2 內頁 → P3 扭蛋／捕捉／戰鬥／背包。每個 Task 停低等驗收；commit 只喺用戶要求 |
| 手機版 | **零回歸**：440×956 rect diff 必須 0；手機嘅 HUD 細字（9–11px）係設計，唔好順手改 |

Spec：`.trae/specs/20261106-responsive-layout.md`（§13 已知未處理、§14 P2／P3 清單）；Plan：`.trae/documents/20261106-responsive-layout-p1.md`。

## 2. 基準機同尺寸

| 機型 | CSS 尺寸 | DPR | 安全區 top/bottom |
|---|---|---|---|
| iPhone 17 Pro Max（**基準**） | 440 × 956 | 3 | 62 / 34 |
| iPhone 16 Pro | 402 × 874 | 3 | 62 / 34 |
| iPhone 15 | 393 × 852 | 3 | 59 / 34 |
| iPhone SE | 375 × 667 | 2 | 0 / 0 |

- 主佈局用 `100dvh`（唔用 `100vh`）；手機版「剛好塞滿 956」，細機只可以自適應收縮，唔可以出滾動或切底；唔准為細機另做一套。
- `.pd-shell` 最闊 `var(--frame-w)`（手機 440），**必須 ≥ 440**，否則 440 闊機兩邊露底色。

**驗收矩陣**（每次改版面都用）：

| 代號 | 尺寸 | 期望 layout | 觸控 |
|---|---|---|---|
| S1 | 375×667 | phone（安全區 0） | ✓ |
| S2 | 440×956 | phone（基準，零回歸） | ✓ |
| S3 | 820×1180 | tablet（iPad 直） | ✓ |
| S4 | 1180×820 | wide（iPad 橫） | ✓ |
| S5 | 1366×640 | wide（矮 laptop） | |
| S6 | 1440×900 | wide | |
| S7 | 1920×1080 | wide（frame 封頂 1240） | |
| S8 | 956×440 | phone-land | ✓ |
| S9 | 1000×500 | tablet（≥900 闊但 <560 高） | |

## 3. 斷點（兩處同步）

| layout | 條件 | 版面 |
|---|---|---|
| `phone-land` | `(orientation: landscape) and (max-height: 499px) and (pointer: coarse)` | 戰鬥／背包／捕捉；其他出轉直提示 |
| `wide` | `(min-width: 900px) and (min-height: 560px)` | 橫向雙欄 |
| `tablet` | `(min-width: 700px)`（wide 唔成立） | 直向機放大到 640 |
| `phone` | 其餘 | 基礎規則，440 基準 |

- **JS**：`App.layout()`（matchMedia）、`App._initLayout()` 寫 `<html data-layout>`，改變時 dispatch `document` 事件 `pe:layout`（`detail: {from, to}`）——`js/app.js`。同時聽 matchMedia `change`、`resize`、`orientationchange`（matchMedia 事件只喺 render frame 派發）。
- **CSS**：`css/style.css` 頂部「LAYOUT BREAKPOINTS」註解；樣式一律用 `@media`，`data-layout` 只畀 JS 同少量 state 規則用。區塊：17b tablet、17c wide、17d 焦點／hover。
- `phone-land` 要 `pointer: coarse`：桌面窗拉矮唔可以當手機橫向。
- 唔准用 UA、`navigator.platform`、`innerHeight > innerWidth`、`innerWidth <= 1000` 判斷。
- 新規則全部包喺 `min-width: 700px` 或以上嘅 `@media`；phone 基礎規則唔郁。

## 4. 外殼幾何

**結構**：`.pd-shell` grid 四列 `var(--frame-deco-h)(44) 48px 1fr 46px` = 機頂裝飾／bezel／白螢幕 `.pd-screen2`／下巴。Grid 列數必須等於實際子元素數；safe-area 用 `padding` 吸收，**唔好**做 grid row（Rule 27）。

**Safe-area**：`padding-top: max(env(safe-area-inset-top,0px), var(--sim-safe-top,0px), 8px)`；bottom 同理（冇 8px 下限）。真機 Safari 瀏覽器模式 `env()` 可以係 0，突出元素（鑽石 pill `top:-8px`）靠 8px 下限先唔被裁（Rule 37）。

**`:root` 變數（所有 overlay／toast／fixed 層只准用呢組，Rule 81）**：

| 變數 | 意思 |
|---|---|
| `--frame-w` | 紅框最闊：phone 440、tablet 640、wide `min(1240px, 100% - 48px)` |
| `--frame-screen-m` | `.pd-screen2` margin：6px（≤380px 5px） |
| `--frame-screen-w` | overlay 闊 = 紅框實際闊 − 2×margin（wide 再扣左欄＋間隔） |
| `--frame-screen-dx` | overlay 中心相對 viewport 中心位移（wide = (左欄＋間隔)/2） |
| `--frame-screen-left` | `calc(50% - w/2 + dx)` |
| `--frame-screen-top/bottom` | 白螢幕區上下（計埋 deco、bezel、margin、safe-area；Rule 43） |
| wide 專用 | `--frame-h`（≤900）、`--frame-top`（垂直置中、≥24px）、`--pane-l`（360；≥1280 400）、`--pane-gap`（10） |

- 唔准再寫 `428px`／`440px`／`left:50%; translateX(-50%)` 置中——細過 440 嘅手機會凸出紅框（Rule 81 事故）。
- `position: fixed` 元素上 `%` = viewport；所以 `--pane-l` 用固定分段，唔用 `%`（Rule 83）。

**Display-window overlay 規格**（`#view-quiz-setup, #view-settlement, #view-leaderboard, #view-friends, #view-battle-menu, #view-quiz, #view-capture, #view-battle` 嘅 `.active`；`#gacha-scene-b`、`#gacha-inspect` 同樣定位）：
- 定位：`top/bottom: var(--frame-screen-top/bottom)`、`left: var(--frame-screen-left)`、`width: var(--frame-screen-w)`、`transform: none`。
- 外觀：四角 `border-radius: 14px`（唔好只修被投訴嗰角，Rule 39）、`border: 2.5px solid #1b1b22`、背景 `#fffdf7`。
- 層級：bezel／chin `var(--z-frame)`（100，`position: relative`）< overlay `var(--z-overlay)`（120）< sheets（Rule 47、110）。
- Exit 動畫：`transform-origin: bottom center; transform: scaleY(0)`，`.4s cubic-bezier(.25,1,.5,1)`；唔用 translateY（會穿出紅框）；`prefers-reduced-motion` 即時（Rule 47）。
- 答題／捕捉／對戰呢類 overlay **唔可以 fade**（後面係 active 主頁，會閃）；`animation: none`（Rule 45）。
- 全頁 view 收入 overlay：`height: auto`（原本 `100dvh` 嘅要覆寫）、內部 `position: fixed` 改 `absolute; inset: 0`（Rule 45）；基礎規則有 `max-width`（例如 `#view-capture` 520px）要喺 `.active` 覆寫 `max-width: none`，否則 tablet／wide 闊唔到、露出後面 sheet（Rule 89）。
- **戰鬥（固定 px 設計嘅遊戲畫面）喺 tablet／wide：唔好拉闊舞台**，用手機橫向設計畫布（舞台 664 闊、`#view-battle` 680×430）成塊 `transform: scale(--bl-s)` 填滿紅框（`.battle-land.bl-scaled`，`BattleLand.fit()` 計）；phone／phone-land 維持舊 `--bl-w`。JS 計位置一律用 `offsetLeft/Top/Width/Height`（舞台座標），唔好用 `getBoundingClientRect`（會計埋 scale 同手機直向 90° 旋轉）（Rule 90）。
- Canvas／WebGL 場景（捕捉）跟 overlay 變闊：每次 start 都 `_resize()` 對齊 host；場景內容（草叢、地面）喺 ≥700px 要加闊，唔好露邊（Rule 89）。
- 將 view 搬入另一容器（例如戰鬥橫向紅框 `.bl-screen`）：新容器 selector 用 `!important` 清走 `position`、inset、`transform`、`max-width/height`、負 margin、`100vh`；離開時搬返原位（comment placeholder）；搬完即刻 `getComputedStyle` 檢查（Rule 67）。

**Z-order 全景**（Rule 46、110）：**以 `css/style.css` `:root` 嘅 `--z-*` token 為準**，嗰度有齊全部全域層同註解。由高至低：`--z-kbd-badges` 99990、`--z-top` 9999（lb-login-modal／update-modal／qd-fly，刻意蓋過一切）、`--z-entry-gate` 9000 > `--z-toast` 3000 > bag-ghost 2700 > bag-rotate／轉直提示 2600 > bag 2500 > battle-land 2400 > inferno-unlock 2300 > tier-select 2200 > pvp-match 2100 > team-select 2000 > `--z-modal` 1400 > sync-banner 900 > gacha 640–670 > hub 500 > pre-battle 140 > quiz 全螢幕 130 > `--z-overlay` 120 > `--z-frame` 100。`index.html` `<head>` 內聯兜底層唔用 token：loading 99999、fatal 100000、guard-recover 2700、offline pill 2550。新 fixed 層要高過 120，加 token 時確認 toast 仲高過佢（`tests/unit/z-tokens.test.js` 會檢查）。

## 5. Sheets 定位

- 所有 home sheet 喺 `.ph-sheets`（`position: absolute; inset: 0; overflow: hidden; border-radius: 16px`，喺 `.pd-screen2` 入面）。**現況：`.ph-sheets` `bottom: 0`，sheet 展開會蓋過 dock**（`references/incidents.md` 原 6.1 寫「唔可以蓋 dockbar、bottom 預留 56+8」係舊規格，已過時）。
- phone／tablet：`.ph-sheet-down`（由頂捲落，close = `translateY(-100%)`）、`.ph-sheet-up`（由底捲上，close = `translateY(100%)`）；只用 `transform` 做動畫。
- wide：sheet 填滿右欄、`transform: none !important`、高度 `!important` 壓 `expandArrow` 嘅 inline 值、150ms opacity 淡入；冇 backdrop、冇展開箭咀；✕ 返預設（§6）。

## 6. wide 雙欄（≥900×560）

**外殼**：紅框四邊留白、垂直置中、四角圓角＋陰影。`.pd-screen2` 變透明容器（`background/border/box-shadow` 全清——原本有 inset 2px 灰框，唔清會露白線），`::before` 畫左欄白底；`.pd-screen2 > :not(.ph-sheets)` 限闊 `calc(var(--pane-l) - 28px)`；`.ph-sheets` 變右欄白底黑邊。唔改 DOM。

**右欄行為（`js/app.js`）**：

| 函數 | 做咩 |
|---|---|
| `_showWideDefault()` | 右欄冇 sheet 時開 Daily Quests（`sheet-quests` full 模式，`data-wide-default`）。**唔經 `_openSheet`**（佢會 `showView("view-home")` 殺咗右欄 overlay） |
| `_wideSwitch(sheetId, openFn, overlayViewId)` | binder／dockBinder 嘅 wide 路徑：即時切換；再撳同一個 = 返預設；有 Friends／Leaderboard／Battle Menu（fixed overlay）就交返原本 400ms＋410ms 路徑 |
| `_wideHideSheets()` / `_wideFull(id)` | 即時收晒 sheet／直接入 full（`sheet._peFull` 由 `expandArrow` 註冊） |
| `_onLayoutChange(from, to)` | 入 wide 補預設或 full；出 wide 收預設；同步轉直提示 |
| `_setFrameLock` / `_setSettleLock` / `_applyPaneLock` | 答題／捕捉／對戰／Gym 結算：bezel＋左欄 `inert`＋變灰；Gym 結算唔鎖下巴 Home（唯一出口，Rule 44） |

**陷阱（Rule 84、85）**：
- 所有「有冇 sheet 開住」判斷（Esc、click-outside、close timer 嘅 stillOpen guard、binder toggle）要排除 `dataset.wideDefault`——否則答題時 Esc 會關預設 sheet。
- `_closeAllSheets` 喺 wide 保留預設；`_openSheet` 喺 wide 開頭先收起預設，否則經 fixed-overlay 舊路徑會兩個 sheet 同時開。
- `ph-open` 唔好喺 rAF 補：wide 同步加；phone rAF 入面 `if (!sheet.hidden)`（「hidden 但 ph-open」殭屍）。
- wide 左欄喺 overlay 開住時撳得：手機靠「被 overlay 蓋住」防誤觸嘅流程，wide 要用 `inert` 鎖。
- `Quests.boardOpen()` 同時認 `#sheet-quests.ph-open .sheet-view-host`；返主頁用 `Quests.resume()`（唔 call server）。
- wide 點外面唔關右欄；Esc：右欄 sheet → 返預設；overlay → 經下巴 Home 掣（保留 Gym 判定、frame lock）；有 modal 開住唔處理。

## 7. tablet、矮視窗、內容適配

- tablet（≥700）：`--frame-w: 640px`；bezel 掣 48px、icon 24、CTA 64、dock 52、sprite 320。
- **拍檔卡要可縮**（≥700）：`.ph-sign { flex: 0 1 auto; min-height: 0; overflow: hidden }`、sprite `flex: 0 1 320px; min-height: 56px`（`object-fit: contain`）；CTA／dock `flex: none`。`(min-width:700px) and (max-height:620px)` 收埋 stat 條同 note（Rule 82；呢度刻意例外於 Rule 42）。
- flex column 做滾動區：子項 `flex: none`，否則被壓扁；驗 `scrollHeight > clientHeight`（Rule 42）。
- 答題：≥600 全螢幕（Quiz v2 用戶指定，唔改闊度）；≥1024 內容 760；≥900 橫向圖片題左圖右答 1040。圖片題用「剩餘高度」縮放（`.word-card { flex: 1 1 0 }`、img `height:100%; object-fit:contain`），iPhone 一開就見到輸入格；矮機（`max-height:720px` 且 <600 闊）收細鍵盤；矮桌面（≥600×≤560）收細文字題卡（Rule 72）。驗收：`#quiz-scroll` `scrollHeight - clientHeight ≤ 4`、輸入格 bottom < 鍵盤 top。
- 結算 wide 兩欄：`index.html` 有 `.settle-col-a`（標題、分數、stat）／`.settle-col-b`（獎勵、錯題），phone／tablet `display: contents`（子項另補 `flex: none`），wide 變兩個 flex column（Rule 86）。

## 8. Modal／toast

- phone／tablet：`.modal-backdrop` `align-items: flex-start`、`padding-top: calc(var(--frame-screen-top) + 14px)`；`.modal-card` `max-height: calc(100dvh - top - bottom - 28px)`——唔好跌落下巴 Home 鍵（Rule 46）。
- wide：modal 置中成部機（`align-items: center; padding: 24px`），`max-width: 480px`（登入卡 420），內部 scroll。
- toast：`top: calc(var(--frame-screen-top) + 12px)`、`left: calc(var(--frame-screen-left) + var(--frame-screen-w)/2)`（wide 自動喺右欄頂）、`z-index: var(--z-toast)`（3000）。「撳掣冇反應」先查回饋係咪被蓋住（Rule 46）。
- 其他全畫面 popup（`lb-login-modal`、`update-modal`、tier／team／pvp／inferno）用 `inset: 0` 置中，全部 layout 都啱。
- 掛 body 嘅 overlay：`stopPropagation`（Rule 60）＋`__peHit` 豁免（Rule 40）。

## 9. 轉機（Rule 87）

- 轉 90°／「Please rotate your device」：只限 `App.layout() === "phone"` 且直向（`js/bag.js` `isPhone()`、`js/battle/landscape.js` `fit/enter`）。tablet 直向：背包等比縮放；戰鬥紅框全闊、高 `min(H, W×0.62)` 置中。
- 「Turn your phone upright」：`App._syncRotateHint()`，條件 `phone-land`；豁免 `body.bag-open`、`body.battle-landscape`、`#view-capture.active`；「Continue anyway」收起到離開 phone-land；唔中斷 state。入／出豁免畫面要 call 佢（`_doShowView`、背包 open/close、`BattleLand.enter/exit` 已 call）。
- 視覺沿用 `.bag-rotate`（`.back` = 轉返直）。

## 10. 鍵盤、hover、觸控、字級（Rule 88、97）

- `:focus-visible`：白底「`outline: 3px solid #1b1b22` ＋ `box-shadow: 0 0 0 6px #ffd93b`」；紅機身（bezel、下巴）「奶白 `#fff8e1` 框＋黑光環」。只鍵盤出現，手機截圖唔變。有自己 `box-shadow` 嘅掣（`.ph-cta`）光環會被蓋，淨黑框。
- hover 一律 `@media (hover: hover) and (pointer: fine)`（按鈕 lift 動畫見 Rule 49）。
- 觸控目標：phone ≥44、tablet ≥48。唔改外觀擴大：`.ph-sheet-x::after { inset: -6px }`；下巴 Home 球有 `overflow:hidden`，改由 `.pd-chin` click 按距離（≤24px）轉交。量度用 `elementFromPoint`／真滑鼠，唔好淨睇 rect。已知：下巴列 46px，tablet 差 2px。
- 字級：tablet／wide 最細 12px；phone HUD 細字保持。
- **全鍵盤操作（Rule 97，`js/keys.js`）**：↑↓←→ 空間導航＋Enter＋Esc 要去到每個畫面每粒掣。
  - keydown 掛 `window`（bubble 最尾）：document 上舊 handler（答題 Enter／Esc、Ctrl+P／H）先行；`defaultPrevented` 就唔理。舊 handler 嘅「Enter 預設動作」要讓位畀焦點所在嘅掣（例如答題設定彈窗：焦點喺 Keep going 時 Enter 就撳 Keep going）。
  - 情境：overlay（最高 z-index；列表＋body／#app 直屬嘅全屏 fixed 層，例如 `#entry-gate`）> phone／tablet 開住嘅 sheet > active view（非 home 優先，連 bezel／下巴）。wide 右欄 sheet 唔係 modal，但新開嗰陣焦點要跳入去。
  - 候選：原生可聚焦（`tabindex=-1` 容器唔算）＋ `cursor:pointer` 嘅最頂層 div／label（自動補 `tabindex=-1`＋`data-kbd-auto`）；被蓋住（`elementFromPoint`）唔算；捲咗出去嘅只可以由同一個捲動區入面行過去；先喺目前捲動區入面揀，再出去；60° 錐形防止跳去另一欄。
  - 打字中：單行 input 左右留畀游標、上下照導航；textarea／select 全部原生；range 左右調值。radio 用方向鍵只移焦點（唔會順手改設定），Enter／Space 先揀。
  - 開 sheet／modal 自動將焦點放主要掣（`[data-kbd-primary]` > 已知主掣 > 最上最左，✕ 排最後）；關咗還焦點畀開佢嗰粒掣。淡入／延遲出現（fetch 後先插入）嘅 overlay 要 450ms 再檢查一次。overlay／phone sheet 入面 Tab 困住。
  - Esc：overlay 搵 Close／Back／Cancel／Maybe later／`[id$=-cancel]`；普通頁冇 Back 就撳下巴 Home；答題／捕捉／結算／戰鬥唔當離開。
  - 捷徑層（第二期）：`SHORTCUTS` 表（`js/keys.js`）——主頁 `S` 開始、`1–4` 下巴四掣、`D` 圖鑑、`G` 扭蛋、`C` 日曆、`Q` 任務、`B` 背包；選題 `S` Start；普通頁 `H` 返主頁；捕捉 `Space`／`Enter` tap 三下、結果卡 Continue（`capture.js` 自己聽，`e.repeat` 唔計）。答題係打字題，冇選擇題，所以冇 1–4。加新捷徑：入 `SHORTCUTS`（`when` 限情境、目標喺收埋 sheet 就 `hidden:true`），`?` 一覽自動列「On this screen」。
  - 按鍵 badge：獨立 fixed 層 `.kbd-badges`，用目標 rect 定位；只喺鍵盤模式＋`(hover:hover) and (pointer:fine)` 出，撳滑鼠／觸控即收。唔好為 badge 改掣嘅 `position`（入面有 absolute 子元素）。
  - 「睇唔睇到」要計埋：祖先 opacity 0（`checkVisibility({checkOpacity})`；透明 radio 睇 label）、摺疊咗嘅 overflow 祖先（0 高／闊，例如背包 banner `max-height:0`）。否則 Esc 會撳中隱形嘅 Cancel。
  - overlay 淡入完先睇得到：`transitionend`（opacity／visibility／transform）同 `animationend` 都要再檢查；同一情境但焦點仲喺外面（主掣當時被淡出緊嘅層蓋住）→ 都要拉焦點入嚟。
  - 單抽結果卡（`#gacha-inspect`）冇關閉掣：Esc = `App.closeGachaSheet()`。
  - 第三期：圖鑑格仔係 `<button>`；詳情 `Shift+←／→` 或 `[` `]` 跟格仔排序行（`Pokedex.stepDetail`，格仔 `data-dex`）；招式卡補 `role=button`＋`tabindex=0`。背包：可拖格仔 `Drag.bind` 自動補 tabindex／role，`Space` 拎起（目標加 `data-kbd-drop`，空格暫時 `tabindex=-1`）→ 方向鍵 → `Space`／`Enter` 放低（同一個 `onDrop`）、`Delete` 移出隊伍、`Esc` 只取消唔關背包。戰鬥：`F` `B` `S` `R`、`1–4` 招式、`M` Mega、`Y`／`N`；Esc 只返上一層，永遠唔離開戰鬥；戰鬥 UI 會被 BattleLand 由 `#view-battle` 搬入 `.battle-land`（body 級 fixed，會被認做 overlay）→ 用「情境入面有冇 `.battle-bottom`」判斷（唔好搵 `#view-battle`，佢已經冇晒子元素）。戰鬥對話 `waitTap` 要聽 Enter／Space（之前淨聽 click，鍵盤會卡死喺開場白）。
  - 第四期：Settings → Gameplay → Keyboard shortcuts（`pe_kbd_shortcuts`，只滑鼠裝置顯示）關咗淨係停字母／數字捷徑同 badge，方向鍵／Enter／Esc 永遠開。舊答題 Enter／Esc／Ctrl+P／Ctrl+H 刻意留喺 `app.js`（運作正常、搬會有回歸風險）。
  - classic script 嘅 top-level `const`（`Pokedex`、`BattleUI`、`Gacha`…）唔喺 `window`：keys.js 用 `typeof X !== "undefined"`，唔好用 `window.X`（Rule 75）。
  - home sheet 已經冇 `aria-hidden="true"`（隱藏靠 `hidden`）；新 sheet 唔好再加。
  - 已知：home sheet 開咗仍然 `aria-hidden="true"`（app 冇切換，讀屏會跳過）→ keys.js 暫時對 `.ph-sheet` 忽略 aria-hidden。
  - 驗收：headless CDP `Input.dispatchKeyEvent` 淨用方向鍵／Enter／Esc 行 wide（1280×800）同 phone（440×956）：入口 gate → 主頁 → Settings sheet（Tab 困住、Esc 還焦點）→ 選題 → 答題 → 設定彈窗；再逐個 bezel／dock 掣開＋↓＋Esc。responsive `test-sheets`／`test-overlay-switch`／`test-pane-locks`／`test-touch-targets` 結果要同 baseline 一樣。

## 11. CSS cascade

- wide／tablet 區塊喺 `style.css` 前段（約 4930–5050 行），好多基礎規則喺後面（例如「結算 v2」約 5540 行）。同 specificity 後者贏 → wide 覆寫要加 specificity（`.active`、父 id），只有壓 inline style 先用 `!important`（Rule 86）。
- `:where()` specificity 0。
- 要兩欄高度互不影響：加 wrapper（phone `display: contents`），唔好硬用 `grid-template-areas`（跨行元素會拉高隔籬行）。

## 12. 驗證工具同方法

**手機外框模擬器**（日常開發）：`npm run preview:iphone`（`tools/device-preview.html` + `tools/preview-iphone.mjs`）。
- 唔好用桌面窗拉窄、亦唔好用 DevTools iPhone 預設睇安全區（`env()` 永遠 0）。模擬器經 `--sim-safe-top/bottom` 注入，app 用 `max(env(), var(--sim-*))`，一份 code 兩邊通用。
- Headless：`node tools/preview-iphone.mjs --headless [--device iphone-se] --click "#btn-entry-yes" --js "<code>" --shot out.png --port 92xx`。`--js` 喺外框頁跑，`doc` = iframe document；`const App/Quiz/Gacha` 唔喺 `window`——撳真掣或 `w.eval('...')`（Rule 38）。
- 每次用遞增 `--port`；卡死先 kill 殘留 Chrome（Rule 59）。
- 一定要加跑 `--device iphone-se`（安全區 0）；17 Pro Max 嘅 62px 會 mask 晒頂部裁切（Rule 37）。

**響應式截圖／rect diff**：`tools/responsive/shots.mjs`
```bash
node tools/responsive/shots.mjs --out <dir> [--sizes S1,S2] [--scenes home,settlement-full]
node tools/responsive/shots.mjs --compare <baselineDir> <newDir>
```
- 用嘅話（只限大改版面，見驗收清單）改**之前**先影 baseline；每個 scene 重新載入；`settlement-full` 用真題＋假成績；`modal-*` scene 唔隱藏 modal；`quiz` 每次抽題唔同，diff 要睇圖。
- 用 CDP `Emulation.setDeviceMetricsOverride`；`--window-size` 出唔到細 viewport（new headless 最細約 516 闊、扣窗框），先讀 `innerWidth` 再斷症（Rule 26）。
- headless 開過 touch emulation 之後 `(pointer: coarse)` 會黐住 true → 非觸控尺寸排先跑（工具已自動排序）（Rule 80）。

**互動測試**（`tools/responsive/`，本地 server `http://localhost:8080`）：

| 腳本 | 覆蓋 | 已知 fail |
|---|---|---|
| `test-sheets.mjs` | wide／phone sheet 開關、toggle、✕、點外面、Esc、連撳、chin Home、overlay 上開 sheet、layout 互轉 | P9b（同一 tick 三連撳，原有） |
| `test-pane-locks.mjs` | 左欄鎖、overlay 開住撳左欄、Quests 倒數；W2／W4 識分 guest（guest：Friends 出登入提示；Leaderboard 撳「Maybe later」先測 CTA） | — |
| `test-overlay-switch.mjs` | fixed overlay 上撳 bezel／dock 只得一個 sheet | — |
| `test-rotate.mjs <out>` | 轉直提示、tablet 唔轉、桌面矮窗唔彈 | — |
| `test-touch-targets.mjs <out>` | ✕／下巴可撳範圍、<12px 字清單 | — |
| `test-quiz-fit.mjs <out>` | 答題 7 尺寸 overflow、輸入格 vs 鍵盤 | S1 文字題 21px |
| `test-quiz-keyboard.mjs` | App 答題鍵盤觸控快打：多指重疊、極快連撳、Submit 放手先算（Rule 107） | — |
| `test-battle-fit.mjs <out>` | 戰鬥 7 尺寸：tablet／wide 等比例畫布（HP 框、精靈、訓練家同舞台比例 = 手機橫向）、phone 數值不變 | — |
| `test-capture-fit.mjs <out>` | 捕捉 overlay＋canvas 7 尺寸蓋滿白螢幕／右欄（WARNING 同 3D 場景各影一張） | — |
| `test-keys.mjs` | 全鍵盤（Rule 97）：真 CDP 按鍵行 gate → 主頁 → sheet（焦點入／還）→ `?` → badge → 捷徑 D/G/C/1/4、開關 → 背包拎起放低 → 圖鑑 Shift+←／→ → 選題／答題 → 扭蛋 → 捕捉 Space → 戰鬥 F/1/Esc；phone Tab 困住 | — |
| `test-anim-speed.mjs` | 動畫倍速（Rule 95）：進化／扭蛋 1× vs 3× 時間、加速期間 timeScale、完結／中途關閉還原；捕捉只驗加速＋還原 | — |

- 鎖同觸控範圍用 CDP `Input.dispatchMouseEvent`（`el.click()` 唔經 hit-test）；觸控手勢用 `Input.dispatchTouchEvent`。
- IDE／Browser pane：`resize_window` 可能唔派 `resize`／matchMedia 事件，即時切換用 headless 驗；自動化前先查 `innerWidth/innerHeight` 唔係 0（Rule 20）；改 state 嘅 JS 前 assert localhost（Rule 62）。
- Guest 下 Friends 只 toast、Leaderboard 彈 z 9999 登入提示——測「overlay 開住撳左欄」用 `App.showView('view-friends')` 直接開。

**每次改完驗收清單**（慳 token：平時只做「平時」嗰欄；「大改版面」= 改斷點／外框／全域 CSS／新 view，或者用戶要求）：

平時：Browser preview 開 440×956 睇改動嗰個畫面，用 `javascript_tool` 查 `scrollWidth === innerWidth`、受影響 overlay／CTA 嘅 rect，console 冇 error；改到 wide 規則先加睇一個 wide 尺寸。唔影 baseline、唔跑 `shots.mjs`、唔逐個尺寸截圖。

大改版面先做：
1. 440×956 rect diff = 0（`shots.mjs` baseline／compare，背景跑）；其他尺寸 diff 有截圖解釋。
2. 所有尺寸冇橫向 scroll（`scrollWidth === innerWidth`）、console 冇 error。
3. overlay rect 同目標白螢幕（phone `.pd-screen2`；wide `.ph-sheets`）四邊差 0。
4. 底部 CTA／dock 完整可見；矮尺寸（S5、S9）都要。
5. 觸控範圍 ≥44／48；安全區：iPhone SE 同 17 Pro Max 模擬器各一次。
6. 互動測試（`npm run test:e2e`／單個 `test-*.mjs`）**唔自動跑**：慢又食 token，只喺用戶明確要求時先跑；跑嘅話只剩上表已知 fail。平時用 Browser preview + console 驗。

## 13. 改碼清單

**加新 sheet**
- [ ] 放 `.ph-sheets` 入面；有 compact／full 用 `expandArrow` 註冊（wide 自動 full）。
- [ ] 經 binder／dockBinder 開；唔好喺 rAF 自己加 `ph-open`。
- [ ] 任何「有冇 sheet 開住」判斷排除 `dataset.wideDefault`。

**加新 display-window overlay（view）**
- [ ] 加入 §4 overlay selector 群組（定位、圓角、黑邊、z 120、exit）。
- [ ] `_doShowView` 嘅「保持 view-home active」清單；fixed overlay 加入 `#view-friends.active…` 嗰幾個 querySelector（showView、binder、`_wideSwitch`）。
- [ ] wide Esc 清單、`_wideSwitch` 嘅 `overlayViewId`。
- [ ] 要鎖左欄就 call `_setFrameLock`／`_setSettleLock`；橫向專用就加 `_syncRotateHint` 豁免。

**加新 body 級 popup**：喺 `:root` 加一個 `--z-*` token（對 §4 全景揀數值），rule 用 `var(--z-…)`；`stopPropagation`；toast 仲要高過佢。

**加新主頁元素**：問「矮視窗時邊個縮？」；wide 左欄自動限闊，唔好放入 `.ph-sheets`。

**改 CSS**：新規則包喺 `min-width: 700px` 以上；wide 覆寫要夠 specificity；唔寫死 428／440。

## 14. 已知未處理同下一步

- iPhone SE 文字題題目卡多 21px scroll；手機同一 tick 三連撳開 3 個 sheet（原有）；iPad 直向背包字偏細；下巴列 46px（tablet 差 2）。
- P2：圖鑑格數、Streak 月曆、育成、Friends、Leaderboard、Daily Quests 雙欄、Settings、錯題回顧喺 wide。P3：扭蛋、背包喺 iPad 直向同大屏比例；戰鬥喺 iPad 直向畫面偏細（紅框高 = 闊×0.62）。

### Rule 110 — z-index 用 `:root` 嘅 `--z-*` token：全域層（≥100）唔准寫字面值；改層級只改 token；`index.html` 內聯兜底層照寫數字

- 全域層一律寫 `z-index: var(--z-xxx)`，數值集中喺 `:root`（每個 token 有註解）。改層級只改 token，唔好再喺 rule 度寫數字。
- 局部層（喺自己 stacking context 入面，例如 `.catch-ball.grabbed`）照寫數字；要喺 `tests/unit/z-tokens.test.js` 同 `tools/audit/check-z-tokens.mjs` 嘅 `LOCAL_OK` 白名單登記。
- `index.html` `<head>` 內聯兜底樣式（loading、`#fatal-screen`、`#guard-recover`、offline pill）**唔用 token**，因為 `style.css` 載唔到嗰陣都要顯示得到（Rule 94）。
- 驗收：`node tools/audit/check-z-tokens.mjs [ref]`（同 git 版本逐條比較，兩邊各自用自己 `:root` 嘅 token 解析，數值要一樣；乾淨 tree 對 HEAD 一定 exit 0，`compareZ()` 有單元測試）＋ `npm test`（`z-tokens.test.js`：冇字面值、token 齊、toast 只低過三個刻意最頂嘅層）＋ `shots --compare`。
