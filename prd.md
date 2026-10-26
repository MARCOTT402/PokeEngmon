# PokeEngmon 產品需求文檔（PRD）

> 寶可夢主題嘅英文學習遊戲。用答題換鑽石、抽卡、捕捉同進化寶可夢嘅動機，驅動持續練習英文。
> 目前版本：**v132**（2026-10）

---

## 1. 產品定位

| 項目 | 內容 |
|------|------|
| 產品名稱 | PokeEngmon |
| 目標用戶 | 小學生／需要背英文嘅學習者；家長可自行匯入詞庫 |
| 核心玩法 | 答英文題 → 賺鑽石 → 抽卡／捕捉寶可夢 → 進化 → 圖鑑收集 |
| 平台 | Web PWA（GitHub Pages），純前端 + Supabase 後端 |
| 語言 | **全英文 UI**（題目、介面、提示、按鈕都係英文），方便用戶用 Google Translate 學習 |

---

## 2. 核心價值

把「背單字／練文法」呢件苦差，包裝成「養寶可夢」嘅收集養成遊戲：

- **外在動機**：稀有抽卡爽感（快龍扭蛋機動畫）、進化、圖鑑收集、每日練習日曆
- **內在動機**：SM-2 間隔重複演算法，確保記得嘅唔浪費時間重溫，唔記得嘅會按時彈出嚟
- **補救機制**：答錯唔會就咁算，必須入 Power Up Zone 改啱先可以完成回合（教育優先）

---

## 3. 功能模組

### 3.1 答題系統（Quiz）

- 每組最多 **10 題**（`GAME_CONFIG.SET_SIZE`）；某課題到期題唔夠就出細 set，**唔會夾硬充夠**
- 題型（統一由 `Quiz._showFeedback` 處理答對／答錯回應，v114 起新增題型必須共用）：
  - **句子題**：填空（8 欄 CSV），題目圖可選
  - **圖片單字題**：睇圖聽音 → 串字
- 答題支援：
  - **Levenshtein 距離容錯**：接近嘅答案會提示「差 N 個字母」
  - **💡 Hint**：免費，顯示首字母 + 字數
  - **Skip**：當答錯計，入 Power Up Zone
  - **✕ 退出**：任何時候可退出（會彈確認）
- 計分：Perfect（10/10）→ 💎3；8–9 題 → 💎2；7 題 → 💎1；≤6 → 💎0
- 答對後 **650ms 自動跳下一題**；答錯顯示答案解析，**手動撳 Continue**（唔會強制跳走）

### 3.2 Power Up Zone（改錯強制區，v93+）

第 10 題完成後，錯題**唔直接結算**，要入 Power Up Zone 全部改啱先可以完成回合：

- 三階腳架：
  - 第 1 次仍錯 → 只俾 Hint（關鍵詞高亮 + 提示 + 首字母）
  - 第 2 次仍錯 → 顯示完整解析 + 正確答案，要求重做到啱
- 清除條件：**Levenshtein 距離必須 = 0**（唔係只 exact match）
- 每改啱一題 → +5 EXP 浮字
- 全部改啱後 → 全屏「ALL FIXED」慶祝 pop，先至統一更新錯題嘅 SRS 狀態，再入 WARNING 捕捉頁
- 左上角 ✕ 可退出（會警告「fixes will be lost」）

### 3.3 寶可夢系統

- **拍檔（Partner）**：答題 EXP 固定落入當前拍檔（唔係最新捕捉到嗰隻）
- **回合 EXP 分級制（v130 / v136）**：按 `round(score/total×10)` × 有無用 Hint 對照百分比表發放（短 set 全對＝10/10 檔）；記憶光芒 bonus（答對到期題 ×1.5）在此基礎上額外疊加

| 分數 | 無用 Hint | 有用過 Hint |
|---|---|---|
| 10/10 | 100% | 50% |
| 9/10 | 90% | 40% |
| 8/10 | 80% | 30% |
| 5–7/10 | 50% | 25% |
| 1–4/10 | 30% | 15% |
| 0/10 | 10% | 10% |

- **新手期保底**：拍檔 Lv.1–10 期間 `pct = max(0.50, 分級結果)`，低分回合墊高到 50%，全對無 hint 照攞 100%；每回合下限 10 EXP；無拍檔時固定 12 EXP 入 `pendingExp`
- **圖鑑（Pokédex）**：1–649 全圖鑑（Gen 1–5），5 個世代分頁 + 頂部浮動世代 hub（捲落收起、捲上浮出）；世代圖示用封面傳說（Mewtwo / Ho-Oh / Groudon / Dialga / Reshiram）；未解鎖世代顯示純「?」佔位格（**零圖片請求、零外形洩露、零流量**）
- **世代解鎖（v127）**：初始只有 Gen 1；擁有該代**全部進化鏈（連傳說）** → 自動解鎖下一代，彈慶祝窗
- **GenPack 按需下載（v127）**：世代解鎖當刻先至下載該代資料包（GIF + 叫聲 + 數據 JSON，約 3–11 MB），解鎖前零流量零儲存；下載有進度條，SW cache-first 持久化，斷線下次啟動自動續傳
- **進化**：線性進化（最多 3 階）+ 分支進化（伊貝隨機分支；wurmple / clamperl / tyrogue 等按原作分支）
- **IV/EV**：每隻新抽嘅 IV 隨機 0–31；重複抽到 → +1 可自由分配 EV（單項上限 252、總和 510）
- **等級／進度**：`level` 由 `exp` derive；`stage` 由 `chainKey + exp + dupes + branch` derive（v99 起改為 server-side 權威）
- **稀有度（Gen 2–5 自動計算，v127）**：legend = 官方 legendary/mythical；epic = 最終階段 BST ≥ 600；rare = BST ≥ 500；normal = 其餘。Gen 1 維持手調不變

### 3.4 抽卡系統（Gacha）

- **普通抽已永久移除**（v72）：唔再派普通抽券，回合獎勵只保留鑽石 + EXP
- **稀有抽（唯一抽法）**：耗 💎3，機率 rare 80% / epic 15% / legend 5%
- **世代池（v127）**：抽卡池只含目前最高已解鎖世代；`gacha_pull` RPC 加 `p_gen` 參數，server 用 `max_unlocked_gen(uid)` 二次驗證（防前端亂傳）
- **快龍扭蛋機 UI（v102）**：
  - 主頁撳 💎 → 入快龍頁 → 拖／撳 `#dm-arm` ≥ 72% → 快龍肚仔開艙跌球 → 全屏稀有度爆發動畫 → 檢視卡
  - 檢視卡兩個掣：「💎 ×3 TO GO!」（唔夠鑽會 disabled + 顯示差額）、「‹ Back to Home」
- **服務端權威（v99+）**：`gachaPull` RPC 由 server 原子扣鑽 + roll rarity / chain，前端唔改數值
- 重複處理：首次解鎖新種 → 拍檔；重複 → EV+1 或糖果+1（視乎稀有度）

### 3.5 捕捉系統（Capture）

- Three.js 3D 場景，投精靈球捉野生寶可夢
- 捕捉成功率 `0.80 + attempts × 0.05`（上限 0.95），server `settle_capture` RPC 決定（防金手指）
- **世代池（v127）**：捕捉池只含目前最高已解鎖世代；`obtain_capture` RPC dex 上限放寬至 649 + server 端世代驗證
- BGM：WARNING→草叢 0.55，第一下 400ms 內收到 0.32，第 3 下充電撳完拋出後 6.2 秒線性淡出至 0（iOS WebKit 長 ramp 有 bug，用 JS 定時逐格調 gain）
- 捕捉成功唔會自動替換拍檔（避免數據混亂）；首次獲得寶可夢先自動設為拍檔

### 3.6 SM-2 記憶曲線

- 每條題一張 card（`user_cards`），記錄 `next_review_at`、`interval_days`、`ease_factor`
- **間隔梯級**：`[1, 3, 7, 15, 30]` 天；初始 EF 2.5，下限 1.3
- 抽題規則（v95 起）：**只抽到期卡**（`next_review_at <= now`），過期最耐優先，唔夠先補全新題；**未到期卡一律唔抽** —— 某課題做晒後用戶要揀其他課題，唔可以死做刷啱啱做過嘅題
- 「記憶光芒」（彩虹流動橫幅 + 拍檔頭像彈跳）：答對即將到期嘅字 → EXP ×1.5
- 圖片題同句子題共用同一套 SM-2 邏輯，圖片題 SRS key 加 `w:` 前綴避免撞 key

### 3.7 帳戶與同步

- **匿名模式**：首次用 `device_id`（UUID）玩，數據存 localStorage；匿名用戶**唔上傳雲端**（RLS 依賴 `app.device_id` session 變數，PostgREST 設唔到）
- **Google OAuth**：redirect 模式 + `prompt=select_account`（每次必彈帳戶選擇）
  - 首次連接 Google → `import_state` RPC 上傳本地進度（一次性鎖定，鑽石固定 20 粒）
  - 舊 Google 帳戶 → 從雲端拉取；本地有進度會彈覆蓋警告
- **Sign out**：清除本地所有遊戲進度（保留 `device_id` + `customQuestions`），防止切換帳戶時舊數據被誤傳
- **同步策略（v99 起）**：
  - **敏感數值**（鑽石、寶可夢、EXP、IV/EV、糖果）→ 全部行 server RPC，本地唔直寫
  - **非敏感**（trainer name、SM-2 cards / history）→ 背景 queue 非阻塞同步（1s debounce + beforeunload flush）
  - **pull**：page load + 登入後，以本地 `updated_at` 較新為準合併

### 3.8 練習日曆（Calendar）

- 顯示每日答題量（顏色深淺）
- 連續練習日數 `bestStreak`

### 3.9 家長功能

- CSV 匯入自訂題目（存 `customQuestions`，跨帳戶登出都保留）
- 內建詞庫：`Q_folder/questions/questions.csv`（句子題）、`Q_folder/picture_words/picture_words.csv`（圖片單字題）
- Settings 頁：重置進度（要輸入正確訓練員名先 confirm）、查看版本、匯入 CSV

### 3.10 音效與無障礙

- 全域 BGM：One Summer's Day（Spirited Away / Joe Hisaishi），音量 0.25，捕捉場景暫停、結算 jingle 完後恢復
- 答對／答錯 SFX：Web Audio API 合成（兼容 iOS 自動播放限制）
- 圖片題 TTS：Azure `en-US-JennyNeural` rate -10%，本地 mp3 + **v116 起 speechSynthesis 兜底**（mp3 缺失都唔會靜音）
- 寶可夢叫聲：本地 1-151 mp3，僅首次解鎖播放
- 無障礙：`user-scalable=no` 已移除；所有 hover 動效只用 `@media (hover:hover)` 觸發；支援 `prefers-reduced-motion`

---

## 4. 經濟系統

| 資源 | 獲得 | 消耗 | 邊個控制 |
|------|------|------|----------|
| 💎 鑽石 | 答題獎勵（server RPC 計算） | 稀有抽 💎3 | server |
| ⭐ 星星 | 重複抽到同種（每 5 次 +1⭐） | — | server derive |
| 🍬 糖果 | rare 重複 | 進化 | server |
| EXP | 答題 + Power Up 改錯 | 升級／進化 | server derive |

**所有敏感數值都係 server 權威**（v99 起），前端只能睇、唔能改。

---

## 5. 非功能需求

| 項目 | 要求 |
|------|------|
| 離線可用 | Service Worker 容錯式逐個快取（唔用 `caches.addAll`）；答題可離線，同步排隊等上線 |
| 自動更新 | SW `skipWaiting` + 前端偵測 `controllerchange` → 自動刷新；**唔再有用戶確認彈窗** |
| 防金手指 | 鑽石／捕捉率／抽卡／EXP 全部 server RPC；column-level grants 收回 anon 直寫；每個 RPC 用 `auth.uid()` 驗證 |
| 隱私 | 只用 Google OAuth 取 uid + email；匿名模式唔上傳任何答題記錄 |
| 效能 | 純靜態前端 + Supabase；圖片 `object-fit: contain` 響應式高度 `clamp(180px, 27dvh, 260px)` |
| 兼容 | Chrome / Edge / Safari 最新版；iPhone Safari 特別處理（Web Audio、TTS、安全區） |
| 無障礙 | WCAG AA 對比度；支援 `prefers-reduced-motion`；可放大縮小 |

---

## 6. 版本演進要點

| 版本 | 重點 |
|------|------|
| v1–v47 | 基礎答題 + 寶可夢收集 |
| v48 | 取消普通抽，改為答題直接派寶可夢 |
| v72 | 永久隱藏普通抽，回合獎勵只剩鑽石 + EXP |
| v83 | Sign out 清除本地進度（防 cheat） |
| v86 | Google OAuth 加 `prompt=select_account`，每次必揀帳戶 |
| v87 | 加 `supabase-config.js` 修復 GitHub Pages 404 |
| v91 | 修復 `uidGen` 非 UUID → user_entries push 400 |
| v92 | 修復 upsert 缺 `resolution=merge-duplicates` → 409 |
| v93 | **Power Up Zone** 強制改錯機制 |
| v95 | SM-2 抽題改為「只抽到期卡」，唔再 backfill |
| v99 | **安全硬化**：column-level grants、RPC 全部 server 權威、敏感欄收回 anon 寫權 |
| v100–v102 | 快龍扭蛋機抽卡 UI（拖手臂、稀有度爆發、檢視卡） |
| v106–v108 | Import 一次性鎖定 + server clamp；移除本地 Import/Export Save UI |
| v109 | 「All caught up」常駐彈窗（代替 3 秒 toast） |
| v112 | **Q_folder 重構**：所有題型集中放 `Q_folder/<type>/`，附帶 CSV + images + audio |
| v113 | 修復 gacha 抽 lv1 寶可夢冇招式（Sync.pull 要 await loadPokemonDex） |
| v114 | **統一答題回應**：所有題型必須經 `Quiz._showFeedback`，新增題型唔可以另起爐灶 |
| v115 | 圖片題 TTS mp3 搬入 `Q_folder/picture_words/picture_words_audio/`，補返缺失嘅 `wordAudioURL()` |
| v116 | **TTS 兜底**：mp3 缺失時自動用瀏覽器 speechSynthesis 讀出，保證唔會靜音 |
| v117 | 內建 fallback 題（data.js QUESTION_BANK）全數遷移入 questions.csv，題目統一由 CSV 驅動 |
| v119 | Settings 自訂題教學彈窗加「AI出題指引.md」超連結（新分頁打開） |
| v120 | 全域 BGM 音量 0.4 → 0.25 |
| v127 | **Gen 2–5 世代擴充**：+498 隻（#152–649）、世代解鎖制（儲齊全鏈開下一代）、GenPack 按需下載、圖鑑 5 代分頁 + 浮動 hub、未解鎖世代純「?」格、SQL 遷移（`chain_rarity.gen`、`gacha_pull(p_gen)`、`obtain_capture` 放寬 649） |
| v130 | 回合 EXP 分級制：按分數 × 有無用 Hint 對照百分比表；拍檔 Lv.1–10 保底 50% × levelSpan |
| v131 | Leaderboard Top 50 prototype（主頁 chip 入口） |
| v132 | Leaderboard live RPC：`get_leaderboard()` SECURITY DEFINER；登入用戶見真榜（partner = active entry）；匿名自動 fallback mock；chain_key → SPECIES 映射（含舊 `dex_<id>` 遺留）；public/anon 權限已 revoke |
| v135 | 捕捉：`obtain_capture` 傳 stage1 dex；SQL 參數改 `p_chain_key`/`p_dex_id` 修 42702 ambiguous |
| v136 | 短 set EXP：`round(score/total×10)` 正規化，5/5 全對攞 100% span（唔再當 5 分落 50% 檔） |
| v137 | Leaderboard：partner Lv 由 exp derive（唔再用 DB 舊 level）；YOU totalOwned 用鏈數，唔再用 collectedCount 灌水 |
| v138 | Gacha fallback：`pendingExp` 先 snapshot 再清零，RPC 唔再永遠傳 0 |

---

## 7. 未來方向（暫唔做，留記錄）

- Gen 6–9 擴充：PokeAPI 官方動態 GIF 只覆蓋到 #649，Gen 1–5 已到位，Gen 6+ 要另搵素材來源先至做
- 鑽石獎勵曲線調整、回合長度選擇（5/10/20）、未擁有物種加權抽獎（v72 UX review 否決）
- `award_round_diamonds` 回合真實性驗證、`obtain_capture` 回合證明、`add_entry_exp` 速率限制（已記低，未排期）
