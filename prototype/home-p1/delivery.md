# Home P1 原型交付 v2（2026-11-03 10:36 UTC）

**v2 相對 v1 變動**：按 `home-p1-brief.md` 重寫 Console+ 版面（頂 dock / Signature 卡 / 底部 dock / Sheet 系統），修復頂 dock 熱區 <44px 同 kb 模式 CTA 被遮兩個硬傷。

## 交付物

| 項目 | 位置 |
|---|---|
| 原型單檔 | `prototype/home-p1.html` |
| 截圖 4 變體 × 7 | `prototype/home-p1/{A,B}-{console,hero}_{1..7}_*.png` |
| HUD JSON ×3 | `prototype/home-p1/hud_*.json` |
| 截圖/驗收腳本（重跑用） | `prototype/home-p1/capture.mjs`（`node capture.mjs`，需本機 Chrome） |

未改任何正式檔、未升版本、未註冊 SW、零外部依賴（可離線 file:// 開）。

## 參數

`?frame=a|b`（預設 a）· `?ia=console|hero`（預設 console）· `?hud=1` · `?sim=empty|loading|offline|kb` · `?reset=1`（清 reload 計數）· `?json=1`（headless 抽取用）

## 驗收結果（HUD 實測，375×667 @2x，headless Chrome 156）

| 指標 | A/console | B/hero | A/console kb | 標準 |
|---|---|---|---|---|
| viewport / dvh | 375×667 / 667 | 同左 | shellH 367 | ✓ |
| scrollHeight−clientHeight | **0** | **0** | 87（kb 放行設計內滾動） | 預設=0 ✓ |
| 滑動次數 | 0 | 0 | 0 | ✓ |
| <44px 互動元素 | **0** | **0** | **0** | ✓ |
| 下拉 180px × N | reload=**0** | reload=**0** | — | ✓ |
| 首次 Start 點擊 | 921ms 有記錄 | null（Hero 無 `#cta`，非 hard kill） | — | ✓ |
| 誤觸計數 | 有（合成測試=1） | 同左 | 0 | ✓ |
| FPS / CLS | 60 / 0 | 60 / 0 | 61 / 0 | ✓ |
| safe-area 四邊 | env() 探針實測回報（headless=0，需真機） | | | 上機讀數 |
| 鍵盤遮 CTA | — | — | CTA sticky 顯示、bottomdock 自動隱藏（截圖 6-kb） | ✓ |

## 設計變更（v2 由 brief 取代 M0/M1/M2 契約）

| 項目 | 契約（作廢） | v2 brief 決定 |
|---|---|---|
| Console+ 頂部 | StatusStrip 64px（sprite / 名 / 鑽石 / 齒輪） | **頂 dock 4 格**：Dex 45/151、連續 12、鑽石 120、能量 3/5 |
| 主體 | 2×3 Grid（Quests/Battle/Dex/Friends/Leaderboard/Gym） | **Signature 卡** 120px sprite（Squirtle Lv1 / Common / HP100-100 / EXP 0-9） |
| 底部 | TodayStrip 44px + CTA sticky | CTA 60 sticky 貼底 + **底部 dock 6 格 icon-only**（dashboard/quiz/quests/battle/setting） |
| Sheet | bottom sheet 一種 | **兩種方向**：bottom-up（Battle/Setting）+ top-down（Diamond/Energy/Calendar/Dex） |
| TodayStrip | 顯示 streak + quests | 保留 44px，Signature 卡之下、CTA 之上 |
| Hero 變體 | Hero-centric 220px 夥伴區 | 保留舊樣唔上 dock / sheet |

## v2 修復記錄（agent 出檔後人工修）

| # | 問題 | 修復 | 驗證 |
|---|---|---|---|
| F-1 | 頂 dock 4 格 `.td` 渲染高 30px，HUD `<44px>` 報 4 個 | `.td` 加 `min-height:44px` + `padding:6px 10px`；`.topdock` 加 `gap:4px` | HUD `<44px>` count → **0** |
| F-2 | `sim=kb` 時 CTA 被鍵盤完全遮住，底部 dock 同時顯示 | `.sim-kb .bottomdock{ display:none }`；shell bottom:300px，CTA sticky bottom:10px 自然貼鍵盤頂部 | 截圖 6-kb 顯示 CTA 完整可見 |
| F-3 | 頂 dock 格數冇統一高度，flex:1 分欄確保四格同寬 | `.td` 加 `flex:1; min-width:0;` | 四格渲染均勻 |

## 偏離 / 詮釋記錄

1. **💎120** → inline SVG 鑽石 + 數字（全檔零 emoji；emoji 禁令優先）。
2. **Frame B 擺位**：鏡頭 34 左 16、三 LED（8px 紅黃綠）跟鏡頭右側、球 28 右 16。
3. **Hero 變體**：保持舊結構，唔上 dock / sheet（Brief 明確區分）。
4. **「<44px 元素數」定義**：互動元素（`button/a/input`）渲染尺寸 <44px；badge / EXP bar / label 等非互動指示器唔計。
5. **sim=kb**：`#shell{ bottom:300px; height:auto }` 模擬鍵盤 resize；`.screen` 放行滾動；**`.bottomdock` 隱藏**，CTA sticky 自然貼鍵盤頂。
6. **sim=empty**：隱藏 TodayStrip + 全部 badge；Signature 卡保留（頁面主體）。
7. **sim=loading**：頂 dock / Signature / Tile 上 skeleton shimmer（`background-position` 動畫，無 blur/transform）；TodayStrip 視本地快取即時顯示。
8. **reload 計數**：`navigation.type==="reload"` + sessionStorage 累加（同 tab 跨 reload 保留）；`?reset=1` 清零。
9. **截圖管線**：`--headless=new --window-size` 有最小視窗寬（≈516）且扣窗框；改用 CDP `Emulation.setDeviceMetricsOverride`（375×667 @dsf2）。
10. **Sheet 動效**：280ms `cubic-bezier(.25,1,.5,1)`；backdrop `#00000066`；Escape / 點 backdrop 關閉；內部獨立滾動。
11. **禁 blur 詮釋**：無 `filter/backdrop-filter`；硬陰影 `box-shadow:0 3px 0`（blur=0）保留作卡片立體感。
12. **Hero CTA id**：Hero 變體 CTA id 非 `cta`（capture script 只在 console 變體 tap CTA）；非 hard kill。

## 已知限制

- iOS <16 及第三方 in-app browser 的下拉刷新無法 100% 封鎖；本檔以 `overscroll-behavior:none` + touchmove guard 處理，PWA 獨立模式為正解。
- safe-area 四邊 headless 環境恆為 0，需真機（動態島/手勢條）驗收。
- headless FPS 為桌面合成器讀數，僅供參考。
- Hero 變體 `firstStartClickMs: null`（無 tap 合成），非硬 kill。

## 5 分鐘真機測試腳本（iOS Safari → 加至主畫面 PWA）

0. **準備（30s）**：開 `home-p1.html`；四個書籤 A/console、A/hero、B/console、B/hero，各加 `&hud=1`。
1. **首屏零滾動（60s）**：逐變體單指狂掃屏幕 → HUD `screenDiff=0`、`scroll count=0`；目視 CTA 完整貼底、Signature 卡完整可見、無元素被動態島／手勢條遮擋（HUD `safe` 四邊應 >0）。
2. **熱區抽查（45s）**：逐個點頂 dock 四格、Signature 卡、TodayStrip、底部 dock 六格、CTA → 全部有可見 press 回饋；HUD `<44px` 保持 0；點空白處 → `misTaps` +1。
3. **Sheet 巡檢（60s）**：頂 dock 四格向下捲出（Dex/Energy/Streak 細頁，Diamond 大頁）；底部 dock battle/setting 向上捲出；方向正確、backdrop 变暗、點 backdrop 關閉、Escape 關閉、sheet 內滾動唔透出。
4. **狀態巡檢（45s）**：`sim=empty`（TodayStrip 消失、版面唔塌）→ `sim=loading`（skeleton、CTA 暗）→ `sim=offline`（提示條、零滾動）→ `sim=kb`（鍵盤升起、CTA 仍在鍵盤上方可點、bottomdock 隱藏）。
5. **下拉刷新（30s）**：頂部用力下拉 10 次 → HUD `maxDist` 有讀數、`reload` 必須 =0（先 `?reset=1`）。
6. **Start 量測（30s）**：重開頁即秒點 Start → HUD `start` 行有 ms 時間戳；`Copy JSON` 掣可複製全部指標。
7. **寬機交叉（30s）**：第二部機（≥390 寬）開 `frame=a&ia=console` → 頂 dock 四格均分、版面不爆。

**退件條件**（任一）：預設態 `screenDiff≠0`、`reload>0`、`<44px>0`、CTA 被鍵盤／手勢條遮住、見到 emoji icon。
