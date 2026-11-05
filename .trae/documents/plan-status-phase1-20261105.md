# 狀態系統第一期｜實作計劃（2026-11-05）

> Spec：`status-hp-system-spec-20261105.md`。本文件記實作決定，唔重複規則。

## 0. 負責人追加決定（2026-11-05）

- 用藥入口：背包未做前，**暫時放 Partner Care**；戰鬥內用現有 BAG 掣。
- Inferno：AI Potion **拎走**（玩家 Full Restore 一早拎走）。
- Revival **唔計**入用藥過量。
- 非拍檔睡眠／冰凍 30 分鐘**照計**。
- 嚴重中毒 icon 用 `status-tox.png`（普通中毒用 `status-psn.png`）。
- Gym 唔係戰鬥（答題制），唔受影響；戰鬥 = AI／PvP／好友局。

## 1. 資料

### user_entries（新欄位，全部 nullable）

| 欄位 | 用途 |
|---|---|
| `pet_health`（沿用） | **= 飽肚值** 0–100（避免大改名；JS 內部 `pet.health` 亦 = 飽肚值，UI 叫 Fullness） |
| `hp_permille` smallint | HP 千分比 0–1000；0 = Faint |
| `status` text | null／`brn`／`par`／`slp`／`frz`／`psn`（Faint 用 hp=0 表示，唔係 status） |
| `poison_level` smallint | `psn` 時 1 = 中毒、2 = 嚴重中毒 |
| `status_since` timestamptz | 睡眠／冰凍開始時間（30 分鐘自然解除） |
| `care_at` timestamptz | HP 流失（燒傷／中毒）結算錨點 |
| `med_log` jsonb | 最近用藥時間戳（ms）陣列，最多留 3 個（1 分鐘滑動窗口） |
| `od_count` smallint | 中毒／嚴重中毒期間累計用藥次數（滿 3 升級） |
| `vomit_count` smallint | 嘔吐階梯 0／1／2 |

- 所有新欄位**唔開 client update**（只可經 RPC 寫）；開 select。
- `pet_streak`／`pet_last_fed_day`／`pet_settled_day` 停用，**下一份 migration 先 drop**（避免舊 cache client PATCH 失敗）。

### user_account

- `items_meds` jsonb：`{potion, super_potion, antidote, burn_heal, paralyze_heal, awakening, ice_heal}`；只經 RPC 寫。

## 2. Server RPC（security definer）

| RPC | 作用 |
|---|---|
| `care_settle()` | 按經過時間結算所有 entry：拍檔飽肚值（燒傷 ×1.5）、拍檔燒傷／中毒扣 HP、所有 entry 睡眠／冰凍 30 分鐘到期；飽肚值 0 → HP 0。回傳全部 entry care 狀態 |
| `care_feed(p_entry, p_kind)` | food／premium；麻痹／睡眠／冰凍／Faint 唔准；嘔吐階梯；扣 `items_food`／`items_premium` |
| `care_use_item(p_entry, p_item)` | 7 種藥 + revive；過量（1 分鐘 3 次 → 中毒 → 再 3 → 嚴重 → 再 3 → Faint）；育成過量覆蓋其他狀態 |
| `award_meds(p_perfect)` | 答題掉藥：全對穩掉 1 隻、1–9 題 10%；7 種平均；server 抽 |
| `settle_battle_team(p_team, p_used)` | 戰鬥正常完結一次過寫：每隻出戰 Pokémon 嘅 hp_permille／status；扣用咗嘅藥 |

- 遷移：所有 entry `hp_permille = 1000`（`pet_health = 0` → 0）；所有帳戶送測試藥包（傷藥 ×3、其餘各 ×1）。

## 3. 前端

- `js/care.js`（新）：純規則函數（同 SQL 一致），guest 用本地結算；登入用 RPC 結果覆蓋本地。
- `js/pet.js`：飽肚值結算交俾 care 規則；拎走 streak；餵食改經 care。
- 主頁：HP 條實數 + 狀態 icon（撳 icon 睇倒數／說明）；每分鐘更新；離線 Faint 開 app 提示。
- Partner Care：加 HP 條、狀態、7 種藥格 + revive；streak 改連續答題日數（閃電 icon）。
- 答題：Faint（HP 0）→ EXP 0；掉藥。

## 4. 戰鬥

- `makeBattlePokemon` 讀 hp_permille／status（睡眠入場抽 1–3 回合；嚴重中毒 → 每回合 1/4）。
- 揀隊：Faint 唔可以揀。
- BAG：玩家背包藥物（一回合一次，佔回合）；過量規則（5 回合內 3 次）。
- 引擎 ITEMS 補 7 種藥 + revive 嘅效果同戰鬥文字；PvP 同步接受。
- 拎走 Inferno AI Potion。
- 戰鬥結束 → `settle_battle_team`；中途斷線唔寫。
- 混亂 bug：改返 volatile（2–5 回合），唔佔主要狀態。

## 5. 分段

- 1a：migration + RPC（SQL）
- 1b：前端 care／主頁／Partner Care／掉藥
- 1c：戰鬥讀寫
- 測試：node 單元測試 care 規則 + 本地預覽

## 6. 進度（2026-11-05）

- [x] 1a SQL：`supabase-migrate-20261105c-care-status-phase1.sql` + `20261105b-move-loadout`（2026-11-05 已喺 Supabase 執行；5 個 RPC 用 rollback dry-run 驗證過）
- [x] 1b 前端：`js/care.js`（新）、`pet.js`、`app.js`（主頁 HP + 狀態 icon、Partner Care 藥物／HP／連續答題、每分鐘 tick、5 分鐘 server 結算、離線 Faint 提示、答題掉藥）、`sync.js`／`storage.js`（讀新欄位、停 pushPet）
- [x] 1c 戰鬥：`engine.js`（帶 HP／狀態入場、嚴重中毒 ×2）、`state.js`（7 種藥 + Revival、過量、混亂改 volatile）、`battle.js`（BAG 用背包、Revival 揀隊員、Faint 唔可以出戰、PvP 序列化帶狀態、戰鬥完 `settle_battle_team`、AI Potion 拎走）
- [x] 測試：`tools/_test_care.js`（18）、`tools/_test_battle_care.js`（14）、`tools/_test_battle.js`（97）全過；本地 guest 實測 Partner Care 同 AI 戰
- [ ] 登入實測（要先跑 migration）
- [ ] 下一份 migration drop `pet_streak`／`pet_last_fed_day`／`pet_settled_day`
- [ ] 第二期：PvP 雙方核對
