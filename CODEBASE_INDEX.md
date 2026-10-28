# CODEBASE_INDEX（檢索用地圖｜改完功能記得同步）

> 詳細架構睇 `arch.md`。呢份只係「功能 → 檔案」。

| 功能 | 主要檔案 |
|------|----------|
| 入口 / 路由 / modal / 版本 | `index.html`, `js/app.js`, `sw.js` |
| 題庫 / 答題 / feedback | `js/quiz.js`, `Q_folder/` |
| SRS / session | `js/sm2.js` |
| Power Up 改錯 | `js/powerup.js` |
| 本地存檔 | `js/storage.js` |
| 雲端 sync | `js/sync.js` |
| Auth + RPC（鑽石/捕捉/扭蛋/exp） | `js/supabase-auth.js` |
| Schema / RPC SQL | `supabase/supabase-schema.sql`, `supabase/migrations/` |
| 捕捉（Three.js） | `js/capture.js` |
| 扭蛋 | `js/gacha.js` |
| 圖鑑 | `js/pokedex.js` |
| 數值 / 進化 / moves | `js/pokemon.js`, `js/data.js`, `js/gens-data.js` |
| GenPack | `js/genpack.js` |
| Streak / Gym | `js/gym.js` |
| Leaderboard | `js/leaderboard.js` |
| 練習日曆 | `js/calendar.js` |
| 錯題解析 | `js/explain.js` |
| UI 樣式 | `css/style.css` |
| 敏感規則 | `.cursor/rules/pokeengmon-core.mdc` |
