# PokeEngmon 響應式 — 事故紀錄同原文（references）

> 主規則喺 `../SKILL.md`（唯一來源）。呢份係歷史原文，**數值可能過時**；同正文衝突以正文為準。新事故加喺 B 部分尾，格式 `### Rule N — 標題`。

## A. 原 `webapp-mobile-dev` 段落（2026-11-06 搬入，歷史原文）

> 已過時：4.1 斷點表（440／700／1024／1280）由正文 §3 取代；6.1「sheet 唔可以蓋 dockbar、bottom 預留 56+8」由正文 §5 取代。

### 原 Rule 1 — 基準機先定，唔好邊做邊改

開工第一件事，書面寫死一部**基準機**（baseline），之後所有版面數值都以佢為準：

| 項目 | iPhone 17 Pro Max（本專案基準） |
|---|---|
| CSS 視口 | **440 × 956** |
| 安全區 | top **62** / bottom **34** |
| 裝置像素比 | 3x |

規則：
- 主佈局高度用 `100dvh`、必須避開安全區用 `env(safe-area-inset-*)`。
- 版面「剛剛好塞滿 956」係設計目標；換機只可以**自適應收縮**，唔可以出滾動、唔可以切底。
- 基準機以外嘅機型（375 / 390 / 393 / 402 / 430）都要驗一次，但**唔可以為細機重做一套版面**。

### 原 Rule 2 — 本地永遠用「手機外框模擬器」開發

**唔好用**桌面瀏覽器直接拉窄個窗去睇（`100dvh`、`env()`、DPR 全部唔準）。
**亦唔好用** Chrome DevTools 嘅 iPhone 預設：佢**唔會**注入 `env(safe-area-inset-*)`，安全區永遠係 0，對位一定錯。

本專案工具：

```powershell
# 1) 起本機 server（只需一次）
npx http-server -p 8080 -c-1

# 2) 開手機模擬器（已包含機款下拉、橫向、重載 App）
npm run preview:iphone

# 3) 改完 code → 按 HUD「重載 App」或 Ctrl+R（唔使重開窗）
```

工具組成：

| 檔案 | 作用 |
|---|---|
| `tools/device-preview.html` | 外框頁：iPhone 機身（圓角、Dynamic Island、Home indicator、側鍵）＋底部 HUD；入面係 **iframe 載入真 app**，可點擊操作 |
| `tools/preview-iphone.mjs` | 用 Chrome `--app` 模式開一個無分頁窗；亦支援 `--headless`、`--click`、`--shot` |

#### 2.1 換機款

底部 HUD 有下拉選單（9 款 iPhone，由 17 Pro Max 到 SE）。揀完即時換機身尺寸同安全區，唔使重開；選擇會寫入 URL `?device=xxx`。

#### 2.2 安全區點做到「同一份 code」

iframe 內 `env(safe-area-inset-*)` 一定係 0，所以**唔可以**寫死 padding。
做法：外框頁把模擬值注入 `--sim-safe-*`，app CSS 寫成

```css
padding-top: max(env(safe-area-inset-top, 0px), var(--sim-safe-top, 0px));
padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--sim-safe-bottom, 0px));
```

真機：`env()` 有值 → 用真機。模擬器：`env()`=0 → 用注入值。**一份 code 兩邊通用**。

#### 2.3 截圖 / 自動驗收

```powershell
node tools/preview-iphone.mjs --headless --click "#btn-entry-yes" --shot out.png
node tools/preview-iphone.mjs --headless --device iphone-se --shot out.png
```

`--click` 嘅 selector 會喺 **iframe 內部** querySelector，所以寫 `#id` 就得。
要量數值（元素高度、溢出、`<44px` 熱區）就喺 `Runtime.evaluate` 讀 `getBoundingClientRect` / `scrollHeight - clientHeight`。

#### 2.4 已知陷阱

- 外框頁要按窗口大小**整體縮放**，否則模擬視口（956）高過真實窗高，底部被切，睇落好似「全部移位」。
- 桌面 Chrome 會喺 iframe 內畫 scrollbar，真機冇 → 注入 `::-webkit-scrollbar{width:0}` 隱藏。
- 手機模擬器只係「顯示層」，**唔會**改 CSS 數值；量出嚟嘅 px 同真機一致。

### 原 Rule 4 — RWD 喺手機做完之後才做（唔好偷步）

> **擴展去平板／電腦嘅完整做法（策略問題、斷點、雙欄、零回歸驗證、陷阱）見全域 skill `responsive-app-layout`；PokeEngmon 具體實作見 `.trae/skills/pokeengmon-responsive/SKILL.md`。** 下面 4.1 嘅斷點係早期草稿，以 `pokeengmon-responsive` 為準（700／900×560／phone-land）。

次序：**手機功能 + UI 做齊 → 再做平板/桌面**。桌面佈局提前寫會令手機版被 desktop-first 思維污染（固定寬度、hover 依賴、絕對定位）。

#### 4.1 斷點策略

- **Mobile-first 級聯**：基準樣式 = 最細機；斷點一律用 `min-width` 往上疊，唔用 `max-width` 往下減。
- 斷點以**內容需要**為準，唔好抄 device 名。本專案暫定：

```css
/* 基準：<= 439px（手機單欄） */
@media (min-width: 440px) { /* 大手機：外殼貼邊 */ }
@media (min-width: 700px) { /* 平板/摺機展開：可加側欄 */ }
@media (min-width: 1024px) { /* 桌面：主內容單欄居中 + 留白 */ }
@media (min-width: 1280px) { /* 寬桌面：主內容 + 側欄 */ }
```

#### 4.2 尺寸用流體單位，唔用死數

| 用途 | 用法 |
|---|---|
| 字級 | `clamp(0.95rem, 2.6vw, 1.25rem)` |
| 間距 | `clamp(8px, 2vw, 20px)` 或 `gap` + `min()` |
| 主欄寬 | `width: min(100%, 440px); margin-inline: auto;` |
| 高度 | `100dvh` / `100svh`（唔好用 `100vh`，iOS 工具列會食位） |

- 高度永遠配合 `min-height: 0` 用 Flex/Grid，否則內容會撐爆容器。
- 桌面唔好把「手機外殼」無限拉闊；到某寬度就**拆走外殼**（`border-radius:0`、`max-width` 放大），或保留居中「裝置框」都可以，但要揀定一種。

#### 4.3 唔好做嘅事

- ❌ 用 `@media (max-width: ...)` 由大寫到細（會變 desktop-first）
- ❌ 用 hover 做唯一可發現性（觸控冇 hover）→ 用 `@media (hover: hover)`
- ❌ 用 `position: fixed` 頂欄 + `100vh` 內滾動（iOS Safari 會跳）→ 用 `dvh` + 單一滾動容器 + `overscroll-behavior: contain`
- ❌ 用 JS 讀 `window.innerWidth` 切版面（先寫 CSS，JS 只用嚟做行為差異）
- ❌ 用固定 px 高度做「一屏塞滿」，一定要 `1fr` + `minmax()`

#### 4.4 必須驗嘅狀態

- 375×667（SE，無安全區）
- 393×852 / 402×874 / 430×932（一般至大手機）
- 440×956（基準）
- 768×1024（平板直向）
- 1280×800（桌面）
- 橫向（`--rotate` 或 HUD「橫向」）
- 200% 文字縮放、`prefers-reduced-motion: reduce`

### 原 Rule 5 — 每次改完嘅驗收清單

1. 模擬器上：**無滾動**（`scrollHeight - clientHeight === 0`）、底部 CTA / dock 完整可見。
2. 安全區：頂部內容唔壓 Dynamic Island，底部唔貼 Home indicator。
3. 熱區：所有可點元素 `>= 44 × 44`。
4. Console：零 error（info 除外）。
5. 至少再換一部細機（SE）同大機（17 Pro Max）各睇一次。
6. 截圖留檔，交付時附 HUD 數值。

### 原 6.1 定位：必須喺 white screen 區內，唔可以蓋住 dockbar / red bezel

```css
/* sheet 容器定位喺白色螢幕區內（非紅色 bezel 內、非 dockbar 內） */
.ph-sheets {
  position: absolute; inset: 0; z-index: 40;
  bottom: calc(56px + 8px);  /* 預留 dockbar (min-h 44 + pad 8 = 52) + gap 8 */
  overflow: hidden;           /* 捲出時唔會露 margin */
  border-radius: 16px;        /* 跟 white screen 圓角一致 */
}
/* top-down sheet（由螢幕頂部向下捲入） */
.ph-sheet-down {
  top: 0; left: 0; right: 0; bottom: 0;
  transform: translateY(-100%); z-index: 2;
  border-top: 0;
}
.ph-sheet-down.ph-open { transform: translateY(0); }
/* bottom-up sheet（由螢幕底部向上捲入，例如 setting / battle） */
.ph-sheet-up {
  bottom: 0; left: 0; right: 0; top: 0;
  transform: translateY(100%); z-index: 2;
  border-bottom: 0;
}
.ph-sheet-up.ph-open { transform: translateY(0); }
```

**鐵律：**
- Sheet 永遠唔可以蓋住 dockbar。`bottom` 必須預留 dockbar + gap。
- Sheet 必須定位喺 `.ph-sheets` 容器（即白色螢幕區內），唔可以自己 `position:fixed` 蓋住紅色 bezel。
- Sheet 只可以用 `transform: translateY` 做動畫，唔好用 `top/bottom` transition（會觸發 layout reflow）。

## B. 原 preop checklist 事故紀錄（2026-11-06 搬入，按 Rule 編號）

> preop checklist 仍保留 Rule 標題（編號唔變，舊引用照用）。

### Rule 20 — Browser automation silently mis-fires when the IDE preview window is 0×0

Symptom: every click "succeeds" but nothing happens; no console error; handlers all bound correctly (v1.15.0 party-screen verification burned 3 browser_use agents on this).

- FIRST check innerWidth/innerHeight via rowser_evaluate — if both are 0, the preview window is minimized/zero-sized and elementFromPoint returns null for everything. Fix with rowser_tabs({action:'activate'}) (restores the window), NOT code changes.
- 	ypeof window.X === 'undefined' is a red herring for scripts whose top-level uses const/let (battle.js's BattleUI is such a global). Probe with bare-identifier eval('typeof X') instead.
- If the bridge wedges ("WebView is not ready" even on a blank HTML file, navigate timeouts at 60s): close the wedged tab via rowser_tabs close; if still stuck, ask the user to close/reopen the preview panel — do not keep retrying navigations (each costs 60s).

### Rule 26 — Headless Chrome 截手機版圖：`--window-size` 出唔到 375×667，要用 CDP `Emulation.setDeviceMetricsOverride`

Incident (P1 home 原型驗收, 2026-11-03): `--headless=new --window-size=375,667` 實際視口變咗 500×572 —— new headless 有最小視窗寬（≈516px）兼扣窗框（寬 −16／高 −95）。用 `--force-device-scale-factor=2` 都冇用（只放大渲染，唔改 CSS 視口）。截圖一度以為版面右側溢出，其實係 500px 視口 + 430 max-width 居中造成嘅黑邊假象 —— 先讀 HUD/JS 實測 `innerWidth` 再斷症，唔好信截圖第一印象。

- 正解：Node ≥22 內建 WebSocket，零依賴講 CDP —— `--remote-debugging-port` 起 Chrome，`Emulation.setDeviceMetricsOverride {width:375,height:667,deviceScaleFactor:2,mobile:true}` 先係真 375×667。現成腳本：`prototype/home-p1/capture.mjs`（兼可用 `Input.dispatchTouchEvent` 做合成下拉/誤觸測試）。
- 同場兩個版面教訓：(1) 彈出式元素（offline banner）會改變固定高度預算，用 CSS 變數 `--fixed` 補償而唔係寫死；(2) sticky CTA 要設 `z-index` 高過卡內 badge，否則滾動時 badge 會透出 CTA 邊緣。

### Rule 27 — Grid 列數必須等於實際子元素數；`env(safe-area-*)` 用 `padding` 吸收，不要當成 grid row

Incident (v1.28 Home 上線後真機全紅, 2026-11-03): `.pd-shell` 寫了 `grid-template-rows: env(safe-area-inset-top) 48px 1fr 34px env(safe-area-inset-bottom)` 五列，但當時 shell 內只有 2 個 grid item（bezel、screen2），`.pd-chin` 還在 shell 外面。結果 bezel 落入第 1 列（safe-top=0 → 0px 高、內容溢出）、screen2 被壓進第 2 列（48px）、其餘 1fr/34px/safe-bottom 全部空成紅色背景 —— 版面「整個屏幕都是紅殼、內容只剩頂部一條白帶」。

- `grid-template-rows` 的數量是「軌道」數量，**不會自動對應子元素**。加/刪子元素時必須同步改列定義，否則子元素被塞進錯的軌道。
- Safe area 用 `padding-top/bottom: env(safe-area-inset-*)` + `box-sizing: border-box` 吸收（外殼高度仍 `100dvh`），Grid 只留固定內容列（`48px 1fr 34px`）。把 safe-area 寫成 row 的話，桌面/瀏覽器（inset=0）會多出兩條 0px 軌道，令所有子元素位移一列。
- 裝飾性子元素（下巴/底部裝飾）如果想參與 grid 佈局，就要放進 grid 容器內；放外面就永遠不是 grid item。
- 驗證方法（唔可以只靠肉眼睇截圖）：CDP 讀 `getBoundingClientRect()` 每個 grid item 的高度 + `scrollHeight - clientHeight`。本次正確值（375×667）：shell 667 / bezel 48 / screen2 575 / chin 34 / overflow 0。

### Rule 30 — 手機尺寸基準與本地預覽（iPhone 17 Pro Max）

Phase 1 以手機為先，版面基準就用最大嘅 iPhone：

| 機型 | CSS 尺寸 | DPR | 安全區 top/bottom |
|---|---|---|---|
| iPhone 17 Pro Max | 440 × 956 | 3 | 62 / 34 |
| iPhone 16 Pro | 402 × 874 | 3 | 62 / 34 |
| iPhone 15 | 393 × 852 | 3 | 59 / 34 |
| iPhone SE | 375 × 667 | 2 | 0 / 0 |

- `.pd-shell` / `.ph-shell-parent` 嘅 `max-width` **必須 ≥ 440**，否則 440 闊機左右會露底色。
- 本地預覽：`npm run preview:iphone` 開 `tools/device-preview.html`（iPhone 外框 + Dynamic Island + Home indicator，可操作）。外框頁按窗口大小整體縮放，並經 `--sim-safe-top/bottom` 注入安全區；`.pd-shell` 用 `max(env(...), var(--sim-*))` 所以真機仍然用 env()。截圖：`--headless --click "#btn-entry-yes" --shot out.png`。
- 桌面 Chrome DevTools 嘅 iPhone 預設**唔會**注入 `env(safe-area-inset-*)`（iframe 內更加一定係 0），所以唔好靠 DevTools 對安全區。
- `.pd-ball` 基類係 `position:absolute; right:18px; top:10px`。任何新容器（下巴、卡角、裝飾）要用佢，必須畀容器 `position:relative` 並重置 `top/right:auto`，否則粒球會飛去 `.pd-shell` 嘅 padding 區（實測飛到 y=10，即狀態欄位置）。

### Rule 37 — 唔好假設 `env(safe-area-inset-top)` 一定大過 0；負 offset 元素要畀 shell 留白下限

Incident (2026-11-03 紅框頂裁切): 真機 Safari 瀏覽器模式下 `safe-area-inset-top = 0`（webview 由狀態欄下方先開始），`.pd-shell` 用 `top:0` 貼死 viewport 頂，結果鑽石數值 pill（`.pd-topdiamond`，`top:-8px` 突出 bezel 上方 6px）被 viewport 頂邊裁切一半，紅框亦冇可見頂邊。手機模擬器長期注入 `--sim-safe-top: 62px`，所以呢類「safe-area=0」嘅破版喺模擬器永遠睇唔到。

- 任何靠 safe-area 留白收容嘅突出元素（負 top/right offset 嘅 pill、badge），容器 padding 要用 `max(env(...), var(--sim-*), <下限>)` 設下限，唔可以淨靠 env()。
- 驗證版面時**必須**加跑一次 safe-area=0 嘅配置（`node tools/preview-iphone.mjs --device iphone-se`），唔好只驗 17 Pro Max（62px 會 mask 晒所有頂部裁切問題）。
- 外框頂邊要可見時，用 `--frame-inset-top` 統一調整 shell `top` + `height: calc(100dvh - ...)`，並同步更新 `--frame-screen-top`（gacha overlay 定位用），三處算式要共用同一份 max() 表達式。

### Rule 38 — preview 工具 `--js`：`const` 全域（Gacha/App/Quiz）唔喺 `window` 上，要 click 真掣或 iframe `eval`

Incident (2026-11-04 Lucky Draw 驗證): `preview-iphone.mjs --js` 喺外框頁執行，`doc.defaultView.Gacha` 係 `undefined` —— app 入面 `const Gacha = {...}` 呢類 top-level const/let 只存在 global lexical scope，**唔會**變 `window` property（`loadState` 呢類 `function` 宣告先至會）。用 `w.eval('Gacha.open(...)')` 又得，但 PowerShell 巢狀引號极易 SyntaxError。

- 首選：**click 真 UI 掣**間接觸發，例如入 gacha 用 `doc.querySelector('#btn-bezel-diamond').click()`，唔使直接掂 const 物件。
- 改 state 用 `w.loadState()` / `w.saveState()`（function 宣告，有掛 window）。
- 一定要 eval：用 `w.eval('...')`，eval 字串入面只用單引號；外層 PowerShell 用雙引號，唔好再嵌雙引號。
- 模擬拖拽：`new w.PointerEvent('pointerdown', {clientY, pointerId:1, bubbles:true})` dispatch 落 `#dm-arm`，再 `pointermove` 加 clientY 偏移（≥108px 即過 72% 閾值），可無頭行完整個抽獎流程。

### Rule 39 — display-window overlay 四個角都要圓角（唔好只修被投訴嗰個角）

Incident (2026-11-04)：quiz 選題／結算、Leaderboard、Battle Menu、Friends 收成 display-window overlay 後，用戶投訴「下面起角穿出來」。第一次只加 `border-radius: 0 0 14px 14px`（底部），下一輪用戶再投訴**頂部**一樣起角——白螢幕區（`.ph-sheets`）本身四個角都係 16px 圓角，任何一個直角都會穿。

- 新 display-window overlay（position: fixed、對齊 `--frame-screen-top/bottom`、max-width 428px）**一出場就要** `border-radius: 14px`（全四角），唔好等被投訴邊個角先修邊個。
- 規則：投訴「起角／穿出」時，檢查**全部四個角**，唔好只修用戶指住嗰個。
- 同時檢查同類 overlay 是否共用同一 selector（`#view-quiz-setup, #view-settlement, #view-leaderboard, #view-friends, #view-battle-menu, #gacha-scene-b, #gacha-inspect`），改一個就要改晒。

### Rule 42 — flex column 容器做滾動區：子項要 flex: none，否則被壓扁

Incident (2026-11-04)：選題頁 `#topic-list` 設咗 `flex:1; overflow-y:auto` 但清單全部縮到 ~20px 一條、唔滾動。原因：flex column 容器嘅子項預設 `flex-shrink:1`，空間唔夠時瀏覽器寧願壓扁子項都唔溢出。修：`#topic-list > * { flex: none; }`。

- 任何 `flex column + overflow-y:auto` 嘅滾動清單，子項必須 `flex: none`（或 `flex-shrink: 0`），否則 overflow 形同虛設。
- 驗證方法：check `scrollHeight > clientHeight` 先算真滾動；單睇 CSS 有 `overflow-y: auto` 唔代表滾到。

### Rule 43 — display-window overlay 定位要對齊 .pd-screen2（計埋佢嘅 margin:6px）

Incident (2026-11-04)：Leaderboard／Battle Menu／Friends overlay 上下各凸出 6px（頂蓋住 status bar、底蓋住下巴紅邊）。原因：`--frame-screen-top/bottom` 算式冇計 `.pd-screen2` 嘅 `margin: 6px`。修：兩個算式各加 6px。

- 改紅框結構（deco／status bar／chin／pd-screen2 margin）時，必須同步更新 `--frame-screen-top/bottom` 算式，並用 `getBoundingClientRect` 對比 `.pd-screen2` 同 overlay 四邊（差值要係 0）。

### Rule 45 — 將全頁 view 收入 display window：height:auto + 內部 fixed 轉 absolute

Incident (2026-11-04)：答題／捕捉／對戰由全頁 view 改成 display-window overlay 後，`#view-capture` 自帶 `height:100dvh`、`.battle-party` 自帶 `position:fixed; inset:0`，會撐出白螢幕區並蓋住紅框。

- 新 view 加入 display-window selector 群組時，必定同時覆寫 `height:auto`（原本有 `100dvh` 的話），並將內部 `position:fixed` 圖層改 `position:absolute; inset:0`（父 overlay 已係 fixed/relative）。
- 呢三類玩法（答題／捕捉／對戰）要 call `App._setFrameLock(true)`，用 `disabled` + `pointer-events:none` 鎖住紅框 4 個 stat 同下巴 `btn-pd-home`；離開呢三個 view 記得解鎖。
- 驗證：用 `getBoundingClientRect` 對比 overlay 同 `.pd-screen2` 四邊（差值 0）；模擬器要試 440×956 同 375×667 兩個尺寸。
- **唔可以 fade-out 呢類 overlay**：佢哋後面就係仍然 active 嘅主頁 shell，任何 `opacity` transition／`is-fading` 都會喺切頁時露出主頁（用戶見到「主頁閃一下」）。要麼即時切換，要麼先鋪一層不透明黑幕再淡出。新 overlay 亦要 `animation: none`，避免 fade-in 期間見到主頁。

### Rule 46 — 全域 popup（modal／toast）要貼 display window 頂部，z-index 要高過 view overlay

Incident (2026-11-04)：toast 原本 `bottom:30px`，正正疊住下巴 Home 鍵；modal 置中又會被 quiz／捕捉／對戰 overlay（z-index 120）蓋住，因為 `.modal-backdrop` 舊 z-index 只有 50。

- `.modal-backdrop`：`align-items:flex-start`、`padding-top: calc(var(--frame-screen-top) + 14px)`、`z-index: 1400`，`.modal-card` 用 `max-height: calc(100dvh - --frame-screen-top - --frame-screen-bottom - 28px)` 確保唔會落到 Home 鍵。
- `.toast`：`top: calc(var(--frame-screen-top) + 12px)`、`bottom:auto`、`z-index: 3000`（v1.45.3 起，要高過晒所有 app 內 modal 先睇得清）。
- 新增任何 body 級 popup 時，z-index 必須大過 120（display-window view overlay），否則喺答題／捕捉／對戰入面會完全睇唔到。
- **Z-order 全景（2026-11-04 定案）：** toast(3000) > inferno-unlock(2300) / tier-select(2200) / pvp-match(2100) / team-select(2000) > display-window overlays(120) > bezel/chin(100)；entry-gate(9000) / update-modal / qd-fly(9999) 蓋過一切係刻意嘅。
- **教訓（v1.45.3 Battle「Confirm 冇反應」）：** toast 曾卡喺 1500，被 team-select-modal(2000) 完全蓋住 —— 揀隊數量唔夠撳 Confirm 時「Pick exactly N Pokémon」有彈但用戶完全睇唔到，等於冇反應。新增任何 fixed modal（z-index 已 >1500）時，必須同時檢查**所有** toast / 全域 popup 嘅 z-index 仲高唔高過佢；「撳掣冇反應」類報告，要先查「回饋係咪彈咗但被蓋住」先好查 handler。

### Rule 47 — position:fixed overlays 必須：bezel/chin z-index 高過佢哋；exit 動畫跟 Settings sheet 一樣

Incident (2026-11-04)：新增 display-window overlays（Friends / Leaderboard / Battle Menu）後出現連串 z-index 同 binder 邏輯 bug：

**Bug 1 — bezel/chin 被攔截點擊**
- Friends/Leaderboard/Battle Menu 用 `position:fixed` 疊喺 `position:relative` 嘅 `.pd-bezel` 同 `.pd-chin` 上面（fixed stacking context 更高）→ 用戶撳頂部 Pokedex/Streak/Settings 按鈕冇反應。
- **必做：** 紅框兩個固定欄位必須有 `z-index: 100`：`.pd-bezel { position: relative; z-index: 100; }` 同 `.pd-chin { position: relative; z-index: 100; }`。
- 所有 position:fixed 嘅 view overlay（包括之後新增嘅）都設 `z-index: 120`，確保高過 bezel/chin（bezel/chin 要可撳 → overlay 之間 sheet 要蓋住 overlay → sheet z-index 再高）。
- Stacking 次序：bezel/chin (100) < display-window overlays (120) < sheets (z-index: 121+)。

**Bug 2 — binder/dockBinder 只檢查 sheet，冇檢查 fixed overlay**
- 開住 Friends view → curSheet = null → binder 走 `else → openFn()` → sheet 被開出嚟但顯示喺 Friends 後面（Friends 係 fixed，sheet 係 absolute）→ 用戶以為冇反應。
- **必做：** `binder` 同 `dockBinder` 加前置檢查 `#view-friends.active, #view-leaderboard.active, #view-battle-menu.active`；有 fixed overlay active 時先 `showView("view-home")` 再 open。

**Bug 3 — token self-cancel（同 Rule 51 詳細規格）**
- binder 入面 `token = bump → showView("view-home") → showView 內部又 bump → token mismatch → timer cancel → openFn() 冇 run`。

**Bug 4 — exit 動畫唔跟 Settings sheet 方向（搞反上/下）**
- 初次加嘅 exit 動畫係 `translateY(18px) + opacity fade`，之後又搞反方向寫咗 `translateY(-100%)`（向上），但 Settings sheet 係 bottom anchored（`.ph-sheet-up`），close 時係 `translateY(100%)` 向下捲出。
- **必做：** 所有 display-window overlay 必須有 `border: 2.5px solid #1b1b22; border-radius: 14px;`（同 `.ph-sheet` 一樣嘅黑邊框 + 圓角），否則會「唔係 exactly in display window」。
- **必做：** 所有 display-window overlay 嘅 exit 動畫必須用 **scaleY(0) + transform-origin: bottom center**，唔好用 translateY：
  ```css
  transform-origin: bottom center;
  transition: transform .4s cubic-bezier(.25,1,.5,1);
  .fixed-overlay-exit { transform: translateX(-50%) scaleY(0); pointer-events: none; }
  ```
  - **唔好用 translateY**：因為呢三個 view 係 `position:fixed`（viewport 級），translateY 會令元素移動到 display window 外嘅區域（dockbar / chin area），穿過紅框邊界
  - scaleY(0) 唔改變元素位置，只係由底部向上壓縮內容，永遠留喺 display window 範圍內
  - transform-origin: bottom center 確保由底部向上壓（同 Settings sheet close 視覺一致）
- **注意：** translate 方向唔好憑直覺寫，先確認對齊嘅 sheet 係 top anchored（`.ph-sheet-down`，close = `-100%` 向上捲）定 bottom anchored（`.ph-sheet-up`，close = `+100%` 向下捲）。
- `showView("view-home")` 時如果目前有 fixed overlay active，要先加 `fixed-overlay-exit` class → 延遲 400ms → 切 active（先播動畫，再換頁）。

**Bug 5 — closure 內部 `_sheetSwitching` 變數引用**
- 改 binder 嘅 `let _sheetSwitching` closure var → `App._sheetSwitching` 時漏咗 `dockBinder`（另一個 closure），dockbar 全部 function 即刻 ReferenceError 壞掉。
- **必做：** 改 closure-level 變數名稱時，grep 全部 closure 引用位置（`let _xxx;` 出現咗幾多個 closure 就改幾多個）；或者一開始就掛 App object 上（`App._sheetSwitching`），唔用 closure var。

### Rule 59 — preview 工具卡死：先 kill 殘留 CDP Chrome，再換 `--port`

Incident (2026-11-04)：連續跑 `tools/preview-iphone.mjs --headless` 時，舊 Chrome 仍佔住 9230，新 run 連到舊 page 後卡死（120s timeout），但截圖其實已寫出。

- 每次 run 用遞增 `--port`（9230/9231/…）；run 前 `Get-NetTCPConnection -LocalPort <port>`，有 OwningProcess 就 `Stop-Process -Id <pid> -Force`。
- 工具完成後 Chrome 有時唔退出：截圖檔存在就代表 JS 已跑完，可以 kill 該 pid 收工。

### Rule 67 — 將現有 view 搬入另一個容器（例如橫向紅框）：要清走佢原本嘅定位 CSS

Incident (2026-11-05，背包第 4a 段)：`#view-battle` 搬入橫向紅框 `.bl-screen` 之後，畫面偏咗去右下（top 106px、left 397px、translateX(-50%)）。原因係 display window 版本用 `position/inset/max-width/transform` 將 view 貼落直向白螢幕，搬咗位照樣生效。

- 搬 view 入新容器時，喺新容器 selector 用 `!important` 清走 `position`、`inset／top／left／right／bottom`、`transform`、`max-width／max-height`、負 margin、`100vh` min-height。
- 第一次搬完即刻 `getComputedStyle()` 睇 position／inset／transform，再截圖，唔好淨係睇 DOM 有冇搬到。
- 離開時一定要搬返原位（用 comment placeholder 記住位置），並用 `App.showView` 包一層確保任何出口都會搬返。

### Rule 72 — 圖片題：張圖要用「剩餘高度」縮放，唔可以用固定／dvh 高度；iPhone 打開就要見到輸入格

Incident (2026-11-05，Quiz v2 圖片題)：`.word-image` 用 `height: clamp(170px, 28dvh, 300px)`，加上下面一行播放狀態文字同 App 鍵盤（約 290px），iPhone 要向上推先見到輸入格。

- 圖片題 `#view-quiz.is-word`：`.quiz-col { height: 100% }` + `.word-card { flex: 1 1 0; min-height: … }`，張圖 `height: 100%; object-fit: contain`——圖片食剩餘高度，輸入格同鍵盤永遠喺畫面內。
- 唔好再加獨立一行嘅控制／狀態：🔊／🐢 疊喺圖片右下角，狀態（System voice／冇錄音）做圖片左上角小 pill，平時唔顯示。
- 矮機（`max-height: 720px`，例如 iPhone SE 375×667）要同時收細鍵盤（key 40px、工具列 44px）同圖片下限，否則張圖會被推出畫面。
- 橫向 ≥900px：左圖右答（grid），鍵盤佔高度都唔會逼到張圖。
- 驗收：每個尺寸（440×956、375×812、375×667、820×1180、1280×800）量 `#quiz-scroll` 嘅 `scrollHeight - clientHeight` 要 ≤ 4，同埋輸入格 `bottom` 要細過鍵盤 `top`。

Skill: Rule 72 added

### Rule 80 — 響應式驗證：headless 觸控模擬會「黐住」；Browser pane resize 唔派 resize／matchMedia 事件

Incident (2026-11-06，Responsive P1 Task 0–1)：(1) `tools/responsive/shots.mjs` 一個 Chrome session 入面輪流跑觸控同非觸控尺寸，S6（1440×900 桌面）答題竟然顯示 App 鍵盤，`1200×480` 冇觸控都判成 `phone-land`。原因：headless Chrome 開過 `Emulation.setTouchEmulationEnabled` 之後，`(pointer: coarse)` 停喺 true，關返都冇用。(2) Browser pane 用 `resize_window` 轉尺寸，`window` 嘅 `resize` 同 `matchMedia` change 事件一次都冇 fire（pane 隱藏時冇 render frame），`data-layout` 停喺舊值，好似 app 有 bug。

- 同一個 headless session 要**先跑晒非觸控尺寸，再跑觸控**（`tools/responsive/shots.mjs` 已經自動排序）；要驗「桌面冇觸控」嘅行為，就開一個從未開過 touch 嘅新 session。
- 驗 layout 即時切換（`pe:layout` 事件）用 headless CDP `Emulation.setDeviceMetricsOverride`，唔好靠 Browser pane `resize_window`；pane 只用嚟睇靜態畫面（resize 後要 reload）。
- `App._initLayout()` 同時聽 `matchMedia` change、`resize`、`orientationchange`，唔好只靠其中一種。
- 斷點數值有兩份：`css/style.css` 頂部「LAYOUT BREAKPOINTS」同 `js/app.js` `App.layout()`，改一邊就要改另一邊。
- 答題 scene 每次抽題都唔同，所以 `--compare` 見到 `quiz@*` 有 DIFF 係正常，要睇截圖判斷；其他 scene 要差 0。

Skill: Rule 80 added

### Rule 81 — display-window overlay 定位只准用 `--frame-screen-*`；寫死 `width:100%; max-width:428px` 喺 < 440 闊手機會凸出紅框

Incident (2026-11-06，Responsive P1 Task 2)：baseline 截圖發現 375×667 時選題／Leaderboard／結算／答題 overlay 係 `[0,106,375,509]`，但白螢幕區係 `[5,105,365,511]` —— 兩邊各凸出 5px 蓋住紅框，頂底差 1px。原因：overlay 用 `width:100%; max-width:428px; left:50%; translateX(-50%)`，只喺 440 闊先等於「殼 440 − 2×6px」；≤380px 時 `.pd-screen2` margin 仲會變 5px。Rule 45 要求驗 375×667，但之前冇跟。

- 定位一律用 `:root` 嘅 `--frame-w`、`--frame-screen-m`、`--frame-screen-w`、`--frame-screen-left`、`--frame-screen-dx`、`--frame-screen-top/bottom`；唔好再寫 `428px`、`440px` 或 `translateX(-50%)` 置中。
- `.pd-screen2` 嘅 margin 用 `var(--frame-screen-m)`；改 margin 就改變數，唔好喺 media query 直接寫 `margin: 5px`。
- `transform` 留畀動畫用：exit 係 `scaleY(0)`（Rule 47），唔好再疊 `translateX(-50%)`。
- 驗證：`node tools/responsive/shots.mjs` 跑晒 S1–S9，`--compare` 同 baseline 比；overlay rect 一定要等於 `.pd-screen2` rect（S1 同 S2 都要睇）。

Skill: Rule 81 added

### Rule 82 — 主頁拍檔卡喺矮視窗要可以縮；驗收一定要包矮尺寸（1000×500）

Incident (2026-11-06，Responsive P1 Task 3)：1000×500 桌面窗（矮過 560 → tablet）主頁拍檔卡 sprite 固定 264／320px、`.ph-sign` 又係 `flex:none`，成張卡撐爆白螢幕區，START QUIZ 同 dock 被推出畫面（`.pd-screen2` 係 `overflow:hidden`，冇得 scroll）。改動前嘅 baseline 一樣壞，只係之前冇人用矮視窗開。

- ≥700px：`.ph-sign { flex: 0 1 auto; min-height: 0; overflow: hidden }`、sprite `flex: 0 1 320px; min-height: 56px`（`object-fit: contain` 令圖跟高度縮）；CTA／dock／today 仍然 `flex:none`。呢度係刻意例外於 Rule 42。
- `(min-width:700px) and (max-height:620px)` 收埋 `.ph-sign-stat`、`.ph-sign-note`，唔好畀卡喺棒中間切開。
- 新增主頁元素前問：「矮視窗時邊個縮？」；CTA／dock 一定要見到。驗收跑 `tools/responsive/shots.mjs` 嘅 S9（1000×500），量 dock bottom ≤ `.pd-screen2` bottom。

Skill: Rule 82 added

### Rule 83 — wide 雙欄：右欄 = `.ph-sheets`，overlay 要同佢 rect 一致；左欄闊用固定分段，唔好用 %

背景（2026-11-06，Responsive P1 Task 4）：wide（≥900×560）唔改 DOM，`.pd-screen2` 變透明容器，`::before` 畫左欄白螢幕，`.ph-sheets` 變右欄白螢幕；display-window overlay 經 `--frame-screen-w`／`--frame-screen-dx` 對齊右欄。

- `--pane-l` 一定要係固定值（360px；≥1280 係 400px）。overlay 嘅 `--frame-screen-w` 喺 `position:fixed` 元素上計，`%` 會指 viewport；左欄 `::before` 嘅 `%` 指 `.pd-screen2`——用 `%` 兩邊會對唔齊。
- 改 `--pane-l`／`--pane-gap`／`.ph-sheets` 邊框，要用 `tools/responsive/shots.mjs` 量 overlay rect（`.view.active:not(#view-home)`）同 `.ph-sheets` rect，S4–S7 都要完全相等。
- 將有樣式嘅容器改透明時，連 `box-shadow` 都要清：`.pd-screen2` 本身有 `inset 0 0 0 2px` 灰框，透明之後會喺兩欄外圍露出一圈白線（Incident 2026-11-06）。
- 左欄子元素用 `.pd-screen2 > :not(.ph-sheets)` 限闊；新增主頁元素唔使另外處理，但唔好加喺 `.ph-sheets` 入面。

Skill: Rule 83 added

### Rule 84 — wide 右欄常駐 sheet：所有「有冇 sheet 開住」嘅判斷都要排除 `data-wide-default`；`ph-open` 唔可以喺 rAF 補落已 hidden 嘅 sheet

背景（2026-11-06，Responsive P1 Task 5）：wide 右欄冇嘢開時顯示 Daily Quests（`sheet-quests` full 模式，`data-wide-default`），即係 wide 幾乎永遠有一個 sheet `ph-open`。

- **Esc 陷阱**：Esc handler 原本「有 sheet 開住就先關 sheet」→ wide 答題時 Esc 會去關預設 sheet，開唔到答題設定。所有 `querySelectorAll(".ph-sheet.ph-open")` 用嚟做決定嘅地方（Esc、`_closeAllSheets` 嘅 stillOpen guard、click-outside）都要 filter 走 `dataset.wideDefault`。新增類似判斷時照做。
- **預設 sheet 唔經 `_openSheet`**：`_showWideDefault()` 直接設 class；`_openSheet` 會 `showView("view-home")` 殺咗右欄 overlay。`_closeAllSheets` 喺 wide 唔收預設 sheet（切 overlay 返嚟唔會閃空白）。
- **殭屍 sheet**：`_openSheet` 原本喺 `requestAnimationFrame` 先加 `ph-open`；同一 tick 再撳另一個掣，wide 嘅 `_wideHideSheets()` 已經將佢 `hidden`，rAF 之後又補返 `ph-open` → 5 個 sheet 同時「開住但 hidden」。修：wide 同步加 class；phone 嘅 rAF 加 `if (!sheet.hidden)`。
- phone 原本已有：同一 tick 撳 3 個掣會開 3 個 sheet（rAF 未 fire，binder 睇唔到 curSheet）。真人做唔到，未修；如果將來改 binder 要留意。
- 驗收：用 headless CDP 互動腳本（wide＋phone 各一套：開／toggle／✕／點外面／Esc／快速連撳／chin Home／overlay 上面開 sheet／layout 互轉），檢查「只有一個 ph-open」同「冇 hidden 但 ph-open」。

Skill: Rule 84 added

### Rule 85 — wide 左欄喺 overlay 開住時仍然撳得：鎖要包左欄（inert）；Gym 結算要鎖 bezel＋左欄；任務板喺 sheet 入面都要當「開住」

Incident (2026-11-06，Responsive P1 Task 6)：
1. **捕捉／Gym 結算多咗出口**：phone 時 overlay 蓋住 CTA 同 dock，`_setFrameLock` 只鎖 bezel＋下巴就夠。wide 嘅 overlay 只蓋右欄，左欄 START QUIZ／dock 仍然撳得 → 捕捉中可以開答題，Gym 結算可以唔經下巴 Home 走（Rule 44 badge 唔判）。修：`_applyPaneLock()` 喺 `frame-locked` 或 `settle-locked` 時將 `.pd-screen2 > :not(.ph-sheets)` 設 `inert`；`_setSettleLock()` 鎖 bezel 4 個 stat、唔鎖下巴 Home。`_gymSettleData` 係 `showView("view-settlement")` **之後**先 set，所以鎖要喺 set data 嗰度補 call。
2. **兩個 sheet 同時開**：由 Friends／Leaderboard／Battle Menu（fixed overlay）撳 bezel／dock，會行原本 400ms exit＋410ms open 路徑；`_closeAllSheets` 喺 wide 刻意保留預設 Daily Quests → 開完多咗一個。修：`_openSheet` 喺 wide 開頭先收起 `data-wide-default` sheet。測試要斷言「`ph-open` 數量 = 1」，唔好淨係睇第一個（第一次測試就係咁漏咗）。
3. **任務板倒數唔郁**：`Quests.boardOpen()` 只認 `view-quests` active，任務板搬入 sheet（phone full 模式、wide 預設）之後 timer 第一下 tick 就停、領獎後唔 re-render。修：`boardOpen()` 同時認 `#sheet-quests.ph-open .sheet-view-host`；返主頁用 `Quests.resume()`（唔 call server）。

- 驗證鎖要用真滑鼠事件（CDP `Input.dispatchMouseEvent`），`el.click()` 唔經 hit-test，測唔到 `inert`／`pointer-events`。
- Guest 帳號下 Friends 只會 toast＋叫登入、Leaderboard 會彈 `lb-login-modal`（z 9999 蓋全畫面）；測試「overlay 開住撳左欄」要用 `App.showView('view-friends')` 直接開，唔好當 guest 行為係 bug。

Skill: Rule 85 added

### Rule 86 — 響應式 @media 區塊喺檔案前面：覆寫後面嘅基礎規則要加 specificity；兩欄高度互不影響要用 wrapper，唔好硬用 grid areas

Incident (2026-11-06，Responsive P1 Task 8 結算兩欄)：
1. wide 區塊（`@media (min-width:900px) and (min-height:560px)`，喺 style.css 約 4990 行）寫 `#view-settlement .settle-col { display:flex }`，但「結算 v2」基礎規則 `#view-settlement .settle-col { display: contents }` 喺約 5540 行 —— 同 specificity、後者贏，wide 兩欄完全冇生效，畫面亂排。修：wide 用 `#view-settlement.active .settle-col` 加分。
2. 第一版用 `grid-template-areas: "title rewards" "sub rewards" …`：右欄獎勵卡（130px）跨兩行，grid 將「標題」「副標題」兩行拉高 → 中間一大段空白。修：加 `.settle-col-a`／`.settle-col-b` wrapper，各自 flex column；phone／tablet `display: contents`（等於冇呢層），子項另外補 `flex: none`（Rule 42，因為佢哋唔再係 `> *`）。

- 喺 wide／tablet `@media` 覆寫某個 selector 前，先 grep 佢喺檔案邊度定義；基礎規則喺後面就要加 specificity（`.active`、父 id），唔好用 `!important` 了事。
- 加 wrapper 改 DOM：JS 用 id 搵元素就唔受影響，但要 grep `parentElement`／`> ` selector 依賴；`index.html` 有 BOM（Rule 70 類），用 Edit 工具改。
- 驗收結算要用有內容嘅版本：`tools/responsive/shots.mjs --scenes settlement-full`（`settlement` scene 只係空殼）。

Skill: Rule 86 added

### Rule 87 — 「要唔要轉機」只問 `App.layout()`：手機直向先轉 90°；手機橫向先提示轉返直；唔好用 innerWidth/innerHeight 比較或 `<= 1000`

Incident (2026-11-06，Responsive P1 Task 9)：背包 `fit()`／`open()` 同戰鬥 `landscape.js` 用「高過闊」當直向 → iPad 直向（820×1180）都被叫轉機，或者成個畫面轉 90°；離開背包／戰鬥嘅「請轉返直向」用 `innerWidth <= 1000` → 桌面 1000 闊以下嘅橫窗都會彈。

- 轉 90°／「Please rotate your device」：只限 `App.layout() === "phone"` 且直向。tablet 直向：背包等比縮放；戰鬥紅框全闊、高度 `min(H, W×0.62)` 置中。
- 「Turn your phone upright」：全域 `App._syncRotateHint()`，條件 = `phone-land`（橫向＋高 < 500＋`pointer: coarse`），背包（`body.bag-open`）、戰鬥（`body.battle-landscape`）、捕捉（`#view-capture.active`）豁免；「Continue anyway」收起到離開 phone-land 為止；唔中斷 state（答題中轉橫再轉返直會繼續）。
- 入／出呢三個豁免畫面時要 call `App._syncRotateHint()`（`_doShowView` 已經 call；背包 open／close、`BattleLand.enter／exit` 自己 call）。新增橫向專用畫面要加入豁免清單。
- 驗收：headless 非觸控先跑（Rule 80）：1200×480 桌面唔可以彈提示；956×440 觸控要彈；820×1180 背包／戰鬥唔轉 90°；440×956 舊行為（轉 90°＋轉機提示）不變。

Skill: Rule 87 added

### Rule 88 — 擴大觸控範圍唔改外觀：用透明 `::after`；元素有 `overflow:hidden` 就改用父層點擊轉交；量度要用 hit-test

Incident (2026-11-06，Responsive P1 Task 10)：觸控目標驗收發現 sheet ✕ 只有 34px（tablet 40px）、下巴 Home 球 40px，低過 44／48px。手機版要零回歸，唔可以改外觀尺寸。

- ✕：`.ph-sheet-x { position: relative }` + `::after { inset: -6px }` → 可撳範圍 46／52px。`.ph-sheet-down .ph-sheet-x` 本身係 absolute，specificity 較高唔會被 relative 蓋。
- 下巴 Home 球有 `overflow: hidden`（圓形裁圖），`::after` 擴出去嘅部分會被裁走、點唔到。改為 `.pd-chin` click：`e.target === chin` 而且距離球中心 ≤ 24px → `ball.click()`（disabled 時 click() 冇效，frame lock 照樣生效）。
- 量度唔好淨係睇 `getBoundingClientRect`（只係外觀）：用 `document.elementFromPoint` 喺邊緣外 `(目標 − 外觀)/2` 位置測，或者 CDP 真滑鼠撳邊緣外幾 px。
- 焦點框：`:where(...) :where(button…):focus-visible` specificity 只有 (0,1,0)，有自己 `box-shadow` 嘅掣（例如 `.ph-cta`）會蓋走黃光環，淨低黑 outline（對比已足夠）。要光環就要加 specificity。
- 字級：tablet／wide 最細 12px；phone 嘅 HUD 細字（品牌 9px、鑽石 pill 10px、stat 標籤 11px）係紅框設計，改咗會破手機零回歸，未郁。

Skill: Rule 88 added

### Rule 89 — overlay 基礎規則嘅 `max-width` 要喺 `.active` 覆寫；canvas 場景跟 overlay 變闊要 resize＋加闊內容

Incident (2026-11-06，用戶截圖)：wide（1440×900 等）開捕捉畫面，`#view-capture` 只得 520px 闊，右欄後面嘅 Daily Quests 露出一截。原因：基礎規則 `#view-capture { max-width: 520px; margin: 0 auto }`（舊全螢幕設計）冇喺 display-window overlay 規則覆寫；phone 嘅 `--frame-screen-w` ≤ 428 所以一直睇唔到，tablet（628）同 wide（750–818）先爆。

- `#view-capture.active` 加 `max-width: none`。加新 overlay 時 grep 基礎規則有冇 `max-width`／`margin: auto`。
- `capture.js`：`_buildGrass` 喺 `(min-width: 700px)` 草叢闊 24 → 36、數量按比例（密度不變）；`start` 重用 renderer 前 call `_resize()`（phone↔wide 轉過 layout 都對齊）。
- 驗收：`tools/responsive/test-capture-fit.mjs`，7 尺寸 overlay 同 `.ph-sheets`／`.pd-screen2` 左右差 0、canvas = overlay − 邊框；440×956、375×667 rect 同之前一樣。

Skill: Rule 89 added

### Rule 90 — 固定 px 設計嘅遊戲畫面（戰鬥）喺大屏要「固定畫布＋等比例 scale」，唔好拉闊舞台；JS 座標用 offset

Incident (2026-11-06，用戶截圖)：電腦（1440×900、1920×1080）同平板橫向（1180×820）開戰，舞台跟紅框拉到 1270–1750 闊、精靈跟住放大（273–376px），但 HP 框（max 240px）、文字（max 22px）、訓練家（148px）、拋球終點（`rect.width - 28 - 55` 等固定 px）冇放大 → 人物、精靈球、資料框、文字框比例全部走樣，拋球位置錯。

- `BattleLand.fit()`：layout 係 tablet／wide → `.battle-land.bl-scaled`，`--bl-w: 664px`、`--bl-s = min(screenW/680, screenH/430)`；CSS `#view-battle` 680×430、`transform: scale(var(--bl-s))`、清走 display-window 黑邊圓角。phone／phone-land 唔郁（量度數值同改動前完全一樣）。
- 因為 vw clamp 喺 ≥ 約 700px viewport 全部到頂，設計畫布同手機橫向（956×440）嘅字級／高度一致，唔使另外凍結。
- `throwBall`、`playMoveFx`（battle.js）、`MoveAnim.play`（moveanim.js）由 `getBoundingClientRect` 改用 offset（精靈係 `.battle-stage` 直屬子元素）：rect 會計埋 scale；手機直向「Play anyway」轉 90° 時 rect 闊高對調，拋球本來就落錯位，一併修正。
- 驗收：`tools/responsive/test-battle-fit.mjs`；`test-rotate.mjs` 18/18。

Skill: Rule 90 added

### Rule 97 — 全鍵盤操作：方向鍵空間導航要認啱「當前情境」；舊 Enter 預設要讓位畀焦點掣

- 背景（2026-11-06）：用戶要求電腦端淨用鍵盤控制所有掣，並且唔記得快捷鍵都可以用 ↑↓←→＋Enter＋Esc。
- 撞板（headless 實測先發現）：
  1. 首次入 app 有 `#entry-gate` 全屏層唔喺 overlay 清單 → 主頁所有掣被判「蓋住」，0 個候選。→ 加通用偵測：body／#app 直屬、fixed／absolute、蓋 ≥40% 視窗、入面有掣。
  2. wide 開咗 Settings sheet，入面嘅掣全部唔算 → sheet 開咗仍然 `aria-hidden="true"`（app 從來冇切換）。→ keys.js 對 `.ph-sheet` 忽略 aria-hidden；app 本身嘅 aria-hidden 係另一個讀屏 bug。
  3. ↓ 由左欄 dock 跳去右欄 radio、由 sheet 清單跳去下巴 Home → 分數只用中心距離＋弱橫向權重。→ 60° 錐形＋邊距計分＋「先留喺目前捲動區」。
  4. Esc 關 sheet 之後焦點留喺正在收埋嘅 sheet → 關咗冇人接。→ 開嗰陣記低開佢嗰粒掣，返到嗰個情境就還焦點；同一情境焦點冇咗就放主要掣。
  5. Leaderboard 嘅登入 popup 喺 fetch 後（~0.8s）先插入，再加上 opacity 淡入唔觸發 MutationObserver → 要 120ms＋450ms 兩次檢查。Esc 關唔到因為掣叫「Maybe later」。
  6. 答題設定彈窗：舊 document handler「Enter = Quit this set」無視焦點 → 方向鍵揀 Keep going 再 Enter 都會 Quit。→ 焦點喺 modal 掣上就唔行預設。
- pane-locks W2／W4、sheets P9b 喺封咗 keys.js／anim-speed.js 嘅 baseline 一樣 fail，唔係呢次引入。

#### Rule 97 續 — 第二期捷徑層（2026-11-06）

- 背包 `B` 開到但 Esc 關唔到：Esc 揀中 banner 嘅「Cancel」——banner `max-height:0; overflow:hidden` 摺埋，但掣自己 rect 正常（71×25）。→ isVisible 加「0 高／闊嘅 overflow 祖先」同祖先 opacity（`checkVisibility`）。
- 扭蛋結果卡出現嗰刻，Scene B 仲喺度淡出，`Pull again` 被判「蓋住」→ 嗰次揀唔到；之後情境冇變就冇人再理。→ 同一情境但焦點喺外面都拉入嚟；`transitionend`／`animationend` 再檢查。
- 測試陷阱：capture 結果用 `caught` 判斷 → 走甩咗就 false，誤以為 Enter 無效；要睇 `done`／`_finished`。

#### Rule 97 續 — 第三／四期（2026-11-07）

- 圖鑑詳情 Shift+→ 冇反應：keys.js 寫 `window.Pokedex && …`，但 `Pokedex` 係 classic script top-level `const`，唔喺 `window` → 靜靜咩都冇做（Rule 75 同一類）。→ 用 `typeof Pokedex !== "undefined"`。
- 戰鬥測試開唔到局：開場「XXX would like to battle!」靠 `waitTap()` 等撳 `.battle-bottom`，鍵盤完全推進唔到 → 真 bug，唔係測試問題。→ `waitTap` 加 Enter／Space（焦點喺掣上就讓畀掣）。
- 戰鬥 `F` 冇反應：BattleLand 將戰鬥搬入 `.battle-land`（body 級 fixed、蓋大半個視窗）→ 被通用 overlay 偵測認做 overlay，`isBattle`（要求 view 情境）唔成立。→ 第一次改做「情境包唔包住 `#view-battle`」都唔得：BattleLand 係將戰鬥舞台同底欄**搬出** `#view-battle`。最後用「情境入面有冇 `.battle-bottom`」，Esc 嘅 findClose 都用嗰個 root。測試 B2 原本因為 F 冇開到招式選單而「假 PASS」→ 改成先確認選單開咗。
- home sheet `aria-hidden="true"` 寫死喺 `index.html`、app 從來冇切換 → 讀屏會跳過開咗嘅 sheet。`hidden` 已經負責隱藏，所以直接刪走 6 個 sheet 嘅 aria-hidden（backdrop 係裝飾，保留）。
- 測試陷阱：隊伍存喺 `st.myTeam`（唔係 `team`）；phone 開機 gate 要先 ↓ 揀 YES 再 Enter。
- 戰鬥 B1（`F` 開招式）間歇 fail（約一半）：用 MutationObserver 追到「招式選單開咗即刻被 `showMainMenu()`＋`narrate()` 打返轉頭」。源頭係測試 helper（抄自 `test-battle-fit`）：揀隊 loop 開咗局 `break` 之後**仲無條件再撳一次 confirm** → 背景開咗第二場 intro，佢未完嘅 `waitTap()`（聽 `.battle-bottom` click）食咗 FIGHT 嘅 click，intro 收尾重設選單。→ 兩個測試都改做「揀隊窗仲開住先撳」。教訓：間歇 fail 唔好加 sleep／重試，要追到邊個改咗 DOM（MutationObserver 記 style／class 變化次序最快）。
