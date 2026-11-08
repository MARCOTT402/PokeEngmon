# PokeEngmon 戰鬥 — 事故紀錄同原文（references）

> 由 `pokeengmon-preop-checklist` 原文搬入（2026-11-06），每條 Rule 原文照錄。主要點喺 `../SKILL.md`。

### Rule 21 — Hand-made battle anims: verify in slow-mo; never emit an empty frame 0

Two pitfalls from authoring the 27 custom `assets/battle/anim/*.json` (v1.15.17):

- **Screenshot verification**: battle anims run at 60fps and many are ~260ms total, so browser_use screenshots almost always land between animations and report "nothing renders" for perfectly fine anims. Use the dev harness `tools/_anim_preview.html?slug=<a,b,c>&frameMs=400` (passes `frameMs` to `MoveAnim.play`, 4–6s per move) — screenshots then reliably catch every move mid-animation.
- **Empty frame 0**: when staggering layer entrances (e.g. trick-room tiles appearing one by one), make sure at least one layer exists in frame 0 — `MoveAnim.play` calls `drawFrame(0)` immediately, and an empty first frame shows a blank beat (and trips `tools/gen_missing_anims.js` validation). Bias stagger formulas so the first element is already visible at i=0.

### Rule 22 — The "fainted → skip action" guard in `runTurnResolution` must not swallow switch actions

Bug (reported as "對戰用戶Pokémon戰死後不能換Pokémon上場"): `js/battle/battle.js` `runTurnResolution` guarded every queued action with `if (active(state, side).hp <= 0) continue;`. A forced post-faint switch is itself a queued `{kind:"switch"}` action resolved inside that loop, so the guard skipped it → `switchTo` never ran → the turn ended with the active still at 0 HP → the forced-switch branch re-opened `showSwitchMenu(true)` forever. Symptom: player picks a healthy Pokémon, taps SEND OUT, party screen reopens every time.

Fix shape (keep this condition):

```js
if (act.action.kind === "move" && active(state, side).hp <= 0) continue;
```

Rules:
- Only `move` actions may be skipped for a fainted side. `switch` actions MUST still execute even when the outgoing Pokémon is at 0 HP — `executeMove` already guards `actor.hp <= 0`, and `animatedSwitch` skips the recall animation when `out.hp <= 0`, so a fainted-side switch is safe.
- Do NOT "fix" a stuck switch by moving forced switches outside the turn loop / giving them a free turn: PvP requires switch to stay a next-turn action (`prd.md` L162) because both clients replay the same seed with the same `Battle.turnOrder` (switch priority 6); changing turn semantics desyncs PvP.
- When adding any new action kind (item, run, etc.), decide explicitly whether the fainted guard applies to it, and write it as a positive `kind ===` list rather than a blanket `continue`.

### Rule 61 — 戰鬥 EXP：battle pokemon 必須帶 `uid`，分配只計「存活 + participated」；Level Sync 只降唔升

Incident (2026-11-04)：結算畫面顯示「獲得 EXP」但實際冇加。根因係 `Battle.makeBattlePokemon` 回傳物件冇 `uid`，`grantKOExp` 記落 `pendingExp` 嘅 uid 全部係 `undefined`，`applyRewards` 用 `gainByUid[e.uid]` 查唔到 → gain 永遠 0。

- `makeBattlePokemon` 回傳必須包含 `uid: entry.uid`（同 `expLevel`）。
- `grantKOExp` 收 EXP 名單用 `team.filter(p => p.participated && p.hp > 0)`；fainted 唔派 EXP（Gen 5 規則）。
- Inferno Level Sync 用 `Math.min(e.level, levelSyncLevel)` **只降唔升**：本身低過 sync 值嘅寵唔應該被升。
- 以弱勝強加成用 `expLevel`（sync 前真實等級），唔好用 `level`，否則被壓低等級嘅寵會被誤加乘。
- 改 EXP 相關流程後，跑 `node tools/_test_battle.js`（應 97 PASS）。

### Rule 63 — 一件道具有「育成效果」同「戰鬥效果」兩套：使用路徑一定要按場景分支，兩邊都要測

Incident (2026-11-05，背包 prototype)：樹果育成 = 加飽肚值，戰鬥 = 原作效果（Oran +10 HP、Sitrus +25%、Pecha／Cheri／Lum 解狀態）。`applyTo()` 只寫咗育成分支，戰鬥中餵樹果只加飽肚值、冇回血，用戶先發現。同輪複查再搵到：Antidote 只解 `psn` 唔解 `tox`；換招 overlay 開住時撳左欄另一隻，overlay 仲顯示舊嗰隻；EV Undo stack 冇按 Pokémon 分，換隻後 Undo 會扣錯隻。

- 道具定義要同時有育成欄位（`care`／`food`）同戰鬥欄位（`bHeal`／`bHealPct`／`bCure`），使用函數用 `S.battle`（正式版：戰鬥 state）分支，唔可以共用一條。
- 解狀態用陣列（`cure: ["psn","tox"]`），唔好單一字串比較。
- 戰鬥中「冇效果」（滿血又冇對應狀態）跟原作：提示 "It won't have any effect." 而且唔扣數；育成藥物照狀態 spec（滿血照扣、計過量）。
- 蓋喺主畫面上面嘅 overlay（換招頁等）要跟住「當前選中」：`select()` 入面同步更新或者關閉 overlay。
- 任何 Undo stack 換選中對象時要清空（或者每條記錄帶 uid）。
- 改完背包流程，喺 `tools/prototype-bag.html` 用 console 跑一次三個 mode（Normal／In-battle bag／In-battle switch）嘅端到端檢查，`errs` 要係空。

### Rule 68 — 戰鬥測試：名唔好寫死、推進文字要撳 `.battle-bottom`、回合完 = 選單打開

Incident (2026-11-05，背包第 4b 段)：(1) node 測試用 `chainKey: "bulbasaur", level: 30`（冇 `stage`）建隊，出嚟係 Venusaur，regex 寫死「Bulbasaur ate its…」全部 FAIL（引擎其實啱）。**更正（第 4c 段）**：物種由 `entryCurrentSpecies` 按 `stage` 決定，唔係等級；冇 `stage`（undefined）會跌落「最後一段」fallback。(2) 瀏覽器自動推進戰鬥文字撳 `#battle-text` 冇反應（`waitTap` 聽 `.battle-bottom`），又等「What will…」先出招，但回合完 `showMainMenu()` 唔會 narrate → loop 以為卡死。

- node 測試：用 `chainKey` 建隊一定要寫 `stage`（1 = 第一段），想要邊隻就寫邊段；名由 `team[i].name` 讀，或者 regex 唔包名。
- 瀏覽器推進對白：`document.querySelector('.battle-bottom').click()`（programmatic click 冇座標，唔會誤撳 RUN）。
- 判斷「輪到我」：`.battle-bottom.menu-open` + `#battle-action-menu` 顯示，唔好靠文字。
- 1v1 對手（Youngster 等）隊伍只得 1 隻：測換 Pokémon／後備觸發要揀多隻隊伍嘅對手或者用 node 測試。

### Rule 79 — 新 Mega 特性：去 Pokémon Champions 資料搵效果；`statLabel` 只收 PokeAPI stat 名

Incident (2026-11-06，Aura Guard／Eelevate)：上一輪將 Mega Lucario Z 嘅 Aura Guard 同 Mega Eelektross 嘅 Eelevate 當「效果不明」做 no-op。原因係淨係喺 Legends Z-A 搵資料，但 Z-A 本身冇特性系統；呢啲新特性係 Pokémon Champions 先定義（Serebii `pokemonchampions/newabilities.shtml`）。另外寫 Eelevate log 時用 `statLabel("spa")`，但 `statLabel` 只認 `special-attack` 呢類 PokeAPI 名，會顯示 raw key。

- 新 Mega／新特性效果：先睇 Serebii Pokémon Champions 新特性頁；Z-A 搵唔到唔等於冇效果。
- 寫完用 `tools/_test_mega_abilities.js` 嘅 Node 腳本列出 `MEGA_STONES` 特性有邊啲未出現喺 `state.js`／`engine.js`，逐個確認係「單打本來冇效果」（Stalwart、Healer；本 engine 冇 Protect → Piercing Drill、Unseen Fist）定真係漏咗。
- 防守方特性要諗埋 Mold Breaker：加入 `BREAKABLE`。Levitate 類用 `LEVITATING` set／`grounded()`，唔好再寫死 `=== "levitate"`。
- Log 能力名：engine key（atk/def/spa/spd/spe）要先轉做 PokeAPI 名再 call `statLabel`。

Skill: Rule 79 added

### Rule 92 — AI 戰：我方暈咗之後補位係免費換入，唔經 `resolveTurn`（對手唔可以白打一下）；PvP 照 Rule 22

Incident (2026-11-06，用戶回報)：我方 Pokémon 被打暈 → 強制換寵 → 揀咗後備之後，對手即刻打多一下。原因：`chooseSwitch` 一律 `resolveTurn({kind:"switch"})`，強制換寵當咗一個普通回合，AI 揀招照出。原作規則：暈咗嘅補位喺回合尾發生，唔佔回合。對手暈咗嘅補位本身已經用 `animatedSwitch`（免費），所以兩邊唔一致。

- 修正：`chooseSwitch` 喺 AI 戰 + 我方 active HP 0 → 直接 `animatedSwitch`，之後處理釘子再暈、雙方同時暈（對手補位），再出選單。PvP 唔郁（Rule 22）。
- 驗證（headless，臨時 localhost debug hook，驗完已移除）：我方 HP 設 1 → 被打暈 → 經背包「Send out」補位 → `state.turn` 不變、新寵滿血、選單返返嚟。
- 測試踩坑：team-select confirm 喺 modal 收埋後再 `.click()` 會開第二場戰鬥，兩條流程同時行（每句訊息出兩次），令人誤以為換寵後背包又彈返出嚟。

- 跟進（同日，用戶確認）：「強制換寵可以免費，但唔係戰死而換寵就唔免費」；PvP 都要免費、Shift 維持免費。PvP 加補位回合：冇暈嗰邊自動交 `pass`，回合只做換寵、唔計殘餘。Rule 22 原本「唔好畀強制換寵免費回合」嘅寫法同步改為「經補位回合實現，唔好搬出回合 loop」。未做真機 PvP 測試（要兩個帳號）。

Skill: Rule 92 added

### Rule 99 — 數值兜底：NaN 同任何數比較都係 false — 傷害／HP／比例／幾何／存檔計數一定要喺入口夾成有限值；`Math.max(1, NaN)` 都係 NaN

- 背景：stability-performance plan §4。審查：`computeDamage` 任何 stat 係 undefined → 傷害 NaN（`Math.max(1, NaN)` 仍然 NaN）→ HP NaN → 戰鬥永遠唔完；`battle.js` 上 server 嘅 per-mille HP 可以係 NaN；iOS 轉機瞬間視窗 0 → 背包 `scale(0)`；精靈球座標 NaN 永遠夾唔返；`app.js`／`gacha.js` `st.diamonds = r.balance` 冇檢查。
- 修正：`engine.js` `_fin`＋出口檢查；`state.js` `sanitizeHp`（`checkFinished` 第一步，亦 export）；`battle.js` `hpRatio`；`bag.js`／`landscape.js` fit 重試＋夾值；`quiz.js` 球 NaN 修復；`storage.js` `_sanitizeStateNumbers`（避開另一個 session 正改緊嘅 `app.js`／`gacha.js`，喺存檔層一次過兜）。
- 驗證：新 `tools/_test_numeric_guards.js` 30/30；battle 97 PASS、battle_care／care／held_berries／mega／mega_abilities 全過；test-rotate 18/18、test-battle-fit 7/7；browser 答題＋返主頁＋即時 diamonds undefined → 0 有記錄。

Skill: Rule 99 added

## Rule 117 — `battle.js` 分喺 `js/battle/ui/*.js`：閉包狀態喺 `BattleUI._.S`、跨檔 call 用 `B.xxx`；改戰鬥邏輯前後跑固定 seed 重播測試

- 2026-11-08 總計劃 P2.5。`js/battle/battle.js` 係 IIFE 閉包（131 個 function、34 個 `let`、11 個數據表），唔可以好似 App／Quiz／Gacha 咁用 `Object.assign` 搬。
- 做法：用 TypeScript checker 逐個 identifier 查佢指向邊個宣告，自動改寫 663 處（狀態 434、跨檔 function 219、數據 10），分 450 行；同名局部變數 41 處（`foe` 25、`mode` 8、`me` 6、`state` 2）自動避開。
- 驗證：
  - 還原比對：143 個 statement 將 `S.`／`B.` 還原之後同原本逐字一樣。
  - 固定 seed 重播：改之前錄基準，連續 3 次比較全部一致（證明測試本身穩定）；拆完 3 場 255 條記錄、133 次隨機數完全一樣。
  - 397 個單元測試、lint 0（`no-undef` 證明冇漏改跨檔名）、typecheck 0；e2e；瀏覽器開選單、訓練員、難度、開戰。
- 寫重播測試時撞到嘅非決定性（全部係測試問題，唔係 app bug）：
  1. 開場對白出 caret 之後 650ms 先開始等 tap，太早撳會被食咗 → caret 喺度就一直撳。
  2. 冷啟動慢，訓練員列表多 render 一次，用多咗隨機數 → 撳難度前重新播種，並等寶可夢／招式資料載完。
  3. `natureFor` 經 `pokemon.js` 嘅 `randomNature()` 攞隨機數，只睇直接 caller 會漏 → 改為睇成條 call stack。
  4. Yes／No 掣出現時問題仲打緊字，記錄到半句 → 等 caret 先答。
- 另外：8080 static server 中途停咗，headless 載到錯誤頁扮成 timeout → test 開頭先檢查 server。

Skill: Rule 117 added

## Rule 124 — 改開戰流程（例如跳過揀隊頁）：重播測試嘅記錄鈎要喺「觸發開戰嗰下」之前裝；隊伍來源改咗要令開戰隊伍對返舊 fixture

- 2026-11-08 Trainer Lv／battle menu 重做：打 AI 唔再開揀隊頁（`team.js` `openTeamSelect` AI 分支用 `B.teamLineup`）。跑重播測試：seed 1 `TIMEOUT — 0 records, 309s`。
- 原因：測試喺撳 tier **之後**先裝 `BattleState.create` 記錄鈎；舊流程要等揀隊確認先開戰所以趕得切，新流程撳 tier 即刻開戰。另外 seed 存檔 My Team 係空，新流程會 toast「Set up your team in the Bag」唔開戰。
- 修正：鈎搬去撳 tier 之前；開戰前 My Team 空就用舊揀隊頁嘅排序（`DEXSORT.load(TEAM_SORT_KEY)`）填頭 N 隻，開場隊伍同 fixture 一樣（Charmander Lv15…）。

Skill: Rule 124 added
