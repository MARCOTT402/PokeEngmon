# CODEBASE_INDEX（檢索用地圖｜改完功能記得同步）

> 詳細架構睇 `arch.md`。呢份只係「功能 → 檔案」。

| 功能 | 主要檔案 |
|------|----------|
| 入口 / 路由 / modal / 版本 | `index.html`, `js/app.js`, `sw.js` |
| 全域錯誤邊界（error／rejection handler、ErrorLog 上報、恢復卡、開機兜底畫面、`Guard.asyncClick`／`fetchGet`／`num`） | `js/core/guard.js`, `index.html`（head 內聯樣式＋shim、`#fatal-screen`、`#guard-recover`）, `supabase/migrations/supabase-migrate-20261106d-client-errors.sql`（`client_errors`、`log_client_errors`）, Rule 94 |
| 題庫 / 答題 / feedback（Quiz v2：分段進度、combo、底部回饋、App 鍵盤、≥600px 全螢幕） | `js/quiz.js`, `css/style.css`（尾段「Quiz v2」）, `Q_folder/` |
| 結算畫面（分數圈／stat／錯題預覽） | `js/app.js` `_renderSettlement`, `css/style.css`（「結算 v2」） |
| 答題 UI prototype／計劃 | `tools/prototype-quiz.html`, `.trae/documents/plan-quiz-ux-20261105.md` |
| 自訂題（CSV／App 內加句／加圖／View·Edit·Delete） | `js/app.js`, `js/data.js` (`customQuestions`), `js/qimg-db.js` (圖片 IndexedDB) |
| SRS / session（解析快取 Rule 93） | `js/sm2.js`, `tools/_test_sm2_cache.js` |
| 自動測試／lint／CI（`npm test`＝`node:test` 單元測試；vm loader；舊存檔 fixture；ESLint 跨檔 globals 自動生成；e2e 總 runner；release 前跑 lint+test） | `tests/unit/*.test.js`, `tests/helpers/load.js`, `tests/fixtures/state-old.json`（`tools/make-old-state-fixture.mjs`）, `eslint.config.mjs`, `tools/audit/gen-eslint-globals.mjs`→`eslint.globals.json`, 死碼掃描 `tools/audit/unused-css.mjs`／`unused-assets.mjs`（Rule 108）, `tools/responsive/run-all.mjs`, `.github/workflows/release.yml`, 計劃 `.trae/documents/20261106-commercial-grade-engineering.md` |
| 效能基線（CPU 降速量入題／答題寫入／sheet 切換） | `tools/perf/bench.mjs`, 計劃 `.trae/documents/20261106-stability-performance.md` |
| 題目圖片清單（`findQuestionImage` 讀 `index.json`；加／刪圖要重跑） | `tools/gen_grammar_image_index.py`, `Q_folder/grammar/grammar_images/index.json`, `js/data.js`, Rule 101 |
| 開機預載（戰鬥 BGM idle 預載 `preloadBattleBGM`；捕捉場景 `CaptureScene.preload`） | `js/app.js`（entry gate `unlockAudio`）, `js/audio.js`（`_loadBGMBuffer`、facade `preload/load`）, Rule 101／103 |
| Power Up 改錯 | `js/powerup.js` |
| 本地存檔（壞存檔先備份 `pokeengmon_state_corrupt_*`、寫唔落提示，Rule 98；150ms 合併寫入＋`flushState`，Rule 102） | `js/storage.js` |
| Service Worker 分流（`swRoute`：跨域 API skip、版本化 cache-first、頁面 3 秒 timeout） | `sw.js`, `tests/unit/sw-strategy.test.js`, Rule 102 |
| 答題預載下一題（`Quiz._preloadNext`、`CaptureScene.audio.preloadWord`） | `js/quiz.js`, `js/audio.js`, Rule 102 |
| 雲端 sync（持久化 queue `pokeengmon_sync_queue_v1`、backoff、keepalive，Rule 98） | `js/sync.js`, `tests/unit/sync-queue.test.js` |
| Auth + RPC（鑽石/捕捉/扭蛋/exp；`authedFetch`、single-flight token 續期，Rule 96） | `js/supabase-auth.js` |
| 網絡層（timeout／離線／錯誤分類／連線 toast／離線 pill `#net-offline`） | `js/core/net.js`（`Net.request`、`NetError`、`syncPill`），Rule 96／98 |
| Schema / RPC SQL | `supabase/supabase-schema.sql`, `supabase/migrations/` |
| 捕捉（Three.js；按需 `import()`，經 `CaptureScene.load()`／`play()`，Rule 103） | `js/capture.js` |
| 音效引擎（BGM、SFX、單字錄音；`window.CaptureScene` facade） | `js/audio.js`, Rule 103 |
| 背景音樂選擇（Settings → Audio → Music track：Flat Water／Brown Noise／Focus Tones，3 分鐘 loop；`state.bgmTrack` ↔ 雲端 `user_account.bgm_track`） | `js/storage.js`（`BGM_TRACKS`、`getBgmTrack/setBgmTrack`）, `js/audio.js`（`_townUrl`、`switchTownTrack`）, `js/app.js`（`_syncBgmTrack`）, `js/sync.js`（pull／`patchAccount`）, `assets/bgm/focus-*.mp3`, migration `supabase-migrate-20261107-bgm-track.sql` |
| 對戰字型（emerald 拉丁子集 woff2＋原 ttf 互補 `unicode-range`） | `assets/fonts/pokemon-emerald-pro-latin.woff2`, `css/style.css` `@font-face`, Rule 103 |
| 扭蛋 | `js/gacha.js` |
| 動畫倍速 1×／2×／3×（捕捉、扭蛋、進化；Settings → Gameplay；只存本機 `pe_anim_speed`；GSAP `globalTimeline.timeScale` + `<html>` `--anim-spd`，Rule 95） | `js/anim-speed.js`（`AnimSpeed.begin/end/ms/badge`）, `js/capture.js`（`_after`）, `js/gacha.js`（`_setT`、`_spdBegin/_spdEnd`）, `js/evolve-scene.js`（`_later`）, `js/app.js`（`_syncAnimSpeed`）, 計劃 `.trae/documents/20261106-keyboard-and-capture-speed.md` |
| 全鍵盤操作（↑↓←→ 空間導航、Enter、Esc 關 overlay／返回、開 sheet／modal 自動焦點＋還焦點、overlay Tab 困住、`?` 快捷鍵一覽；捷徑層 `SHORTCUTS`（主頁 S／1–4／D／G／C／Q／B、選題 S、頁面 H、戰鬥 F／B／S／R／1–4／M／Y／N、圖鑑詳情 Shift+←／→）＋鍵盤模式 badge＋開關（`pe_kbd_shortcuts`）；捕捉 Space／Enter；背包 Space 拎起放低；戰鬥對話 Enter 推進；Settings → Help → Keyboard shortcuts 只喺滑鼠裝置顯示；Rule 97） | `js/keys.js`（`Keys.context/move/escape/showHelp`、`SHORTCUTS`、`renderBadges`）, `js/capture.js`（keydown Space／Enter）, `js/bag.js`（`Drag` kbd carry）, `js/pokedex.js`（`stepDetail`）, `js/battle/battle.js`（`waitTap` 鍵盤）, 測試 `tools/responsive/test-keys.mjs`、`test-anim-speed.mjs`, `css/style.css`（`[data-kbd-auto]:focus-visible`、`.kbd-only`、`.kbd-help`）, `js/app.js`（答題 Enter 讓位畀焦點掣、`btn-kbd-help`）, 計劃 `.trae/documents/20261106-keyboard-and-capture-speed.md` |
| 圖鑑 | `js/pokedex.js` |
| 育成（飽肚值／拍檔／道具） | `js/pet.js` |
| 戰鬥畫面轉橫（橫向紅框 host #view-battle） | `js/battle/landscape.js` |
| 攜帶樹果戰鬥觸發（HELD 表、checkHeld／custapCheck） | `js/battle/state.js`, `tests/unit/held-berries.test.js`, `supabase/migrations/supabase-migrate-20261105g-held-berries.sql`（hold_berry） |
| 攜帶道具規則（第 5 項：只限樹果／Mega 石；進化石只可以「使用」；held_item 只經 RPC） | `js/bag.js`（`giveStone`、`returnHeldStones`）, `supabase/migrations/supabase-migrate-20261105k-held-item-lock.sql`（trigger + 收回 grant） |
| Mega 進化（70 粒 Mega 石資料、MEGA 掣、megaEvolve） | `js/mega-data.js`（`tools/fetch_mega.py` 產生）, `js/battle/state.js`, `tests/unit/mega.test.js`, `assets/battle/pkmn/{front,back}/<dex>-mega*.png`（`tools/fetch_pkmn_sprites.py --mega`）, `supabase/migrations/supabase-migrate-20261105h-mega.sql` |
| Mega 特性（Tough Claws／Drought／Pixilate／Parental Bond／Mold Breaker 等，招式分類表） | `js/battle/engine.js`（`abilityPowerMult`、`isContact`）, `js/battle/state.js`（`onSwitchIn`、`priorityOf`、`trappedBy`、Electric Terrain）, `tests/unit/mega-abilities.test.js` |
| 擊倒對手後問換 Pokémon（第 16 項；AI 戰免回合、PvP 當下回合 action） | `js/battle/battle.js`（`askYesNo`、`offerShift`、`shiftPick`） |
| Trainer Avatar（第 14 項；104 個原作角色全身像、揀選器、雲端同步） | `js/avatars.js`, `assets/trainers/avatars/`（`tools/fetch_trainer_avatars.py`）, `js/sync.js`（`pushAvatar`）, `js/friends.js`（頁頭）, `supabase/migrations/supabase-migrate-20261105i-trainer-avatar.sql` |
| PvP pre-battle 頁（第 13 項；雙方頭像、隊伍、戰績、對戰紀錄） | `js/battle/battle.js`（`showPreBattle`）, RPC `get_trainer_cards` |
| PvP 結算核對（狀態第二期；兩邊報告對勝方） | `js/battle/battle.js`（`reportPvpResult`、`settleFriendV2`）, `supabase/migrations/supabase-migrate-20261105j-pvp-crosscheck.sql`（`battle_reports`、`report_battle_result`、`settle_friend_battle_v2`） |
| 防作弊：進化石／Revival RPC、隨機 PvP 報告結算、battles 收權 | `js/care.js`（`awardStone`、`useStone`、`awardRevive`）, `supabase/migrations/supabase-migrate-20261106b-revive-award.sql`（`award_revive`）, `js/battle/battle.js`（`settleRandomPvp`）, `supabase/migrations/supabase-migrate-20261106-anticheat-stones-pvp.sql`（`award_stone`、`use_stone`、`settle_pvp_battle`、`_battles_guard` trigger） |
| 背包（橫向紅框、三欄、轉手機提示） | `js/bag.js`, `tools/prototype-bag.html`（設計稿） |
| HP／狀態／用藥規則（server RPC + guest 本地） | `js/care.js`, `tests/unit/care.test.js`, `supabase/migrations/supabase-migrate-20261105c-care-status-phase1.sql` |
| 數值 / 進化 / moves | `js/pokemon.js`, `js/data.js`, `js/gens-data.js` |
| 數值兜底（傷害 `_fin`、`sanitizeHp`、`hpRatio`、fit 重試、存檔計數 `_sanitizeStateNumbers`） | `js/battle/engine.js`, `js/battle/state.js`, `js/battle/battle.js`, `js/bag.js`, `js/battle/landscape.js`, `js/quiz.js`, `js/storage.js`, `tests/unit/numeric-guards.test.js`, Rule 99 |
| GenPack | `js/genpack.js` |
| Streak / Gym | `js/gym.js` |
| Leaderboard | `js/leaderboard.js` |
| 練習日曆 | `js/calendar.js` |
| 錯題解析 | `js/explain.js` |
| 響應式斷點（phone／tablet／wide／phone-land、`<html data-layout>`、`pe:layout` 事件、外殼幾何 `--frame-w`／`--frame-screen-*`） | `js/app.js`（`App.layout`、`_initLayout`）, `css/style.css`（頂部 LAYOUT BREAKPOINTS；`:root` 外殼變數；17b tablet／17c wide／17d 焦點＋hover）, spec `.trae/specs/20261106-responsive-layout.md`, plan `.trae/documents/20261106-responsive-layout-p1.md`, 截圖／rect 驗收 `tools/responsive/shots.mjs`、互動測試 `tools/responsive/test-*.mjs`（Rule 80–90）、改碼清單 `.trae/skills/pokeengmon-responsive/SKILL.md` |
| wide 右欄（預設 Daily Quests、sheet 即時切換、Esc、左欄鎖） | `js/app.js`（`_showWideDefault`、`_wideSwitch`、`_wideHideSheets`、`_wideFull`、`_onLayoutChange`、`_setSettleLock`、`_applyPaneLock`）, `js/quests.js`（`boardOpen` 認 sheet、`resume`）, Rule 84／85 |
| 手機橫向「請轉返直向」／背包戰鬥轉機判斷 | `js/app.js`（`_syncRotateHint`）, `js/bag.js`（`isPhone`、`fit`）, `js/battle/landscape.js`（`fit`、`enter／exit`）, Rule 87 |
| 結算兩欄（wide） | `index.html`（`.settle-col-a／-b` wrapper，phone 係 `display: contents`）, `css/style.css`（17c wide 區塊）, Rule 86 |
| UI 樣式 | `css/style.css` |
| 敏感規則 | `.cursor/rules/pokeengmon-core.mdc` |
| Agent 規則（skills） | 總索引 `.trae/skills/pokeengmon-preop-checklist/SKILL.md` → 題目 skill `.trae/skills/pokeengmon-{workflow,supabase,auth,game-data,battle,quiz,ui-sheets,responsive}/`（`SKILL.md` 現行要點＋`references/` 事故原文）；寫法規範 `.trae/skills/post-fix-lesson-capture/SKILL.md` |
