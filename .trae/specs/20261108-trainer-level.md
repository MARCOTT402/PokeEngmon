# Spec：Trainer Lv（訓練員等級）— 2026-11-08

> **狀態（2026-11-08）**：已實作，未 commit。Migration 已套用（`supabase-migrate-20261108-trainer-level.sql`）；plan `.trae/documents/20261108-trainer-level-impl.md`。
> 同 spec 嘅差異：排行榜 `get_leaderboard` 係 `returns table`，改回傳要 drop function，所以改用新 RPC `get_trainer_levels(uids)`（Friends 名單都用佢），唔郁 `get_leaderboard`／`get_my_friends`；升級提示用 toast（`TrainerLevel.adopt`）；全隊暈咗而冇其他健康 Pokémon 時沿用原本「use a Revival first」提示。

> 來源：battle menu 訓練員卡 prototype（`tools/prototype/battle-menu-app.html`）＋ 方案文件 `.trae/documents/20261108-trainer-level-plan.md`。
> 用戶已決定：方案 A；EXP 用建議數值；**舊玩家全部由 Lv1 開始**；每 5 級 💎10；Lv 顯示喺 battle menu 資料牌、Friends 名單／好友卡、PvP 戰前頁、排行榜。
> 原則（用戶 2026-11-08）：**只 reward，唔 punish**——任何 EXP／分數都唔會因為輸而扣。之後做 PvP 段位（方案 B）都跟呢條：輸唔扣 RP。

## 1. 目標

- 每個玩家有一個 Trainer Lv（1–100），由 Trainer EXP 計出嚟。
- 學英文（答題）係主要 EXP 來源；戰鬥同收集係輔助。
- 全部 EXP 由 server 計同存，client 只讀、改唔到（防作弊）。

## 2. EXP 規則

| 來源 | EXP | 備註 |
|---|---|---|
| 答啱一題 | +1 | 每日（香港時間）答題 EXP 上限 **200** |
| 完成一組 | +5 | 唔計入 200 上限 |
| 打贏 AI 訓練員 | +10 × 難度倍率 | 倍率同 tier EXP 倍率一樣（`TIER_META[tier].mult`：Easy 0.7、Normal 1…），四捨五入 |
| AI 首次通關（該訓練員該難度） | 額外 +20 | 用 `settle_battle_v2` 現有 `first_clear` 判斷 |
| PvP（隨機配對） | 贏 +20、輸 +5 | 只 reward：輸都有 EXP，唔扣 |
| 好友戰 | 0 | 防止互刷 |
| 圖鑑新品種（第一次捕捉到嗰個 dex 號） | +15 | 用 server 端判斷「新」，唔信 client |

- 升級：由 Lv N 升 Lv N+1 要 `100 + 20 × (N − 1)` EXP。Lv100 封頂（EXP 照記，Lv 唔再升）。
- 獎勵：每到 Lv 5、10、15… 由 server 派 💎10（同一級只派一次）。

## 3. 資料同 server

### 3.1 Migration（`supabase/migrations/supabase-migrate-20261108x-trainer-level.sql`，由用戶執行或者經 execute_sql）

- `user_account` 加：
  - `trainer_exp int not null default 0`
  - `trainer_exp_quiz_day text`、`trainer_exp_quiz_today int not null default 0`（每日答題上限用）
  - `trainer_lv_rewarded int not null default 0`（已派獎勵到邊一級）
- **唔加 column-level grant 俾 `authenticated` 寫**（Rule 54 嘅反面：呢啲係 server-only）；確認現有 `user_account` 嘅 update grant 冇包到呢幾欄。
- 新 internal function `_grant_trainer_exp(p_uid uuid, p_amount int, p_kind text) returns jsonb`（security definer、唔 grant execute 俾 client）：
  - `p_kind = 'quiz'` 時套每日上限（跨日歸零）。
  - 加 EXP → 計新 Lv → 跨過 5 嘅倍數就加鑽石、更新 `trainer_lv_rewarded`。
  - 回傳 `{ exp, lv, gained, lv_up, diamonds_awarded, balance }`。
- 喺現有 RPC 入面 call（每個 RPC 回傳 JSON 加 `trainer` 欄）：
  - 答題：`award_round_diamonds(score, total)` → 答啱 `score` × 1（上限）＋ 完成一組 +5。
  - AI：`settle_battle_v2` → 贏先加；首通再 +20。
  - PvP：`settle_pvp_battle`／`report_battle_result` 確認結果嗰刻（雙方各自一次；冇結果／斷線唔加）。
  - 捕捉：`obtain_capture`、`gacha_pull`、`gacha_pull_lucky` → server 端新 dex 號先 +15。
  - 好友戰 RPC 唔加。
- 顯示用 RPC 加回傳 `trainer_exp`（client 自己計 Lv）：
  - `get_trainer_cards`（Friends 名單／好友卡、PvP 戰前頁）
  - `get_leaderboard`
- 舊玩家：**唔補**，全部由 0 EXP（Lv1）開始。

### 3.2 Client

- 共用純函數（新檔 `js/trainer-level.js`，或者放 `js/core/`，按 Rule 119 ESM 過渡做法）：
  - `levelFromExp(exp) → { lv, into, need }`（`into` = 今級已有 EXP、`need` = 今級要幾多）
  - `expForLevel(lv)`
- State：`st.trainerExp`（`js/sync.js` pull 由 `user_account.trainer_exp` 覆寫；RPC 回應嘅 `trainer.exp` 即時寫入）。
- 未登入：唔顯示 Lv、唔計 EXP（資料牌顯示「Log in to earn Trainer EXP」）。
- 升級提示：RPC 回 `lv_up` → 結算畫面／戰鬥結果加一行「Trainer Lv 12 → 13!」；有鑽石就加「💎10」。用現有 toast／結算元件，唔開新 overlay。

## 4. UI

| 位置 | 顯示 |
|---|---|
| Battle menu 資料牌 | 「名 …… Lv12」＋藍色 EXP 條（`#48c8f8`）＋「340 / 500 EXP to Lv13」（跟 prototype） |
| Friends 名單／好友卡 | 名旁邊細 `Lv12`（PokeRogueEmerald） |
| PvP 戰前頁 `showPreBattle` | 雙方頭像旁邊 `Lv12` |
| 排行榜 | 每行名旁邊 `Lv12` |

## 5. Battle menu 其他改動（同一個 prototype 已批示嘅部分，一齊做）

- 拎走 `.bm-hero`；PvP／Friends 搬上頂改做 `pr-window-1` 戰鬥指令框。
- 訓練員卡：頭像企喺戰鬥草地台（撳頭像換）、資料牌（名＋Lv、PvP 勝率同一行、W/L、EXP 條）、My Team 6 格（名／Lv／HP／狀態，只讀）、「Edit in Bag」開 `BagUI`。
- 打 AI 訓練員唔再開揀隊頁：用 My Team 頭 N 隻（跳過 Faint）；全隊 Faint 或者冇隊 → toast＋開背包。Tier 卡顯示會出場嘅幾隻。
- 修現有 bug：戰鬥轉機提示用咗背包字眼「The Bag works in landscape」（`js/bag.js:168` `showRotate`），要分開戰鬥文案。

## 6. 測試同驗收

- 單元（`tests/unit/trainer-level.test.js`）：`levelFromExp` 邊界（0、99、100、Lv99→100、封頂）、`expForLevel`。
- SQL：`_grant_trainer_exp` 每日上限跨日、5 級獎勵只派一次、Lv100 封頂；client 直接 `update user_account set trainer_exp=…` 要被拒。
- 戰鬥：AI 打贏／打輸、首通、PvP 贏／輸 EXP 正確；好友戰 0。
- 版面：`npm run test:e2e`＋440×956／1280×800 截圖（battle menu、Friends、PvP 戰前頁、排行榜）。
- `npm test`、`npm run lint` 過。

## 7. 未決／之後

- 方案 B（PvP 段位）：PvP 多人之後先做；規則跟「只 reward 唔 punish」。
- EXP 數值上線後睇數據再調（只改 server 常數）。
