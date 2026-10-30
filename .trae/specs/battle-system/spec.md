# PokeEngmon Battle System - Product Requirements Document

## Overview
- **Summary**: 加入獨立對戰系統，支援 **線上 PvP（Supabase realtime）** 同 **AI Trainers 梯隊**兩種模式，使用完整 Gen 5 招式效果。唔做野外戰。
- **Purpose**: 答題抽精靈之外，俾玩家用自己嘅 Pokémon 同人/電腦對戰，獲得 EXP、鑽石、EV 點同道具。
- **Target Users**: 已收集到 Pokémon 嘅玩家（至少 1 隻可出戰）。

## Goals
- 玩家可以從主頁獨立入口進入對戰。
- 對戰有兩條路線：PvP（線上配對）同 AI Trainers（電腦梯隊，逐個解鎖）。
- 完整 Gen 5 對戰規則：優先度 → 速度排序、命中、傷害公式、相剋/STAB、status、stat stage ±6、多段 hit、治療、效果機率。
- 對戰完結派獎勵（EXP / 鑽石 / EV 點 / 道具），EXP 可升級/學招/進化。

## Non-Goals
- 野外戰 / 遇敵系統（唔做）。
- 對戰中捕捉（capture scene 唔接入對戰）。
- 雙打／三打／輪轉戰（只做單打）。
- 跨裝置戰鬥回放、觀戰。
- PvP 排名榜（梯隊解鎖已足夠，獨立 leaderboard 留第二階段）。

## Background & Context
- 資料層已齊：`data/moves.json`（563 招，含 type/power/accuracy/pp/priority/damage_class/meta/stat_changes）、`data/type-chart.json`（18 屬相剋）。
- Helper 已有：`calcStats(dexId, level, ivs, evs, nature)`、`moveInfo(slug)`、`typeMultiplier(atk, defTypes)`、`entryCurrentSpecies(entry)`。
- 每隻 entry 已有 `moves`（持有 ≤4）同 `knownMoves`（招式池），玩家可喺 Pokédex 配招。
- 現有 Supabase + realtime 基礎（auth、entries 同步），可重用做對戰狀態同步。
- 現有 capture scene（Three.js）唔接入對戰。

## Functional Requirements

### 入口與隊伍選擇
- **FR-1**: 主頁加「Battle」入口按鈕，進入對戰模式選擇畫面（PvP / AI Trainers）。
- **FR-2**: PvP 路線：玩家點「Find Match」→ 進入配對池；配對成功後，雙方各自從自己嘅 Pokémon 中選出戰隊伍。
- **FR-3**: AI Trainers 路線：顯示 trainer 梯隊列表，已解鎖嘅可挑戰，未打贏嘅鎖住。
- **FR-4**: 對戰開始前，雙方各選出戰 Pokémon：隊伍大小由系統隨機決定 1v1 / 3v3 / 6v6（50/50/... 機率，對戰開始前顯示畀雙方知），玩家從自己擁有嘅 entry 入面揀。
- **FR-5**: 玩家只可以揀「而家持有嘅物種」（`entryCurrentSpecies`）嘅 entry 出戰，已進化走嘅唔可以。

### 對戰畫面（火紅版 UI）
- **FR-6**: 戰鬥畫面 `view-battle` **完全對照 Pokémon FireRed/LeafGreen 對戰 UI 排版**：
  - 上半場景：敵方 sprite 喺右上方、我方 sprite 喺左下方（用現有 sprite/animated assets）。
  - 敵方 HP box 喺左上角：名、Lv、HP bar（綠>50%／黃 20-50%／紅<20%）。
  - 我方 HP box 喺右下角：名、Lv、HP bar、EXP bar。
  - 下半部：左邊文字框（顯示「什麼什麼使出了什麼招式」等敘述），右邊 2×2 選單：**FIGHT / BAG / POKéMON**（BAG disabled 灰掉；**唔顯示 RUN**）。
  - FIGHT → 4 招按鈕 2×2，每個顯示招式名 + PP，type 顏色邊框。
  - POKéMON → 隊伍畫面（6 格，顯示 sprite/名/Lv/HP bar/狀態，暈咗嘅灰掉）。
  - 揀完招式/換人後返回文字框顯示敘述 + 動畫。
- **FR-7**: 每回合雙方同時選動作（出招 / 換 Pokémon）；PvP 要等齊雙方先 resolve；AI 即時決定。道具/逃跑唔提供（見 FR-16/17）。
- **FR-8**: 行動順序：先按招式 `priority`（高先出），同 priority 按速度（`spe`），同速隨機。交換 Pokémon 永遠係最高優先（除非被追擊/黑眼神等鎖住）。
- **FR-9**: 招式執行：命中判定（accuracy、避開率、必中）→ 屬性相剋 → 傷害公式（Gen 5：`floor(floor(floor(2*Lv/5+2)*Power*Atk/Def)/50)+2` × 相剋 × STAB × 隨機 0.85-1.0 × burn 0.5（physical）× 其他）→ 效果（status、stat stage、多段、治療、吸取、畏縮）。
- **FR-10**: Status 效果完整：burn（每回合扣 1/16 max HP、physical 攻擊減半）、paralyze（25% 唔郁、速度減半）、poison（每回合扣 1/8）、toxic（倍數毒）、sleep（1-3 回合）、freeze（20% 解凍）、confusion（50% 打自己）。
- **FR-11**: Stat stage ±6：攻擊/防禦/特攻/特防/速度/命中/閃避，每級倍率（±1: 1.5/0.67, ±2: 2/0.5, ±3: 2.5/0.4, ±4: 3/0.33, ±5: 3.5/0.29, ±6: 4/0.25；命中/閃避用另一表）。
- **FR-12**: 多段 hit：`meta.min_hits`–`max_hits`（含 2-5 hit 機率表），每段獨立命中/傷害。
- **FR-13**: 治療類：`meta.healing`（% max HP 回復）；吸取類：`meta.drain`（傷害嘅 % 回復）。
- **FR-14**: PP：每招有 PP，用完唔使；對戰唔回復 PP（完結先回）。
- **FR-15**: 換 Pokémon：可喺回合揀換；被打到暈（HP=0）必須換；雙方都冇可出戰 Pokémon 就輸。
- **FR-16**: 道具：BAG 按鈕存在（火紅版 2×2 選單其中一格），但**暫時 disabled**（灰掉、撳唔到）；對戰中唔可用道具。
- **FR-17**: 逃跑：**完全唔提供 Run 選項**（PvP 同 AI 戰都冇）。選單只顯示 FIGHT / POKéMON / BAG（BAG disabled）；唔顯示 RUN。

### PvP 線上同步
- **FR-18**: Supabase 表 `battles`（id, mode, p1_uid, p2_uid, p1_team, p2_team, team_size, state, turn, p1_action, p2_action, winner, created_at, updated_at）+ `battle_log`（回合 log）。
- **FR-19**: 配對：玩家入池 → server 找另一個入池玩家 → 開 battle row → 雙方 subscribe 自己 battle row（realtime）。
- **FR-20**: 回合同步：玩家 submit action → update `p1_action`/`p2_action`；當兩邊都有 action → 觸發 resolve（由先 submit 嗰邊 client 計算，結果寫返 battle row + log）；雙方 render 結果。
- **FR-21**: 超時：對方 60 秒唔出招 → 自動隨機出招；120 秒冇反應 → 判負。
- **FR-22**: 斷線重連：player refresh 後可重新 subscribe 自己 ongoing battle row 繼續。

### AI Trainers
- **FR-23**: 5 個 AI trainers，固定等級/隊伍/招式，由弱到強排列；打贏第 N 個先解鎖第 N+1 個。
- **FR-24**: AI 決策：優先考慮相剋（用威力 × 相剋最高嘅招）、考慮 PP、低 HP 有機會用治療招、status 招有機率用。

### 獎勵
- **FR-25**: 贏 AI trainer：出戰嘅 Pokémon 獲得 EXP（按對手等級差計算）、玩家獲得鑽石（按 trainer 強度）、隨機 1 個道具（食物/進化石/復活藥/狀態藥）、EV 點（按擊敗對手嘅物種 EV yield）。
- **FR-26**: 贏 PvP：EXP + 鑽石 + EV 點（無道具）。
- **FR-27**: 輸咗：少量 EXP（參與獎），冇鑽石/道具/EV。
- **FR-28**: EXP 結算觸發升級/學招/進化（沿用 `addEntryExp` 機制）。

## Non-Functional Requirements
- **NFR-1**: 對戰單回合 resolve 喺 client 端 < 100ms（不計同步）。
- **NFR-2**: PvP 配對等待 ≤ 30 秒先顯示「未搵到對手，再試/打 AI」。
- **NFR-3**: 對戰狀態喺斷線/refresh 後 5 秒內可恢復。
- **NFR-4**: 對戰引擎可獨立測試（node --check + 邏輯測試），唔依賴 DOM。

## Constraints
- **Technical**: 純前端 static PWA + Supabase（Postgres + realtime）；對戰引擎 client-side resolve，server 只做狀態同步同配對。
- **Business**: 唔做收費；鑽石/道具獎勵要平衡，唔可以破壞答題主線嘅經濟。
- **Dependencies**: Supabase 要加 `battles`/`battle_log` 表 + realtime enable；client 已有 `js/supabase-auth.js`。

## Assumptions
- PvP resolve 由先 submit action 嘅 client 計算，另一方 trust 結果（簡化，避免雙算分歧；將來可加 server-side resolve）。
- 隊伍大小隨機 1v1/3v3/6v6，權重各 1/3（用戶話「抽 50/50」但有 3 個選項，理解為三揿一）。
- AI trainers 嘅 Pokémon 用固定 entry（唔喺玩家 entries 表）。

## Acceptance Criteria

### AC-1: Battle 入口
- **Type**: `rule`
- **Given**: 玩家已登入並有至少 1 隻 Pokémon
- **When**: 喺主頁撳「Battle」
- **Then**: 進入對戰模式選擇畫面，見到「PvP」同「AI Trainers」兩個選項
- **Pass Condition**: 兩個按鈕可見可撳
- **Evidence**: 瀏覽器截圖

### AC-2: AI Trainers 梯隊解鎖
- **Type**: `rule`
- **Given**: 玩家從未打 AI
- **When**: 進入 AI Trainers 畫面
- **Then**: 只見第 1 個 trainer 可挑戰，其餘鎖住
- **Pass Condition**: 第 1 個 unlocked，其他顯示 🔒
- **Evidence**: 瀏覽器截圖 + localStorage `aiTrainersBeaten`

### AC-3: 隊伍選擇隨機大小
- **Type**: `rule`
- **Given**: 玩家開始一場對戰（PvP 配對成功 or 選咗 AI trainer）
- **When**: 進入隊伍選擇
- **Then**: 系統顯示隊伍大小（1 / 3 / 6），玩家只能揀咁多隻
- **Pass Condition**: 顯示嘅大小 ∈ {1,3,6}，選擇數量受限
- **Evidence**: 瀏覽器截圖

### AC-4: 行動順序（優先度 → 速度）
- **Type**: `rule`
- **Given**: 我方 A 用 Quick Attack（priority +1），對方 B 用 Tackle（priority 0），B 速度 > A
- **When**: 雙方同時出招
- **Then**: A 先出手
- **Pass Condition**: log 顯示 A 嘅招先執行
- **Evidence**: 對戰引擎測試輸出

### AC-5: 傷害公式含相剋同 STAB
- **Type**: `rule`
- **Given**: 火屬 Pokémon 用 Ember（power 40）打草屬，同自己屬性一致（STAB ×1.5）
- **When**: 命中
- **Then**: 傷害 = floor(floor(floor(2*Lv/5+2)*40*Atk/Def)/50+2) × 2（草剋火）× 1.5（STAB）× 隨機
- **Pass Condition**: 計算值喺公式範圍內
- **Evidence**: 引擎單元測試

### AC-6: Status 效果
- **Type**: `rule`
- **Given**: 對方被 Thunder Wave 命中（paralyze）
- **When**: 其後回合
- **Then**: 25% 機率唔郁，速度 ×0.5
- **Pass Condition**: 多次測試平均約 25% skip，速度值減半
- **Evidence**: 引擎測試（1000 次模擬）

### AC-7: Stat stage
- **Type**: `rule`
- **Given**: 對方用 Swords Dance（atk +2）
- **When**: 其後 physical 招傷害
- **Then**: 攻擊力 ×2
- **Pass Condition**: 傷害約為未 buff 嘅 2 倍
- **Evidence**: 引擎測試

### AC-8: 多段 hit
- **Type**: `rule`
- **Given**: 用 Double Slap（2-5 hits）
- **When**: 命中
- **Then**: 總傷害 = 單段 × hit 次數（2-5），每段有獨立動畫/log
- **Pass Condition**: hit 次數 ∈ {2,3,4,5}，log 顯示每段
- **Evidence**: 引擎測試

### AC-9: 被打到暈要換 Pokémon
- **Type**: `rule`
- **Given**: 我方出戰 Pokémon HP=0
- **When**: 回合結束
- **Then**: 強制進入換 Pokémon 畫面，有其他可戰就一定要揀，冇就輸
- **Pass Condition**: 彈出換 Pokémon UI
- **Evidence**: 瀏覽器實測

### AC-10: PvP 配對同步
- **Type**: `rule`
- **Given**: 兩個玩家同時點 Find Match
- **When**: 配對成功
- **Then**: 雙方都進入同一場 battle，subscribe 同一 battle row
- **Pass Condition**: 雙方 battle id 相同
- **Evidence**: 兩個瀏覽器分頁實測

### AC-11: PvP 回合同步
- **Type**: `rule`
- **Given**: 一場進行中嘅 PvP battle
- **When**: 雙方都 submit 咗 action
- **Then**: battle row 更新 turn+1，雙方 render 同一個結果
- **Pass Condition**: 雙方 HP/status 同步
- **Evidence**: 兩個分頁實測

### AC-12: 超時自動出招
- **Type**: `rule`
- **Given**: 對方 60 秒冇 submit action
- **When**: 超時
- **Then**: 系統自動幫佢揀一招（隨機有 PP 嘅），繼續對戰
- **Pass Condition**: 60s 後對方有 action
- **Evidence**: 引擎 + 實測

### AC-13: 斷線重連
- **Type**: `rule`
- **Given**: 對戰中 refresh 頁面
- **When**: 重新載入
- **Then**: 自動恢復 ongoing battle，狀態（HP/PP/status/turn）一致
- **Pass Condition**: 重連後 battle 狀態同 refresh 前
- **Evidence**: 實測

### AC-14: 獎勵結算
- **Type**: `rule`
- **Given**: 玩家贏咗 AI trainer
- **When**: 對戰完結
- **Then**: 出戰 Pokémon 獲得 EXP，玩家獲得鑽石 + 隨機道具 + EV 點，EXP 足夠會升級
- **Pass Condition**: 鑽石增加、背包多咗道具、entry exp 增加
- **Evidence**: localStorage diff

### AC-15: 火紅版 UI 對照
- **Type**: `rubric`
- **Dimension**: 對戰 UI 與 Pokémon FireRed/LeafGreen 排版一致度 + 流暢度
- **Scale**: 1-5
- **Anchors**: 1 = 完全唔似火紅版 / 狀態混亂；3 = 大體排版對（HP box 位置、2×2 選單）但細節有出入；5 = 精確對照火紅版（敵 HP box 左上、我 HP+EXP box 右下、文字框+2×2 選單 FIGHT/BAG/POKéMON、FIGHT 後 2×2 招式鈕），HP 綠黃紅漸變、動畫順暢、BAG 灰掉冇 RUN
- **Pass Threshold**: >= 4
- **Evidence**: 瀏覽器截圖對照火紅版戰鬥畫面

## Open Questions
- [ ] PvP resolve trust model：而家假設先 submit 嗰邊計算，對方 trust。要唔要加 server-side RPC resolve？（留第二階段）
- [ ] 隊伍大小「50/50」係指 1v1 vs 3v3 二揈一，定 1/3/6 三揈一？（暫定三揈一，需確認）
- [ ] AI trainers 具體數量/隊伍/等級？（暫定 5 個，等級由 5 到 50，需確認）
- [ ] 鑽石/道具/EV 獎勵具體數值？（暫定按 trainer 強度，需 balance）
