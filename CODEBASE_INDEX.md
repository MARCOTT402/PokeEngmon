# CODEBASE_INDEX（檢索用地圖｜改完功能記得同步）

> 詳細架構睇 `arch.md`。呢份只係「功能 → 檔案」。

| 功能 | 主要檔案 |
|------|----------|
| 入口 / 路由 / modal / 版本 | `index.html`, `js/app.js`, `sw.js` |
| 題庫 / 答題 / feedback（Quiz v2：分段進度、combo、底部回饋、App 鍵盤、≥600px 全螢幕） | `js/quiz.js`, `css/style.css`（尾段「Quiz v2」）, `Q_folder/` |
| 結算畫面（分數圈／stat／錯題預覽） | `js/app.js` `_renderSettlement`, `css/style.css`（「結算 v2」） |
| 答題 UI prototype／計劃 | `tools/prototype-quiz.html`, `.trae/documents/plan-quiz-ux-20261105.md` |
| 自訂題（CSV／App 內加句／加圖／View·Edit·Delete） | `js/app.js`, `js/data.js` (`customQuestions`), `js/qimg-db.js` (圖片 IndexedDB) |
| SRS / session | `js/sm2.js` |
| Power Up 改錯 | `js/powerup.js` |
| 本地存檔 | `js/storage.js` |
| 雲端 sync | `js/sync.js` |
| Auth + RPC（鑽石/捕捉/扭蛋/exp） | `js/supabase-auth.js` |
| Schema / RPC SQL | `supabase/supabase-schema.sql`, `supabase/migrations/` |
| 捕捉（Three.js） | `js/capture.js` |
| 扭蛋 | `js/gacha.js` |
| 圖鑑 | `js/pokedex.js` |
| 育成（飽肚值／拍檔／道具） | `js/pet.js` |
| 戰鬥畫面轉橫（橫向紅框 host #view-battle） | `js/battle/landscape.js` |
| 攜帶樹果戰鬥觸發（HELD 表、checkHeld／custapCheck） | `js/battle/state.js`, `tools/_test_held_berries.js`, `supabase/migrations/supabase-migrate-20261105g-held-berries.sql`（hold_berry） |
| Mega 進化（70 粒 Mega 石資料、MEGA 掣、megaEvolve） | `js/mega-data.js`（`tools/fetch_mega.py` 產生）, `js/battle/state.js`, `tools/_test_mega.js`, `assets/battle/pkmn/{front,back}/<dex>-mega*.png`（`tools/fetch_pkmn_sprites.py --mega`）, `supabase/migrations/supabase-migrate-20261105h-mega.sql` |
| Mega 特性（Tough Claws／Drought／Pixilate／Parental Bond／Mold Breaker 等，招式分類表） | `js/battle/engine.js`（`abilityPowerMult`、`isContact`）, `js/battle/state.js`（`onSwitchIn`、`priorityOf`、`trappedBy`、Electric Terrain）, `tools/_test_mega_abilities.js` |
| 擊倒對手後問換 Pokémon（第 16 項；AI 戰免回合、PvP 當下回合 action） | `js/battle/battle.js`（`askYesNo`、`offerShift`、`shiftPick`） |
| Trainer Avatar（第 14 項；104 個原作角色全身像、揀選器、雲端同步） | `js/avatars.js`, `assets/trainers/avatars/`（`tools/fetch_trainer_avatars.py`）, `js/sync.js`（`pushAvatar`）, `js/friends.js`（頁頭）, `supabase/migrations/supabase-migrate-20261105i-trainer-avatar.sql` |
| PvP pre-battle 頁（第 13 項；雙方頭像、隊伍、戰績、對戰紀錄） | `js/battle/battle.js`（`showPreBattle`）, RPC `get_trainer_cards` |
| PvP 結算核對（狀態第二期；兩邊報告對勝方） | `js/battle/battle.js`（`reportPvpResult`、`settleFriendV2`）, `supabase/migrations/supabase-migrate-20261105j-pvp-crosscheck.sql`（`battle_reports`、`report_battle_result`、`settle_friend_battle_v2`） |
| 背包（橫向紅框、三欄、轉手機提示） | `js/bag.js`, `tools/prototype-bag.html`（設計稿） |
| HP／狀態／用藥規則（server RPC + guest 本地） | `js/care.js`, `tools/_test_care.js`, `supabase/migrations/supabase-migrate-20261105c-care-status-phase1.sql` |
| 數值 / 進化 / moves | `js/pokemon.js`, `js/data.js`, `js/gens-data.js` |
| GenPack | `js/genpack.js` |
| Streak / Gym | `js/gym.js` |
| Leaderboard | `js/leaderboard.js` |
| 練習日曆 | `js/calendar.js` |
| 錯題解析 | `js/explain.js` |
| UI 樣式 | `css/style.css` |
| 敏感規則 | `.cursor/rules/pokeengmon-core.mdc` |
