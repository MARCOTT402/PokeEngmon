---
name: pokeengmon-supabase
description: PokeEngmon Supabase rules: upserts, uuid columns, sensitive state via RPC, plpgsql naming and terminators, column grants, sync normalisation, gacha queries, shared-pool rows, new JS modules calling RPCs, login checks and anti-cheat revokes. Read before writing SQL/migrations, RPC calls, sync code or anything that changes diamonds, items, Pokémon or battle rewards.
---

# PokeEngmon Supabase（RPC／SQL／sync／防作弊）

> 幾時讀：寫 SQL／migration、加或改 RPC、改 `js/sync.js`／`js/supabase-auth.js`、任何改鑽石／道具／寶可夢／獎勵嘅 code 之前。
> 由 `pokeengmon-preop-checklist` 按題目拆出（2026-11-06）。下面係每條 Rule 嘅**現行要點**（原文條列照抄）；事故經過、code 範例、原因分析喺 `references/incidents.md`，要查來龍去脈先開。
> 新事故：寫入 `references/incidents.md`（`### Rule N — 標題` 加喺尾），呢度加要點；preop checklist 加 `## Rule N — 標題` 一行指向（跟 `post-fix-lesson-capture`）。

## Rules

### Rule 2 — Supabase upsert requires `Prefer: resolution=merge-duplicates`

Any `POST` to `/rest/v1/<table>?on_conflict=<col>` MUST include the header:
```
Prefer: return=representation,resolution=merge-duplicates
```
Without `resolution=merge-duplicates`, PostgREST treats it as a plain INSERT. If a row with the same PK already exists, you get `409 Conflict: duplicate key value violates unique constraint` — the `on_conflict` param does NOTHING without this header.

The `_api()` helper in `js/sync.js` auto-adds this header when the path contains `on_conflict`. If you write a new fetch call that uses `on_conflict`, route it through `_api()` or add the header manually.

### Rule 3 — `uuid` columns need valid UUIDs

`user_entries.id` and other `uuid`-type columns require a valid UUID v4 string (e.g. `550e8400-e29b-41d4-a716-446655440000`). Do NOT use base36 timestamps (e.g. `lq3k7a9x2b`) — Supabase returns `400 Invalid input`.

`uidGen()` in `js/storage.js` uses `crypto.randomUUID()`. If you introduce a new ID generator, ensure it emits valid UUIDs. Existing entries with non-UUID IDs are auto-migrated in `loadState()`.

### Rule 5 — Sensitive state changes go through RPCs, not pushState

- Quiz round diamonds → `awardRoundDiamonds(score, total)` (server returns the authoritative balance — use it, don't `+=`)
- Rare pull → `gachaPull(initExp, unlockedGen)` (server deducts diamonds atomically, rolls rarity/chain itself, returns the entry row → `adoptServerEntry()`)
- Capture success → `obtainCapture(chainKey, stage1Dex)` (+ `settleCapture(stage1Dex)` for logging) — **always stage1**, never evolved form dex
- EXP gains (quiz settle / Power Up batch) → `addEntryExp(entryId, delta)`
- Candy feed → `useEntryCandy(entryId, count, expDelta)`
- EV allocation → `allocEv(entryId, stat)`
- Partner switch / Eevee branch evolution → `Sync.patchEntry(entryId, { active | branch })`
- New Google account first-time import → `importState(payload)` (one-shot guard server-side)

### Rule 9 — plpgsql RPC: variable names must NEVER collide with column names

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

- Before running a new migration, count `IF ... THEN` / `ELSIF` chains against `end if;`. Loops close with `end loop;`; only the outermost `begin ... end;` uses a bare `end;`.
- Failure mode: `42601 syntax error at or near ";"` points at the stray `end;` line, NOT at the `IF` that opened the chain — so do not reread the flagged line, count terminators instead.
- Re-running is only safe when the file is written idempotently (`create table if not exists`, `drop policy if exists` + `create policy`, `create or replace`, seed `on conflict do nothing`); keep new migrations in that shape so a failed paste can simply be re-run.

### Rule 54 — 新增可寫 column 必須同一份 migration 加 column-level grant

- **加任何 client 會直寫嘅新 column 時，同一份 migration 必須加：** `grant update (<col>) on public.user_account to authenticated;`（其他表同理）。
- **驗證（唔好信 client 測試）：** 用 SQL 查 `information_schema.role_column_grants where table_name='<t>' and privilege_type='UPDATE' and grantee='authenticated'`，確認新欄喺入面。
- **診斷呢類「改咗但重開變返」嘅投訴：** 先查 grant，再查 client catch 係咪有 silent fallback 扮成功（sync.js 嘅 legacy-schema fallback 會吞咗 permission error）。
- 已修：migration `grant_authenticated_update_curve_mode` + 補返落 `supabase-migrate-20261030-curve-mode.sql`。

### Rule 57 — 10 連抽：`chain_rarity` 有 normal、保底查詢要排除；MCP 唔可以偽造 `auth.uid()`

- `chain_rarity` 有 **normal / rare / epic / legend** 四種；`GACHA_BALL` 只識 rare/epic/legend。任何「保底／派球」查詢必須 `and cr.rarity in ('rare','epic','legend')`。
- 冒煙測試用 `pg_temp.test_x(p_uid)` 包 transaction，最後 `rollback`；**唔好用** `set local role authenticated` + `set_config('request.jwt.claims', ...)` 偽造 `auth.uid()`，MCP 執行環境唔生效（會回 `not authenticated`）。
- 10 連經濟：9 次 `gacha_pull` + 第 10 次 `gacha_pull_lucky`，順序 await；`pendingExp` 只傳第一抽；任何一次 RPC 回 null → 唔本地假派（Rule 5 / v140），已落地嘅抽數保留。
- 本地 fallback 的保底 `_pickLuckyChainLocal` 同樣只揀 epic/legend，並排除已持有 chain。

### Rule 66 — 「共用池」數值存喺個別 row：刪 row 之前要將佢嗰份搬走

- 任何「加總先係真數」嘅資源（共用 EV 池等），刪除／合併 row 之前，先將嗰 row 嘅份額轉去另一個 row（server RPC 同 client 本地兩邊都要做）。
- 測試要對「池總數」：刪除前總數 − 退還規則 = 刪除後總數，唔好只睇單一 row。

### Rule 75 — 新 JS module：`const X` 要掛 `window.X`；`SupabaseAuth._rpc` 會食 error 同拆 array；防作弊資料唔好放 `battles`

- 新 module 尾加 `if (typeof window !== "undefined") window.X = X;`，或者全部用 `typeof X !== "undefined"` 判斷；唔好兩種混用。
- 新 RPC 回 **jsonb object**（要 list 就包 `{ cards: [...] }`）；client 經 `_rpc` 判斷失敗用 `res == null`，唔好靠 catch。
- 防竄改／結算用嘅資料放獨立表（RLS on、`revoke all from anon, authenticated`），只經 security definer RPC 寫；加欄位之前先查 `information_schema.table_privileges`，有 table-level UPDATE 就唔好放落嗰張表。
- DDL dry-run（`execute_sql` 包 `raise exception` rollback）會俾 auto mode 擋：寫好 migration 交用戶跑，跑完先用 RPC 呼叫驗證。

### Rule 76 — 「有冇登入」用 `SupabaseAuth.isLoggedIn()`，唔好用 `Sync.isEnabled()`；server 退道具時本地唔好再加

- `Sync.isEnabled()` 只代表有 Supabase 設定（匿名 device 都係 true），唔等於已登入；判斷登入一律用 `SupabaseAuth.isLoggedIn()`（`bag.js`／`care.js` 嘅 `online()`）。
- 同一件道具 server（migration／RPC）同本地都可能退：登入用戶只信 server（pull 會帶返數量），本地只清 `heldItem`，唔好 `Pet.addItem` 再加，否則 `pushItems` 會將雙倍數推上雲。
- 收回欄位 grant 之前，先 grep client 所有 `patchEntry({ <col> })`／PATCH body，一併拎走，否則整個 PATCH 會 401／403 連其他欄位都寫唔到。

### Rule 78 — 防作弊收權：新 RPC 上線要 revoke 舊版；table-level revoke 會連 column grant 一齊收

- 經濟數值（道具數量、勝負、鑽石）一律經 security definer RPC 寫：掉落由 server 抽（`award_*`），使用由 server 扣（`use_*`），client 只用 RPC 回傳數量覆蓋本地（`Care.applyStones`）。
- 出新版 RPC 取代舊版時，同一份 migration `revoke execute` 舊版；用 `has_function_privilege('authenticated', oid, 'execute')` 列晒同名函數核對。
- 要改一個長 RPC 加 guard：用 `pg_get_functiondef` + `replace` 插入再 `execute`，replace 後檢查有冇插到（anchor 唔中就 `raise`），唔好成段重抄（容易抄錯舊版本）。
- `revoke update on table` 會連該表所有 column-level UPDATE grant 一齊收走：revoke 之後要再 `grant update (<cols>)`。
- 多人共用一行（battles）：用 BEFORE UPDATE trigger 按 `auth.uid()` 判斷邊一方，只准寫自己嗰欄；`current_user <> 'authenticated'` 時放行（security definer RPC 係 owner 身份）。
- 收 grant 之前照 Rule 76：grep 晒 client 所有 PATCH body，拎走相關欄位（今次：`patchEntry` 嘅 `stone_used`、`pushItems` 嘅 `items_stones`）。
- 驗證：未登入路徑喺 localhost 跑（Rule 62，試完還原存檔並 reload）；登入路徑要等用戶跑完 migration，再用 RPC 呼叫 + `information_schema.role_column_grants` 核對。

### Rule 96 — 網絡請求一律經 `Net.request`／`SupabaseAuth.authedFetch`：有 timeout、token 自動續期（single-flight）、401 refresh 一次再試；POST／RPC 唔自動重試

- 新寫嘅 Supabase 請求唔好直接 `fetch`：RPC 用 `SupabaseAuth._rpc`／`_rpcTable`；PostgREST 用 `SupabaseAuth.authedFetch(url, init, { timeout, quiet, where })`（`Sync._api`、`PvP.api` 已經係）。佢負責：`apikey`＋`Authorization`（有登入用 token，冇就 anon key——唔好再送 `Bearer null`／`undefined`）、發之前 `ensureFreshSession()`（提前 120 秒續期）、回 401 就強制 refresh 一次再發一次。
- `ensureFreshSession()` 係 **single-flight**：同時幾個 request 過期只會 POST 一次 refresh。Supabase refresh token 會輪換，同一粒用兩次可能當重用撤銷成個 session——唔好喺其他地方自己 call `/auth/v1/token?grant_type=refresh_token`。
- refresh 回 400／401（refresh token 已死）→ `_onSessionExpired()`：toast 一次「Your sign-in has expired — please sign in again.」＋`pe:auth-expired` 事件；**唔清 session**（清咗會行登出流程清本機進度）。
- `Net.request` timeout 預設 12 秒（auth 15、sync 20、PvP 10、登出 8）；離線即刻 throw `NetError(kind: offline)`；`NetError.message` 以 "Network" 開頭 → `App._authError` 對應 `net`。5xx 彈「Server is busy」、timeout／斷線彈「Connection problem」（同類 20 秒一次）；4xx 唔彈（業務錯誤由 caller 處理）；離線中唔逐個彈，只喺 offline／online 事件各彈一次。背景請求（sync、PvP、refresh、report）用 `quiet: true`。
- 唔做自動重試 POST／RPC（Rule 5：會重複發獎勵）；冪等 GET 先用 `Guard.fetchGet` 重試（Rule 94）。
- 驗收（唔好用真帳號，stub `window.fetch`）：過期 session＋5 個並行 `_rpc` → refresh 只 call 1 次、全部用新 token；401 一次 → 第二次成功；refresh 回 400 → 兩個 RPC 都 null、仍然 `isLoggedIn()`、expired toast 1 次；冇 session 嘅 `_rpcTable` 用 anon key；`navigator.onLine=false` → 0 toast；timeout 300ms 準時 throw `kind: timeout`。驗完要還原 `pokeengmon_auth_session`。

### Rule 98 — 本機資料唔准靜靜冇咗：sync queue 要持久化＋backoff＋毒批丟棄＋keepalive；存檔讀唔到要先備份；寫唔落要話用戶知；離線用 pill 提示

- `Sync` queue 存 `pokeengmon_sync_queue_v1`（每次入隊／送完即寫）；開 App 自動補送（3 秒後）。每行帶 `account_id`，flush 只送目前登入帳戶嘅行；卡按 `card_id` 去重，history 上限 2000。
- 失敗 backoff：1s → 2 → 4 … 上限 60s（`_failures` 最多 6）；離線唔試，`online` 事件即刻試。**4xx（除 401／408／429）＝毒批**：丟棄＋`Guard.report`，唔好無限重試卡住後面嘅資料。
- 頁面隱藏（`visibilitychange: hidden`／`pagehide`）用 `keepalive: true` 送——iOS PWA 唔會 fire `beforeunload`。`_api(method, path, body, { keepalive })`。
- 已知限制：`user_history` POST 冇 on_conflict，response 超時但 server 已寫入時重試會重複一行（`SM2.mergeHistory` 本地按 ts＋card_id 去重；server 端未處理）。
- `loadState()`：JSON 壞咗或者唔係 object → 先將原文寫去 `pokeengmon_state_corrupt_<ts>`（留 3 份）、`Guard.report`、`window.__stateRecovered = true`、toast 話用戶知，**先至**用 `defaultState()`。唔准直接 default（下一次 `saveState()` 會覆蓋玩家進度）。
- `saveState()` 寫唔落（quota／私密模式）→ `Guard.report`＋toast「Couldn't save on this device — storage may be full.」（5 分鐘一次），唔准 `catch (e) {}` 吞咗。
- 離線：`#net-offline` pill（`index.html` 內聯樣式，右上角、`pointer-events: none`、z 2550、`white-space: nowrap`、位置用 `--frame-screen-*`，Rule 81／46），由 `Net.syncPill()` 跟 `online`／`offline` 事件同步；toast 只喺轉離線／返線上各彈一次。舊 `.sync-banner`（`top: 0; translateX(-50%)`）唔好再用。
- 驗收：`npm test`（`tests/unit/sync-queue.test.js`）（18 項：持久化、重開還原、離線唔送、2s／4s backoff、成功清空、400 丟棄、401 保留、換帳戶唔送、hidden → keepalive、clearQueue、壞存檔備份原文）；headless `Network.emulateNetworkConditions offline` → pill 出、RPC 即刻 null、返線上 pill 收；壞 JSON 存檔重開 → App 正常、有備份、有 toast。
