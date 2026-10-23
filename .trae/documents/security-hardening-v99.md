# v99 安全硬化計劃：SQL RLS/privilege 收緊 + RPC 權威化

## Context

TRAE-security-review 發現 4 個 HIGH 級漏洞，令「防金手指」形同虛設：

1. `user_account` RLS 係 `FOR ALL` → 登入用戶一句 PATCH 即可 `diamonds=999999`（`sync.js pushState` 本身就係咁寫）
2. `user_entries` 嘅 exp/level/candies 同樣可直接寫
3. 三個 SECURITY DEFINER RPC（`award_round_diamonds` / `settle_capture` / `migrate_anonymous_to_auth`）接受任意 `account_uuid`，唔驗證 `auth.uid()`，且冇 REVOKE EXECUTE → 淨攞公開 anon key 已可刷鑽
4. `account_anon_insert_any` 政策 + migrate 嘅 rekey 分支 → 攻擊者 INSERT 假匿名帳戶再認領，將假鑽洗入自己 Google 帳號

目標：diamonds 同捕捉結算變 server-authoritative；entries 敏感欄收回直寫權、改經 RPC（帶 clamp）；migrate 堵死洗鑽路徑；匿名角色完全斷網（前端匿名本來就唔 sync）。

關鍵設計洞察：entry 嘅 `level/stage/moves/owned_species/stars` 全部都係 `(exp, dupes, chain 靜態資料)` 嘅 deterministic function（JS 已有 `levelFromExp` / `EVOLUTION_CHAINS` / `movesBetween` / stars 公式）。Server 只需對 `exp/candies/ev_points/evs/dupes/ivs` 權威，derived 欄位由 `pull()` 喺前端重推，client 直寫 derived 欄位即變無害。

## Step 1 — 新建 `supabase-migrate-20261024c-security-hardening.sql`

跟 repo 規則：獨立 migration 檔、Dashboard SQL Editor 手動執行。內容順序：

### 1a. 清舊嘢
```sql
drop function if exists award_round_diamonds(uuid,int,int);   -- 舊 signature 必須逐個 drop，create or replace 改唔到參數列
drop function if exists settle_capture(uuid,int,int);
drop function if exists migrate_anonymous_to_auth(uuid,text);

drop policy if exists "account_anon_rw" on user_account;
drop policy if exists "account_anon_insert_any" on user_account;   -- 洗鑽入口
drop policy if exists "entries_anon_rw" on user_entries;
drop policy if exists "cards_anon_rw" on user_cards;
drop policy if exists "history_anon_rw" on user_history;
drop policy if exists "captures_anon_rw" on user_captures;
-- 保留 5 個 *_auth_rw FOR ALL policy（RLS 管 row、privilege 管 column/verb，兩層疊加，唔使拆 per-command policy）
```

### 1b. Table privileges（Supabase 預設 GRANT 咗大量權限俾 anon/authenticated，要主動收）
```sql
revoke all on user_account, user_entries, user_cards, user_history, user_captures from anon;

revoke all on user_account from authenticated;
grant select on user_account to authenticated;
grant update (trainer_name, updated_at) on user_account to authenticated;   -- diamonds/totals 變 RPC-only

revoke all on user_entries from authenticated;
grant select on user_entries to authenticated;
grant update (active, updated_at) on user_entries to authenticated;          -- 拍檔切換仍可直接 PATCH

grant select, insert, update on user_cards to authenticated;                 -- SM-2 upsert 照舊（非貨幣，可接受風險）
grant select, insert on user_history to authenticated;
grant select on user_captures to authenticated;                              -- insert 只經 settle_capture

alter table user_entries add column if not exists branch smallint;           -- Eevee 分支唔可重推，要落 DB
```

### 1c. `chain_rarity` 靜態表（server 端驗證抽獎/捕捉合法性）
由 `js/data.js` 嘅 PULLABLE/RARITY 生成：`create table chain_rarity(chain_key text primary key, rarity text)`，INSERT 非 normal 嘅 chain（rare/epic/legend），其餘視為 normal。

### 1d. 重建 RPC（全部 `security definer`、`uid := auth.uid()`、null 即 raise、輸入 clamp、逐個 `revoke execute ... from public, anon; grant execute ... to authenticated;`）

| RPC | 邏輯 |
|---|---|
| `award_round_diamonds(score int, total int) returns jsonb` | clamp total 1..50、score 0..total；server 計 bonus（10/10→3, ≥8→2, ≥7→1）；atomic `diamonds = diamonds + bonus` + totals 累加；回傳 `{bonus, balance}`（balance 做前端權威） |
| `gacha_pull(init_exp numeric default 0) returns jsonb` | **server 自己 roll rarity + pick chain**（唔收 chain_key，否則攻擊者必中神獸）；原子扣 3 鑽（`where diamonds >= 3`，冇 row → raise）；dupe → ev_points+1/dupes+1/candies+1/stars 重計；新 → INSERT server-rolled IVs（0-31）；`init_exp` 僅限帳號第一隻 entry 且 clamp ≤ 5000（對應 pendingExp）；回傳全行 jsonb |
| `obtain_capture(chain_key text, dex_id int) returns jsonb` | rarity 必須 = normal；dupe/new 同上（candies+0）；回傳全行 |
| `add_entry_exp(entry_id uuid, delta numeric) returns numeric` | ownership check（`entry.account_id = auth.uid()`）；clamp `0 < delta ≤ 10000`（quiz 合法上限 ≈ span 36,383 × 12% + memory bonus ≈ 5,700；powerup batch 每 zone ≤ 50） |
| `use_entry_candy(entry_id uuid, count int, exp_delta numeric) returns jsonb` | count 1..50；`exp_delta ≤ 40000 × count`（max levelSpan 36,383）；guard `candies >= count` |
| `alloc_ev(entry_id uuid, stat text) returns jsonb` | stat ∈ 6 個合法 key；ev_points>0、單項<252、總和<510 |
| `import_state(payload jsonb) returns boolean` | 首次 connect 一次性 bootstrap：guard = account 存在 AND `total_sets=0` AND 0 entries AND `diamonds=0`；entries ≤ 200 條、每條 exp ≤ 1,300,000（合法上限 1,212,873）、chain_key 格式 `^[a-z_]{1,40}$`、IVs clamp 0-31、diamonds = `LEAST(payload, 200)` |
| `settle_capture(dex_id int) returns void` | clamp 1..151；維持 log-only（寫 `user_captures`） |
| `migrate_anonymous_to_auth(old_device_id text) returns boolean` | uid 取自 `auth.uid()`（刪 `new_auth_uuid` 參數）；account 已存在 → false（pull）；否則 INSERT 全新 row（diamonds 0, device_id null）→ true。**成個 device_id rekey/搬數分支刪除**（洗鑽路徑；匿名本來就唔 sync，雲端唔會有 legit 匿名數據） |

### 1e. 收尾
```sql
select pg_notify('pgrst', 'reload schema');   -- GRANT/REVOKE 後逼 PostgREST  reload cache
```

## Step 2 — `js/supabase-auth.js`

- 3 個舊 wrapper 更新 signature（唔再傳 `account_uuid` / `new_auth_uuid`）；`settleCapture` 刪 `attempts` 參數
- 新增 wrapper：`gachaPull(initExp)` / `obtainCapture(chainKey, dexId)` / `addEntryExp(entryId, delta)` / `useEntryCandy(entryId, count, expDelta)` / `allocEv(entryId, stat)` / `importState(payload)`
- 全部沿用現有模式：失敗 `return null` 俾前端 fallback；檔尾 `window.SupabaseAuth = SupabaseAuth;` 保持

## Step 3 — `js/sync.js`

- `pushState()`：
  - user_account PATCH payload 剝走 `diamonds/total_sets/total_correct/total_questions`，淨 `trainer_name, updated_at`（否則 403）；fallback upsert 分支刪除
  - user_entries upsert 成段刪除（改由 RPC per-action 寫入；active 切換由 pokedex/app 直接 PATCH）
  - user_cards / user_history upsert 唔變
- 首次 connect 分支：`migrateAnonymous` 回 true 後唔再叫 `pushState()` 全量上傳，改叫 `SupabaseAuth.importState({diamonds, totals, entries})` → 再 `pull()` 正規化
- `pull()`：entries 唔再信 server 嘅 `level/stage/stars/owned_species`，改用新 `deriveEntryFields()`（Step 4）由 `(chainKey, exp, dupes, branch)` 重推；`ivs/evs/ev_points/candies/exp/branch` 信 server

## Step 4 — `js/storage.js`

- 抽出純函數 `deriveEntryFields(entry)`：由 exp 重推 level（`levelFromExp`）、進化 loop 重推 stage/owned_species（用 `entry.branch`）、`movesBetween` 重推 moves、dupes 重推 stars；**唔 mutate 入參、唔 saveState**，回傳新 object
- `addEntryExp` 同 `pull()` 共用呢個函數，避免邏輯分叉

## Step 5 — `js/app.js`

- `onSetComplete`（~L457-486）：登入時 `awardRoundDiamonds` 回傳 `{bonus, balance}` → `st.diamonds = balance`（server 權威，唔再本地 +=）；active entry EXP 登入時走 `addEntryExp` RPC（失敗先本地 `addEntryExp` fallback）；capture `onCaught` 改叫 `obtainCapture(chainKey, dexId)`，採用 server 回傳行（server IVs）
- migrate 分支（~L974）：配合 Step 3 新流程

## Step 6 — `js/gacha.js` / `js/pokedex.js` / `js/powerup.js`

- `gacha.js pull()`：登入時 `await SupabaseAuth.gachaPull(st.pendingExp || 0)` → server 已原子扣鑽 + roll  rarity + 拎寵 → 用回傳 row 播動畫（rarity 由 server 決定，動畫照舊）；失敗/未登入 → 現有本地 path 唔變。本地 `st.diamonds -= 3` 只在 fallback path 保留
- `pokedex.js`：L158 `addEvPoint`、L168 `useEntryCandy` 按鈕 — 登入時走 RPC，失敗本地 fallback；拍檔切換維持直接 PATCH `active`（已 grant）
- `powerup.js`：L216 per-fix `addEntryExp` 改為本地累加，`_complete()` 一次過 `addEntryExp(entry, totalExp)` RPC（batch）

## Step 7 — 版本 bump + 部署

跟 SKILL.md Rule 1，三檔齊改 **v97 → v99**：
- `js/app.js` `APP_VERSION`、[sw.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/sw.js) `CACHE_NAME`、`index.html` 全部 `?v=97` → `?v=98`

**部署順序：先 SQL（Dashboard 手跑）→ 即推 frontend（commit + push main）**。過渡窗內舊前端：PATCH diamonds 403 被 catch、舊 RPC signature 404 → 本地 fallback，進度暫停上雲但遊戲唔會壞；新前端對舊 DB 則 RPC 404 → 本地 fallback。兩個方向都 graceful，但應盡量貼住做。

同場更新 `.trae/skills/pokeengmon-preop-checklist/SKILL.md` Rule 4/5 字眼：entries/diamonds 唔再經 pushState 直寫，敏感操作走 RPC，本地改完數值要確保對應 RPC 已成功（唔係齋 call pushState）。

## 驗證（end-to-end）

1. **SQL 落地**：Dashboard 跑 migration 無 error；`\df+ award_round_diamonds` 確認淨返新 signature
2. **漏洞回歸**（登入後喺 DevTools console）：
   - `fetch(.../user_account, {method:'PATCH', body:{diamonds:999999}})` → 預期 403/42501
   - 舊 signature `rpc/award_round_diamonds {account_uuid:...}` → 預期 404 function not found
   - 新 RPC 傳 `score:50, total:1` → 預期 raise（clamp）
   - `rpc/migrate_anonymous_to_auth {new_auth_uuid: 他人uid, ...}` → 404（參數已刪）
3. **正常流程**：登入 → 做一 round 10 題 → diamonds 增加且 Network 見 RPC 回 `{bonus, balance}`、DB 值一致 → Rare Pull 扣 3 鑽原子生效、IV 係 server roll → 捕捉成功 → entry 出現 → 餵糖 / EV / 換拍檔正常 → refresh 後 `pull()` 還原一致（level/stage 重推正確，Eevee branch 冇走樣）
4. **匿名流程**：sign out → 本地清空 → 匿名玩一 round → 確認零 Supabase 寫入 → 新 Google 帳號 connect → `import_state` 一次性上傳（diamonds cap 200）→ 第二次 call `import_state` 被拒
5. **版本**：Settings/footer 顯示 v99；SW 自動接管；`git status` 乾淨、main 已 push

## 殘留風險（接受）

- `obtain_capture` 無法驗證玩家真係做完 quiz → 攻擊者可 script 刷 normal 稀有度寶可夢。Commons 唔值錢、唔產鑽，接受
- `user_cards`/`user_history` 仍可直寫（學習數據，非貨幣，沿用現有取態）
- `import_state` 一次性 cap 200 鑽可被新帳號攞盡 → 作弊天花板 = 每個新 Google 帳號 200 鑽，可接受
