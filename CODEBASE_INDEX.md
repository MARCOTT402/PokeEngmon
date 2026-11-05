# CODEBASE_INDEX（檢索用地圖｜改完功能記得同步）

> 詳細架構睇 `arch.md`。呢份只係「功能 → 檔案」。

| 功能 | 主要檔案 |
|------|----------|
| 入口 / 路由 / modal / 版本 | `index.html`, `js/app.js`, `sw.js` |
| 題庫 / 答題 / feedback | `js/quiz.js`, `Q_folder/` |
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
| HP／狀態／用藥規則（server RPC + guest 本地） | `js/care.js`, `tools/_test_care.js`, `supabase/migrations/supabase-migrate-20261105c-care-status-phase1.sql` |
| 數值 / 進化 / moves | `js/pokemon.js`, `js/data.js`, `js/gens-data.js` |
| GenPack | `js/genpack.js` |
| Streak / Gym | `js/gym.js` |
| Leaderboard | `js/leaderboard.js` |
| 練習日曆 | `js/calendar.js` |
| 錯題解析 | `js/explain.js` |
| UI 樣式 | `css/style.css` |
| 敏感規則 | `.cursor/rules/pokeengmon-core.mdc` |
