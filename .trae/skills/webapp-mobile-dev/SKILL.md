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

---

## 本專案對應位置

- 模擬器：`tools/device-preview.html`、`tools/preview-iphone.mjs`
- 外殼 CSS：`css/style.css` 的 `.pd-shell`（`max(env(), var(--sim-*))`）
- 基準機設定：`DEVICES` 表（`iphone-17-pro-max` 為預設）
