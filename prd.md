# PokeEngmon 產品需求文檔（PRD）

> 寶可夢主題嘅英文單字學習遊戲。用答題換鑽石、抽卡、捕捉同進化寶可夢嘅動機，驅動持續練習英文詞彙。

---

## 1. 產品定位

| 項目 | 內容 |
|------|------|
| 產品名稱 | PokeEngmon |
| 目標用戶 | 小學生／需要背英文單字嘅學習者（家長可匯入自訂詞庫） |
| 核心玩法 | 答英文題 → 賺鑽石 → 抽／捉寶可夢 → 進化 → 圖鑑收集 |
| 平台 | Web（GitHub Pages），純前端 + Supabase 後端 |
| 語言 | UI 繁體中文，學習內容英文 |

---

## 2. 核心價值

把「背單字」呢件苦差，包裝成「養寶可夢」嘅收集養成遊戲：
- **外在動機**：抽卡爽感、進化動畫、圖鑑收集欲
- **內在動機**：SM-2 間隔重複演算法，確保記得嘅字唔會浪費時間重溫，唔記得嘅字會彈出嚟

---

## 3. 功能模組

### 3.1 答題系統（Quiz）
- 每組最多 10 題（`GAME_CONFIG.SET_SIZE`）；唔夠到期題就出細 set，唔會夾硬充夠
- 題型：聽音選字、看圖選字、拼字（Levenshtein 距離容錯）
- 計分：Perfect（全對）→ 💎3；8-9 題 → 💎2；7 題 → 💎1；<7 → 💎0
- 答題記錄寫入 SM-2 history + `user_history`

### 3.2 寶可夢系統
- **拍檔（Partner）**：答題經驗值會入落而家嘅拍檔，升級 → 進化
- **圖鑑（Pokédex）**：1-151 全圖鑑，已擁有嘅顯示、未擁有嘅問號
- **進化**：線性進化（3 階）+ 分支進化（伊貝）
- **IV/EV**：每隻有個體值（IV）同努力值（EV），重複抽到同隻 → EV+1

### 3.3 抽卡系統（Gacha）
- **普通抽**：只能抽到 normal 稀有度（免費）
- **稀有抽**：耗 💎3，可抽到 rare 80% / epic 15% / legend 5%
- 重複抽到 → EV point +1；rare 抽重複 → 糖果 +1

### 3.4 捕捉系統（Capture）
- Three.js 3D 場景，投精靈球捉野生寶可夢
- 捕捉成功率 `0.80 + attempts × 0.05`（最高 0.95）
- 捕捉結果由 server RPC `settle_capture` 決定（防金手指）

### 3.5 SM-2 記憶曲線
- 每個字一張 card，記錄 `next_review_at`、`interval_days`、`ease_factor`
- 答對 → 拉長間隔；答錯 → 重置
- 「記憶光芒」：答對即將到期嘅字 → EXP ×1.5
- 抽題規則（v95）：**只抽到期卡**（`next_review_at <= now`），過期最耐未見優先，全新題隨機補尾；未到期卡一律唔抽 —— 某課題到期題做晒後，用戶必須揀其他課題先可以繼續，唔可以死做一個課題刷啱啱做過嘅題

### 3.6 帳戶與同步
- **匿名模式**：首次使用自動生成 `device_id`，數據存 localStorage + Supabase（anon 身份）
- **Google OAuth**：登入後 `migrate_anonymous_to_auth` 將匿名數據搬去 auth 帳戶
- **雲端同步**：`pushState`（本地→雲端）、`pull`（雲端→本地）
- Sign out 會清除本地遊戲進度（防金手指）

### 3.7 練習日曆（Calendar）
- 顯示每日練習記錄（顏色深淺 = 答題量）
- 連續練習日數 `bestStreak`

### 3.8 家長功能
- CSV 匯入自訂題目（`customQuestions`）
- `picture_words.csv` + `questions.csv` 預設詞庫

---

## 4. 經濟系統

| 資源 | 獲得 | 消耗 |
|------|------|------|
| 💎 鑽石 | 答題獎勵（server RPC 計算） | 稀有抽（💎3） |
| ⭐ 星星 | 重複抽到同隻（每 5 次 +1⭐） | — |
| 🍬 糖果 | rare 抽重複 | 進化 |
| EXP | 答題（按等級所需經驗比例） | 升級／進化 |

---

## 5. 非功能需求

| 項目 | 要求 |
|------|------|
| 離線可用 | Service Worker 快取靜態資產；答題可離線，同步排隊等上線 |
| 防金手指 | diamonds 由 server RPC 計算；capture 成功率由 server 決定 |
| 隱私 | 只用 Google OAuth 取 uid + email，唔存取其他資料 |
| 效能 | 純靜態前端，Supabase 做後端，無 server 維運成本 |
| 兼容 | Chrome / Edge / Safari 最新版；手機瀏覽器 |

---

## 6. 版本演進要點

| 版本 | 重點 |
|------|------|
| v1–v47 | 基礎答題 + 寶可夢收集 |
| v48+ | 取消普通抽，改為答題直接獲得寶可夢 |
| v83 | Sign out 清除本地進度（防 cheat） |
| v87 | 加入 `supabase-config.js`（修復 GitHub Pages 404） |
| v89 | 修復 `chain_key` 格式不一致導致 render crash |
| v91 | 修復 `uidGen` 非 UUID 導致 user_entries push 400 |
| v92 | 修復 upsert 缺 `resolution=merge-duplicates` 導致 409 |
