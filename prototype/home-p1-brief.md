# Home P1 原型任務簡報（可整份貼俾 agent）

> 用法：把本檔「任務正文」一節整段複製俾 agent。「已拍板決策」同「已知陷阱」兩節係背景，
> 唔好刪——刪咗 agent 會重犯同一批錯。

---

## 任務正文（直接複製）

在 `prototype/` 新增單檔 `home-p1.html`（Home 原型）。

**約束**：唔准改任何正式檔、唔准升版本、唔准註冊 sw、零外部依賴、必須能 `file://` 離線打開。

### 參數

`?frame=A|B&ia=console|hero&hud=1&sim=empty|loading|offline|kb`

預設 `frame=A`、`ia=console`。`sim` 可疊加。另備 `?reset=1`（清 reload 計數）、
`?json=1`（供 headless 抽取 HUD JSON）。

### 外殼（兩個 frame 共用）

- `fixed`、`100dvh`、`max-width 430` 居中
- Grid 五列：`safe / 48 / 1fr / 34 / safe`，全列機身紅 `#e03a32`
- 左右側條 6px、屏幕玻璃圓角 16、黑框 3、padding 12
- **A 上框**：鏡頭 30（左 16）、精靈球 24（右 16）、接縫 2.5px `#8a1712`
- **B 上框 76**：鏡頭 34、三顆 LED、球 28

### Console+ 版面

1. **頂 dock**（取代 StatusStrip）：四個 icon + 右側數字，由左至右
   Dex `45/151` · 連續閃電 `12` · 鑽石 `120` · 能量 `3/5`
2. **Signature 卡（不可移除）**：sprite 120、名稱 `Squirtle`、稀有度 badge `Common`、
   `Lv 1` + 星、`Health 100/100 · Decay —50 at 15:00 HKT`、`EXP 0 / 9 to next Lv.` + 進度條
3. **TodayStrip 44**：`streak 12 · quests 3/5`（無資料時整條隱藏）
4. 彈性空白只出現在 TodayStrip 與 CTA 之間
5. **CTA 60 sticky**：文案固定 `START QUIZ (10 questions)`
6. **底部 dock 60 sticky 貼屏幕底**（iPhone dock 風格）：五格 icon-only、無文字
   `dashboard / quiz / quests / battle / setting`

### Sheet

- **由下向上捲（bottom-up）**
  - Battle：Leaderboard / Friends / Start Battle（icon + 文字）
  - Setting：基本設定（名字頭像 / 音量 / Reset）· 學習設定（Curve Mode）·
    題目導入（Add Sentence / Add Picture / Import CSV / View My Questions / Create Your Own）·
    關於（Copyright & Disclaimer / Version）
- **由上向下捲（top-down）**
  - Rare Pull（大頁）、Energy bar（細頁）、Streak 月曆（細頁）、Pokédex 收集格（細頁）
- 動效 280ms `cubic-bezier(.25,1,.5,1)`；backdrop 变暗；Escape 亦要關

### Hero 變體（保持舊樣，唔上 dock）

夥伴區 220（sprite 120）、CTA 60、底欄 56（Dex / Battle / Quests / More）

### 硬性禁止（違反即退件）

- shell / 外殼唔准用 `transform`
- 唔准用 `div` 扮 button（全部原生 `<button>`）
- 唔准 `filter` / `backdrop-filter` blur（硬陰影 `box-shadow` blur=0 可）
- 唔准寫 `100vh`（用 `100dvh`）
- 唔准用任何 emoji 做 icon（全部 inline SVG）
- 唔准出現兩個主行動

### HUD（`?hud=1`）

顯示並可 Copy JSON：視口尺寸、dvh 實測、四邊 safe inset、`scrollHeight−clientHeight`、
滑動次數、下拉最大距離 / reload 次數、首次 Start 點擊時間、誤觸數、`<44px` 互動元素清單、
FPS、CLS、variant、UA、時間戳。

### 固定 mock

`Ash / Pikachu Lv12 / EXP 340/500 / 鑽石 120 / streak 12 / 任務 3/5 / 好友 2 / Dex 45/151`
另加 Signature 用：`Squirtle Lv1 / Common / HP 100 / EXP 0-9`

### 驗收（自己跑，唔好交截圖就話完成）

375×667：

- 首屏滑動 0
- `scrollHeight − clientHeight = 0`
- `<44px` 互動元素 = 0
- 下拉 10 次 reload = 0
- 無元素被動態島／手勢條遮住
- `sim=kb` 時 CTA 仍在鍵盤上方可點

### 交付

檔案、每變體 7 張截圖（default / hud / empty / loading / offline / kb / 寬 430）、
HUD JSON ×3、偏離記錄（每項寫明「規格未定，我的詮釋」）、5 分鐘真機測試腳本。

---

## 已拍板決策（唔使再問，照做）

| 項目 | 決定 |
|---|---|
| 鑽石 `💎` | 用 SVG 鑽石，唔用 emoji（emoji 禁令優先於 mock 字符） |
| `<44px` 計法 | 只計互動元素（`button/a/input`）；badge、EXP bar 等指示器唔計 |
| Frame B 擺位 | 規格只俾尺寸 → LED 跟鏡頭右、球靠右 |
| Signature 位置 | 取代 StatusStrip，成為頁面主體 |
| 舊 6 格 Grid | 拆散入 dock / sheet（Dex→頂 dock；Leaderboard/Friends/Battle→battle sheet；Calendar→streak sheet；Quests→底 dock） |
| `sim=empty` | 隱藏 TodayStrip + 全部 badge |
| `sim=kb` | 外殼壓縮 300px 模擬鍵盤；放行滾動；CTA 保持 sticky 可見 |
| Skeleton | `background-position` shimmer（非 opacity 脈動），`prefers-reduced-motion` 必停 |
| reload 計數 | `navigation.type` + sessionStorage 累加 |
| Hero 變體 | 保持舊樣，唔上 dock / sheet |
| 按壓動效 | 120ms `cubic-bezier(.25,1,.5,1)`，`prefers-reduced-motion` 停 |

---

## 已知陷阱（agent 一定會踩，提前講明）

1. **headless `--window-size` 出唔到 375 寬**
   new headless 有最小視窗寬（≈516），兼扣窗框（寬 −16 / 高 −95）。
   `--force-device-scale-factor` 只放大渲染，唔改 CSS 視口。
   → 必須用 CDP `Emulation.setDeviceMetricsOverride { width:375, height:667, deviceScaleFactor:2, mobile:true }`。
   現成參考：`prototype/home-p1/capture.mjs`（Node ≥22 內建 WebSocket，零依賴）。

2. **截圖見到「右側溢出」可能係假象**
   先讀 JS 實測 `innerWidth` 再斷症，唔好信截圖第一印象（500px 視口 + 430 max-width 居中會造成黑邊）。

3. **彈出元素會撐爆固定高度預算**
   offline 提示條一出現，Grid 就會溢出 → 用 CSS 變數補償（例：`--fixed`），唔好寫死。

4. **sticky 底層元素會被卡內 badge 透出**
   sticky CTA / dock 要 `z-index` 高過卡內 badge。

5. **CTA 重複顯示**
   Console+ 與 Hero 各有一個 CTA，必須各自標 `.c-only` / `.h-only`，否則兩個一齊出。

6. **按壓動效漏 `transition`**
   只寫 `:active{transform}` 冇 transition = 即時跳，量唔到 120ms 物理回饋。

---

## 5 分鐘真機測試腳本（iOS Safari → 加至主畫面 PWA）

0. **準備（30s）**：開 `home-p1.html`；四個書籤 A/console、A/hero、B/console、B/hero，各加 `&hud=1`。
1. **首屏零滾動（60s）**：逐變體單指狂掃屏幕 → HUD `screenDiff=0`、`scroll count=0`；
   目視 CTA 完整貼底、無元素被動態島／手勢條遮擋（HUD `safe` 四邊應 >0）。
2. **熱區抽查（45s）**：逐個點頂 dock 四格、Signature、五格底 dock、CTA →
   全部有可見 press 回饋；HUD `<44px` 保持 0；點空白處 → `misTaps` +1。
3. **Sheet 巡檢（60s）**：頂 dock 四格向下捲出、底 dock battle/setting 向上捲出 →
   方向正確、backdrop 变暗、點 backdrop 關閉、Escape 關閉、sheet 內滾動唔透出。
4. **狀態巡檢（45s）**：`sim=empty`（TodayStrip 消失、版面唔塌）→ `sim=loading`（skeleton、CTA 暗）→
   `sim=offline`（提示條、零滾動）→ `sim=kb`（鍵盤升起、CTA 仍在鍵盤上方可點）。
5. **下拉刷新（30s）**：頂部用力下拉 10 次 → HUD `maxDist` 有讀數、`reload` 必須 =0（先 `?reset=1`）。
6. **Start 量測（30s）**：重開頁即秒點 Start → HUD `start` 有 ms 時間戳；`Copy JSON` 可用。

**退件條件（任一）**：預設態 `screenDiff≠0`、`reload>0`、`<44px>0`、CTA 被鍵盤／手勢條遮住、見到 emoji icon。
