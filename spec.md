# Spec — 句子題行內空格練習 + SM-2 v3 校準

> 狀態：待用戶批准（Spec Mode）
> 分支：`feat/inline-blank-quiz`（已開；只 push 分支，**不 merge 到 main**，待用戶審核）
> 介面文字：全英文；對話與文件：繁體中文（香港用語）

---

## 1. 目標

把現時「整句輸入框 + Hint + Skip + Power Up Zone」的做題流程，換成：

1. 句子題在句內逐個字詞填空（inline blanks），打對自動轉綠、自動跳格、最後一格自動提交。
2. 一題只有三種結果：**無提示答對 / 用 1 次提示答對 / 用 2 次提示答對**。
3. 用過提示的題目在**同一回合內重排**（5 分鐘只是一個上限，清完原本題目即插入）。
4. SM-2 改為 EF 主導的間隔演算法（EF 參與 interval 計算），新增 `last_review_at`。
5. **完整移除 Power Up Zone**（`js/powerup.js`、相關 DOM／CSS／結算文案／每題 +5 EXP）。
6. 頂部只保留獎盃、`n / 10`、幼線進度、齒輪設定；返回／退出收進齒輪彈窗。
7. 新增「複習時間 chip」：未答前顯示實際經過時間；答完後顯示下次複習時間。

---

## 2. 已鎖定規格（不可自行改動）

### 2.1 答題頁 UI（句子題）

- 頂部：`🏆` + `n / 10`（分母固定**初始題數**）+ 幼線進度 + 齒輪（右上）。
- 移除左上返回鍵 `#btn-quiz-exit`。退出功能放入齒輪 → **Quiz Settings** 彈窗，內含 `Quit this set`。
- 題目卡只顯示英文句子：**不要**中文翻譯、19 級星星、`New`、來源標籤。
- `___` → 行內空格；格數 = CSV「答案」欄**第一個寫法**的**字數**：
  - `human race` → 2 格
  - `wasn't` → 1 格（整隻字放入同一格）
- 原生 input 疊在當前格：input 透明（文字透明、caret 可見），下面 `span` 顯示文字；輸入黑字。
- 每格內容完全符合該格答案 → 自動轉綠、鎖住該格、游標跳下一格；最後一格轉綠 → 自動提交（無需按提交）。
- 提示字數：以「仲要輸入幾多個字母」計 —— **≤5 個 → 提示 1 個字母**；**≥6 個 → 提示 2 個字母**。
- 提示次數以**同一條題**計：
  - **第 1 次** → L1：ghost 接住已輸入嘅正確前綴之後；若已輸入唔係正確前綴（例如 `test`）→ 先清空該格，再出 L1；
  - **之後任何一次按**（不論有冇打字、打字啱唔啱、係邊一格）→ 一律當第 2 次，直接出 L2：清空該格、顯示整個答案做 ghost。
- `✓` 確認（保留）：內容不符 → 框左上角紅驚嘆號 + 框底色微紅；EF −0.14；**不重排、不清題、不寫 history**。
- 鍵盤上方工具列：
  - 未提交：`💡 Show hint`、`🎤 Voice mode`（**disabled**）；
  - 提交後：`Next →`、`🔊 Pronounce`（**disabled**）。
- 取消原本答對後 650ms 自動跳下一題；一律由 `Next →`（或 Enter）前進。

### 2.2 回合流程

- **移除 Power Up Zone 整套**。
- 沒有「錯題」概念；一題三種結果（見上）。
- 該次出現用過任何提示（按幾多次都只算一次）→ 該題排入重排佇列（概念上 5 分鐘後，實際清完原有題目即插入）。
- 重排後再用提示 → 再排。
- **只有當前隊列最後一題**即使有提示也不再排（保證回合終止）。
- 原本題目清完 → 立即插入已排的重排題。
- 一題必須「重排後無提示答對」才算清；分母固定初始題數；分子 = 無提示清題數，每題只加一次（重排次數不影響分子）。
- EXP =（無提示清題數 ÷ 總題數）× 現有 span 分級表（單一維度，取消「有無 hint」二維）。
- 鑽石 RPC `awardRoundDiamonds(score, total)` 的 `score` 改傳「無提示清題數」。
- Gym：`allCorrect = results.length>0 && every(correct)`、`usedHint = some(hint)` 保持；`correct` = 該題最終是否無提示清掉。

### 2.3 SM-2（演算法層）

- Q 值取消速度分流：
  - 無提示首次答對 → `q = 5`
  - `✓` 錯誤確認 → `q = 3`（只扣 EF，不寫 history）
  - 用提示 → `q = 0`
- `EF0 = 2.5`；下限 **1.8**；上限 **3.0**（保留兩位小數）。
- 無提示答對：
  - EF `+0.15`
  - `interval = clamp(1..60, round(上次 interval × 新 EF × 0.6))`
  - `repetition += 1`（上限 5）；`is_mastered = rep >= 5`
- 用提示：
  - EF 第 1 次 `−0.2`；同一次出現第 2 次再 `−0.3`（合計 `−0.5`，地板 1.8）
  - `interval = 1 天`、`repetition = 0`
  - 每次學習事件都寫卡（用提示那次寫 interval 1 / rep 0 / EF）；重排後無提示答對再寫 rep+1 與新 interval
- `✓` 錯誤確認：只寫 EF `−0.14`，不動 `repetition / interval / next_review_at / last_review_at`，不寫 history。
- 新增欄位 `last_review_at`（本機卡片、Supabase payload、DB 遷移）；每次完成學習事件（clean／hint）都設為 `now`。
- 現存卡片**一次性重算**：先備份玩家 state；EF 夾到 1.8–3.0；用新乘數重算 interval；補 `last_review_at`（由 `next_review_at − interval_days` 推算）。

### 2.4 Chip（複習時間）

- 未答前：顯示實際經過時間，例如 `Last practised 16 days ago`。
- 答完後：
  - 重排題 → **維持原字眼** `Review in 5 minutes`（即使實際清完即出）；
  - 無提示答對 → `Review in 1 day / 24 hours / 48 hours / 7 days`。
- 單位規則：`< 1 小時` → 分鐘；`<= 2 天` → 小時；`> 2 天` → 天。
- 新卡（從未複習）不顯示 chip。

### 2.5 已知取捨（用戶已接受）

- EF 1.8 時乘數 1.08，`round(1×1.08)=1` 會連續卡在 1 天（不加「最少 +1 天」補丁）。
- `+0.15` 會令正常學生曲線加速（約第 8 次就 60 天封頂）。

---

## 3. 範圍外（不做）

- 不改題庫 CSV 格式、不加新題。
- 不改抽查／抽卡／寵物／排行榜機制。
- 不改 `buildSession` 的「只抽到期卡、不補位」規則（preop Rule 7）。
- 不改 Google OAuth、RPC 權限模型。
- 不手動 bump `APP_VERSION` / `CACHE_NAME` / `?v=`（交 semantic-release，分支上維持 1.8.3）。

---

## 4. 檔案與改動（decision-complete）

### 4.1 `js/sm2.js`（重寫演算法層，保留 Storage／Session 層）

**保留**：`getOrCreateCard`、`upsertCard`、`listDue`、`listNew`、`listAll`、`listHistory`、`appendHistory`、`mergeHistory`、`buildSession`、localStorage keys `pokeengmon_sm2_cards_v2` / `pokeengmon_sm2_history_v2`。

**刪除**：`levenshtein`、`isPrefix`、`expectedTime`、`computeQ`、`computeBestQ`、`computeEF`、`nextInterval`、`nextRepetition`、`updateCard`、`LADDER`（已無引用；`js/powerup.js` 同步刪除）。

**新增常量**：
```js
INITIAL_EF = 2.50, MIN_EF = 1.80, MAX_EF = 3.00
MAX_INTERVAL_DAYS = 60, MAX_REP = 5, SET_SIZE = 10, DAY = 86400000
CLEAN_Q = 5, CHECK_FAIL_Q = 3, HINT_Q = 0
```

**新增純函數**：
- `efForClean(ef)` → `clamp(1.8, 3.0, ef + 0.15)`，四捨五入 2 位。
- `efForHint(ef, hintCount)` → `hintCount>=1 −0.2`；`>=2 再 −0.3`；夾 1.8。
- `efForCheckFail(ef)` → `clamp(1.8, 3.0, ef − 0.14)`。
- `intervalForClean(prevDays, ef)` → `clamp(1..60, round(prevDays × ef × 0.6))`。
- `applyClean(card, now)` → 回傳更新後卡片（EF、interval、rep+1、next_review、last_review_at、updated_at、is_mastered）。
- `applyHint(card, hintCount, now)` → interval 1、rep 0、EF 依 hintCount 扣、next_review +1 天、last_review_at、updated_at。
- `applyCheckFail(card, now)` → 只改 `ease_factor` + `updated_at`。
- `lastReviewedMs(card)` → `last_review_at`；舊卡 fallback `next_review_at − interval_days×DAY`；新卡 0。
- `formatSpan(ms)` → `{ value, unit: "minute"|"hour"|"day" }`（<1h 分鐘、<=2d 小時、>2d 天）。
- `migrateV3()`：
  - marker `pokeengmon_sm2_v3_migrated`；
  - 先把 `pokeengmon_state_v1`、cards、history 備份到 `pokeengmon_sm2_v3_backup`；
  - EF 夾 1.8–3.0；interval>0 → 用新乘數重算；補 `last_review_at`；
  - 回傳 `true`（有改動）／`false`（已遷移或無卡）。

**卡片新 shape**：`last_review_at: number`（新卡 0）。

### 4.2 `js/quiz.js`（重寫回合引擎）

**狀態**：`set`（初始題）、`queue`（工作佇列，元素 `{ q, dueAt, requeued }`）、`total`、`seenQids`、`answers`（以 `questionKey(q)` 為 key 的 Map：`{ hintCount, clean, hintEver, chosen }`）、`cells`（`{ tokens, acceptTokens, values, green }[]`）、`currentCell`、`answered`、`_curQuestionStart`。

**保留公開 API**：`start(topics)`、`startGym(milestone)`、`finish()`、`playWordAudio()`。
**新增公開 API**：`check()`（✓）、`hint()`、`next()`、`openSettings()`、`quit()`。

**流程**：
- `start` / `startGym`：照舊用 `drawMixedSet` / 全題庫洗牌；`set.length===0` → All caught up；少於 10 題 → toast；初始化 queue = set 副本；`total = set.length`；渲染第一題。
- `_renderQuestion`：
  - 進度 = `seenQids.size / total`（分母固定）；bar 同值。
  - 移除 `_renderMemoryLight`、`_renderTopic` 星星；改為 `_renderChip()`。
  - 句子題：`_buildCells(q)`（答案 split 空白；`accept` 只有同 token 數才納入逐格比對；空答案 → 1 格、目標空字串）。
  - 圖片單字題：照舊顯示 word card；空格格用單字同一引擎（放在 word card 下方）。
  - 重設 toolbar（before 顯示、after 隱藏）、✓ 顯示、feedback 清空。
- `_onCellInput(i)`：
  - 同步 span 文字；有輸入 → 隱藏 ghost；
  - 若值非空且 match 該格 → 綠格、鎖 input、focus 下一格；最後一格 → `_complete("clean")`。
  - 空答案題：只有在按 `✓` 時才可完成。
- `check()`：比對當前格；符合 → 同自動流程；不符 → 紅驚嘆號 + 微紅底 + EF −0.14（`applyCheckFail` + `upsertCard`），不寫 history。
- `hint()`：
  - 無當前格／已答完 → return；
  - `hintCount===0` → L1 ghost（首兩字母），`hintCount=1`；
  - `hintCount>=1`：ghost 仍在 → 震一下；ghost 已消失 → 顯示 L2、清空該格、`hintCount=2`；
  - 只記錄在 `answers`，EF 在完成時一次過計。
- `_complete(kind)`：
  - 鎖全部格、隱藏 ✓、顯示 after toolbar；
  - 寫卡：clean → `applyClean`；hint → `applyHint(card, hintCount)`；
  - 寫 history：q_score 5（clean）／0（hint）；check fail 不寫；
  - 記入 `answers`（`clean` 只可 true 一次；`hintEver`）；
  - `hintEver && queue.length>0` → push `{ q, dueAt: now+5min, requeued:true }`；若係隊列最後一題 → 唔排；
  - chip 更新：重排 → `Review in 5 minutes`；clean → interval 換算；
  - feedback：clean → 隨機讚美；hint → `Correct — hint used.`。
- `next()`：`queue.shift()`；有 → render；冇 → `finish()`。
- `finish()`：`score = answers 中 clean===true 的數量`；`results = 初始 set 逐題映射`（`qid, chosen, correct=clean, hint=hintEver, memory=false`）；傳 `App.onQuizFinished`。
- `quit()` / `openSettings()`：彈窗；Quit → 停 timer、清狀態、`App.renderHome()` + `showView("view-home")`。
- 圖片單字題保留 `_autoPlayWord`、`playWordAudio`、圖片載入；移除 `_isCorrect`、`_showFeedback` 舊版（改用新 feedback 路徑）、`skip`、`submit`、`_advance`、`_continue`。

### 4.3 `index.html`

- 重寫 `#view-quiz`：
  - 頂部：`🏆`、`#quiz-progress`、`#btn-quiz-settings`（⚙）；移除 `#btn-quiz-exit`、`#quiz-timer`。
  - `#quiz-chip`。
  - 保留 `#quiz-image-box`、`#quiz-word-card`。
  - `#quiz-card > #quiz-sentence`。
  - `#quiz-toolbar-before`：`#btn-quiz-hint`、`#btn-quiz-voice`（disabled）。
  - `#quiz-toolbar-after`（hidden）：`#btn-quiz-next`、`#btn-quiz-replay`（disabled）。
  - `#btn-quiz-check`（Submit ✔）。
  - `#quiz-feedback`。
- 刪除整段 `#view-powerup`。
- 刪除 `<script src="js/powerup.js?v=...">`。

### 4.4 `js/app.js`

- `onQuizFinished`：刪除 `wrongs` / `PowerUp.start` 分支，直接 `_captureThenSettle(data)`。
- `onSetComplete` EXP：
  - `s = round(score/total×10)`；單一維度 pct：`10→1.0 / 9→0.9 / 8→0.8 / 5–7→0.5 / 1–4→0.3 / 0→0.1`；
  - `level<=10` 保底 0.5 保留；
  - 刪除 `usedHint`、`memoryCorrect`、`memoryBonus`。
- `_renderSettlement`：刪除 memory bonus 文案。
- 按鈕綁定：
  - `#btn-quiz-settings` → `Quiz.openSettings()`；
  - `#btn-quiz-hint` → `Quiz.hint()`；
  - `#btn-quiz-check` → `Quiz.check()`；
  - `#btn-quiz-next` → `Quiz.next()`；
  - 刪除 `#btn-quiz-exit`、`#btn-quiz-skip`、`#btn-quiz-continue`、`#quiz-answer` keydown、document Enter continue、所有 `#btn-powerup-*` / `#powerup-answer` 綁定。
- `init()` 首屏前呼叫 `SM2.migrateV3()`（在任何 `buildSession` 之前）。

### 4.5 `js/sync.js`

- `queueUpsert` payload 加 `last_review_at`（number｜0）。
- `pushState` cards rows 加 `last_review_at`。
- `_flush` 的 cards map 保留 spread（已自動帶新欄）。
- `pull` 合併照舊（雲端 row 有新欄就保留）。

### 4.6 Supabase

- 新增 `supabase/migrations/supabase-migrate-20261030-add-last-review-at.sql`：
  `alter table user_cards add column if not exists last_review_at bigint;`
- 更新 `supabase/supabase-schema.sql` 的 `user_cards` 定義。

### 4.7 `sw.js`

- 從 `ASSETS` 移除 `./js/powerup.js`。
- 不手動改 `CACHE_NAME`（交 semantic-release）。

### 4.8 `css/style.css`

新增：
- `.quiz-trophy`、`.quiz-gear-btn`
- `.quiz-chip`
- `.quiz-toolbar`、`.quiz-tool`、`.quiz-tool:disabled`
- `.qb-cell`、`.qb-text`、`.qb-input`、`.qb-ghost`、`.qb-cell.good`、`.qb-cell.bad`、`.qb-bang`
- 刪除只屬於 Power Up 的 `.powerup-*` 規則（若有共用則保留）。

### 4.9 刪除檔案

- `js/powerup.js`（`DeleteFile`）。

---

## 5. 數值驗證表（實作後自檢）

| 情境 | 舊 EF / int | 新 EF | 新 interval | 新 rep |
|---|---|---|---|---|
| 新卡 clean | 2.50 / 0 | 2.65 | 1 | 1 |
| int 1 clean | 2.65 / 1 | 2.80 | 2 | 2 |
| int 2 clean | 2.80 / 2 | 2.95 | 4 | 3 |
| int 4 clean | 2.95 / 4 | 3.00 | 7 | 5 |
| EF 1.8 / int 1 clean | 1.80 / 1 | 1.95 | 1 | — |
| hint ×1 | 2.50 | 2.30 | 1 | 0 |
| hint ×2 | 2.50 | 2.00 | 1 | 0 |
| check fail | 2.50 | 2.36 | 不變 | 不變 |
| 上限 | 3.00 / 59 | 3.00 | 60 | — |

---

## 6. 驗收清單

1. `node --check` 通過：`js/sm2.js`、`js/quiz.js`、`js/app.js`、`js/sync.js`、`sw.js`。
2. 全 repo 搜尋 `PowerUp` / `powerup`（除文件與 CSS 歷史）零程式引用。
3. 句子 `human race` → 2 格；`wasn't` → 1 格；空答案題可留空完成。
4. 打對一格即綠、跳格；最後一格綠 → 自動提交；不再 650ms 自動跳題。
5. L1 → 首兩字母；再按（ghost 消失後）→ L2 + 清空；ghost 仍在再按 → 只震。
6. ✓ 不符 → 紅驚嘆號 + EF −0.14 + 無 history；輸入可繼續。
7. 用提示完成 → 於原題清完後重新出現；最後一題不再排。
8. Chip：答前顯示經過時間；答後顯示 5 minutes／1 day／24 hours／48 hours／7 days。
9. 齒輪彈窗可 Quit；頂部無返回鍵；無星星／中文／New／來源。
10. 結算 EXP 只按無提示清題數；無 memory bonus 文案。
11. 本機卡片出現 `last_review_at`；舊卡一次性重算並有備份 key。
12. 只 push `feat/inline-blank-quiz`，**不 merge**。

---

## 7. Commit 計劃（分支內）

1. `feat(sm2): recalibrate EF/interval model and add last_review_at`
2. `feat(sync): persist last_review_at and add DB migration`
3. `feat(quiz): inline word blanks, two-level hints and same-set requeue`
4. `feat(quiz): settings header, toolbar and next-review chip; remove Power Up Zone`
5. `feat(exp): score clean completions only`

> 每個 commit 用 `python tools/git_commit_push.py --paths <files> -m "..."` 限定檔案；PowerShell 5 用 `;`。
