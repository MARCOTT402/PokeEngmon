# Battle System 2.0 — Trainer Mastery Matrix

> 狀態：Design Sign-off 待批 · 目標版本：v140+ · 文件性質：商業級設計 + 落地藍圖
> 取代：現時 `battle.js` 隨機 1/3/6 場制 + 無難度概念嘅 AI 對戰

---

## 1. Executive Summary

將 AI 對戰由「單一難度、隨機場制」重構為 **Trainer Ladder × Difficulty Matrix** 二軸系統：

- **內容軸（Trainer Ladder）**：10 位 AI 訓練家按等級順序解鎖（沿用現有梯隊）
- **挑戰軸（Difficulty Matrix）**：每位訓練家內置 Easy / Normal / Hard / Inferno 四級難度，逐級解鎖

核心商業目標：**D7 retention +15%、日均對戰次數 +30%、高難度內容觸及率（Hard+）≥40% 活躍玩家**，全部透過「挑戰自主權 + 可收集嘅 mastery 進度」驅動，唔涉及付費，純內容深度。

---

## 2. Design Pillars（設計支柱）

| 支柱 | 含義 | 反模式（禁止） |
|---|---|---|
| **Challenge is a choice** | 玩家自選難度，技巧型玩家唔使磨等級先有味 | 用進度牆逼玩家順序食哂所有內容 |
| **Mastery is visible** | 40 格獎章牆 + 火焰邊框，進度一眼睇晒 | 隱藏完成度、冇收藏動機 |
| **Difficulty is a formula** | 難度 = 一套參數公式套用任何 trainer，唔係逐個手調 | 每個 trainer × 難度人手平衡（維護災難） |
| **Server is authoritative** | 所有獎勵、解鎖、首通由 server 驗證計算 | 前端自報難度/結果 |
| **Every loss teaches** | 失敗成本趨近零，edu app 唔懲罰嘗試 | 挫敗懲罰（扣資源、鎖時間） |

---

## 3. 系統架構：兩軸模型

### 3.1 內容軸 — Trainer Ladder（14 位訓練家，Lv.5–99）

**設計原則：等級與隊伍數刻意脫鈎**——低等級可以有 6 隻（數量考驗），高等級也可以只有 2 隻（質素考驗），避免玩家憑「等級 = 隊伍數」嘅直覺估錯難度。

| # | Trainer | 基礎等級 | 隊伍數 | 分區 | 設計意圖 |
|---|---|---|---|---|---|
| 1 | Youngster Timmy | 5 | 1 | Boot Camp | 教學單挑 |
| 2 | Bug Catcher Wade | 8 | 6 | Boot Camp | 低等級 6 隻蟲隊：教「數量 ≠ 強度」 |
| 3 | Lass Dana | 14 | 2 | Boot Camp | 標準 2 隻 |
| 4 | Hiker Marcos | 22 | 3 | Boot Camp | 岩石/地面 3 隻，教相剋 |
| 5 | Gentleman Alfred | 30 | 2 | Local League | 高防慢速 2 隻 |
| 6 | Swimmer Barry | 38 | 6 | Local League | 中段 6 隻水隊 |
| 7 | Ace Trainer Kiera | 46 | 4 | Local League | 均衡 4 隻 |
| 8 | Gym Leader Jasmine | 55 | 3 | Gym Circuit | 鋼系高防 3 隻 |
| 9 | Psychic Sarah | 64 | 6 | Gym Circuit | 6 隻超能，狀態戰 |
| 10 | Champion Cynthia | 76 | 5 | Champion Road | 準神混合 5 隻 |
| 11 | Champion Alder | 82 | 6 | Champion Road | 6 隻全面隊 |
| 12 | Elite Four Drake | 90 | 6 | Elite Road | 龍系 6 隻 |
| 13 | Frontier Brain Anabel | 95 | 6 | Elite Road | 6 隻最優配置 |
| 14 | Champion Red | 99 | 6 | Elite Road | 最終試煉 |

**解鎖規則**：破 Trainer N 嘅 **Normal** → 解鎖 Trainer N+1（Easy + Normal 同時開放）。

**節點總數**：14 × 4 = **56 個 mastery 節點**（Mastery Wall 56 格）。

### 3.2 挑戰軸 — 每位 Trainer 內置四級難度

| 難度 | 解鎖條件 | 定位 |
|---|---|---|
| Easy | 永遠開放 | 體驗/熱身，減價獎勵 |
| Normal | 永遠開放 | 標準體驗，Ladder 推進基準 |
| Hard | 破該 trainer Normal | 技巧認證 |
| Inferno | 破該 trainer Hard | 終極試煉（簽名機制：Level Sync，見 §4.3） |

神秘感設計：未解鎖嘅 Hard/Inferno 喺 trainer 卡上只顯示火焰剪影 + `???`；Inferno 剪影用彩虹火框（視覺鉤子，見 §7）。

---

## 4. 難度公式（Difficulty Budget）

難度唔係逐個 trainer 手調，而係 **一組全域參數預設（DIFFICULTY_PRESETS）**，套用公式 `buildFoeTeam(trainer, tier)` 生成。

### 4.1 參數矩陣

| 軸 | Easy | Normal | Hard | Inferno |
|---|---|---|---|---|
| 玩家出戰數 | min(AI+1, 6) | = AI | max(AI−1, 1) | max(AI−1, 1) |
| AI 等級 | 基準 −10%（AI=6 時 −20%） | 基準 | 基準 +10% | 基準（玩家走 Level Sync） |
| AI IV | 全 0 | 隨機 0–31 | 全 31 | 全 31 |
| AI EV | 無 | 無 | 主攻 252 / Speed 252 | 主攻 252 / Speed 252 |
| AI 性格 | 無修正 | 隨機 | 有利修正 | 最優修正 |
| AI 招式 | 最弱 2 招 | 固定 4 招 | 剋制面 4 招 | 競技配招（含強化/狀態） |
| AI 決策 IQ | T0 隨機 | T1 威力優先 | T2 期望傷害 | T3（85% 最優 / 15% 隨機） |
| AI 道具 | 無 | 無 | 無 | Potion ×1 |
| 玩家補償 | — | — | — | Level Sync（Lv +2）＋ 開場 Full Restore ×1 |
| 獎勵倍率 | ×0.7 | ×1.0 | ×1.6 | ×2.5 |

**出戰數換算表（14 位訓練家全覆蓋）**

| AI 隊伍數 | Easy | Normal | Hard | Inferno |
|---|---|---|---|---|
| 1 | 2 | 1 | 1 | 1 |
| 2 | 3 | 2 | 1 | 1 |
| 3 | 4 | 3 | 2 | 2 |
| 4 | 5 | 4 | 3 | 3 |
| 5 | 6 | 5 | 4 | 4 |
| 6 | 6 | 6 | 5 | 5 |

**可贏性檢查（Winnability Budget）**

- **Hard**：少一隻 + AI 質素（+10% 等級、IV31、T2），預估通關率 **40–55%**
- **Inferno**：少一隻 + 完美培育 + T3 + Potion + 玩家 Level Sync +2，預估 **20–35%**
- 舊方案（AI−2 + 完美 AI + Potion ×2）預估 **<8%**，判定為不可贏，**已否決**

### 4.2 頭數飽和轉移規則（關鍵 edge case）

當 trainer 隊伍太細，頭數軸冇調節空間（例：Timmy 1 隻，Hard 規則下玩家仍係 1v1），**差額難度預算自動轉移到等級 / IV / IQ 軸**：

- **Easy 且 AI = 6**：玩家同樣 6 隻，數量優勢消失 → AI 等級再 −10%（合計 −20%）、保持 T0、只帶最弱 2 招
- **Hard 且 AI = 1**：1v1 單挑，AI +10% 等級、IV31、T2
- **Hard / Inferno 且 AI = 2**：1v2，Hard 靠 +10% / IV31 / T2，Inferno 靠完美培育 / T3 / Potion / Level Sync
- **Inferno 且 AI = 1**：1v1，完美 AI + T3 + Potion ×1，玩家 Level Sync +2 → 約 30% 勝率

效果：細隊 trainer 高難度 = 「單挑技術試煉」，大隊 trainer 高難度 = 「資源管理試煉」，兩種玩法互補。

### 4.3 Inferno 簽名機制：Level Sync（雙向 +2）

- 出戰時，玩家所有寶可夢**臨時視為「AI 隊伍平均等級 + 2」**（上限 Lv.100），只重算戰鬥內 stats，唔改真實等級/經驗
- **雙向同步**：低等級玩家可以挑戰高等級 trainer，唔會被等級牆擋死；過度練級玩家會被壓回合理水平
- **+2 補償**：抵銷 AI 完美 IV/EV 嘅約 15% 數值優勢，將 Inferno 勝率拉入可玩區間（目標 20–35%）
- UI 必須明確提示：出戰確認畫面顯示 `Level Sync → Lv. N`，並註明「戰後等級不變」

---

## 5. AI 決策 IQ 分層（engine.js 改造核心）

以 seeded RNG（現有 `rng.js`）驅動，四層由淺入深：

| Tier | 决策邏輯 | 實裝量級 |
|---|---|---|
| **T0** | 均勻隨機出招 | 現有 |
| **T1** | 揀 `power × accuracy` 最高嘅招 | ~20 行 |
| **T2** | 揀期望傷害最高：`power × acc × STAB × 屬性相剋倍率`；冇有效傷害招先用狀態招 | ~60 行 |
| **T3** | T2 + 三條 heuristic：<br>① 對面相剋自己且預計被 2HKO → 換入抗性最高嘅後備<br>② 對面 HP < 自身最高招期望值 → 必殺優先<br>③ HP < 30% 且有回復道具 → 用道具；安全回合（對面被克/被眠）→ 用強化招 | ~150 行 + 測試 |

T3 唔做完美搜索（minimax），用 weighted scoring + seeded random tie-break，保證單機 deterministic、雙方可重放。

---

## 6. 經濟與獎勵系統（Server-Authoritative）

### 6.1 獎勵公式

```
reward(trainer, tier) = base[trainerIndex] × tierMultiplier × clearType
```

- `base`：按 trainer 序號遞增（例：Timmy 10 EXP / Alder 150 EXP 量級，實數平衡表另附 spreadsheet 任務）
- `tierMultiplier`：§4.1（×0.7 / ×1.0 / ×1.6 / ×2.5）
- `clearType`：**首通** = 全額 EXP + **一次性鑽石 💎10（所有 trainer × 所有 tier 一律 10 粒）**，全遊戲 56 節點嘅鑽石總量上限 = **560 粒**，簡單易明、唔使查表；**重複通關** = 40% EXP，唔派鑽石（防 farming）
- **Flawless 加成**（己方零倒下）：任何 tier +20% EXP，首次 Flawless 額外 +1 candy

### 6.2 防金手指約束（沿用 v99 規則）

- `settle_battle` RPC 升級為 `settle_battle_v2(p_trainer_id text, p_tier text, p_won bool, p_flawless bool, p_questions_today int)`
- Server 端職責：驗證 `auth.uid()` → 查 `user_trainer_progress` 驗證該 tier 已解鎖 → 查表重算合法獎勵 → 寫入進度 + 派獎 → 記錄 `user_battles` 審計行
- 變數一律 `v_` 前綴；函數收尾 `revoke execute from public, anon; grant execute to authenticated;`
- 每個新 RPC 必須以真實登入喺 live 環境 call 一次確認 200 先上線
- 前端 RPC 失敗 → fallback 本地結算（離線可玩），但**唔派首通鑽石**，重新連線後以 server 進度為準對賬

### 6.3 能量點（Energy Point）— 取代固定每日配額

**結論：比固定配額更好，但必須設三重上限，否則細路可以無限刷。**

| 項目 | 規則 |
|---|---|
| 獲取 | 每日登入 +1 EP；完成 10 題 +1 EP（每日最多 3 次，即 30 題） |
| 每日獲取上限 | **4 EP** |
| 持有上限 | **8 EP**（可囤 2 日，週末玩多幾場） |
| 每日消耗上限 | **4 EP**（兒童時長硬紅線：約 20–25 分鐘對戰） |
| 消耗 | **1 EP = 1 場**（AI 對戰或 PvP 好友對戰，任何難度同價） |
| 新手初始 | 5 EP |
| 顯示 | 首頁頂部 ⚡ 計量條 + 明日重置倒數 |

**為何比固定配額好**

| 維度 | 固定每日配額 | 能量點 |
|---|---|---|
| 學習與對戰連結 | 弱（純計時器） | **強（答題 → 對戰）** |
| 擴展性 | 無 | **高（新任務可發其他獎勵）** |
| 玩家自主 | 低（今日不用即逝） | **高（可囤積）** |
| 兒童時長控制 | 天然硬頂 | 需三重上限（獲取／持有／消耗） |
| PvP 整合 | 尷尬 | **自然（同一貨幣）** |

**實作約束**：EP 餘額與任務完成必須 server-authoritative——答題經 `settle_round` 驗證、對戰扣減經 `spend_energy` RPC；前端只做顯示與樂觀更新，斷線重連以 server 餘額為準。

### 6.4 PvP 好友對戰（非同步）

- **形式**：上傳隊伍 snapshot，好友用 friend code 挑戰（非即時，唔依賴 WebSocket）
- **成本**：挑戰方 1 EP；防守方 0 EP（避免被朋友騷擾扣資源）
- **獎勵**：EXP + PvP 積分；**不派鑽石**（防止朋友互相刷獎勵）
- **新表**：`user_pvp_teams`（snapshot jsonb）、`pvp_challenges`、`pvp_battles`（審計）
- **防作弊**：server 驗證 snapshot 合法性（等級／招式／道具上限）；PvP 結果**不計入 trainer mastery**
- **分階段**：P1 只做 snapshot + 非同步挑戰；即時對戰列入 v2.1 backlog

---

## 7. UX 與視覺系統

### 7.1 Trainer 卡（改造現有 `.ai-trainer-card`）

- 卡面顯示四個難度槽位（chip 行）：已破 = 實色章、可挑戰 = 空心、未解鎖 = `???` 剪影
- **等級顯示規則（修正「貨不對版」）**：主卡**唔顯示單一固定 Lv**，改為顯示實際範圍（例：`Lv. 52–64`，由 base ±10% 計算）；難度選擇畫面才顯示該 tier 的精確等級；Inferno 額外顯示 `Foe Lv. 76 · You sync to Lv. 78`；戰鬥內敵人等級一律顯示實際計算值
- 火焰邊框（純 CSS + inline SVG，零圖片資產）——**視覺參考：頭文字 D 街機（Initial D Arcade Stage）嘅鬼火 aura**：火焰唔係靜態描邊，而係沿框體**向上流動嘅火舌帶**，特徵包括 ① 多層半透明火焰互相追趕產生湍流感、② 白熱核心 → 主色 → 透明嘅三層漸變、③ 頂部飄出火星微粒（ember）向上消散、④ 整體帶速度感嘅縱向 flicker。實裝對應：2–3 層 SVG flame path 用 `translateY + scaleY` 交錯 keyframes 模擬追趕、頂邊均佈 4–6 粒細圓點做 ember 用 `translateY/opacity` 上飄消散、全部只用 `transform`/`opacity`
  - Hard 可挑戰/已解鎖 → 紫鬼火（Will-O-Wisp 色 `#8B5CF6`，核心 `#C4B5FD`）
  - Inferno 可挑戰/已解鎖 → 彩虹鬼火，重用 SRS 記憶曲線橫幅嘅彩虹循環色板（粉紅→橙→黃→綠→青→紫）
  - 全部動畫包喺 `@media (prefers-reduced-motion: no-preference)` 及 `@media (hover: hover) and (pointer: fine)` 既有守衛內
- Flawless 通關嘅槽位加金星

### 7.2 Mastery Wall（新頁面/區塊）

14 trainer × 4 tier = **56 格獎章牆**，放喺 Battle 選單頂部或獨立 tab。完成度（如 `27/56`）係玩家嘅長線收集目標，直接支撐 retention KPI。

### 7.3 解鎖演出

- Hard 解鎖：toast + 卡面紫火點燃動畫（一次性）
- Inferno 解鎖：全屏短演出（≤2.5s，可點擊跳過）——黑暗背景彩虹火由中心燃開，標題 `INFERNO UNLOCKED — <Trainer Name>`；首次任何 Inferno 解鎖時先播 full 版，之後播精簡版

---

## 8. 技術架構與資料模型

### 8.1 Client 模組改動

| 檔案 | 改動 |
|---|---|
| `js/battle/battle.js` | `AI_TRAINERS` 改為只存基礎 roster；新增 `DIFFICULTY_PRESETS` 常量表；新增 `buildFoeTeam(trainer, tier)`（等級/IV/EV/性格/招式生成）；`openTeamSelect` 以 `playerSlots(trainer.team.length, tier)` 取代隨機 `[1,3,6]`；trainer 卡渲染四槽位 |
| `js/battle/engine.js` | AI 出招函數加 `iq` 參數，實裝 T0–T3；支援 AI 換人同道具回合 |
| `js/battle/state.js` | 支援 Level Sync（建立戰鬥時覆寫 stats 計算輸入等級） |
| `js/storage.js` | `aiTrainersBeaten: string[]` → `trainerProgress: { [id]: { easy, normal, hard, inferno, flawless[] } }`；`migrateState()` 處理舊存檔（舊 array 每個 id 視為 normal 已破） |
| `js/sync.js` | 同步 `trainerProgress`；RPC 失敗 banner 沿用既有模式 |
| `js/supabase-auth.js` | 新增 `settleBattleV2()` wrapper |
| `styles.css` | 鬼火框、槽位 chip、解鎖演出樣式（遵守 hover/reduced-motion 守衛） |

### 8.2 Supabase

- 新表 `user_trainer_progress`（account_id, trainer_id, tier, cleared_at, flawless, times_cleared）
- 新表 `user_battles`（審計：account_id, trainer_id, tier, won, flawless, reward_json, created_at）
- 新 RPC `settle_battle_v2`（§6.2）；獨立遷移檔 `supabase-migrate-YYYYMMDD-battle-tiers.sql`
- 執行後 `notify pgrst, 'reload schema';`

### 8.3 版本與發佈紀律（硬性）

- 每次發佈：`APP_VERSION`（app.js）+ `CACHE_NAME`（sw.js）+ `index.html` 全部 `?v=NN` 三處同步
- 完成後 `tools/git_commit_push.py` commit + push（用 `--paths` 限定範圍，防夾帶）
- 本機 PowerShell 5：串連指令用 `;` 唔用 `&&`

---

## 9. 數據與 KPI（商業閉環）

`user_battles` 審計表直接支持以下指標（每週 review）：

| KPI | 定義 | 目標 |
|---|---|---|
| Battle DAU 滲透 | 日活中完成 ≥1 場對戰比例 | ≥50% |
| Hard+ 觸及率 | 7 日內打過 Hard/Inferno 嘅活躍玩家比例 | ≥40% |
| Inferno 轉化 | 解鎖 Inferno 後 7 日內嘗試率 | ≥70% |
| 難度漏斗 | 每 trainer 每 tier：嘗試 → 通關率 | Normal 60–80% / Hard 40–55% / Inferno 20–35% |
| 放棄點 | 連敗 3 場後 24h 流失率 | 較現況下降 |
| Mastery 完成度分佈 | 56 格平均完成格數 | 逐週上升 |
| EP 循環健康 | 每日平均獲取 / 消耗 / 持有餘額 | 獲取 3.2–4.0、消耗 2.5–4.0、持有 ≤8 |
| 答題→對戰轉化 | 完成 10 題後 24h 內消耗 EP 比例 | ≥60% |
| PvP 參與率 | 每週發起 ≥1 次好友對戰嘅活躍用戶 | ≥25%（P2 上線後） |

失衡應對：某 tier 通關率 <15% → 檢查 IQ/等級曲線；>85% → 檢查獎勵係咪過度派發。平衡調整**只改 PRESET 常量表**，唔改邏輯。

---

## 10. 分期交付（每期可獨立上線）

| Phase | 內容 | 驗收標準 |
|---|---|---|
| **P1 — 地基** | 14 trainer roster、`trainerProgress` 資料模型 + migration、`DIFFICULTY_PRESETS`（頭數/等級軸先行）、trainer 卡四槽位 UI + 等級範圍顯示、`settle_battle_v2` RPC + 兩張新表 | 舊存檔無痛遷移；Easy/Normal/Hard 可玩；獎勵 server 重算正確；匿名可玩唔同步；卡面等級範圍同實際等級一致 |
| **P2 — 智能 + 能量** | AI IQ T0–T3、IV/EV/性格/招式軸、AI 換人與道具；EP 系統（任務／錢包／三重上限）+ `spend_energy` RPC | T2 期望傷害計算單測通過；T3 行為可重放；EP 上限與扣減 server 驗證正確 |
| **P3 — 包裝** | 鬼火框、Mastery Wall（56 格）、解鎖演出、Level Sync（Inferno） | reduced-motion 下零動畫；Level Sync 提示明確；56 格進度正確 |
| **P4 — PvP + 調優** | 非同步好友對戰（snapshot + friend code）、首週數據 review、平衡表調整 | PvP 不派鑽石且不計 mastery；出第一份 balance report |

明確**唔做**（防 scope creep）：即時 PvP、Gauntlet 連戰、天氣/場地機制——全部列入 v2.1 backlog，今期唔郁。

---

## 11. 風險登記冊

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| 平衡爆炸（14×4 組合） | 中 | 高 | 單一公式 + PRESET 常量表；平衡只調表唔調碼 |
| Inferno 仍然過難（玩家卻步） | 中 | 高 | Level Sync +2、AI 只 1 個 Potion、T3 保留 15% 隨機；上線後按通關率調 PRESET |
| T3 AI 出現 exploit（玩家搵到傻 AI 規律） | 中 | 中 | tie-break 用 seeded random；KPI 監察通關率異常 |
| Level Sync 令玩家誤解等級被扣 | 中 | 中 | 出戰確認 + 戰鬥內雙重提示文案 |
| 舊存檔 migration 出錯 | 低 | 高 | migration 純函數 + 本地測試矩陣（空檔/舊檔/新檔） |
| RPC 上線即壞（42702/42703 類歷史問題） | 中 | 高 | 遵守 `v_` 前綴 + 先加欄位後 GRANT 順序 + live 實測先發佈 |
| EP 系統被刷（小朋友狂答題換對戰） | 中 | 中 | 每日獲取上限 4、持有上限 8、每日消耗上限 4，全部 server 驗證 |
| 動畫拖累低階機 | 低 | 低 | 純 transform/opacity；reduced-motion 全停用 |

---

## 12. 簽核

- [ ] Product（難度曲線、解鎖節奏、獎勵表）
- [ ] Design（鬼火框、Mastery Wall、解鎖演出）
- [ ] Engineering（P1–P4 task breakdown、RPC schema、migration 測試矩陣）
- [ ] Data（KPI 定義、第一週基準線目標）
