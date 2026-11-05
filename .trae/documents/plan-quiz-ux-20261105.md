# 答題系統 UI/UX 優化計劃（2026-11-05）

> 目標：手機／平板／電腦都有商用級學習 app 手感（參考級數：Duolingo、ePop）。
> 原則：**只改呈現同互動，唔改計分／SM-2／重排邏輯**（`Quiz.check()`、`_complete()`、`SM2.*` 行為不變）。
> Prototype：`tools/prototype-quiz.html`（純前端假資料，唔接 app state）。

## 1. 現況問題（由 code 睇到）

| # | 位置 | 問題 |
|---|------|------|
| P1 | `index.html` `#view-quiz` | 頂部只有 🏆 + 「1 / 10」文字 + ⚙，冇離開掣（要入 ⚙ 先退得），冇 combo／即時成就感 |
| P2 | `.progressbar` | 單條 bar，重排題（requeue）唔見；冇「答啱一題 bar 彈一下」嘅回饋 |
| P3 | `#quiz-feedback` | 答啱只係一行文字；答錯只閃紅框 1 秒＋「!」，用戶唔知下一步做咩 |
| P4 | 工具列 | Hint／Voice／Next／Pronounce／Submit 五粒掣兩套輪流 show/hide，主行動唔清楚；Submit 冇 disabled 狀態 |
| P5 | 鍵盤 `.qk-key` | 4 行（含數字行）佔高度，冇按鍵放大預覽、冇 Enter 鍵，⌫ 擠喺第 3 行 |
| P6 | 平板／電腦 | `#app max-width:520` + display-window 428px：iPad／桌面得中間一條窄柱，字細、留白浪費；桌面冇快捷鍵提示 |
| P7 | 結算 `#view-settlement` | 大數字 + 時間，冇準確度、combo、XP 動畫、錯題預覽，獎勵冇逐項 count-up |
| P8 | 動效／聲音 | 欠缺一致嘅 motion 系統（彈性、時長），冇 `prefers-reduced-motion` 處理 |

## 2. 設計方向

### 2.1 版面：「Focus mode」
- 答題時隱藏所有 home chrome，一個畫面只做一件事：**頂欄 → 題目卡 → 答案區 → 底部主行動掣**。
- 底部主行動掣（Check / Continue）固定喺拇指區，全寬、大（56px），未輸入時灰色 disabled。

### 2.2 頂欄
- 左：✕ 離開（確認對話框「Progress in this set will be lost」）。
- 中：**分段 progress bar**（每題一格；重排題喺尾加一格虛線「↻」），答啱嗰格彈一下＋光澤掃過。
- 右：🔥 combo 計數（連續無提示答啱 ≥2 先出現，3／5／10 有升級動畫）。⚙ 收入 ✕ 旁邊嘅 overflow。

### 2.3 題目卡
- 頂部 chip：題型（Articles: Basics）＋ 狀態（New／Last seen 3 days ago）。
- 句子字級：手機 22px、平板 28px、電腦 30px；空格用底線 cell，當前格有藍色底線＋閃爍游標，綠格有 ✓ pop。
- 圖片單字題：大圖卡＋獨立 🔊 圓掣（播緊有聲波動畫），慢速 🐢 播放掣。

### 2.4 回饋（最重要）
- **答啱**：底部升起綠色 feedback sheet（「Nice one!」＋ 下次複習時間 chip ＋ 🔊 Pronounce），主掣變「Continue」。卡片輕微彈、音效、`vibrate(15)`。
- **答錯**（標準模式邏輯不變：唔顯示答案、可以再試）：cell shake ＋ 紅色 sheet「Not quite — try again」＋ 「💡 Hint」次掣；一打字 sheet 自動收返。
- 用咗 hint 後答啱：sheet 用黃色「Correct — hint used · Review in 5 min」。
- 小學生模式 L1／L2 提示照舊，只係轉用新 sheet 顯示。

### 2.5 鍵盤（觸控）
- 3 行字母（QWERTY）＋ 底行 `' - ⌫ ✓`，數字行收入 `123` 切換（題庫基本冇數字）。
- 按鍵 pop-up 放大預覽、`vibrate(5)`、高度按螢幕自適應（手機 46px／平板 58px）。

### 2.6 響應式
| 斷點 | 版面 |
|------|------|
| < 600px（手機） | 單欄；自帶鍵盤固定底部 |
| 600–1023px（平板） | 內容柱 640px 置中，字級＋鍵盤放大；直向／橫向都得 |
| ≥ 1024px（電腦） | 內容柱 720px；用實體鍵盤，掣上顯示 `Enter` 提示，`Tab` = hint、`Esc` = 離開；hover 狀態 |

> ⚠️ 現有 quiz 係 display-window overlay（Rule 39/43/46/47，max-width 428px 對齊 `.pd-screen2`）。平板／電腦要 Focus mode 突破 428px，需要喺 ≥600px 時改用全螢幕 overlay —— 呢點要你拍板（見 §5 Q1）。

### 2.7 結算
- 序列動畫：分數圈 → 準確度／用時／最高 combo 三格 stat → 獎勵（💎、EXP、捕捉）逐項 count-up → 錯題預覽（最多 3 條，「Review all」入現有 `view-review`）。
- 10/10 有彩紙；主掣「Continue」、次掣「Lucky Draw」。

### 2.8 Motion／無障礙
- 統一 token：`--ease-spring`、`--dur-fast 120ms / base 220ms / slow 400ms`。
- `prefers-reduced-motion` 時關晒 shake／confetti，改用顏色變化。
- feedback sheet `aria-live="polite"`；所有掣 ≥44px；顏色之外都有 icon（✓ / ✕）。

## 3. 實作分期（prototype OK 之後）

| 期 | 內容 | 主要檔案 |
|----|------|----------|
| A | 頂欄（✕、分段 bar、combo）＋ 底部主掣 ＋ feedback sheet | `index.html`、`css/style.css`、`js/quiz.js`（只改 UI 函數：`_updateProgress`、`_complete` 嘅 UI 部分、`_flashWrong`、`next`） |
| B | 鍵盤重做＋ 實體鍵盤快捷鍵 | `js/quiz.js`（`_buildKeyboard`）、`css/style.css` |
| C | 響應式（平板／電腦 Focus mode） | `css/style.css`、`js/app.js`（`showView` frame lock） |
| D | 結算重做 | `js/app.js`（`_renderSettlement`）、`css/style.css` |
| E | Motion token、reduced-motion、a11y 收尾；iPhone／iPad／桌面三機驗證 | 全部 |

每期獨立 commit（`feat(quiz): …`），唔改 SQL、唔改 SM-2。

## 4. 唔做（今次範圍外）
- 唔加「心心／生命值」制（會改學習規則）。
- 唔改題庫內容、題型、計分。
- Dark mode（app 其他頁未支援，之後另做）。

## 5. 要你決定
- Q1：平板／電腦答題時，突破 Pokédex 機殼做全螢幕 Focus mode？（建議：手機保留機殼，≥600px 全螢幕）
- Q2：combo 🔥 會唔會影響獎勵？（建議：純視覺，唔影響鑽石）
- Q3：答錯時要唔要好似 Duolingo 咁即刻顯示答案？（建議：唔好，保留現有「再試」SRS 邏輯）
