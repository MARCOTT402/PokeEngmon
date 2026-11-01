# Spec — Friends System MVP + PvP Realtime 提速

> 版本：v1（2026-11-01）
> 狀態：待批核（批核後照 `tasks.md` 執行）
> 相關：`prd.md` §3.12（新增章節）、`supabase/migrations/supabase-migrate-20261101d-friends.sql`

## 1. 目標

1. **好友系統 MVP**：好友清單、請求、刪除；4 種加好友入口；好友邀請制 PvP。
2. **PvP 反應提速**：Supabase Realtime（原生 WebSocket，零依賴）取代主要輪詢；輪詢降為 safety fallback。
3. **好友 PvP 獎勵**：server 權威結算，每日最多 5 場計鑽。

非目標：禮物、觀戰、好友排行、即時聊天、線上狀態（online presence）。

## 2. 現況（已確認）

- `battles` 已在 `supabase_realtime` publication；RLS：只有參與者（`p1_uid`/`p2_uid`）可 SELECT/UPDATE。
- `pvp.js` 現時每 1800ms 全量 `GET /battles`；`waitForTeams` / `waitForOpponentAction` 只靠輪詢；配對只靠 `matchmaking` 表。
- `battle.js`：`onMatched(battle, side, foeUid)` 已存在但 `foeUid` 冇保存；結果畫面只有 CONTINUE；`settle_battle(text,text,text)` 已支援 `ai|pvp`。
- `leaderboard.js` 每行已有 `accountUuid`。
- `supabase-auth.js` 有 `_rpc()`（單行/物件）與 `_rpcTable()`（setof rows）可重用。
- 版本號由 CI 同步（`tools/sync_app_version.py`），本地唔手動 bump `APP_VERSION`。
- `sw.js` 有明確 `ASSETS` 清單，新 JS 必須加入。
- `index.html` 所有 script 帶 `?v=`，新 script 同樣。

## 3. Schema（migration `supabase-migrate-20261101d-friends.sql`）

### 3.1 `user_account`
```sql
alter table user_account add column if not exists friend_code text;
create unique index if not exists user_account_friend_code_uniq
  on user_account (friend_code) where friend_code is not null;
```
- 8 字元；字母表 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（剔除 O/0/I/1）。
- Lazy 生成：`ensure_friend_code()`（security definer）檢查自己個 code，冇就 loop 生成 + 檢查全表唯一，最多 50 次。

### 3.2 `friendships`
```sql
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references user_account(id) on delete cascade,
  addressee uuid not null references user_account(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at bigint not null default (extract(epoch from now())*1000)::bigint,
  responded_at bigint,
  constraint friendships_no_self check (requester <> addressee)
);
create unique index friendships_pair_uniq on friendships
  (least(requester, addressee), greatest(requester, addressee));
alter table friendships enable row level security;
revoke all on friendships from anon, authenticated;   -- 只准經 RPC
```

### 3.3 `battle_invites`
```sql
create table if not exists battle_invites (
  id uuid primary key default gen_random_uuid(),
  from_uid uuid not null references user_account(id) on delete cascade,
  to_uid uuid not null references user_account(id) on delete cascade,
  team_size int not null check (team_size in (1,3,6)),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','expired')),
  battle_id uuid references battles(id) on delete set null,
  created_at bigint not null default (...),
  responded_at bigint,
  constraint battle_invites_no_self check (from_uid <> to_uid)
);
create index battle_invites_to on battle_invites (to_uid, status);
create index battle_invites_from on battle_invites (from_uid, status);
alter table battle_invites enable row level security;
revoke all on battle_invites from anon, authenticated;
```

### 3.4 `battles`
```sql
alter table battles add column if not exists is_friend boolean not null default false;
```

## 4. RPC（全部 `security definer` + `set search_path = public`，變數 `v_`、參數 `p_`、欄位帶 alias）

| RPC | 簽名 | 回傳 | 規則 |
|---|---|---|---|
| `ensure_friend_code` | `()` | `text` | 冇 code 就生成；重入安全 |
| `resolve_friend_code` | `(p_code text)` | `jsonb` | `{account_uuid,trainer_name}`；搵唔到回 `null`；自己回 `{self:true}` |
| `search_trainers` | `(p_query text)` | `table(account_uuid uuid, trainer_name text, relation text)` | 名字 ILIKE；≥2 字；排除自己；limit 20；`relation` ∈ `friend/pending_out/pending_in/none` |
| `send_friend_request` | `(p_target uuid)` | `jsonb` | 已好友 → `already_friends`；已 outgoing pending → `pending`；對方已向我請求 → 自動 `accepted`；上限：好友 50、outgoing pending 20；否則 insert → `sent` |
| `respond_friend_request` | `(p_requester uuid, p_accept boolean)` | `jsonb` | accept → status accepted；decline → 刪 row（可再請求）；唔存在 → `not_found` |
| `remove_friend` | `(p_friend uuid)` | `jsonb` | 刪 pair → `{removed:true/false}` |
| `get_my_friends` | `()` | `table(account_uuid uuid, trainer_name text, pvp_wins int, pvp_losses int, since bigint)` | 只 accepted |
| `get_friend_requests` | `()` | `table(account_uuid uuid, trainer_name text, created_at bigint)` | 只 incoming pending |
| `send_battle_invite` | `(p_friend uuid, p_team_size int)` | `jsonb` | 必須好友；team_size ∈ 1/3/6；同 pair 10 分鐘內已有 pending（任一方向）→ `pending_exists`；否則 insert → `{status:'sent',invite_id,to_uid}` |
| `get_battle_invites` | `()` | `table(invite_id uuid, direction text, account_uuid uuid, trainer_name text, team_size int, status text, created_at bigint, battle_id uuid)` | 最近 10 分鐘、涉及自己、status pending/accepted；`direction` ∈ `in/out` |
| `respond_battle_invite` | `(p_invite uuid, p_accept boolean)` | `jsonb` | 只 to_uid 可回應；過期 → `expired`；decline → `declined`；accept → server roll seed、insert `battles(mode='pvp',p1=from,p2=to,is_friend=true,seed)`、invite→accepted，回 `{status:'accepted',battle_id,side:'p2',team_size,foe_uid,foe_name}` |
| `cancel_battle_invite` | `(p_invite uuid)` | `jsonb` | 只 from_uid、只 pending → 刪 row |
| `settle_battle` | `(p_kind text, p_result text, p_trainer_id text default null, p_battle_id uuid default null)` | `jsonb` | 新增 `pvp_friend`：贏 1💎、輸 0💎；每日最多 5 場（count finished `is_friend` battles since 今日 00:00，**排除 p_battle_id**）；`pvp_wins/losses` 照加 |

- 先 `drop function if exists settle_battle(text,text,text)`（舊簽名）避免 overload 混亂。
- 所有 RPC：`revoke all ... from public, anon; grant execute ... to authenticated;`
- 最後 `notify pgrst, 'reload schema';`
- 先例：`get_leaderboard` 也是 `security definer` + revoke anon；好友 RPC 必須同一處理（Rule 9）。

## 5. Realtime（`js/battle/realtime.js`）

原生 WebSocket，唔引入 supabase-js：

- URL：`wss://<project-ref>.supabase.co/realtime/v1/websocket?apikey=<anon>&vsn=1.0.0`
  - ref 由 `SUPABASE_CONFIG.url` 抽 host 第一段；anon key 由 `SUPABASE_CONFIG.anonKey`。
- `PvpRealtime.subscribe(battleId, cb)` → 回傳 `unsubscribe`：
  - 每個 battleId 一條 channel（subscriber 共用），`phx_join` payload：
    ```js
    { config: { postgres_changes: [{ event: "UPDATE", schema: "public", table: "battles", filter: "id=eq."+battleId }] }, access_token: SupabaseAuth.currentToken() }
    ```
  - topic `realtime:pvp:<battleId>`。
  - 收到 `postgres_changes` → 取 `payload.record` / `payload.data.record` → 同步給所有 subscriber；保留 `lastRecord` 俾新 subscriber 即時收到。
  - 心跳：每 25s `{topic:"phoenix",event:"heartbeat",payload:{},ref}`；`document.hidden` 時降低心跳（或照常，成本低）。
  - 斷線：指數退避重連（1s→2s→4s→8s→cap 10s）；`join` 失敗 / 連 3 次失敗 → 標記 `degraded=true`（照樣俾 pvp.js 輪詢 fallback）。
  - 最後一個 subscriber 取消 → 60s 後無新 subscriber 才關 WS（避免回合之間反覆握手）。
  - 絕不 throw：所有錯誤只 `console.warn("[Realtime] ...")`。
- 安全：只訂閱自己參與嘅 battle（RLS 會擋；若 join 被拒，直接 fallback）。

## 6. `js/battle/pvp.js` 改動

1. **唔再用 1800ms 全量 GET**
   - 新增 `SELECT_BATTLE = "id,state,seed,winner,team_size,p1_uid,p2_uid,p1_action,p2_action,p1_team,p2_team,is_friend"`，所有 `fetchBattle` 只攞需要欄位。
2. **配對過濾好友局**：`findOpponent()`、`findBattleForMe()` 加 `is_friend=eq.false`（防隨機配對劫走好友局）。
3. **等待用 realtime 先行**：新增 `waitRow(battleId, isDone)`：
   - 先 `PvpRealtime.subscribe`；
   - safety 輪詢：首次 1200ms，之後 `×1.6`（cap 2200ms）；
   - `isDone` 成立即 cleanup（unsubscribe + clearTimeout）並 resolve。
   - `waitForOpponentAction` / `waitForTeams` 改用 `waitRow`。
4. **自適應配對輪詢**：`matchmake` 由固定 1800ms 改 `delay = 500 → ×1.4 → cap 1500ms`；`document.hidden` 暫停（唔發請求），visible 時重新入池（DELETE+POST，只限未 matched）。
5. **棄局補寫**：`launchPvpBattle` 任何「對手走／冇隊伍」分支都要 `finishBattleRow(battleId, foeSide)`（現時只 toast + openMenu，row 會殘留 active）。
6. **延遲量測**：`resolvePvpTurn` 由 submit 到收到對手 action 計 `console.debug("[PvP] turn latency", ms+"ms")`；`window.__pvpLatency` 陣列（最後 20 個）方便驗證 p50/p95。
7. **好友局**：`matchmake` 不受影響；好友局由 `battle.js` 直接開。

## 7. UI / 功能

### 7.1 新 view：`index.html` `<section id="view-friends" class="view friends-view">`
- Header：`Friends` + 關閉／返回。
- 自己 Friend Code 卡：`#friends-code` + `#friends-copy-code`（`navigator.clipboard`，失敗 fallback `App.toast`）。
- 加好友：`#friends-add-input`（friend code 或名）+ `#friends-add-btn`；結果列表 `#friends-search-results`（每行 `ADD` / 狀態）。
  - 輸入 8 字元字母表格式 → 先 `resolve_friend_code` → 再 `send_friend_request`。
  - 否則 → `search_trainers`（≥2 字）列出 `＋` 按鈕。
- 好友請求：`#friends-requests`（ACCEPT / DECLINE）。
- 好友清單：`#friends-list`（名、W–L、`⚔ Invite`、`Remove`）。
- 邀請：`#friends-invites`（incoming ACCEPT/DECLINE；outgoing pending「Waiting… / Cancel」）。
- Loading / empty / error 狀態都要有文字，唔可以空白。
- 未登入：toast + 打開 Login Hub，唔顯示 view。

### 7.2 入口
- `view-battle-menu` 加 tile：`👥 Friends`（`#battle-menu-friends`，sub 顯示 `N friends · M requests`），`BattleUI.renderMenu()` 更新。
- `app.js`：`Friends.open()` 綁定；`#friends-back` → home。
- 首頁 Battle tile 唔改。

### 7.3 4 路加好友
1. **Friend Code**（friends view）。
2. **排行榜一鍵加**：`leaderboard.js` 每行（非自己、有 `accountUuid`）加 `＋` 按鈕 → `Friends.addByUid(uuid, name)` → toast。
3. **訓練員名搜尋**（friends view）。
4. **PvP 完場 Add opponent**：`battle.js` 配對時保存 `pvpFoeUid` / `pvpFoeName`；結果卡加 `#br-add-foe` 按鈕（只 PvP + 有 foeUid 時顯示）→ `Friends.addByUid`。

### 7.4 好友邀請 PvP
- Invite：friends list `⚔` → modal 揀 1v1 / 3v3 / 6v6 → `send_battle_invite` → 顯示 waiting（3s poll `get_battle_invites`，accepted 即 `fetchBattle` → `BattleUI.openFriendMatch`；cancel → `cancel_battle_invite`）。
- Accept（invitee）：`respond_battle_invite(...,true)` → `PvpNet.fetchBattle(battle_id)` → `BattleUI.openFriendMatch`。
- `BattleUI.openFriendMatch(battle, foeName)`：`mode="pvp"`、`pvpBattle=battle`、`pvpSide = (p1_uid===me?'p1':'p2')`、`pvpTeamSize=battle.team_size`、`pvpFoeUid`、`pvpFoeName`；顯示 `#pvp-match-panel` + `#pvp-matched`（格式 = team_size），之後照 `confirmFormat` → 揀隊 → `launchPvpBattle`。
- `foeTrainerName()` PvP 時回 `pvpFoeName || "RIVAL"`。
- 通知：登入後 `Friends.startPolling()`，每 20s `get_battle_invites`；只在 `view-home` / `view-battle-menu` / `view-friends` 且非對戰中，遇到新 pending 就 toast + tile badge；好友 view 開住時 8s 一次。
- 已接受但未開局嘅 invite 唔好自動搶走：`PvpNet.findBattleForMe` 已過濾 `is_friend=false`，所以隨機配對唔會接到好友局；好友局必須經 invite 流程開。

### 7.5 `supabase-auth.js` wrappers
```js
ensureFriendCode() / resolveFriendCode(code) / searchTrainers(q)
sendFriendRequest(uid) / respondFriendRequest(requester, accept) / removeFriend(uid)
getMyFriends() / getFriendRequests()
sendBattleInvite(friendUid, teamSize) / getBattleInvites()
respondBattleInvite(inviteId, accept) / cancelBattleInvite(inviteId)
settleBattle(kind, result, trainerId, battleId)   // 加 p_battle_id
```
- 全部用現有 `_rpc` / `_rpcTable`；失敗 return `null`，由 UI toast（Rule 5：已登入唔可以靜默 fallback）。

## 8. 檔案清單

| 檔案 | 動作 |
|---|---|
| `supabase/migrations/supabase-migrate-20261101d-friends.sql` | 新增（schema + RPC） |
| `js/battle/realtime.js` | 新增 |
| `js/battle/pvp.js` | 改（realtime、過濾、自適應、latency、棄局） |
| `js/friends.js` | 新增（view controller + polling + invite flow） |
| `js/supabase-auth.js` | 改（RPC wrappers、settleBattle 加 `p_battle_id`） |
| `js/leaderboard.js` | 改（每行 `＋ Friend`） |
| `js/battle/battle.js` | 改（`openFriendMatch`、`pvpFoeUid/Name`、results Add opponent、`foeTrainerName`、renderMenu 好友 tile） |
| `js/app.js` | 改（friends view 入口 / back / `Friends.startPolling()`） |
| `index.html` | 改（`view-friends`、Friends tile、結算 Add opponent、新 script） |
| `css/style.css` | 改（`.friends-*`、badge；`[hidden]{display:none}` 對 flex 類） |
| `sw.js` | 改（ASSETS 加 `js/friends.js`、`js/battle/realtime.js`） |
| `prd.md` | 改（§3.12 好友系統 + PvP 邀請；資產/功能描述同步） |

## 9. 驗證（必須做）

1. **SQL**：Supabase SQL Editor 全段 Run 無錯；`pg_proc` 見到新函數。
2. **RPC smoke（Rule 9）**：真登入帳戶（瀏覽器 DevTools Network）逐個 call：
   - `ensure_friend_code` → 200 + 8 字 code
   - `send_friend_request` / `get_friend_requests` / `respond_friend_request` / `get_my_friends` → 200，DB 有 row
   - `send_battle_invite` / `get_battle_invites` / `respond_battle_invite` → 200，`battles` 多一行 `is_friend=true` + seed
   - `settle_battle` `pvp_friend` → 200，`{bonus:1|0,balance,...,wins,losses}`
3. **Realtime**：
   - 兩個瀏覽器（或一真一假 session）入同一 battle；DevTools WS 見 join ok。
   - 對手寫 action 後，另一端 `[PvP] turn latency` p50 < 700ms、p95 < 1500ms（20 回合樣本）。
   - 人為斷 WS（DevTools offline / 關 WS）→ 仍然靠 fallback 完成回合，唔卡死。
4. **好友流程**：A/B 兩個 Google 帳戶（或 A + B 測試資料）：
   - code add → request → accept → 出現在雙方清單
   - leaderboard `＋` / 名搜尋 / PvP 完場 Add opponent 三路都成功
   - remove → 雙方清單消失
5. **好友對戰**：invite → 對方接受 → 兩邊揀隊 → 開局 seed 相同（HP/回合一致）；完場鑽石：贏 +1、輸 +0，第 6 場 0 鑽；`pvp_wins/losses` 增加。
6. **隨機 PvP**：好友局唔會被隨機配對劫走（`is_friend=false` filter）。
7. **版本**：唔手動改 `APP_VERSION` / `CACHE_NAME` / `?v=`（CI 負責）；本地預覽如需，用 `npm run sync-version`（Rule 1）。
8. **瀏覽器實測**（Rule 20）：preview 視窗非 0×0；`view-friends` 可開、可關、可返回；no console error。

## 10. 風險 / 決策

- **每日 5 場好友鑽**：靠 `p_battle_id` 排除當前場；若前端冇傳 battle id（舊 client）就 fallback 計全部 → 可能少派，唔會多派。可接受。
- **Realtime join 失敗**：純 fallback 輪詢，遊戲照玩；`degraded` 只記錄 console。
- **好友 invite 過期**：10 分鐘；`get_battle_invites` 只回 10 分鐘內，舊 row 由 server 標 `expired`（`respond` 時檢查 created_at）。
- **邀請 spam**：同 pair 10 分鐘只 1 個 pending；好友上限 50；outgoing pending 20。
- **安全**：`friendships` / `battle_invites` 前端零直接讀寫；所有 mutation 經 RPC；`ensure_friend_code` 只改自己 row。
- **唔改**：`Sync.pushState` 唔加好友資料（唔係敏感數值，亦冇必要上雲）；鑽石仍只經 `settle_battle`。

## 11. 批核後執行順序

見 `tasks.md`。
