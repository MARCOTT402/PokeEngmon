# Tasks — Friends MVP + PvP Realtime

> 對應 `spec.md` v1。每完成一項即 `TodoWrite` 標記完成。

## T1. Migration SQL（不動前端）
- [ ] 新檔 `supabase/migrations/supabase-migrate-20261101d-friends.sql`
- [ ] `user_account.friend_code` + unique partial index
- [ ] `friendships`（pair unique、no-self、RLS、revoke）
- [ ] `battle_invites`（status、battle_id、indexes、RLS、revoke）
- [ ] `battles.is_friend boolean`
- [ ] RPC：`ensure_friend_code`、`resolve_friend_code`、`search_trainers`
- [ ] RPC：`send_friend_request`、`respond_friend_request`、`remove_friend`、`get_my_friends`、`get_friend_requests`
- [ ] RPC：`send_battle_invite`、`get_battle_invites`、`respond_battle_invite`、`cancel_battle_invite`
- [ ] `settle_battle(text,text,text,uuid)`：`pvp_friend` 1/0💎、每日 5 場 cap、`p_battle_id` 排除
- [ ] 全部 `v_`/`p_`、欄位 alias、revoke/grant、`notify pgrst`

## T2. Realtime 模組 + PvP 提速
- [ ] `js/battle/realtime.js`（原生 WS、join/heartbeat/reconnect/degraded、每 battle 一 channel、subscriber 共用）
- [ ] `pvp.js`：`SELECT_BATTLE` 精簡欄位
- [ ] `pvp.js`：`is_friend=eq.false`（findOpponent / findBattleForMe）
- [ ] `pvp.js`：`waitRow()`（realtime 先行 + 1.2s→×1.6→cap 2.2s safety poll）
- [ ] `pvp.js`：`waitForTeams` / `waitForOpponentAction` 改用 `waitRow`
- [ ] `pvp.js`：配對自適應 500→×1.4→cap 1500；`document.hidden` 暫停／visible 重入池
- [ ] `pvp.js`：`launchPvpBattle` 各棄局分支寫 `finishBattleRow`
- [ ] `pvp.js`：`[PvP] turn latency` + `window.__pvpLatency`（最後 20 個）
- [ ] `sw.js` / `index.html` 加 `js/battle/realtime.js`（先於 pvp.js）

## T3. Auth wrappers
- [ ] `supabase-auth.js` 新增 11 個好友／邀請 RPC wrapper
- [ ] `settleBattle(kind, result, trainerId, battleId)` 傳 `p_battle_id`

## T4. Friends view / UI
- [ ] `index.html` `view-friends`（code 卡、add、requests、friends、invites、back）
- [ ] `index.html` battle menu `#battle-menu-friends` tile + badge
- [ ] `css/style.css` `.friends-*` + `[hidden]` 對 flex 類；tile badge
- [ ] `js/friends.js`：open/render/load、copy code、add by code、add by name/uid、requests accept/decline、remove、invite modal（1v1/3v3/6v6）、invite accept/decline/cancel、waiting poll、badge/notification poll
- [ ] `js/app.js`：`Friends.open()` 入口、`#friends-back`、登入後 `Friends.startPolling()`
- [ ] `sw.js` ASSETS 加 `js/friends.js`；`index.html` script 加載

## T5. 4 路加好友 + 對戰入口
- [ ] `leaderboard.js` 每行 `＋` → `Friends.addByUid`
- [ ] `battle.js`：保存 `pvpFoeUid` / `pvpFoeName`
- [ ] `battle.js`：`openFriendMatch(battle, foeName)` → `onMatched` → `confirmFormat`
- [ ] `battle.js`：`foeTrainerName()` PvP 顯示對手名
- [ ] `battle.js`：結果卡 `#br-add-foe`（PvP + foeUid）
- [ ] `battle.js`：`renderMenu()` 更新 friends tile sub/badge
- [ ] `index.html` 結果卡加 `#br-add-foe` 按鈕（預設 hidden）

## T6. 文件
- [ ] `prd.md` §3.12 好友系統 + 好友邀請 PvP（流程、上限、獎勵）
- [ ] `prd.md` PvP 章節補 realtime 同步方式
- [ ] （有需要）免責聲明無新資產 → 唔改

## T7. 驗證（見 spec §9）
- [ ] SQL 全段 Run 成功
- [ ] 每個新 RPC 真登入 200 smoke
- [ ] Realtime WS join + latency p50/p95
- [ ] 斷 WS fallback 完成回合
- [ ] 好友 4 路 + remove
- [ ] 好友對戰 invite→開局→結算（第 6 場 0 鑽）
- [ ] 隨機 PvP 唔劫好友局
- [ ] `view-friends` 瀏覽器實測（無 console error）
- [ ] 版本檔未手動改（CI 負責）

## T8.（需用戶明確指示先做）
- [ ] git commit / push（Conventional Commits）
