---
name: webapp-mobile-dev
description: Mobile-first web app development workflow. Read this before building or iterating on any mobile web app UI: it defines the phone-frame simulator (local dev + test in the same window), the iPhone 17 Pro Max baseline, and the RWD approach for later tablet/desktop expansion.
---

# Web App 手機開發工作流（Mobile-First + RWD）

適用於任何手機 web app / PWA 的 UI 開發。目標：**一路寫、一路喺同一部「假手機」上睇同測**，唔需要每次上真機。

## Rule 1 — 基準機先定，唔好邊做邊改

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

## Rule 2 — 本地永遠用「手機外框模擬器」開發

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

### 2.1 換機款

底部 HUD 有下拉選單（9 款 iPhone，由 17 Pro Max 到 SE）。揀完即時換機身尺寸同安全區，唔使重開；選擇會寫入 URL `?device=xxx`。

### 2.2 安全區點做到「同一份 code」

iframe 內 `env(safe-area-inset-*)` 一定係 0，所以**唔可以**寫死 padding。
做法：外框頁把模擬值注入 `--sim-safe-*`，app CSS 寫成

```css
padding-top: max(env(safe-area-inset-top, 0px), var(--sim-safe-top, 0px));
padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--sim-safe-bottom, 0px));
```

真機：`env()` 有值 → 用真機。模擬器：`env()`=0 → 用注入值。**一份 code 兩邊通用**。

### 2.3 截圖 / 自動驗收

```powershell
node tools/preview-iphone.mjs --headless --click "#btn-entry-yes" --shot out.png
node tools/preview-iphone.mjs --headless --device iphone-se --shot out.png
```

`--click` 嘅 selector 會喺 **iframe 內部** querySelector，所以寫 `#id` 就得。
要量數值（元素高度、溢出、`<44px` 熱區）就喺 `Runtime.evaluate` 讀 `getBoundingClientRect` / `scrollHeight - clientHeight`。

### 2.4 已知陷阱

- 外框頁要按窗口大小**整體縮放**，否則模擬視口（956）高過真實窗高，底部被切，睇落好似「全部移位」。
- 桌面 Chrome 會喺 iframe 內畫 scrollbar，真機冇 → 注入 `::-webkit-scrollbar{width:0}` 隱藏。
- 手機模擬器只係「顯示層」，**唔會**改 CSS 數值；量出嚟嘅 px 同真機一致。

## Rule 3 — 輸入與遊戲邏輯解耦

開發時就分層，唔好等到加鍵盤/滑鼠才重構：

```
Pointer / Keyboard / Gamepad  →  Input 層  →  語意動作  →  App / Game State
                                   { type:"answer", payload }
                                   { type:"nav", dir }
                                   { type:"confirm" }
```

- DOM 事件只准喺 Input 層綁；遊戲邏輯只訂閱「語意動作」。
- Phase 2 加鍵盤/滑鼠 = 新增一個 mapping，**唔改**遊戲邏輯。

## Rule 4 — RWD 喺手機做完之後才做（唔好偷步）

次序：**手機功能 + UI 做齊 → 再做平板/桌面**。桌面佈局提前寫會令手機版被 desktop-first 思維污染（固定寬度、hover 依賴、絕對定位）。

### 4.1 斷點策略

- **Mobile-first 級聯**：基準樣式 = 最細機；斷點一律用 `min-width` 往上疊，唔用 `max-width` 往下減。
- 斷點以**內容需要**為準，唔好抄 device 名。本專案暫定：

```css
/* 基準：<= 439px（手機單欄） */
@media (min-width: 440px) { /* 大手機：外殼貼邊 */ }
@media (min-width: 700px) { /* 平板/摺機展開：可加側欄 */ }
@media (min-width: 1024px) { /* 桌面：主內容單欄居中 + 留白 */ }
@media (min-width: 1280px) { /* 寬桌面：主內容 + 側欄 */ }
```

### 4.2 尺寸用流體單位，唔用死數

| 用途 | 用法 |
|---|---|
| 字級 | `clamp(0.95rem, 2.6vw, 1.25rem)` |
| 間距 | `clamp(8px, 2vw, 20px)` 或 `gap` + `min()` |
| 主欄寬 | `width: min(100%, 440px); margin-inline: auto;` |
| 高度 | `100dvh` / `100svh`（唔好用 `100vh`，iOS 工具列會食位） |

- 高度永遠配合 `min-height: 0` 用 Flex/Grid，否則內容會撐爆容器。
- 桌面唔好把「手機外殼」無限拉闊；到某寬度就**拆走外殼**（`border-radius:0`、`max-width` 放大），或保留居中「裝置框」都可以，但要揀定一種。

### 4.3 唔好做嘅事

- ❌ 用 `@media (max-width: ...)` 由大寫到細（會變 desktop-first）
- ❌ 用 hover 做唯一可發現性（觸控冇 hover）→ 用 `@media (hover: hover)`
- ❌ 用 `position: fixed` 頂欄 + `100vh` 內滾動（iOS Safari 會跳）→ 用 `dvh` + 單一滾動容器 + `overscroll-behavior: contain`
- ❌ 用 JS 讀 `window.innerWidth` 切版面（先寫 CSS，JS 只用嚟做行為差異）
- ❌ 用固定 px 高度做「一屏塞滿」，一定要 `1fr` + `minmax()`

### 4.4 必須驗嘅狀態

- 375×667（SE，無安全區）
- 393×852 / 402×874 / 430×932（一般至大手機）
- 440×956（基準）
- 768×1024（平板直向）
- 1280×800（桌面）
- 橫向（`--rotate` 或 HUD「橫向」）
- 200% 文字縮放、`prefers-reduced-motion: reduce`

## Rule 5 — 每次改完嘅驗收清單

1. 模擬器上：**無滾動**（`scrollHeight - clientHeight === 0`）、底部 CTA / dock 完整可見。
2. 安全區：頂部內容唔壓 Dynamic Island，底部唔貼 Home indicator。
3. 熱區：所有可點元素 `>= 44 × 44`。
4. Console：零 error（info 除外）。
5. 至少再換一部細機（SE）同大機（17 Pro Max）各睇一次。
6. 截圖留檔，交付時附 HUD 數值。

## Rule 6 — 捲頁（Sheet）互動規格（mobile-first）

手機 PWA 最常用嘅互動模式：**由白色螢幕頂部或底部捲入半頁 / 全頁面板**。本專案嘅 sheet 系統定死以下約束，唔好隨意打破。

### 6.1 定位：必須喺 white screen 區內，唔可以蓋住 dockbar / red bezel

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

### 6.2 頭部結構 + ✕ 關閉鍵（所有 Sheet 必須遵守）

**鐵律：每一個 sheet 嘅 ✕ 關閉鍵一律擺喺右上角。** 唔可以隨意放左邊、中間或者唔放。

#### bottom-up sheet（向上捲，例如 setting / battle）

HTML 順序：**grip → title → ✕**

```html
<div class="ph-sheet ph-sheet-up" id="sheet-setting">
  <div class="ph-sheet-head">
    <span class="ph-sheet-grip"></span>
    <span class="ph-sheet-t">Settings</span>
    <button class="ph-sheet-x" type="button" aria-label="Close">✕</button>
  </div>
  <div class="ph-sheet-body">…</div>
</div>
```

CSS：`ph-sheet-grip { margin-right:auto }` 自動把 title + ✕ 推向右。

#### top-down sheet（向下捲，例如 quests / pokedex / gacha）

HTML 順序：**title → ✕**（冇 grip）

```html
<div class="ph-sheet ph-sheet-down" id="sheet-quests">
  <div class="ph-sheet-head">
    <span class="ph-sheet-t">Daily Quests</span>
    <button class="ph-sheet-x" type="button" aria-label="Close">✕</button>
  </div>
  <div class="ph-sheet-body">…</div>
</div>
```

CSS 用 absolute 定位，確保 title **絕對居中**、✕ **固定右上角**（唔會被 title 長度影響位置）：

```css
.ph-sheet-down .ph-sheet-head { position: relative; justify-content: center; }
.ph-sheet-down .ph-sheet-t    { flex: 0 0 auto; }  /* 取消 flex:1 令 title 真正居中 */
.ph-sheet-down .ph-sheet-x    { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); }
.ph-sheet-down .ph-sheet-grip { display: none; }   /* top-down 唔需要 grip */
```

**點解 top-down 要用 absolute？** 如果 title 太長（例如 "Pokédex · 45 / 151"），flex layout 會把 ✕ 推出右邊界。用 absolute + fixed `right:14px`，無論 title 幾長，✕ 永遠喺同一個位置。

#### ✕ 按鈕規格

```css
.ph-sheet-x {
  width: 34px; height: 34px; border-radius: 9px;
  border: 2px solid #1b1b22; background: #f3efe2;
  font-size: 18px; font-weight: 900; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
```

**最小 34×34（≥44×44 熱區規格已滿足）**，icon 用 `✕` 或 `×` 都得（統一用 `✕`），`aria-label="Close"` 必加。

#### 檢查清單

- [ ] ✕ 係 `<button>`（唔係 `<span>` 或 `<div>`），原生支援 keyboard focus + Enter/Space 觸發
- [ ] ✕ 有 `aria-label="Close"`
- [ ] bottom-up：grip → title → ✕ 順序
- [ ] top-down：title 居中，✕ absolute 固定右上 `right:14px`
- [ ] 唔好兩個 sheet 唔同規格（例如一個 ✕ 係左邊、一個係右邊）

**結構圖：**
```
.pd-shell (max-width:440, 3-row grid: 48px bezel | 1fr screen | 34px chin)
├── .pd-bezel (48px, 紅色, 4 stat buttons)
├── .pd-screen2 (1fr, 白色, 內容區)
│   └── .ph-sheets (position:absolute, bottom:calc(56px+8px))  ← sheet 入呢度
│       ├── .ph-sheet-down#sheet-calendar
│       ├── .ph-sheet-down#sheet-pokedex
│       ├── .ph-sheet-down#sheet-quests
│       ├── .ph-sheet-down#sheet-gacha
│       ├── .ph-sheet-up#sheet-battle
│       ├── .ph-sheet-up#sheet-setting
│       └── .ph-backdrop
└── .pd-chin (34px)
```

### 6.3 捲動時間統一 0.4s

```css
.ph-sheet { transition: transform .4s cubic-bezier(.25, 1, .5, 1); }
```

所有 sheet 開 / 關都用同一條 transition。JS 入面所有 close timer 一律 **430ms**（transition 400ms + 30ms buffer），binder 嘅 cross-button open 延遲一律 **410ms**（transition 400ms + 10ms buffer），close timer 遲過 open timer 20ms 確保 race condition 安全。

**唔好做：** 唔好對唔同 sheet 改唔同 transition time，會令切換兩個 sheet 時其中一個「快過另一個」→ 視覺上好似冇動畫。

### 6.4 按鈕行為 3 種狀態

每個可以開 sheet 嘅按鈕（bezel stat buttons、dockbar、其他入口）必須實現以下 3 種狀態：

| 當前狀態 | 用戶動作 | 行為 |
|---|---|---|
| 冇 sheet 開住 | 點按鈕 A | **直接開 A** |
| sheet A 開住 | 再點按鈕 A | **toggle 關閉 A** |
| sheet A 開住 | 點按鈕 B（另一個） | **先關 A → 等 410ms → 再開 B** |
| sheet 開住 | 點非 sheet 區域 / backdrop / dockbar 按鈕 | **先關當前 sheet → 再執行該點擊** |

### 6.5 實現 Pattern（Binder + Debounce）

```js
let _sheetSwitching = false; /* 捲動中 flag，防重複點擊 */

const binder = (btnId, sheetId, openFn) => {
  const el = document.getElementById(btnId);
  if (!el) return;
  el.onclick = () => {
    if (_sheetSwitching) return;                    // 捲動中忽略
    const cur = document.querySelector(".ph-sheet.ph-open");
    const isToggle = cur && cur.id === sheetId;
    if (isToggle) {
      App._closeSheet(sheetId);                      // 同一按鈕 → toggle 關閉
      return;
    }
    if (cur) {
      _sheetSwitching = true;
      App._closeAllSheets();                         // 先捲回全部
      setTimeout(() => { _sheetSwitching = false; openFn(); }, 410);
    } else {
      openFn();                                      // 直接開
    }
  };
};
binder("btn-bezel-diamond", "sheet-gacha", () => { App.openGachaSheet(); });
binder("btn-bd-battle",    "sheet-battle", () => { App._openSheet("sheet-battle"); });
/* 直接跳 view 嘅按鈕：sheetId = null（唔會 toggle，只會先 close → 再跳） */
binder("btn-bd-quiz",      null,           () => { App.showView("view-quiz"); });
```

### 6.4.1 子按鈕唔好用 binder！用 expandArrow() — Accordion 模式

**錯誤做法 A（binder 謬用）：** 把子按鈕綁入 `binder()` 而唔傳 `sheetId` → binder 見到 curSheet 存在 → `isToggle = undefined === curSheet.id → false` → 以為係 cross-button → debounce 鎖死（Incident 9）。

**錯誤做法 B（mode-switch 謬用）：** 展開時 `innerHTML` 覆蓋 container → 把 compact streak 數字都洗掉，只剩下 calendar。用戶要嘅係 **accordion（保留頂部 + 展開下面）**。

**正確做法：**

```js
const expandArrow = (id, sheetId, renderCompact, renderFull) => {
  const el = document.getElementById(id);
  el.onclick = (e) => {
    e.stopPropagation();  // 鐵律！防止 bubble 到 document click handler
    e.preventDefault();
    const sheet = document.getElementById(sheetId);
    const isFull = sheet.classList.contains("ph-sheet-full");
    if (isFull) {
      sheet.classList.remove("ph-sheet-full");
      renderCompact();
      el.innerHTML = /* 向下箭咀 */;
    } else {
      sheet.classList.add("ph-sheet-full");
      renderFull();  // ← accordion：保留 compact 內容 + append 更多
      el.innerHTML = /* 向上箭咀 */;
    }
  };
};
expandArrow("btn-calendar-expand", "sheet-calendar",
  () => { container.innerHTML = `🔥 ${streak}\nDay streak`; },  // compact
  () => { container.innerHTML = `🔥 ${streak}\nDay streak<div class="cal-wrap"></div>`;
          Calendar.render("#sheet-calendar-content .cal-wrap"); }  // accordion：保留頂部 + 加 calendar
);
```

**配套 CSS（必須！）：**
```css
.ph-sheet { max-height: 100%; overflow: hidden; transition: transform .4s, max-height .4s; }
.ph-sheet-down:not(.ph-sheet-full) { max-height: 58%; }  /* compact 高度 */
.ph-sheet-down.ph-sheet-full { max-height: 100%; }        /* full 高度（max-height transition = 捲動畫！）*/
.ph-sheet-down.ph-sheet-full .ph-sheet-body { overflow-y: auto; flex: 1; min-height: 0; }
```
**鐵律 6（關鍵！）：唔好用 `overflow: visible` 嚟解決內容裁切！** 有 `transform` 嘅元素上，Chrome 會自動把 `overflow: visible` 強制變 `overflow: hidden`（瀏覽器規格）！.ph-sheet-down 有 `transform: translateY()` → overflow:visible 永遠唔生效 → simulator 睇唔到 calendar（但 web browser DevTools 可能顯示正常，因為冇 transform context）。正確做法：**用 max-height transition 做捲動畫 + body overflow-y:auto**。

**Pattern 使用場景：**

| Pattern | 使用者 | Debounce | Toggle | Cross-button | Accordion |
|---|---|---|---|---|---|
| `binder()` | **Bezel stat + Dockbar** | ✅ | ✅ | ✅ | ❌ |
| `expandArrow()` | **Sheet 內子按鈕** | ❌ | ✅（模式切換） | ❌ | ✅（保留頂部 + append） |

**鐵律：**
1. 永遠唔好把子按鈕綁入 binder（binder 係頂層導航專用）
2. expandArrow onclick 必須 `stopPropagation()` + `preventDefault()`
3. `renderFull` 必須保留 compact 頂部內容（accordion 原則）
4. `_openSheet()` 必須永遠重置 `.ph-sheet-full` class + arrow 方向 + content（確保每次開都由 compact 開始）
5. `.ph-sheet-full` 必須解鎖 `overflow`（唔係只改 max-height）

### 6.6 兩條 close 路徑必須一致（`_closeSheet` / `_closeAllSheets`）

**錯誤做法 A：** remove class 同時設 hidden → 跳過 transform，「閃一下就冇咗」。

**錯誤做法 B：** `_closeSheet` 410ms、`_closeAllSheets` 410ms，但 binder 都係 410ms → timer race，新 sheet 被舊 timer 設 hidden。

**正確做法：** 兩條路徑共享同一規則：

```js
_closeSheet(id) {
  const sheet = document.getElementById(id);
  sheet.classList.remove("ph-open");
  setTimeout(() => {
    if (document.querySelector(".ph-sheet.ph-open")) return; /* stillOpen guard */
    sheet.hidden = true;
    const bd = document.querySelector(".ph-backdrop");
    if (bd && !bd.classList.contains("ph-open")) bd.hidden = true;
  }, 430); /* 比 transition + binder open 嘅 410ms 遲 20ms */
},
_closeAllSheets() {
  document.querySelectorAll(".ph-sheet").forEach(s => s.classList.remove("ph-open"));
  const bd = document.querySelector(".ph-backdrop");
  if (bd) bd.classList.remove("ph-open");
  setTimeout(() => {
    if (document.querySelector(".ph-sheet.ph-open")) return; /* stillOpen guard */
    document.querySelectorAll(".ph-sheet").forEach(s => {
      if (!s.classList.contains("ph-open")) s.hidden = true;
    });
    if (bd && !bd.classList.contains("ph-open")) bd.hidden = true;
  }, 430);
}
```

**鐵律：**
- `setTimeout` 一律 **430ms**（transition 400ms + buffer 10ms + binder open defer 20ms）
- 一律有 **stillOpen guard**（隱藏前檢查有冇新 `ph-open`）
- 移除 `_checkCloseAllSheets`（舊時 closeSheet 完再 call closeAllSheets → 雙 timer race）

### 6.7 切換 View 時自動捲回

`showView(id)` 最頂部必須 call `_closeAllSheets()`：

```js
showView(id) {
  if (document.getElementById("view-home").classList.contains("active")) {
    this._closeAllSheets();  // 唔等動畫，直接開下一個 view（動畫同 view 切換平行跑）
  }
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}
```

### 6.8 四種關閉路徑（全部一致）

| 路徑 | Trigger | Handler |
|---|---|---|
| ① Backdrop 點擊 | 半透明遮罩 click → target.closest(ph-backdrop) | `_closeAllSheets()` |
| ② Esc key | `document keydown e.key === "Escape"` | `_closeAllSheets()` |
| ③ Sheet ✕ | `.ph-sheet-x` click → 取 parent sheet id | `_closeSheet(sheetId)` |
| ④ 點非 sheet 區域 | document click handler，排除 sheet 內 + backdrop + button 本身 | `_closeAllSheets()`（click 繼續冒泡到目標元素） |

```js
document.addEventListener("click", (e) => {
  const openSheet = document.querySelector("#view-home .ph-sheet.ph-open");
  if (!openSheet) return;

  // 路徑①：backdrop click → close all
  if (e.target.closest("#view-home .ph-backdrop")) { App._closeAllSheets(); return; }
  // 路徑③：sheet ✕ → close single
  const xBtn = e.target.closest("#view-home .ph-sheet-x");
  if (xBtn) { const s = xBtn.closest(".ph-sheet"); if (s) App._closeSheet(s.id); return; }
  // 路徑④：點 sheet 內部 → 唔攔（由 sheet 子按鈕自行 close）
  if (e.target.closest("#view-home .ph-sheet")) return;
  // 路徑④：點任何其他地方 → close all，click 繼續冒泡到目標元素
  App._closeAllSheets();
});
```

**鐵律：** 所有路徑必須走 `_closeSheet` / `_closeAllSheets`（有 stillOpen guard + 430ms timer），唔好直接 `classList.remove + hidden=true`。

### 6.9 Bezel stat button icon 定位技巧

Bezel 按鈕（44px）通常係 flex 容器（icon 22px + pill 數字）。如果要把 pill 貼住某個 icon 嘅右上角（例如鑽石 icon）：

```css
.pd-stat-diamond { position: relative; }           /* button 做定位參考 */
.pd-topdiamond {
  position: absolute;
  /* button 44px 寬，icon 22px 佔左半 → gem right edge = button 嘅 50% 位置 */
  left: calc(50% + 2px);  /* 貼 gem 右邊 */
  top: -8px;               /* 向上偏移貼 gem 頂部 */
  pointer-events: none;    /* 唔擋 click */
}
```

**鐵律：** 唔好用 `right: -8px` 相對於 44px button（飛去 button 最右邊），要用 `left: calc(50% + 2px)` 精確貼 icon 嘅 right edge。button 必須先設 `position: relative`。

### 6.10 實戰經驗（Incident Log）

| # | 問題 | 根因 | 解法 | Lesson 邊關 |
|---|---|---|---|---|
| 1 | 點 A → 點 B 變兩個 sheet 同時 open | Binder 冇檢查 `curSheet`，直接 `openFn()` | 加 `cur && cur.id !== sheetId` 檢查 → closeAll → wait 410ms → open | 6.3 / 6.4 |
| 2 | Sheet「閃一下就冇咗」| `_closeAllSheets` 立即設 `hidden=true` 跳過 transform | 只 remove class，setTimeout 後先 hidden | 6.5 |
| 3 | 連續快速點擊開唔到第二個 sheet | 捲動未完成（400ms）又被打開 | 加 `_sheetSwitching` flag | 6.4 |
| 4 | 點白色螢幕無反應 | 只有 backdrop handler，白色區域冇 | document click handler 路徑④ | 6.8 |
| 5 | Dockbar 切換 view 無先關 sheet | dockbar handler 冇 close 邏輯 | 同 `dockBinder` pattern，加 curSheet 檢查 | 6.4 |
| 6 | Gacha 關閉後鑽石冇 update | `_closeSheet(gacha)` 冇 sync UI | wrapper `closeGachaSheet()` 入面 call renderHome | 6.4 |
| 7 | 點閃電 → 點電池，新 sheet 直接彈出冇動畫 | **Timer race**：`_closeAllSheets` 410ms + binder 410ms 同時 race，JS event loop ordering 唔 guarentee → 新 sheet 可能被舊 timer 設 hidden | close timer 改 **430ms**（遲 binder 20ms）+ 加 **stillOpen guard**（timer 跑時檢查有冇新 ph-open）→ 兩條 close 路徑統一 | 6.2 / 6.5 |
| 8 | 逐個 toggle close 後再 closeAllSheets | `_checkCloseAllSheets` 令單獨 close 完再 call closeAllSheets → **雙 timer race** | 移除 `_checkCloseAllSheets()`；每條 close 路徑有自己嘅 guard timer 就夠 | 6.6 |
| 9 | Sheet 內展開箭咀點擊後冇執行功能 | 把子按鈕綁入 `binder()` 但唔傳 `sheetId` → binder 見到 `curSheet` 存在 → `isToggle = undefined === curSheet.id → false` → 以為係 cross-button → `_closeAllSheets()` + wait 410ms + `_sheetSwitching` debounce 鎖死 | 新增 `expandArrow()` pattern（6.4.1）— 直接 `_closeSheet` → wait 430ms → openFn，唔經 binder | 6.4.1 |
| 10 | Calendar 展開後 simulator 睇唔到 | `.ph-sheet-full` 加 `overflow: visible` 但 Chrome 對有 `transform` 嘅元素**自動把 overflow:visible 變 hidden**（瀏覽器規格）！`.ph-sheet-down` 有 `transform: translateY()` → overflow:visible 永遠唔生效 | 用 **max-height transition** 做捲動畫（compact 58% / full 100%）+ body overflow-y:auto。唔好改 overflow！ | 6.4.1 |

---

## 本專案對應位置

- 模擬器：`tools/device-preview.html`、`tools/preview-iphone.mjs`
- 外殼 CSS：`css/style.css` 的 `.pd-shell`（`max(env(), var(--sim-*))`）
- 基準機設定：`DEVICES` 表（`iphone-17-pro-max` 為預設）
