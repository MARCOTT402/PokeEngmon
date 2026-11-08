# Trainer Lv ＋ Battle menu 重做 — Implementation Plan

> **進度（2026-11-08）**：Task 1–6 已做（未 commit）；登入路徑已驗（PvP 戰前頁 Lv 要真 PvP 對手先睇到，未驗）。

> **For agentic workers:** 用 superpowers:executing-plans 逐個 task 做（本 session native 執行）。Checkbox 追蹤。**唔好 commit**（CLAUDE.md：只喺用戶要求時用 `python tools/git_commit_push.py`）。

**Goal:** 加 server 計嘅 Trainer Lv（EXP、每 5 級 💎10），並將 battle menu 改成 prototype 已批嘅樣（指令框、訓練員卡、打 Trainer 唔使揀隊）。

**Architecture:** EXP 全部喺 Postgres：一個 internal `_grant_trainer_exp`，用 Rule 78 嘅 `pg_get_functiondef` + replace 插入現有結算 RPC，回傳 JSON 加 `trainer` 欄。Client 喺 `SupabaseAuth._rpc` 一個位攔截 `trainer` 欄更新 `st.trainerExp`、彈升級 toast。Lv 由共用純函數 `TrainerLevel.levelFromExp` 計。UI 由 prototype `tools/prototype/battle-menu/proto.{js,css}` 搬入正式檔。

**Tech Stack:** 原生 JS（ES module 過渡，Rule 119）、Supabase plpgsql、`node:test`。

**Spec:** `.trae/specs/20261108-trainer-level.md`（＋ prototype `tools/prototype/battle-menu-app.html`）

## Global Constraints

- EXP：答啱 +1（每日上限 200，香港日，用 `battle_energy_today()` 同一個日界）；完成一組 +5；AI 贏 `round(10 × mult)`（easy 0.7→7、normal 1→10、hard 1.6→16、inferno 2.5→25）；AI 首通 +20；隨機 PvP 確認贏 +20、其他結果（輸／未確認贏）+5；好友戰 0；第一次攞到某 stage1 dex +15。
- 升級：Lv N→N+1 要 `100 + 20 × (N − 1)`；Lv100 封頂（EXP 照加）。
- 獎勵：每到 5 嘅倍數 Lv 派 💎10，每級一次（`trainer_lv_rewarded`）。
- 只 reward 唔 punish（Rule 123）：冇任何扣 EXP 邏輯。
- 新欄位 server-only：唔加 column grant（`user_account` 而家 authenticated 只有 SELECT＋白名單 UPDATE）。
- 舊玩家由 0 EXP 開始，唔補。
- 未登入：唔計、唔顯示 Lv。

## Review Focus

1. 同一場 PvP 結算重入（`settle_pvp_battle` 第二次 call）唔可以再加 EXP → 已有 `already` early return，插入點喺佢之後；SQL 驗證要 call 兩次。
2. 每日答題上限跨日要歸零（`trainer_exp_quiz_day` ≠ 今日 → 由 0 計）。
3. Lv95→100 一次過跨幾個 5 倍數（例如大額 EXP）要派晒每一級獎勵，而唔係只派一次。
4. My Team 有 uid 但 entry 已送走／全隊 Faint／冇隊 → 打 Trainer 要 toast＋開背包，唔可以開空隊戰鬥。
5. `trainer` 欄唔喺回應（舊 RPC／未登入）→ client 唔可以 throw、唔可以將 `st.trainerExp` 變 NaN（Rule 99）。

---

### Task 1: `TrainerLevel` 純函數＋單元測試

**Files:**
- Create: `js/trainer-level.js`（ES module，檔尾 `Object.assign(globalThis, { TrainerLevel })`）
- Test: `tests/unit/trainer-level.test.js`
- Modify: `index.html`（喺 `js/dex-sort.js` 後面加 `<script src="js/trainer-level.js?v=…" type="module">`）、`sw.js` ASSETS、`tools/deploy/site-files.json`（如有逐檔列）

**Interfaces — Produces:**
- `TrainerLevel.MAX_LV = 100`
- `TrainerLevel.expToNext(lv: number) → number`（`100 + 20*(lv-1)`；lv ≥ 100 回 0）
- `TrainerLevel.levelFromExp(exp: number) → { lv, into, need, total }`（exp 非有限／負 → 當 0）
- `TrainerLevel.adopt(t: {exp, lv_up?, diamonds_awarded?, balance?} | null)`：寫 `st.trainerExp`、有鑽石就 `st.diamonds = balance`、升級 toast、`document.dispatchEvent(new CustomEvent("trainer-exp-changed"))`
- `TrainerLevel.mine() → {lv, into, need, total} | null`（未登入 null）

- [x] Step 1 測試：`levelFromExp(0)` → `{lv:1, into:0, need:100}`；`(99)` → lv1 into99；`(100)` → lv2 into0 need120；`(220)` → lv3；Lv100 門檻 = Σ_{n=1}^{99}(100+20(n−1)) = 106,920 → `(106919)` lv99、`(106920)` lv100 need0；`(1e9)` lv100；`(NaN)`／`(-5)` → lv1；`expToNext(1)=100`、`(2)=120`、`(100)=0`。
- [x] Step 2 `npm test` → FAIL（module 未有）
- [x] Step 3 實作（loop 減，最多 99 次）
- [x] Step 4 `npm test` 全綠（包括 `esm-bridge.test.js`、`sw-assets.test.js`）

### Task 2: Migration — 欄位、`_grant_trainer_exp`、插入結算 RPC

**Files:**
- Create: `supabase/migrations/supabase-migrate-20261108-trainer-level.sql`

**Interfaces — Produces（server）:**
- `user_account.trainer_exp int not null default 0`、`trainer_exp_quiz_day text`、`trainer_exp_quiz_today int not null default 0`、`trainer_lv_rewarded int not null default 0`、`trainer_exp_dex int[] not null default '{}'`
- `public._trainer_lv(p_exp int) returns int`（immutable，同 JS 公式）
- `public._grant_trainer_exp(p_uid uuid, p_amount int, p_quiz int default 0) returns jsonb` → `{exp, gained, lv, lv_up, diamonds_awarded, balance}`；`p_quiz` 套每日 200 上限；`revoke execute from public, anon, authenticated`
- `public._grant_trainer_dex(p_uid uuid, p_dex int) returns jsonb`：dex 未喺 `trainer_exp_dex` 先 append＋`_grant_trainer_exp(p_uid,15)`，否則回現狀（gained 0）；同樣 revoke
- `public.get_trainer_levels(p_uids uuid[]) returns jsonb` → `{levels:[{uid, exp}]}`（≤ 60 個；grant anon＋authenticated）
- 結算 RPC 回傳多咗 `'trainer', v_tx`：`award_round_diamonds`、`settle_battle_v2`（只 AI 贏）、`settle_pvp_battle`、`obtain_capture`、`gacha_pull`、`gacha_pull_lucky`；`get_trainer_cards` 每張卡加 `'exp'`

插入做法（Rule 78）：`DO` block 讀 `pg_get_functiondef`，對每個 anchor `replace`，replace 前後一樣就 `raise exception 'anchor not found: …'`，再 `execute`。宣告加 `v_tx jsonb;`。插入點：
- `award_round_diamonds`：喺 `update user_account set\r\n    diamonds = diamonds + bonus` 之前 `v_tx := _grant_trainer_exp(uid, 5, score);`；return 加 `'trainer', v_tx`。
- `settle_battle_v2`：喺最後 `update user_account ua set\r\n    battle_days` 之前，`if p_kind='ai' and p_result='win' then v_tx := _grant_trainer_exp(v_uid, round(10*mult)::int + case when v_first then 20 else 0 end); end if;`（mult 由 `p_tier`）；最後 return 嘅 `'allowed', true, 'bonus'` 改 `'allowed', true, 'trainer', v_tx, 'bonus'`。
- `settle_pvp_battle`：喺最後 `update user_account ua set\n    battle_days` 之前 `v_tx := _grant_trainer_exp(v_uid, case when v_result='win' and v_confirmed then 20 else 5 end);`；return `'allowed', true, 'result'` 加 trainer。
- `obtain_capture`／`gacha_pull`／`gacha_pull_lucky`：最後 return 之前 `v_tx := _grant_trainer_dex(<uid>, <ck>.stage1_dex)`；gacha 兩個嘅 `'balance', bal` 改 `coalesce((v_tx->>'balance')::int, bal)`。
- 鑽石：`_grant_trainer_exp` 喺結算嗰個 `update … returning diamonds` 之前行，所以回傳 balance 已包獎勵。

- [x] Step 1 寫 migration 檔
- [x] Step 2 `execute_sql` 分段套用（DDL → helper → DO 插入 → grants）；俾 MCP 擋嘅 statement 交用戶
- [x] Step 3 驗證（`pg_temp` function 包 transaction 再 rollback，Rule 57；唔偽造 auth.uid）：直接 call `_grant_trainer_exp` 測上限跨日、Lv 4→6 獎勵一次、Lv 95→100 派晒 95／100；`pg_get_functiondef` grep 插入咗；`has_function_privilege('authenticated', '_grant_trainer_exp…', 'execute') = false`；`role_column_grants` 冇新欄

### Task 3: Client 接線（sync、_rpc 攔截、升級 toast）

**Files:**
- Modify: `js/supabase-auth.js:433-434`（`_rpc` 回傳前：`if (out && out.trainer && globalThis.TrainerLevel) TrainerLevel.adopt(out.trainer)`）
- Modify: `js/sync.js:251` 附近（`st.trainerExp = Number(acct.trainer_exp) || 0`，有欄先寫）
- Modify: `js/storage.js` `defaultState()` 加 `trainerExp: 0`
- Test: `tests/unit/trainer-level.test.js` 加 `adopt` 測試（vm 載入 storage.js＋trainer-level.js：adopt `{exp:250}` → `st.trainerExp===250`；adopt `null`／`{}` 唔 throw、唔變 NaN；`{lv_up:true, diamonds_awarded:10, balance:77}` → `st.diamonds===77`）

- [x] Step 1 加 adopt 測試 → FAIL
- [x] Step 2 實作 adopt＋接線
- [x] Step 3 `npm test` 綠

### Task 4: Battle menu 重做＋打 Trainer 唔使揀隊

**Files:**
- Modify: `index.html` `#view-battle-menu`：刪 `.bm-hero`；`.battle-mode-grid` 加 class `bm-cmd`、emoji icon 換 `<span class="tcm-icon">` 遊戲素材；之後加 `<section id="bm-trainer-card" class="bm-tcard">`
- Create: `js/battle/ui/trainer-card.js`（classic，跟 `js/battle/ui/*` 做法 `const B = BattleUI._`；`Object.assign(B, { renderTrainerCard, teamLineup })`）
- Modify: `js/battle/ui/menu.js` `renderMenu()` 尾 call `B.renderTrainerCard()`；`openTierPicker` 每張開咗嘅 tier 卡加 `.tc-bring`（出場 icon）
- Modify: `js/battle/ui/team.js` `openTeamSelect`：`S.mode === "ai" && !fixedSize` → 用 `B.teamLineup(n)`；冇 → toast＋`B.openMenu()`＋`BagUI.open({from:"battle-menu"})`；PvP 照舊
- Modify: `js/bag.js:168` `showRotate(mode, done, msg)`：加第 3 參數文案；`js/battle/landscape.js:99` 傳 `"Battles work in landscape"`
- Modify: `css/style.css`：搬 `proto.css` 嘅 `.bm-tcard`／`.tc-*`／`.bm-cmd` 規則（`url()` 改 `../assets/…`）；刪 `.bm-hero*` 規則
- Modify: `index.html`／`sw.js` 加 `trainer-card.js`

**Interfaces — Consumes:** `TrainerLevel.mine()`、`BagUI.getTeam()`、`Avatars.mine/url/openPicker`、`Care.hpOf/statusKey/STATUS_INFO`、`entryCurrentSpecies`、`animatedURL`。
**Produces:** `B.teamLineup(n) → entry[]`（My Team 次序、跳過 Faint、最多 n）；`B.renderTrainerCard()`。

- [x] Step 1 單元測試 `teamLineup`（`tests/unit/trainer-card.test.js`：myTeam [a,b(faint),c] n=2 → [a,c]；有 uid 搵唔到 entry 跳過；空 → []）→ FAIL
- [x] Step 2 實作，測試綠
- [x] Step 3 資料牌：名＝`st.playerName`；Lv＋EXP 條只喺 `TrainerLevel.mine()` 有值；未登入顯示「Log in to earn Trainer EXP」；勝率同一行；W/L
- [x] Step 4 固定 seed 重播測試（Rule 117）`node tools/responsive/test-battle-replay.mjs` 要更新揀隊步驟後仍然過

### Task 5: Lv 顯示喺 Friends、PvP 戰前頁、排行榜

**Files:**
- Modify: `js/battle/ui/team.js` `showPreBattle`：`side()` 名後加 `<span class="pb-lv">Lv${lv}</span>`（`card.exp` → `levelFromExp`；自己用 `st.trainerExp`）
- Modify: `js/friends.js` `renderRoster`：攞齊 roster uid 後 call `SupabaseAuth._rpc("get_trainer_levels", {p_uids})`，結果放 `levelByUid`，`rosterRow` 名後加 `<span class="tl-badge">Lv12</span>`（未攞到就唔顯示）
- Modify: `js/leaderboard.js` `render()`：rows 有 `accountUuid` 嘅一次過 call `get_trainer_levels`（未登入都 call，anon 有權），`_rowHTML` 名後加 Lv
- Modify: `css/style.css`：`.tl-badge`（PokeRogueEmerald、細）

- [x] Step 1 實作
- [x] Step 2 瀏覽器：Friends／排行榜 network 見 `get_trainer_levels` 200

### Task 6: 驗證＋文件

- [x] `npm test`、`npm run lint`（warning 唔准加）
- [x] 開 8080 → `npm run test:e2e`；`tools/responsive` battle 相關測試
- [x] Browser 440×956／1280×800：battle menu、打 Trainer 直接開戰、Edit in Bag、全隊 Faint、Friends、排行榜；console 冇新 error
- [x] 登入路徑（2026-11-08 用戶帳號喺 localhost 驗：AI 輸 → `trainer: null`；Youngster Easy 贏 → `trainer.exp 7`，卡顯示 7 / 100，DB `trainer_exp = 7`；Friends 名單有 Lv 牌）：用戶登入後打一場 AI → network `settle_battle_v2` 回應有 `trainer`、卡上 EXP 增加（要用戶帳號，冇就寫明未驗）
- [x] `CODEBASE_INDEX.md`、spec 狀態、Rule（如有新坑）
