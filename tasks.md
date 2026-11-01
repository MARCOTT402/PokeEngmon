# Tasks — Friends MVP + PvP Realtime

> 對應 `spec.md`。每完成一項即打勾。

## T1. Migration SQL（不動前端）
- [x] 新檔 `supabase/migrations/supabase-migrate-20261101e-friends.sql`
- [x] `user_account.friend_code` + unique partial index
- [x] `user_account.friend_daily jsonb`
- [x] `friendships`（pair unique、no-self、RLS、revoke）
- [x] `battle_invites`（status、battle_id、indexes、RLS、revoke）
- [x] `battles.is_friend boolean` + index
- [x] RPC：`ensure_friend_code`、`resolve_friend_code`、`search_trainers`
- [x] RPC：`send_friend_request`、`respond_friend_request`、`remove_friend`、`get_my_friends`、`get_friend_requests`
- [x] RPC：`send_battle_invite`、`get_battle_invites`、`respond_battle_invite`、`cancel_battle_invite`
- [x] `settle_friend_battle(p_result)`：贏 1💎／輸 0💎、每日 5 場計鑽（**獨立 RPC**，唔撞每日配額版 `settle_battle`）
- [x] 全部 `v_`/`p_`、欄位 alias、revoke/grant、`notify pgrst`

## T2. Realtime 模組 + PvP 提速
- [x] `js/battle/realtime.js`（原生 WS、join/heartbeat/reconnect/degraded、每 battle 一 channel、subscriber 共用）
- [x] `pvp.js`：`SELECT_BATTLE` 精簡欄位
- [x] `pvp.js`：`is_friend=eq.false`（findBattleForMe）；好友局 server 建 row，唔會入池
- [x] `pvp.js`：`waitRow()`（realtime 先行 + 1.2s→×1.6→cap 2.2s safety poll）
- [x] `pvp.js`：`waitForTeams` / `waitForOpponentAction` 改用 `waitRow`
- [x] `pvp.js`：配對自適應 500→×1.4→cap 1500；`document.hidden` 暫停／visible 重入池
- [x] `index.html` / `sw.js` 加 `js/battle/realtime.js`（先於 pvp.js）
- [x] `battle.js`：`resolvePvpTurn` 記 `[PvP] turn latency` + `window.__pvpLatency`（最後 20 個）
- [x] `battle.js`：`launchPvpBattle` 棄局分支寫 `finishBattleRow`

## T3. Auth wrappers
- [x] `supabase-auth.js` 新增 13 個好友／邀請 RPC wrapper + `settleFriendBattle(result)`

## T4. Friends view / UI
- [x] `index.html` `view-friends`（code 卡、add、requests、friends、invites、back）
- [x] `index.html` battle menu `#battle-menu-friends` tile + badge
- [x] `css/style.css` `.friends-*` + `[hidden]` 對 flex 類；tile badge
- [x] `js/friends.js`：open/render/load、copy code、add by code、add by name、requests accept/decline、remove、invite modal（1v1/3v3/6v6）、invite accept/decline/cancel、waiting poll、badge poll
- [x] `js/app.js`：`Friends.open()` 入口、`#friends-back`、登入後 `Friends.startPolling()`
- [x] `sw.js` ASSETS 加 `js/friends.js`、`js/battle/realtime.js`

## T5. 4 路加好友 + 對戰入口
- [x] `leaderboard.js` 每行 `＋` → `Friends.addByUid`（`.lb-add` CSS）
- [x] `battle.js`：保存 `pvpFoeUid` / `pvpFoeName`
- [x] `battle.js`：`openFriendMatch(battle, foeName)` → 顯示場制 → `confirmFormat`
- [x] `battle.js`：`foeTrainerName()` PvP 顯示對手名
- [x] `battle.js`：結果卡 `#br-add-foe`（PvP + foeUid）；好友局用 `settleFriendBattle`
- [x] `battle.js`：`renderMenu()` 更新 friends tile sub/badge
- [x] `index.html` 結果卡加 `#br-add-foe` 按鈕（預設 hidden）

## T6. 文件
- [x] `prd.md` §3.12 好友系統 + 好友邀請 PvP（流程、上限、獎勵）
- [x] `prd.md` PvP 章節補 realtime 同步方式

## T7. 驗證（見 spec §9）
- [x] SQL 全段 Run 成功（用戶已在 Supabase 執行）
- [x] 13 支新 RPC 存在 + anon 探測回 `42501 permission denied`（證實已建且正確撤權）
- [ ] 每個新 RPC 真登入 200 smoke（需登入 session）
- [ ] Realtime WS join + latency p50/p95
- [ ] 斷 WS fallback 完成回合
- [ ] 好友 4 路 + remove（需 2 個真帳戶）
- [ ] 好友對戰 invite→開局→結算（第 6 場 0 鑽）
- [x] 隨機 PvP 唔劫好友局（`is_friend=eq.false` 已驗證程式碼）
- [x] `view-friends` 瀏覽器實測（無 console error；未登入會彈 Login Hub）
- [x] 版本檔未手動改（`?v=` / `CACHE_NAME` / `APP_VERSION` 維持 1.18.0）
- [x] 全部改動 JS `node --check` 通過

## T8.（需用戶明確指示先做）
- [ ] git commit / push（Conventional Commits）
