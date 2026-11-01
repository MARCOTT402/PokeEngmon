# Checklist — Friends MVP + PvP Realtime

> 對應 [spec.md](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/spec.md) / [tasks.md](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/tasks.md)

## Migration

- [x] `supabase-migrate-20261101e-friends.sql` 全段可 Run，無 SQL 語法錯誤（已在 Supabase 執行成功）
- [x] 好友／邀請表 `revoke all ... from anon, authenticated`，只經 RPC
- [x] 全部 RPC 有 `revoke` + `grant execute ... to authenticated` + 結尾 `notify pgrst`
- [x] 好友結算用 `settle_friend_battle(text)`，冇同 `settle_battle(text,text,text,int)` 撞 overload

## Realtime

- [x] `js/battle/realtime.js` 在 `index.html` 於 `pvp.js` 之前載入
- [x] `sw.js` ASSETS 包含 `js/battle/realtime.js` 與 `js/friends.js`
- [x] `waitRow()` 有 realtime 先行 + safety 輪詢（1.2s→×1.6→cap 2.2s）
- [x] `findBattleForMe` 有 `is_friend=eq.false`
- [x] `resolvePvpTurn` 有 `[PvP] turn latency` + `window.__pvpLatency`（最多 20）
- [x] `launchPvpBattle` 棄局分支有寫 `finishBattleRow`

## 好友功能

- [x] 好友 view 有 code 卡、搜尋、requests、friends、invites、back
- [x] 4 路加好友：friend code / 排行榜 `＋` / 名搜尋 / PvP 完場 Add opponent
- [x] 邀請 modal 有 1v1 / 3v3 / 6v6，可 cancel
- [x] 收到邀請可 accept（server 開 `is_friend=true` 局）／decline
- [x] 邀請過期（10 分鐘）有處理，唔會卡 waiting
- [x] 好友上限／pending 上限／重複邀請狀態有清楚 toast
- [x] 未登入撳 Friends → toast + Login Hub，不顯示空 view（瀏覽器實測）

## 對戰整合

- [x] `BattleUI.openFriendMatch` 正確設 `pvpSide` / `pvpFoeUid` / `pvpFoeName` / seed
- [x] `foeTrainerName()` 好友局顯示對手訓練員名
- [x] 好友局結算走 `settleFriendBattle`（贏 1💎／輸 0💎，每日 5 場）
- [x] 隨機 PvP 結算維持原獎勵，唔會派好友獎勵
- [x] 好友局唔會被隨機配對接走

## 文件 / 版本

- [x] `prd.md` §3.12 有好友系統 + 好友邀請 PvP 章節
- [x] 冇手動改 `APP_VERSION` / `CACHE_NAME` / `?v=`（維持 CI 帶入的 1.18.0）
- [x] 所有改動檔案 `node --check` 通過
