# PokeEngmon Battle System - Implementation Plan

## Task 1: Supabase 對戰 schema
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 新增 migration：`battles` 表（id, mode, p1_uid, p2_uid, p1_team, p2_team, team_size, state, turn, p1_action, p2_action, p1_team_state, p2_team_state, winner, created_at, updated_at）+ `battle_log` 表（battle_id, turn, actor, action, payload, created_at）。
  - Enable realtime on `battles`。
  - RLS：player 只能 read/update 自己有參與嘅 battle；insert 只限配對 RPC。
- **Acceptance Criteria Addressed**: AC-10, AC-11, AC-13
- **Test Requirements**:
  - `rule` TR-1.1: migration 可重複執行（idempotent），`battles`/`battle_log` 表存在且有 RLS
  - `rule` TR-1.2: `battles` 已 enable realtime（supabase dashboard 可確認）
- **Notes**: 用現有 migration 命名慣例 `supabase-migrate-YYYYMMDD-battle-schema.sql`

## Task 2: 對戰引擎核心（js/battle/engine.js）
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - `computeDamage(attacker, defender, move)`：Gen 5 公式 `floor(floor(floor(2*Lv/5+2)*Power*Atk/Def)/50)+2` × typeMult × STAB × rand(0.85-1.0) × burn×0.5(physical)。
  - `turnOrder(a1, a2)`：priority desc → spe desc → random tiebreak。
  - `hitCheck(move, attacker, defender)`：accuracy × evasion stage；必中招必中。
  - 獨立檔案，唔依賴 DOM，可 node 測試。
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `rule` TR-2.1: priority+1 招必定快過 priority 0（不論速度）
  - `rule` TR-2.2: 火打火 Ember 打草，傷害含 ×2 相剋同 ×1.5 STAB
- **Completion Evidence**:
  - `node tools/_test_battle.js` → 6 PASS, 0 FAIL；Ember avg damage 18.1（含 STAB+相剋）
- **Notes**: 攻擊/防禦用 spa/spd 當 damage_class=special，atk/def 當 physical

## Task 3: 對戰狀態模型（js/battle/state.js）
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - `BattleState`：雙方 team（每隻有 species/level/stats/hp/maxHp/pp/status/statStages/moves）。
  - `applyMove(state, actor, move, target)`：執行傷害、status、stat stage、多段、治療、吸取、畏縮。
  - `hasUsablePokemon(team)` / `faintedActive(state)`。
- **Acceptance Criteria Addressed**: AC-4, AC-5, AC-6, AC-7, AC-8, AC-9
- **Test Requirements**:
  - `rule` TR-3.1: paralyze 後速度 ×0.5，1000 次模擬 skip 率 ≈ 25% (±5%)
  - `rule` TR-3.2: Swords Dance atk+2 後 physical 傷害約 2×
  - `rule` TR-3.3: Double Slap hit 次數 ∈ {2,3,4,5}
- **Completion Evidence**:
  - 測試輸出：paralyze skip 25.1%、atk base 25 → atk+2 50、hit counts {2,3,4,5}、完整對戰有勝負
- **Notes**: status 用 {burn, paralyze, poison, toxic, sleep, freeze, confusion} + 計數器

## Task 4: 招式效果執行器（併入 js/battle/state.js）
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - 依 `move.meta`（ailment, ailment_chance, crit_rate, drain, flinch_chance, healing, stat_chance, min_hits, max_hits）同 `stat_changes` 執行效果。
  - crit：crit_rate 對應機率表（Gen 5：stage 0 = 1/16, +1=1/8, +2=1/4, +3=1/3, +4+=1/2）。
  - 多段 hit 機率：2 hit 3/8, 3 hit 3/8, 4 hit 1/8, 5 hit 1/8。
- **Acceptance Criteria Addressed**: AC-6, AC-7, AC-8
- **Test Requirements**:
  - `rule` TR-4.1: Recover healing = 50% maxHP
  - `rule` TR-4.2: Absorb drain = 傷害 50% 回復
  - `rule` TR-4.3: Thunder Wave 90% 命中後 100% paralyze（ailment_chance=null = 100%）
- **Completion Evidence**:
  - 效果邏輯已實作喺 state.js executeMove（ailment/stat changes/healing/drain/flinch/crit/multi-hit），由 Task 3 嘅完整對戰模擬涵蓋
- **Notes**: effect_chance 係 move level 機率，ailment_chance 係 meta level

## Task 5: 對戰畫面 UI（火紅版）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - `index.html` 加 `view-battle` section，**完全對照 FireRed/LeafGreen 對戰排版**：
    - 上半場景：敵 sprite 右上、我 sprite 左下。
    - 敵 HP box 左上：名、Lv、HP bar（綠>50%／黃 20-50%／紅<20%）。
    - 我 HP box 右下：名、Lv、HP bar、EXP bar。
    - 下半部：左文字框（敘述出招/效果），右 2×2 選單 **FIGHT / BAG / POKéMON**。
    - **BAG disabled**（灰掉、pointer-events none）；**唔顯示 RUN**。
    - FIGHT → 4 招 2×2 按鈕（名 + PP，type 顏色邊框）。
    - POKéMON → 隊伍畫面（6 格 sprite/名/Lv/HP/狀態，暈咗灰掉）。
  - 動畫：出招 sprite 震動、HP bar 漸減（綠黃紅隨百分比變色）、status icon 彈出。
- **Acceptance Criteria Addressed**: AC-1, AC-9, AC-15
- **Test Requirements**:
  - `rule` TR-5.1: 我方 Pokémon HP 歸零後自動彈 POKéMON 隊伍畫面（強制換人）
  - `rule` TR-5.2: 選單只見 FIGHT / BAG / POKéMON，BAG 有 disabled 狀態，冇 RUN 按鈕
  - `rubric` TR-5.3: 火紅版 UI 一致度；scale 1-5；anchors 1=唔似/3=大體對/5=精確對照；threshold >=4；瀏覽器截圖對照
- **Notes**: 沿用現有 `app.js` showView 模式；參考火紅版戰鬥截圖做 CSS

## Task 6: 入口 + 模式選擇 + 隊伍選擇
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5
- **Description**:
  - 主頁加 Battle 按鈕 → `view-battle-menu`（PvP / AI Trainers）。
  - PvP：Find Match 按鈕 → 配對中畫面。
  - AI Trainers：trainer 梯隊列表（已解鎖可挑戰，未打贏鎖住；`st.aiTrainersBeaten`）。
  - 隊伍選擇：隨機決定 teamSize ∈ {1,3,6}，玩家從自己 entries（現持有物種）揀。
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `rule` TR-6.1: 主頁 Battle 按鈕可入對戰選單
  - `rule` TR-6.2: AI 列表第 1 個 unlocked，其餘 locked
  - `rule` TR-6.3: teamSize 顯示後選擇數量受限
- **Notes**: teamSize 隨機用 Math.floor(Math.random()*3) → [1,3,6]

## Task 7: AI Trainer 資料 + 決策
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - `data/ai-trainers.json`：5 個 trainers，每個有 name/level/team[{dexId,level,moves,ivs,nature}]。
  - `aiPickAction(state)`：優先威力×相剋最高招；低 HP (<30%) 有治療招就用；status 招 30% 機率；follow me/protect 類唔用。
- **Acceptance Criteria Addressed**: AC-2, AC-24
- **Test Requirements**:
  - `rule` TR-7.1: AI 面對弱點時優先選相剋招（可重複測試 >80% 選中）
- **Notes**: trainers 等級 5→50 漸強

## Task 8: 獎勵結算
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - 完結畫面：勝/負、獲得 EXP/鑽石/道具/EV。
  - `applyBattleRewards(entry, trainer)`：EXP 按等級差（`expYield` from species）、鑽石按 trainer tier、道具隨機（食物/進化石/復活藥/狀態藥）、EV 按對手物種 EV yield。
  - 用 `addEntryExp` 觸發升級/學招/進化。
- **Acceptance Criteria Addressed**: AC-14, AC-25, AC-26, AC-27, AC-28
- **Test Requirements**:
  - `rule` TR-8.1: 贏 AI 後鑽石 +、背包 +1 道具、entry.exp +
  - `rule` TR-8.2: EXP 足夠時 entry.level 上升
- **Notes**: 輸只有少量 EXP；PvP 無道具

## Task 9: PvP 配對 + 同步
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1, Task 5
- **Description**:
  - `findMatch()`：player 入配對池（Supabase `matchmaking` 表或 RPC）→ server 配對 → 開 battle row。
  - `subscribeBattle(battleId)`：realtime 聽 battle row 變化。
  - `submitAction(battleId, player, action)`：update p1_action/p2_action。
  - `resolveIfReady(battle)`：當兩邊都有 action，由先 submit 嗰邊 client 用 engine resolve，寫返 team_state + log + turn+1。
- **Acceptance Criteria Addressed**: AC-10, AC-11
- **Test Requirements**:
  - `rule` TR-9.1: 兩個分頁配對成功後 battle id 相同
  - `rule` TR-9.2: 雙方 submit 後兩邊 render 同一結果（HP 同步）
- **Notes**: resolve 加 lock 避免雙方同時算（check `turn` 冇變先 resolve）

## Task 10: 超時 + 斷線重連
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 9
- **Description**:
  - 60s 對方冇 action → 自動隨機揀有 PP 嘅招。
  - 120s 冇反應 → 判負。
  - 頁面 load 時 check 有冇 ongoing battle（自己 uid 參與、state=active）→ 自動 subscribe 恢復。
- **Acceptance Criteria Addressed**: AC-12, AC-13
- **Test Requirements**:
  - `rule` TR-10.1: refresh 後 ongoing battle 狀態恢復
  - `rule` TR-10.2: 對方 60s 唔郁後自動出招
- **Notes**: timer 用 client-side setTimeout，reconnect 後重置

## Task 11: 引擎單元測試
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 2, Task 3, Task 4
- **Description**:
  - 用 node 寫測試 harness（同之前進化/配招測試方式），涵蓋 AC-4 到 AC-8。
  - 覆蓋：turn order、damage formula、所有 status、stat stage、multi-hit、healing、drain、crit。
- **Acceptance Criteria Addressed**: AC-4, AC-5, AC-6, AC-7, AC-8
- **Test Requirements**:
  - `rule` TR-11.1: 所有測試 PASS（node 執行，exit 0）
- **Completion Evidence**:
  - `node tools/_test_battle.js` → 6 PASS, 0 FAIL，exit 0
- **Notes**: 臨時測試檔案 `tools/_test_battle.js` 保留作回歸用（之前測試檔用完即刪，但呢個對戰引擎會持續擴充，保留）

## Task 12: 瀏覽器 E2E 驗證
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 6, Task 7, Task 8, Task 9, Task 10
- **Description**:
  - AI 戰完整打一場：入 → 隊伍 → 出招 → 打贏 → 獎勵。
  - PvP 兩分頁：配對 → 同步出招 → 完結。
  - 驗 status/換 Pokémon/逃跑（AI 戰）。
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15
- **Test Requirements**:
  - `rule` TR-12.1: AI 戰由頭到尾冇 console error
  - `rule` TR-12.2: PvP 兩分頁狀態同步
  - `rubric` TR-12.3: 對戰體驗 >= 4
- **Notes**: 用 seed 入面嘅 Pokémon 測試
