# PokeEngmon Supabase（RPC／SQL／sync／防作弊） — 事故紀錄同原文（references）

> 由 `pokeengmon-preop-checklist` 原文搬入（2026-11-06），每條 Rule 原文照錄。主要點喺 `../SKILL.md`。

### Rule 2 — Supabase upsert requires `Prefer: resolution=merge-duplicates`

Any `POST` to `/rest/v1/<table>?on_conflict=<col>` MUST include the header:
```
Prefer: return=representation,resolution=merge-duplicates
```
Without `resolution=merge-duplicates`, PostgREST treats it as a plain INSERT. If a row with the same PK already exists, you get `409 Conflict: duplicate key value violates unique constraint` — the `on_conflict` param does NOTHING without this header.

The `_api()` helper in `js/sync.js` auto-adds this header when the path contains `on_conflict`. If you write a new fetch call that uses `on_conflict`, route it through `_api()` or add the header manually.

The sync queue flush (`_flush()` in `js/sync.js`) must POST user_cards to `/user_cards?on_conflict=account_id,card_id` — a plain batch INSERT aborts the whole batch if any card already exists. The queue also flushes on `beforeunload` so answers submitted within the 1s debounce window aren't lost on page close.

### Rule 3 — `uuid` columns need valid UUIDs

`user_entries.id` and other `uuid`-type columns require a valid UUID v4 string (e.g. `550e8400-e29b-41d4-a716-446655440000`). Do NOT use base36 timestamps (e.g. `lq3k7a9x2b`) — Supabase returns `400 Invalid input`.

`uidGen()` in `js/storage.js` uses `crypto.randomUUID()`. If you introduce a new ID generator, ensure it emits valid UUIDs. Existing entries with non-UUID IDs are auto-migrated in `loadState()`.

### Rule 5 — Sensitive state changes go through RPCs, not pushState

Since v99, `Sync.pushState()` only pushes non-sensitive data (trainer_name; SM-2 cards/history go via the background queue). Diamonds, entries, exp, IVs/EVs, and candies are server-authoritative — direct writes are blocked by column-level grants, and `pull()` overwrites local values with cloud data on next load.

State-changing actions MUST call the matching RPC wrapper in `js/supabase-auth.js`:
- Quiz round diamonds → `awardRoundDiamonds(score, total)` (server returns the authoritative balance — use it, don't `+=`)
- Rare pull → `gachaPull(initExp, unlockedGen)` (server deducts diamonds atomically, rolls rarity/chain itself, returns the entry row → `adoptServerEntry()`)
- Capture success → `obtainCapture(chainKey, stage1Dex)` (+ `settleCapture(stage1Dex)` for logging) — **always stage1**, never evolved form dex
- EXP gains (quiz settle / Power Up batch) → `addEntryExp(entryId, delta)`
- Candy feed → `useEntryCandy(entryId, count, expDelta)`
- EV allocation → `allocEv(entryId, stat)`
- Partner switch / Eevee branch evolution → `Sync.patchEntry(entryId, { active | branch })`
- New Google account first-time import → `importState(payload)` (one-shot guard server-side)

**Logged-in RPC fail (v140):** if the user is signed in and the RPC was attempted but failed, **abort** (toast / try again) — do NOT silently fall back to local fake diamonds / fake gacha rewards. Local fallback is only for anonymous / truly offline. Silent fallback masks broken RPCs (v108 lesson) and desyncs cloud state.

Never re-add a direct diamonds/exp/entries write to `pushState()` — it will 403 once the migration SQL is applied.

### Rule 9 — plpgsql RPC: variable names must NEVER collide with column names

Postgres defaults `plpgsql.variable_conflict = error`: if an identifier in a SQL statement could be both a plpgsql variable and a table column, the call fails at runtime with `42702 column reference "X" is ambiguous` → PostgREST returns **400**.

Real incident (v99→v108): `gacha_pull` had `where rarity = rarity` (variable `rarity` vs column `chain_rarity.rarity`) → **every rare-pull RPC 400'd for days**; the frontend's offline fallback silently masked it (pulls "worked" locally, Supabase never updated). Fixed in `supabase-migrate-20261024f-fix-gacha-pull-ambiguous.sql` by renaming the variable to `v_rarity` and qualifying the column (`cr.rarity = v_rarity`).

Prevention when writing/editing any RPC:
- Prefix declared variables with `v_` and **parameters with `p_`** (e.g. `p_chain_key`, `p_dex_id`) — v135 `obtain_capture` hit 42702 again when bare `chain_key`/`dex_id` collided with columns.
- ALWAYS qualify columns with a table alias (`cr.rarity`).
- **Smoke-test every new/modified RPC with a real authenticated call against live Supabase** — browser DevTools Network tab must show `200` from `/rest/v1/rpc/<name>`. Do NOT trust in-browser flow testing alone.
- If the user reports "Supabase didn't update after action X", FIRST check the console for `[Auth RPC] ... failed: 400` before debugging sync logic.

### Rule 11 — Import/Export save feature was removed (v107); import_state is one-shot and server-clamped (v106)

- The manual Export/Import Save UI was **removed in v107** (`exportSave`/`handleImportFile` in `app.js`, local `importState` in `storage.js` deleted) because a tampered save file was a cheat vector. Do NOT re-add a client-side import without server-side validation.
- The remaining upload path is the post-login first-connect migration via the `import_state` RPC, hardened in `supabase-migrate-20261024e-import-tightening.sql`: **diamonds never cross the trust boundary** (client value ignored, fixed 20💎 welcome bonus), entries ≤151, exp ≤1.25M, candies ≤99, dupes ≤100, one-shot `user_account.imported_at` lock, `user_imports` audit table.
- Known adjacent RPC gaps deliberately deferred (fix in a future task, highest priority first): `award_round_diamonds` has no round-authenticity check, `obtain_capture` has no round proof, `add_entry_exp` has no rate limit.

### Rule 14 — Sync.pull: normalize `dex_*` BEFORE collecting gens

`pull()` must rewrite legacy `dex_<id>` chain keys first, then walk entries to `ensureGenDataLoaded(g)`. Skipping `dex_` entries during gen collect leaves Gen2+ moves empty (v140).

### Rule 24 — plpgsql block terminators: `IF` ends with `end if;`, only the function body ends with `end;`

A migration is applied as one pasted script in the Supabase SQL Editor, so one syntax slip aborts EVERYTHING after it. Sections already executed stay applied — the file is left half-applied (tables/policies exist, RPCs don't).

- Before running a new migration, count `IF ... THEN` / `ELSIF` chains against `end if;`. Loops close with `end loop;`; only the outermost `begin ... end;` uses a bare `end;`.
- Failure mode: `42601 syntax error at or near ";"` points at the stray `end;` line, NOT at the `IF` that opened the chain — so do not reread the flagged line, count terminators instead.
- Re-running is only safe when the file is written idempotently (`create table if not exists`, `drop policy if exists` + `create policy`, `create or replace`, seed `on conflict do nothing`); keep new migrations in that shape so a failed paste can simply be re-run.

Incident (20261102c quest-config): two if-chains ended with `end;` → whole migration rejected at line 150 after tables/policies had already applied. Restructuring a `CASE`-with-correlated-subquery into plain `if / else` also removed the ambiguity that made the slip easy to miss.

### Rule 54 — 新增可寫 column 必須同一份 migration 加 column-level grant

Incident (2026-11-04)：Settings 改 Learning Curve Mode 後關 app 再開變返舊值。根因：`user_account.curve_mode` column 早已存在（migration 20261030），但 `authenticated` role 嘅 UPDATE 係 column-level grant，淨係開咗 trainer_name / name_customized / items_* / updated_at 等 8 欄，**冇 `curve_mode`** → `Sync.pushState()` 嘅 PATCH 被 PostgREST 拒絕（permission denied），落入 fallback（只推 trainer_name）「靜靜雞成功」→ DB 永遠係舊值 → 下次開 app `Sync.pull()` 用 DB 舊值覆蓋 local。

- **加任何 client 會直寫嘅新 column 時，同一份 migration 必須加：** `grant update (<col>) on public.user_account to authenticated;`（其他表同理）。
- **驗證（唔好信 client 測試）：** 用 SQL 查 `information_schema.role_column_grants where table_name='<t>' and privilege_type='UPDATE' and grantee='authenticated'`，確認新欄喺入面。
- **診斷呢類「改咗但重開變返」嘅投訴：** 先查 grant，再查 client catch 係咪有 silent fallback 扮成功（sync.js 嘅 legacy-schema fallback 會吞咗 permission error）。
- 已修：migration `grant_authenticated_update_curve_mode` + 補返落 `supabase-migrate-20261030-curve-mode.sql`。

### Rule 57 — 10 連抽：`chain_rarity` 有 normal、保底查詢要排除；MCP 唔可以偽造 `auth.uid()`

Incident (2026-11-04 Lucky Draw 10×)：寫 `gacha_pull_lucky` 保底時，fallback「任何未持有的 rare/epic/legend」漏咗 filter，用 `pg_temp` 冒煙測試抽到 `{rarity:"normal", chain:"paras"}`；client `GACHA_BALL['normal']` 唔存在，會喺演出層 crash。

- `chain_rarity` 有 **normal / rare / epic / legend** 四種；`GACHA_BALL` 只識 rare/epic/legend。任何「保底／派球」查詢必須 `and cr.rarity in ('rare','epic','legend')`。
- 冒煙測試用 `pg_temp.test_x(p_uid)` 包 transaction，最後 `rollback`；**唔好用** `set local role authenticated` + `set_config('request.jwt.claims', ...)` 偽造 `auth.uid()`，MCP 執行環境唔生效（會回 `not authenticated`）。
- 10 連經濟：9 次 `gacha_pull` + 第 10 次 `gacha_pull_lucky`，順序 await；`pendingExp` 只傳第一抽；任何一次 RPC 回 null → 唔本地假派（Rule 5 / v140），已落地嘅抽數保留。
- 本地 fallback 的保底 `_pickLuckyChainLocal` 同樣只揀 epic/legend，並排除已持有 chain。

### Rule 66 — 「共用池」數值存喺個別 row：刪 row 之前要將佢嗰份搬走

Incident (2026-11-05，背包第 3a 段)：EV Point Unit 係共用池（= 全部 entry 嘅 `ev_points` 加總）。送 Pokémon 返大木博士時刪咗佢嘅 row，佢身上未用嘅 3 點跟住消失（池 17 → 15，應該係 18）。

- 任何「加總先係真數」嘅資源（共用 EV 池等），刪除／合併 row 之前，先將嗰 row 嘅份額轉去另一個 row（server RPC 同 client 本地兩邊都要做）。
- 測試要對「池總數」：刪除前總數 − 退還規則 = 刪除後總數，唔好只睇單一 row。

### Rule 75 — 新 JS module：`const X` 要掛 `window.X`；`SupabaseAuth._rpc` 會食 error 同拆 array；防作弊資料唔好放 `battles`

Incident (2026-11-05，第 13／14 項 + 狀態第二期)：(1) 新 `js/avatars.js` 用 `const Avatars = (() => …)()`，`battle.js`／`friends.js` 用 `window.Avatars ? …` 判斷 → 永遠 false，pre-battle 頁冇頭像（Rule 38 講過 preview 工具，今次係 app code 自己中）。(2) `get_trainer_cards` 本來回 jsonb array，`_rpc` 見到 array 只回 `data[0]` → 只得第一張卡。(3) `settleFriendV2` 用 `try/catch` 判斷「未跑 migration」，但 `_rpc` 出錯唔 throw、淨係回 `null`，fallback 永遠唔會行。(4) `battles` 有 table-level UPDATE 俾 authenticated，新加嘅欄位 client 都寫得。

- 新 module 尾加 `if (typeof window !== "undefined") window.X = X;`，或者全部用 `typeof X !== "undefined"` 判斷；唔好兩種混用。
- 新 RPC 回 **jsonb object**（要 list 就包 `{ cards: [...] }`）；client 經 `_rpc` 判斷失敗用 `res == null`，唔好靠 catch。
- 防竄改／結算用嘅資料放獨立表（RLS on、`revoke all from anon, authenticated`），只經 security definer RPC 寫；加欄位之前先查 `information_schema.table_privileges`，有 table-level UPDATE 就唔好放落嗰張表。
- DDL dry-run（`execute_sql` 包 `raise exception` rollback）會俾 auto mode 擋：寫好 migration 交用戶跑，跑完先用 RPC 呼叫驗證。

Skill: Rule 75 added

### Rule 76 — 「有冇登入」用 `SupabaseAuth.isLoggedIn()`，唔好用 `Sync.isEnabled()`；server 退道具時本地唔好再加

Incident (2026-11-05，第 5 項攜帶道具)：舊存檔攜帶進化石要退返背包，本地版用 `Sync.isEnabled()` 判斷「登入用戶由 server migration 退」→ 未登入都係 true，本地退還完全冇行。

- `Sync.isEnabled()` 只代表有 Supabase 設定（匿名 device 都係 true），唔等於已登入；判斷登入一律用 `SupabaseAuth.isLoggedIn()`（`bag.js`／`care.js` 嘅 `online()`）。
- 同一件道具 server（migration／RPC）同本地都可能退：登入用戶只信 server（pull 會帶返數量），本地只清 `heldItem`，唔好 `Pet.addItem` 再加，否則 `pushItems` 會將雙倍數推上雲。
- 收回欄位 grant 之前，先 grep client 所有 `patchEntry({ <col> })`／PATCH body，一併拎走，否則整個 PATCH 會 401／403 連其他欄位都寫唔到。

Skill: Rule 76 added

### Rule 78 — 防作弊收權：新 RPC 上線要 revoke 舊版；table-level revoke 會連 column grant 一齊收

Incident (2026-11-06，進化石／隨機 PvP／battles 收權)：(1) 進化石數量 `items_stones` 同 `stone_used` 由 client PATCH 直寫，改 localStorage 就可以憑空變石。(2) 隨機 PvP 用 `settle_battle_v2(p_result)` 信 client 講嘅勝負；而且舊版 `settle_battle`（v1）一直冇收 execute，v2 加咗檢查都可以行 v1 繞過。(3) `battles` 有 table-level UPDATE，p1 可以改 p2 嘅 action／winner。

- 經濟數值（道具數量、勝負、鑽石）一律經 security definer RPC 寫：掉落由 server 抽（`award_*`），使用由 server 扣（`use_*`），client 只用 RPC 回傳數量覆蓋本地（`Care.applyStones`）。
- 出新版 RPC 取代舊版時，同一份 migration `revoke execute` 舊版；用 `has_function_privilege('authenticated', oid, 'execute')` 列晒同名函數核對。
- 要改一個長 RPC 加 guard：用 `pg_get_functiondef` + `replace` 插入再 `execute`，replace 後檢查有冇插到（anchor 唔中就 `raise`），唔好成段重抄（容易抄錯舊版本）。
- `revoke update on table` 會連該表所有 column-level UPDATE grant 一齊收走：revoke 之後要再 `grant update (<cols>)`。
- 多人共用一行（battles）：用 BEFORE UPDATE trigger 按 `auth.uid()` 判斷邊一方，只准寫自己嗰欄；`current_user <> 'authenticated'` 時放行（security definer RPC 係 owner 身份）。
- 收 grant 之前照 Rule 76：grep 晒 client 所有 PATCH body，拎走相關欄位（今次：`patchEntry` 嘅 `stone_used`、`pushItems` 嘅 `items_stones`）。
- 驗證：未登入路徑喺 localhost 跑（Rule 62，試完還原存檔並 reload）；登入路徑要等用戶跑完 migration，再用 RPC 呼叫 + `information_schema.role_column_grants` 核對。

Skill: Rule 78 added

### Rule 96 — 網絡請求一律經 `Net.request`／`SupabaseAuth.authedFetch`：有 timeout、token 自動續期（single-flight）、401 refresh 一次再試；POST／RPC 唔自動重試

- 背景：stability-performance plan §3.1–3.3。審查發現全部 `fetch` 冇 timeout（慢網時掣一直灰／Loading… 永遠轉）；`_rpc` 發之前冇續期 token → 用超過 1 粒鐘全部 RPC 401、靜靜 return null（鑽石／EXP 唔入帳）；`_rpcTable` 冇登入時送 `Authorization: undefined`；`Sync`／`PvP` 冇登入時送 `Bearer null`。
- 修正：新檔 `js/core/net.js`；`SupabaseAuth._req`／`authedFetch`／single-flight `ensureFreshSession(force)`／`_onSessionExpired`；auth endpoint、`_rpc`、`_rpcTable`、`submitReport`、`fetch()` helper、`Sync._api`、`Sync.syncClock`、`PvP.api` 全部經 Net。
- 設計重點：refresh token 會輪換 → 並行過期一定要 single-flight，否則可能被當重用撤銷 session。
- 驗證：browser stub fetch 六個場景全過（見 SKILL.md 驗收）；boot 冇新 Guard 錯誤。

Skill: Rule 96 added

### Rule 98 — 本機資料唔准靜靜冇咗：sync queue 要持久化＋backoff＋毒批丟棄＋keepalive；存檔讀唔到要先備份；寫唔落要話用戶知；離線用 pill 提示

- 背景：stability-performance plan §3.4–3.7。審查發現：sync queue 只喺記憶體、靠 `beforeunload` flush（iOS 唔 fire）→ 殺 App 就冇咗；失敗每 1 秒無限重試（斷網狂 retry 食電，4xx 毒批永遠卡住）；`loadState()` parse 失敗直接 `defaultState()`，下一次 `saveState()` 覆蓋玩家進度；`saveState()` quota 滿靜靜失敗。
- 修正：`js/sync.js` queue 重寫（持久化、per-account、去重、backoff、毒批、keepalive、`pendingCount()`）；`js/storage.js` `_backupCorruptState`＋`saveState` 失敗提示；`js/core/net.js` `syncPill`＋`index.html` `#net-offline`。
- 撞板：pill 第一版喺 phone 斷成兩行（41px 高）→ 加 `white-space: nowrap`。Rule 97 已被另一個 session 嘅 `js/keys.js` 引用 → 改用 98。
- 驗證：Node 18/18；browser 壞存檔重開；headless phone／wide 斷網／返線上；sm2 15/15；overlay-switch 10/10；sheets 28/29（P9b 已知）。

Skill: Rule 98 added
