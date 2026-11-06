---
name: pokeengmon-battle
description: PokeEngmon battle rules: hand-made animations, the fainted/switch guard, battle EXP distribution, items with care vs battle effects, battle test conventions, and Mega abilities. Read before changing js/battle/*, battle items, EXP or abilities, or writing battle tests.
---

# PokeEngmon 戰鬥

> 幾時讀：改 `js/battle/*`、戰鬥道具、EXP、特性，或者寫戰鬥測試之前。
> 由 `pokeengmon-preop-checklist` 按題目拆出（2026-11-06）。下面係每條 Rule 嘅**現行要點**（原文條列照抄）；事故經過、code 範例、原因分析喺 `references/incidents.md`，要查來龍去脈先開。
> 新事故：寫入 `references/incidents.md`（`### Rule N — 標題` 加喺尾），呢度加要點；preop checklist 加 `## Rule N — 標題` 一行指向（跟 `post-fix-lesson-capture`）。

## Rules

### Rule 21 — Hand-made battle anims: verify in slow-mo; never emit an empty frame 0

- **Screenshot verification**: battle anims run at 60fps and many are ~260ms total, so browser_use screenshots almost always land between animations and report "nothing renders" for perfectly fine anims. Use the dev harness `tools/_anim_preview.html?slug=<a,b,c>&frameMs=400` (passes `frameMs` to `MoveAnim.play`, 4–6s per move) — screenshots then reliably catch every move mid-animation.
- **Empty frame 0**: when staggering layer entrances (e.g. trick-room tiles appearing one by one), make sure at least one layer exists in frame 0 — `MoveAnim.play` calls `drawFrame(0)` immediately, and an empty first frame shows a blank beat (and trips `tools/gen_missing_anims.js` validation). Bias stagger formulas so the first element is already visible at i=0.

### Rule 22 — The "fainted → skip action" guard in `runTurnResolution` must not swallow switch actions (see also Rule 92)

- Only `move` actions may be skipped for a fainted side. `switch` actions MUST still execute even when the outgoing Pokémon is at 0 HP — `executeMove` already guards `actor.hp <= 0`, and `animatedSwitch` skips the recall animation when `out.hp <= 0`, so a fainted-side switch is safe.
- PvP forced switches stay inside the turn loop (both clients replay the same seed with the same `Battle.turnOrder`, switch priority 6). Since Rule 92 they are free via a **replacement turn**: the fainted side submits `switch`, the other side auto-submits `pass`, and `runTurnResolution` runs only switches (no moves, Mega or residuals). Don't move them out of the turn loop: that would desync PvP.
- When adding any new action kind (item, run, etc.), decide explicitly whether the fainted guard applies to it, and write it as a positive `kind ===` list rather than a blanket `continue`.

### Rule 92 — 暈咗之後嘅強制換寵係免費（對手唔可以白打一下）；自己揀換寵照計回合；Shift 免費

- 用戶規則：**只有戰死後嘅強制換寵免費**；主選單 POKéMON 自己換照樣佔回合；對手暈咗時問嘅 Shift 維持免費（原作做法）。
- **AI 戰**：`chooseSwitch`：`mode !== "pvp"` 而且 `myActive().hp <= 0` → 直接 `animatedSwitch(mySide, idx)`，唔加 `state.turn`、唔叫 `pickAIAction`；完咗 `narrate("What will …")` + `showMainMenu`。
- 補位後要處理：入場釘子打死新寵 → 再強制換；同一回合雙方都暈 → 對手都要 `animatedSwitch` 補位（舊流程靠回合尾 AI 自動換）。
- 對手暈咗嘅補位本身已經係回合尾 `animatedSwitch`（免費），兩邊而家一致。
- **PvP（補位回合）**：仍然經 `resolvePvpTurn` 交 action（兩邊 seed 同步，Rule 22）。暈咗嗰邊交 `switch`；冇暈嗰邊唔出選單，回合尾自動 `resolveTurn({kind:"pass"})`（想 Shift 就揀換寵，`openBattleBag("switch", true)`）。`runTurnResolution` 開頭 `replacement = pvp && 任何一邊 active HP 0` → 非 switch 一律當 `pass`、唔計殘餘傷害。新 action kind `pass` 要喺 `resolvePvpTurn` 解析；舊版客戶端唔識 `pass`（會當第 0 招）→ 兩邊要同版本。
- 測試注意：戰鬥測試開戰時 team-select confirm 只可以有效撳一次；Modal 收埋之後再 `.click()` 會開第二場、兩條流程同時行，訊息全部出兩次，睇落好似換寵出錯。

### Rule 61 — 戰鬥 EXP：battle pokemon 必須帶 `uid`，分配只計「存活 + participated」；Level Sync 只降唔升

- `makeBattlePokemon` 回傳必須包含 `uid: entry.uid`（同 `expLevel`）。
- `grantKOExp` 收 EXP 名單用 `team.filter(p => p.participated && p.hp > 0)`；fainted 唔派 EXP（Gen 5 規則）。
- Inferno Level Sync 用 `Math.min(e.level, levelSyncLevel)` **只降唔升**：本身低過 sync 值嘅寵唔應該被升。
- 以弱勝強加成用 `expLevel`（sync 前真實等級），唔好用 `level`，否則被壓低等級嘅寵會被誤加乘。
- 改 EXP 相關流程後，跑 `node tools/_test_battle.js`（應 97 PASS）。

### Rule 63 — 一件道具有「育成效果」同「戰鬥效果」兩套：使用路徑一定要按場景分支，兩邊都要測

- 道具定義要同時有育成欄位（`care`／`food`）同戰鬥欄位（`bHeal`／`bHealPct`／`bCure`），使用函數用 `S.battle`（正式版：戰鬥 state）分支，唔可以共用一條。
- 解狀態用陣列（`cure: ["psn","tox"]`），唔好單一字串比較。
- 戰鬥中「冇效果」（滿血又冇對應狀態）跟原作：提示 "It won't have any effect." 而且唔扣數；育成藥物照狀態 spec（滿血照扣、計過量）。
- 蓋喺主畫面上面嘅 overlay（換招頁等）要跟住「當前選中」：`select()` 入面同步更新或者關閉 overlay。
- 任何 Undo stack 換選中對象時要清空（或者每條記錄帶 uid）。
- 改完背包流程，喺 `tools/prototype-bag.html` 用 console 跑一次三個 mode（Normal／In-battle bag／In-battle switch）嘅端到端檢查，`errs` 要係空。

### Rule 68 — 戰鬥測試：名唔好寫死、推進文字要撳 `.battle-bottom`、回合完 = 選單打開

- node 測試：用 `chainKey` 建隊一定要寫 `stage`（1 = 第一段），想要邊隻就寫邊段；名由 `team[i].name` 讀，或者 regex 唔包名。
- 瀏覽器推進對白：`document.querySelector('.battle-bottom').click()`（programmatic click 冇座標，唔會誤撳 RUN）。
- 判斷「輪到我」：`.battle-bottom.menu-open` + `#battle-action-menu` 顯示，唔好靠文字。
- 1v1 對手（Youngster 等）隊伍只得 1 隻：測換 Pokémon／後備觸發要揀多隻隊伍嘅對手或者用 node 測試。

### Rule 79 — 新 Mega 特性：去 Pokémon Champions 資料搵效果；`statLabel` 只收 PokeAPI stat 名

- 新 Mega／新特性效果：先睇 Serebii Pokémon Champions 新特性頁；Z-A 搵唔到唔等於冇效果。
- 寫完用 `tools/_test_mega_abilities.js` 嘅 Node 腳本列出 `MEGA_STONES` 特性有邊啲未出現喺 `state.js`／`engine.js`，逐個確認係「單打本來冇效果」（Stalwart、Healer；本 engine 冇 Protect → Piercing Drill、Unseen Fist）定真係漏咗。
- 防守方特性要諗埋 Mold Breaker：加入 `BREAKABLE`。Levitate 類用 `LEVITATING` set／`grounded()`，唔好再寫死 `=== "levitate"`。
- Log 能力名：engine key（atk/def/spa/spd/spe）要先轉做 PokeAPI 名再 call `statLabel`。

### Rule 99 — 數值兜底：NaN 同任何數比較都係 false — 傷害／HP／比例／幾何／存檔計數一定要喺入口夾成有限值；`Math.max(1, NaN)` 都係 NaN

- 戰鬥：`computeDamage` 入口用 `_fin()` 修正 `level`（1–100）、`atk`／`def`（≥1）、`power`（≥0）；出口 `!Number.isFinite(base)` → 1＋`Guard.report`。**唔准改 `BattleRng.next()` 嘅抽數次序**（PvP 兩邊要算到一樣）。
- `BattleState.checkFinished()` 第一步 `sanitizeHp(state)`：`maxHp` 壞 → `stats.hp`（冇就 1）；`hp` NaN／Infinity → 0（當暈，兩邊結果一致）；負數 → 0；超 `maxHp` → `maxHp`。NaN HP 會令 `hp > 0` 同 `hp <= 0` 都唔成立＝戰鬥永遠唔完。
- `battle.js` 所有 HP 比例用 `hpRatio(p)`（0–1、有限）；上 server 結算嘅 per-mille HP 夾 0–1000，唔准送 NaN。
- 轉機 `bag.js fit()`／`battle/landscape.js fit()`：`innerWidth`／`innerHeight` 唔係 > 0 就 100ms 後再試（最多 10 次），唔寫入 `scale(0)`；背包 scale 夾 0.2–4；`--bl-s`／`--bl-w` 寫入前 `Number.isFinite`。
- 答題精靈球物理：每 tick 位移後檢查 `x／y／vx／vy`，唔係有限數 → 放返框中間、速度歸零（否則邊界反彈夾唔返，球永遠消失）。
- 存檔：`_sanitizeStateNumbers()` 喺 `loadState()`／`saveState()` 檢查 `diamonds`、`normalPulls`、`totalSets`、`totalCorrect`、`totalQuestions`、`bestStreak`：數字字串轉數字；其他非有限值 → 還原上一次好嘅值（冇就 0）＋`Guard.report`。所以 `st.diamonds = r.balance` 呢類直接賦值，就算 RPC 少咗欄位都唔會壞存檔（但新 code 仍然應該先檢查 `typeof === "number"`）。
- CSS 外殼幾何（`--frame-*`）只喺 CSS `:root` 定義、JS 冇寫，唔會變 NaN，唔使加 fallback；JS 寫入嘅 CSS 變數先要檢查。
- 通用 helper：`Guard.num／clamp／posDim／safeJSON`（Rule 94）。
- 驗收：`node tools/_test_numeric_guards.js`（30 項：7 種壞輸入傷害有限、RNG 次序不變、NaN／Infinity／越界 HP、戰鬥可以完、存檔計數還原、helpers）；`tools/_test_battle.js` 97 PASS＋其餘戰鬥測試全過；`tools/responsive/test-rotate.mjs`、`test-battle-fit.mjs` 全過。
