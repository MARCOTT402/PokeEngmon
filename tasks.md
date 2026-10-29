# Tasks — 句子題行內空格練習 + SM-2 v3 校準

> 對應 [spec.md](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/spec.md)
> 分支：`feat/inline-blank-quiz`｜介面文字：全英文

## 執行順序（每項完成後自檢）

- [x] **T1. SM-2 演算法層重寫**（`js/sm2.js`）
  - 刪除舊 Q 值／階梯函數；新增 `efForClean` / `efForHint` / `efForCheckFail` / `intervalForClean` / `applyClean` / `applyHint` / `applyCheckFail` / `lastReviewedMs` / `formatSpan` / `migrateV3`。
  - 卡片新 shape 加 `last_review_at`。
  - 保留 Storage 與 `buildSession`。
  - 驗證：`node --check js/sm2.js`；用 console 跑 spec §5 數值表。

- [x] **T2. 同步層 + DB 遷移**（`js/sync.js`、`supabase/supabase-schema.sql`、新增 migration SQL）
  - `queueUpsert` 與 `pushState` 加 `last_review_at`。
  - Migration：`alter table user_cards add column if not exists last_review_at bigint;`
  - 驗證：`node --check js/sync.js`；payload 有 `last_review_at`。

- [x] **T3. 回合引擎重寫**（`js/quiz.js`）
  - 行內空格渲染、逐格自動綠、L1/L2 ghost、✓ 檢查、重排佇列、chip、設定彈窗。
  - 移除 submit / skip / _continue / _advance / memory light。
  - 驗證：`node --check js/quiz.js`；手動流程見 spec §6 第 3–9 項。

- [x] **T4. 答題頁 DOM + 樣式**（`index.html`、`css/style.css`）
  - 重寫 `#view-quiz`；刪 `#view-powerup`；刪 `powerup.js` script。
  - 新增 toolbar／chip／gear／qb-cell 樣式；清走 powerup-only CSS。
  - 驗證：頁面載入無 console error；元素 id 與 app.js 綁定一致。

- [x] **T5. 主流程整合**（`js/app.js`）
  - `onQuizFinished` 移除 PowerUp；`onSetComplete` 改單維度 EXP；刪 memory bonus。
  - 更新按鈕綁定；`init()` 呼叫 `SM2.migrateV3()`。
  - 驗證：`node --check js/app.js`；完成一組 → 捕捉 → 結算無報錯。

- [x] **T6. 移除 Power Up**（`js/powerup.js`、`sw.js`、相關 CSS）
  - 刪檔、刪 `sw.js` ASSETS 條目、刪殘留引用。
  - 驗證：`Grep "PowerUp|powerup"` 只剩文件／註解。

- [x] **T7. 手動驗收**（瀏覽器）
  - 用 browser 子代理開本地預覽，逐項核對 spec §6。
  - 特別測：`human race` 2 格、`wasn't` 1 格、空答案題、hint L1/L2、重排、最後一題不再排、chip 單位。

- [ ] **T8. Commit + push 分支**
  - 按 spec §7 五個 commit（`--paths` 限定）。
  - push `feat/inline-blank-quiz`；**不 merge**。
  - 回報 commit 清單與驗收重點。

## 完成定義（DoD）

- spec §6 全數通過。
- 分支已 push，main 未改動。
- 回報含：改了哪些檔案、行為差異、Supabase migration 需要用戶在正式環境執行、已知取捨。
