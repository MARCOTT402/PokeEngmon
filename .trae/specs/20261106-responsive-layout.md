# Spec：響應式版面（電腦／平板／手機）— 第一階段

- 日期：2026-11-06
- 狀態：P1 Done（2026-11-06，未 commit）；P2／P3 未開始
- 範圍：第一階段 = 外殼斷點系統 + 主頁 + 主頁 sheets + display-window overlays 對齊 + 答題 + 結算 + 轉機提示
- 後續階段（另開 spec）：P2 圖鑑／育成／Friends／Leaderboard／日曆／Quests；P3 扭蛋／捕捉（Three.js）／戰鬥／背包精修

---

## 1. 背景與問題

現況（2026-11-06 實測）：

| Viewport | 現況 |
|---|---|
| 375×667、440×956 | 直向 Pokédex 紅框，OK（Rule 30 基準） |
| 820×1180（iPad 直） | 440px 機居中，兩邊各 190px 空位 |
| 1180×820（iPad 橫） | 440px 機居中，只用 37% 闊度 |
| 1366×640（細 laptop） | 440px 機居中，只用 32% 闊度，白螢幕區好矮 |
| 1440×900（桌面） | 440px 機居中，只用 30% 闊度 |

根源：`.pd-shell { max-width: 440px }`，而所有 display-window overlay（`#view-quiz-setup` 等）、`#gacha-scene-b`、modal、toast 都寫死 `max-width: 428px` + `left:50%; translateX(-50%)`。答題 ≥600px 已經獨立全螢幕；背包／戰鬥有自己嘅橫向紅框（`.bl-frame`，956×440 等比縮放）。

## 2. 目標

1. 用戶主要場景（電腦、平板、手機）都用得盡畫面，達商用 app 水準。
2. 保留 Pokédex 紅框世界觀：大屏係「橫向 Pokédex」，唔係普通網頁 sidebar。
3. 版面只按**可用闊度／高度**決定，唔按裝置或 UA 判斷（Split View、細視窗自動用啱版面）。
4. 唔改任何遊戲邏輯、RPC、state；純 CSS + 少量 layout JS。

非目標：唔重做視覺風格；唔加新功能；唔改 Three.js 場景內部渲染（P3 處理）。

## 3. 斷點系統

| 代號 | 條件 | 典型裝置 | 版面 |
|---|---|---|---|
| `phone` | width < 700 | 手機直向、iPad Split View 窄欄 | 現有直向 Pokédex（不變，440 基準） |
| `tablet` | 700 ≤ width < 900 | iPad 直向 744–834 | 放大直向 Pokédex（shell 最闊 640） |
| `wide` | width ≥ 900 **且** height ≥ 560 | iPad 橫向、laptop、桌面 | 橫向 Pokédex 雙欄 |
| `phone-land` | landscape **且** height < 500 **且** `pointer: coarse` | 手機橫向 | 只有戰鬥／背包／捕捉可用，其他畫面顯示「請轉返直向」 |

- `phone-land` 要求 `pointer: coarse`（輸入能力，唔係裝置判斷）：桌面視窗拉到好矮唔應該彈「請轉返直向」，改按闊度落 `tablet`／`phone`。
- 1366×640 等矮 laptop 屬 `wide`（640 ≥ 560）。width ≥ 900 但 height < 560（例如縮細嘅桌面視窗）用 `tablet` 規則避免雙欄過矮。
- 實作：CSS `@media` 為主；JS 只喺需要時讀同一組條件（統一放 `App.layout()`，回傳 `"phone" | "tablet" | "wide" | "phone-land"`，並喺 `<html data-layout>` 標記，resize／orientationchange 更新）。CSS 同 JS 嘅斷點數值要寫成同一處註解對照，避免漂移。

## 4. 外殼幾何（核心改動）

將所有「寫死 440／428」改為 CSS 變數，由斷點設定：

```
:root {
  --frame-w: 440px;                 /* shell 最大闊度 */
  --frame-screen-left / --frame-screen-w   /* overlay 對齊用（取代 left:50% + max-width:428） */
  --frame-screen-top / --frame-screen-bottom  /* 保留現有算式（Rule 43） */
}
```

- `phone`：`--frame-w: 440px`，行為同現況 100% 一致（回歸基準）。
- `tablet`：`--frame-w: min(640px, 100vw)`；bezel 數值、dock、CTA 按比例放大（字級 +1 級、觸控目標 ≥ 48px）。
- `wide`：`--frame-w: min(1240px, 100vw - 48px)`，紅框四邊留 24px 背景，四角 18px 圓角（唔再貼死頂／底）；高度 `min(100dvh - 48px, 900px)` 垂直置中。超大螢幕（≥1600）唔再加闊，避免行長過長。
- 所有 display-window overlay、`#gacha-scene-b`、`#gacha-inspect`、`.modal-backdrop`、`.toast` 改用 `--frame-screen-*` 變數定位（Rule 39／43／46／47 嘅圓角、黑邊、z-index、scaleY exit 全部保留）。

## 5. `wide` 雙欄主頁

```
┌──────────────────────── red frame ────────────────────────┐
│ deco: lens · brand · ball                                   │
│ bezel: streak · 💎        (同一行，左右分佈)     dex · energy │
│ ┌─ 左欄 360–400px ─┐ ┌──────── 右欄（flex:1）────────────┐ │
│ │ 拍檔卡 ph-sign    │ │                                     │ │
│ │ ph-today / Gym    │ │  sheet／overlay 內容區               │ │
│ │ START QUIZ        │ │  （Pokédex、Streak、Quests、          │ │
│ │ bottom dock 4 掣  │ │   Settings、Battle、Gacha、          │ │
│ └──────────────────┘ │   Friends、Leaderboard、選題、結算）  │ │
│                      └─────────────────────────────────────┘ │
│ chin: ◉ Home                                                │
└─────────────────────────────────────────────────────────────┘
```

- 左欄 = 現有 `.pd-screen2` 主頁內容（拍檔、CTA、dock），固定闊度 `clamp(340px, 30%, 400px)`。
- 右欄 = 新增 `.pd-screen-r`（第二塊白螢幕，同樣 6px margin、黑邊、14–16px 圓角）。`.ph-sheets` 喺 `wide` 時搬入右欄（CSS grid 重排，**唔搬 DOM**，避免 Rule 67 類定位殘留；如必須搬，跟 Rule 67）。
- Sheet 行為：
  - `wide` 時 sheet 唔再上落滑入，改為右欄內容切換（淡入 150ms；`prefers-reduced-motion` 即時）。`.ph-sheet-down`／`.ph-sheet-up` 嘅 translateY 只喺 `phone`／`tablet` 生效。
  - 右欄冇開任何 sheet 時顯示**預設內容：Daily Quests**（待確認，見 §10-1）。
  - `ph-backdrop` 喺 `wide` 唔顯示（右欄係常駐面板，唔係 modal）。
  - 「點外面關 sheet」（Rule 17／40／60）喺 `wide` 停用對右欄嘅自動關閉 —— 點左欄唔會清走右欄；改為由 ✕ 返回預設內容。
  - `_closeSheet`／`_closeAllSheets` 兩條路徑（Rule 41）都要處理 `wide` 嘅「返回預設內容」。
- Display-window overlays（Friends、Leaderboard、Battle Menu、選題、結算、Gacha scene）喺 `wide` 對齊**右欄**（`--frame-screen-left/w` 指向右欄），左欄拍檔同 dock 保持可見可撳；`binder`／`dockBinder`（Rule 47 Bug 2、Rule 52）要支援「右欄已有 overlay 時直接替換」。
- 下巴 Home 掣：`wide` 時 = 關閉右欄 overlay／sheet，返回預設內容。

## 6. `tablet` 放大直向

- 結構同 `phone` 一樣（單欄），只係 `--frame-w` 放大到 640。
- 拍檔卡 sprite 放大、CTA 高度 64px、dock icon 28px；sheet 最大高度同現況比例。
- Overlay 跟 `--frame-screen-*` 自動變闊。

## 7. 答題／結算

- 答題：維持 ≥600px 全螢幕（現有設計，Rule 71／72／74 不變），但：
  - 內容欄最大闊度 `wide` 720px、`tablet` 600px 居中，避免 1440 闊時題目同鍵盤拉到成個畫面闊。
  - `wide` 有實體鍵盤時預設收起 App 鍵盤（`(hover:hover) and (pointer:fine)`），保留切換掣；觸控 laptop／iPad 仍顯示 App 鍵盤。（待確認，見 §10-2）
  - 圖片題左圖右答 grid（Rule 72 ≥900 橫向）沿用，驗收尺寸加 1366×640。
- 結算（`#view-settlement`）：`wide` 喺右欄顯示；分數圈＋stat 同錯題預覽改兩欄（右欄闊 ≥ 640 時）。

## 8. 轉機提示

- 戰鬥／背包／捕捉：「請轉橫手機」只喺 `phone`（width < 700）出；`tablet` 直向（820 闊）直接用橫向紅框等比縮放，唔再逼轉機。`bag.js` 嘅 `isPortrait()` 判斷改用 `App.layout()`。
- `phone-land`（手機橫向）：戰鬥／背包／捕捉正常；其他畫面顯示全屏「請轉返直向」提示（同背包提示同一視覺），唔蓋 toast（z-index 跟 Rule 46）。

## 9. 商用水準橫切要求（第一階段觸及嘅畫面）

1. 冇橫向 scroll：每個斷點 `document.documentElement.scrollWidth === innerWidth`。
2. 觸控目標 ≥ 44×44（`tablet` ≥ 48）。
3. `wide` 有 `:hover`／`:focus-visible` 狀態；`Esc` 關閉右欄 sheet／overlay（答題內 Esc 行為維持現狀）。
4. 字級用 `clamp()`，最細 12px；行長 ≤ 75ch。
5. `prefers-reduced-motion` 全部新動畫有 fallback。
6. Safe area：沿用 `max(env(), var(--sim-*), 下限)`（Rule 27／37），`wide` 唔使 safe-area。
7. 唔准用 UA／`navigator.platform` 判斷裝置。

## 10. 已確認決定（2026-11-06）

1. `wide` 右欄預設內容 = **Daily Quests**。
2. `(hover:hover) and (pointer:fine)` 時答題預設收起 App 鍵盤，保留掣可以再開。

## 11. 驗收

每個改動畫面喺以下尺寸量度＋截圖（Rule 26 用 CDP／Browser pane resize，Rule 30／37）：

| 尺寸 | 期望 layout |
|---|---|
| 375×667（safe-area 0） | phone，同改動前像素級一致 |
| 440×956 | phone，同改動前一致 |
| 820×1180 | tablet |
| 1180×820 | wide |
| 1366×640 | wide（矮） |
| 1440×900 | wide |
| 1920×1080 | wide（frame 封頂 1240） |
| 956×440 | phone-land |

檢查項：
- `getBoundingClientRect` 對比 overlay 同目標白螢幕區四邊差 0（Rule 43／45）。
- 冇橫向 scroll；console 冇 error。
- sheet 開關兩條路徑（✕、下巴 Home、dock 切換）喺 phone 同 wide 都正常（Rule 41／47／52）。
- 答題：`#quiz-scroll` `scrollHeight - clientHeight ≤ 4`，輸入格唔被鍵盤蓋（Rule 72）。
- `phone` 兩個基準尺寸截圖同改動前對比，冇回歸。

## 12. 風險

- **Sheet／overlay 狀態機最脆弱**（Rule 17、31、35、40、41、47、52、53、60 都係呢度嘅事故）。`wide` 改為常駐右欄會改變「點外面關」語義 → 要逐條 Rule 重驗。
- 寫死 428／440 嘅地方分散（style.css 15 處＋JS 可能有計算）→ 實作前先 grep `428|440` 全 repo 列清單。
- `phone` 必須零回歸：所有新規則包喺 `@media (min-width: 700px)` 或 `[data-layout=wide]` 入面，唔改 phone 嘅基礎規則。

## 13. P1 完成紀錄（2026-11-06）

- 實作：Task 0–11（見 plan）；新增 preop Rule 80–88。
- 同 spec 嘅偏差：
  - `phone-land` 加咗 `pointer: coarse`（桌面矮視窗唔當手機橫向）。
  - 答題闊度沿用 Quiz v2 原有規則（≥1024 內容 760；≥900 橫向圖片題 1040），冇改成 600／720；只加矮視窗（≥600×≤560）收細。
  - 結算兩欄加咗 `index.html` wrapper（`.settle-col`），phone 用 `display: contents`。
  - 手機 HUD 細字（9–11px）未改，保持手機零回歸。
- 已知未處理：
  - iPhone SE（375×667）文字題題目卡多 21px 要 scroll（輸入格同鍵盤見到）。
  - 手機同一 tick 連撳 3 個 sheet 掣會開 3 個 sheet（原有，真人做唔到）。
  - iPad 直向背包等比縮細，字偏細（P3）。
  - 下巴列高 46px，平板觸控標準 48px 差 2px。

## 14. P2／P3 題目清單（下一份 spec 用）

- P2（內頁精修，大屏右欄 818px 闊）：圖鑑格數同卡大細、Streak 月曆格偏大、育成（Pet）、Friends 列表雙欄、Leaderboard 闊版、Daily Quests 任務板雙欄、Settings 兩欄、錯題回顧（`#view-review`）喺 wide 嘅位置。
- P3（遊戲畫面）：扭蛋場景、捕捉（Three.js canvas 跟右欄）、戰鬥／背包喺 iPad 直向同大屏嘅比例同字級、PvP 前置頁。
