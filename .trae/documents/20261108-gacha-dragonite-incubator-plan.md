# 扭蛋主線：快龍空投（即時抽）＋ 孵化器 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本項目規定（CLAUDE.md）：計劃入面冇 commit 步驟**；用戶要求先用 `python tools/git_commit_push.py --paths …` commit，唔好手動 bump 版本。

**Goal:** 用「快龍空投」取代現有拉手扭蛋（單抽），再加「孵化器」：Lucky Draw 用 💎3 Claim 一隻蛋，答內置題孵化。

**Architecture:** 四個可以獨立上線嘅部分：Part 0 修 server 保底槽重複規則（抽出共用派寵 helper）；Part 1 純 client，重寫 `js/gacha/scene.js` 演出層，經濟結算（`_beginPull`／`_settleResult`／`abort()`）一行唔郁；Part 2 server 孵化器（新表＋5 個 RPC，全部 server 權威）；Part 3 client 孵化器（純邏輯 `js/incubator/rules.js` 有單元測試，UI 由 prototype 搬入）。

**Tech Stack:** 原生 JS（classic script＋mixin、Rule 116／119）、GSAP（`vendor/gsap`）、WebAudio、Supabase Postgres plpgsql RPC、`node:test`。

**Spec:** `.trae/specs/20261107-gacha-redesign.md`（§3 色、§4 單抽、§10「孵化器 v4」為準；v2／v3 被 v4 覆蓋嘅位以 v4 為準）
**Prototype（照搬行為同外觀）：** 單抽 `tools/prototype/gacha-v2-prototype.html`；孵化器 `tools/prototype/incubator/incubator.js`＋`incubator.css`（`node tools/prototype/incubator/build.mjs` → `tools/prototype/incubator-app.html`）

## Global Constraints

- 改碼前讀 `.trae/skills/pokeengmon-preop-checklist/SKILL.md` 指向嘅題目 skill；加 sheet／overlay 前讀 `.trae/skills/pokeengmon-responsive/SKILL.md`。
- 經濟同派寵一律 server 權威（登入時）；匿名／離線行本地 fallback，同現有 gacha 一樣（`js/gacha/pull.js`）。
- 稀有度色：Rare 藍 `#4aa8ff`／Epic 金 `#ffc93c`／Legend 紫 `#c77dff`；Common 蛋 `#c9a26b`。
- 孵化器：Claim 💎3；機率 Common 30%／Rare 40%／Epic 20%／Legendary 10%；題數 Common 30／Rare 80／Epic 140／Legendary 200；孵蛋演出級別 Common 0／Rare 2／Epic 3／Legendary 4。
- Slot：Slot 1 永遠開；Slot 2 從未解鎖過 → 連續答題 **7** 日解鎖；之後 streak 斷咗 → 重新連續 **3** 日再解鎖；有蛋時 streak 斷咗 = 凍結（進度唔跌、唔計題），再解鎖即解凍。
- 1 條答啱（clean）嘅**內置題**同時計落所有開住、未滿嘅蛋；`customQuestions`（id `c…`／`cw…`）唔計。
- 丟棄：進度清零、💎3 唔退；已夠數嘅蛋唔准丟。
- 答題畫面唔顯示任何孵化器資訊；結算頁只喺夠數先彈孵蛋小視窗（多隻逐隻），之後出 `#gacha-inspect` 結果卡（掣改 Done）。
- 只 reward、唔 punish（Rule 123）：孵化器任何流程唔扣 EXP／鑽（除咗用戶自己 Claim 嘅 💎3）。
- 動畫倍速：所有新場景經 `AnimSpeed.begin/end`，`setTimeout` 經場景 wrapper（Rule 95）。
- 錯誤邊界：async 掣用 `Guard.asyncClick`；場景唔准卡死（Rule 94）。
- display-window overlay 只用 `--frame-screen-*` 定位（Rule 81）；z-index 用 `--z-*` token（Rule 110）。
- 新 runtime 檔要同時加入 `index.html`、`sw.js` ASSETS、`tools/deploy/site-files.json`（Rule 113）；更新 `CODEBASE_INDEX.md`。
- 新 server 表：client 只有 `select`，冇直寫 column（所以唔使 Rule 54 grant）；寫入一律經 RPC。
- 測試：`npm test`（`node:test`＋`tests/helpers/load.js`）、`npm run lint`（warning 只准減）、`npm run typecheck`、`npm run test:e2e`（要 8080 server）。

## Review Focus

1. **撳 Claim 時網絡慢／RPC 失敗** → 唔可以扣咗鑽冇蛋，亦唔可以出兩隻蛋：`claim_egg` 原子；client 等 RPC 回覆先顯示題數拉霸，失敗 toast + 唔改本地（Task 3.2 測試）。
2. **同一回合兩隻蛋都夠數，用戶喺第一隻結果卡撳 Done 之前離開結算頁** → 第二隻唔可以消失：未孵嘅蛋仍然留喺孵化器（progress ≥ need），入孵化器頁仍然可以孵（Task 3.1 `applyRound` 只標記、唔刪蛋；Task 3.4 測試）。
3. **Slot 2 凍結時答題** → Slot 1 照加、Slot 2 唔加；之後 streak 到 3 日解凍，進度係凍結前嘅數（Task 3.1 測試 `applyRound` frozen case）。
4. **扭蛋演出中途離開（撳下巴 Home／切 sheet）** → `abort()` 照補結算、`AnimSpeed.end`、快龍 rig 停晒 tween，再開扭蛋唔會殘留（Task 1.3 驗收）。
5. **自訂題目同內置題 id 撞名／customQuestions 未載入** → 計數以「qid 唔喺 customQuestions id 集合」為準；`results` 空（例如 Gym 舊資料）就用 0 唔用 `score`（Task 3.1 測試）。

---

## Part 0 — 修 10 連保底槽重複規則

### Task 0.1: 共用派寵 helper＋`gacha_pull_lucky` 用返「未完全進化」規則

**Files:**
- Create: `supabase/migrations/supabase-migrate-20261108-gacha-obtain-helper.sql`

**Interfaces:**
- Produces: `public._obtain_gacha_entry(p_uid uuid, p_chain_key text, p_stage1 int, p_entry_count int) returns jsonb` → `{ "entry": user_entries row, "is_dupe": bool }`（Part 2 `hatch_egg` 用）

- [ ] **Step 1: 寫 helper**：邏輯照抄 `supabase-migrate-20261031b-collect-fully-evolved.sql` 嘅 `gacha_pull` dupe 段——`select … where account_id = p_uid and chain_key = p_chain_key and is_final = false order by obtained_at asc limit 1`；有 → `ev_points+1, dupes+1, candies+1, stars = least(5, 1 + (dupes+1)/5)`；冇 → insert 新 entry（IV 隨機、`active = (p_entry_count = 0)`）。`security definer`、`set search_path = public`；`revoke execute … from public, anon, authenticated`（只俾其他 RPC 用）。
- [ ] **Step 2: 改 `gacha_pull_lucky`**：用 `_obtain_gacha_entry` 取代內聯 dupe／insert（`supabase-migrate-20261104-lucky-10pull.sql` 第 94–121 行）；回傳格式唔變（`entry`、`rarity`、`is_dupe`、`balance`）。
- [ ] **Step 3: 驗證（由用戶喺 Supabase 執行 migration 之後）**：用一個測試帳號，將某條鏈全部 entry 設 `is_final = true`，跑 `select gacha_pull_lucky(1)` 直到抽中嗰條鏈 → 預期新 insert 一個 entry（`is_dupe = false`）；未完全進化嘅鏈 → `is_dupe = true`、candies +1。

---

## Part 1 — 快龍空投（單抽）

### Task 1.1: 預兆路線純函數 `GachaTells`

**Files:**
- Create: `js/scene/gacha-tells.js`（classic、`// @ts-check`）
- Test: `tests/unit/gacha-tells.test.js`

**Interfaces:**
- Produces: `GachaTells.plan(rarity: "rare"|"epic"|"legend", rand?: () => number) => { start: "great"|"ultra"|"master", ups: string[], tease: boolean, trail: "#ffffff"|"#ffc93c"|"rainbow" }`；`GachaTells.BALL_COL = { great:"#4aa8ff", ultra:"#ffc93c", master:"#c77dff" }`

- [ ] **Step 1: 寫測試**：
  - `plan("rare")` 一定 `start === "great" && ups.length === 0`；`rand = () => 0.1` → `tease === true`，`0.9` → `false`。
  - `plan("epic", () => 0.1)` → `{ start: "great", ups: ["ultra"] }`；`() => 0.9` → `{ start: "ultra", ups: [] }`。
  - `plan("legend", () => 0.1)` → `ups` = `["ultra","master"]`；`0.5` → `start "ultra", ups ["master"]`；`0.9` → `start "master", ups [], trail "rainbow"`。
  - 不變式（1000 次隨機）：`[start, ...ups]` 最後一個一定等於該稀有度嘅球（rare→great、epic→ultra、legend→master）。
- [ ] **Step 2: 跑** `npm test -- --test-name-pattern=gacha-tells` → FAIL（`GachaTells` 未定義）。
- [ ] **Step 3: 實作**：機率照 prototype `planPath()`（rare tease 25%；epic 55% great→ultra；legend 40% great→ultra→master、40% ultra→master、20% 直接 master＋彩虹拖光）。`rand` 預設 `Math.random`。
- [ ] **Step 4: 跑** → PASS；`npm run lint`、`npm run typecheck` 0 錯。

### Task 1.2: 快龍 rig（拆層素材＋拍翼／轉身／飛行工具）

**Files:**
- Create: `assets/gacha/dnite-wing.png`、`dnite-tail.png`、`dnite-body.png`、`dnite-arm.png`（由 `tools/prototype/assets/` 搬，同一 640×829 座標系）
- Create: `js/scene/dragonite-rig.js`
- Modify: `index.html`（script 次序：喺 `js/gacha.js` 之前）、`sw.js` ASSETS、`tools/deploy/site-files.json`、`CODEBASE_INDEX.md`
- Test: `tests/unit/sw-assets.test.js`、`tests/unit/deploy-manifest.test.js`（現有，加完檔要綠）

**Interfaces:**
- Produces: `DragoniteRig.make(el: HTMLElement) => Rig`；`Rig = { el, wing, tail, bob, arm, face, hand, pos:{x,y,s}, onDown: (() => void)|null, speed(k:number):void, faceTo(dir: 1|-1):void, hold(node: HTMLElement):HTMLElement, place(x,y,s,rot,depthK):void, kill():void }`；`DragoniteRig.depthFilter(k:number):string`；`DragoniteRig.bez(P:{x,y}[4], t:number):{x,y}`
- 關節（transform-origin）：wing `53.9% 35%`、tail `71% 72.4%`、arm `22.7% 39.8%`；手位 `left 7% top 33%`。拍翼：上拍 `-36°/scaleY .9/.26s sine`、下拍 `+26°/scaleY 1.05/.18s power2.in`，bob `yPercent 1.4 → -1.8`，`onDown` 喺 .42s。

- [ ] **Step 1: 搬素材＋登記**（index／sw／site-files／CODEBASE_INDEX），跑 `npm test` → sw-assets／deploy-manifest 綠。
- [ ] **Step 2: 實作 `DragoniteRig`**（照 prototype `makeRig`／`bez`／`depthFilter`；`hold()` 改為收任何 node，唔再內建 makeBall；`kill()` 殺 flap／tail tween）。
- [ ] **Step 3: 驗收**：`npm run lint`、`npm run typecheck`；瀏覽器 console 冇 error。

### Task 1.3: 新單抽演出（取代拉手＋Scene B）

**Files:**
- Modify: `index.html` `#view-gacha`（刪 `#gacha-machine`／`#dm-arm`；加 rig 容器、1×／10× 大掣、odds chip 改統一色 §3）
- Modify: `js/gacha/scene.js`（`_triggerPull` 改由大掣觸發；新 `_flyIn`、`_windAndThrow`、`_exitRig`、`_arcTo`、`_tapPhase`、`_burstReveal`；刪 `_dropBall`、`_openSceneB`、`_sceneBTimeline`、`_ensureSceneB`）
- Delete: `js/gacha/arm.js`、`js/gacha/charge.js`（10 連入口改大掣；`_beginMultiPull` 保留）＋index／sw／site-files 移除
- Modify: `js/gacha/core.js`（`open()` 唔再 `_bindArm`／`_bindStageFit`；`_refreshControls` 改掣狀態）、`js/audio.js`（加 `flap`、`flyby`、`toss`、`riser`、`burst(rarity)`、`heartbeat`、`star(i)`、`fanfare(rarity)`，照 prototype `Snd`，行現有 sfxBus）
- Modify: `css/style.css`（gacha 段：大掣、rig、`#gacha-stage-v2` overlay 用 `--frame-screen-*`、新 `--z-gacha-stage` token）
- Modify: `tests/fixtures/app-surface.json`（`node tests/unit/app-surface.test.js --update`，Gacha 方法有意改動）

**Interfaces:**
- Consumes: `GachaTells.plan`、`DragoniteRig.make`；現有 `Gacha._beginPull()`、`Gacha._settleResult(flow)`、`Gacha._revealInspect(flow, s)`、`Gacha._setT`、`Gacha._spdBegin/_spdEnd`
- Produces: `Gacha.pullOne()`（大掣）、`Gacha.pullTen()`（暫時接舊 10 連演出 `_dropBalls…`，Part 4 先換）

- [ ] **Step 1: 時間線**（全部經 `_setT`／GSAP，`_spdBegin` 喺撳掣後）：起飛 → `_flyIn`（2.0s bezier、轉身、傾側、空氣透視、拍翼聲、飛掠聲）→ 懸停吼（`Pokedex.playCry(149)`）→ `_windAndThrow` → 拋物線落地（hit-stop 80ms＋震 overlay，唔好震 body）→ 升級（`plan.ups`，每級 sting）／tease → `_tapPhase`（撳 3 下，球附近 1.1× 半徑都算，3 秒提示）→ `_burstReveal`（riser → 靜默 240／420ms → 爆 → 剪影 → 上色＋叫聲＋星）→ `_revealInspect`。**`_settleResult` 一定喺落地前 resolve**（起飛期間 await，RPC 慢就喺懸停度等，唔好跌波）。
- [ ] **Step 2: 出口**：`abort()`、`_cleanupScene()` 加 `rig.kill()`、`AnimSpeed.end`；SKIP 掣 = 直接 `_revealInspect`。`prefers-reduced-motion`：唔震屏、唔慢鏡、粒子減 80%、時間 ×0.25（沿用 `this._rm()`），但升級同剪影 → 上色照做（資訊唔可以少）。
- [ ] **Step 3: 測試**：`npm test`（app-surface 更新後綠）、`npm run lint`、`npm run typecheck`、`npm run test:e2e`。
- [ ] **Step 4: 瀏覽器驗收**（Rule 114：用 headless 錄影格，唔好靠隱藏 pane 截圖）：localhost dev hook `window.__gachaForceRarity = "legend"` 各跑 rare／epic／legend；1×／3× 倍速；中途撳下巴 Home → 鑽有扣、寵有派、`gsap.globalTimeline.timeScale() === 1`；440×956 同 1000×500。

---

## Part 2 — 孵化器 server

### Task 2.1: 表＋streak＋Slot 2 狀態

**Files:**
- Create: `supabase/migrations/supabase-migrate-20261108b-incubator.sql`

**Interfaces:**
- Produces（表）：`user_eggs(account_id uuid, slot smallint check (slot in (0,1)), rarity text check (rarity in ('normal','rare','epic','legend')), need int, progress int default 0, created_at timestamptz default now(), primary key (account_id, slot))`；`user_incubator(account_id uuid primary key, slot2_ever bool default false, slot2_on bool default false, slot2_last int default 0, last_add_at timestamptz)`
- Produces（內部）：`_incubator_streak(p_uid uuid) returns int`（由 `user_practice_days` 計，邏輯同 client `calcStreak`：今日冇就由昨日數起）；`_incubator_sync(p_uid uuid) returns boolean`（slot2_on；規則同 Task 3.1 `syncSlot2`）
- RLS：select own；`revoke all … from anon`；`grant select on user_eggs, user_incubator to authenticated`；冇 insert／update grant。

- [ ] **Step 1: 寫 migration**（表、RLS、兩個 helper）。
- [ ] **Step 2: 驗證 SQL**：`select _incubator_streak('<uid>')` 對比 app 顯示嘅 streak；`information_schema.role_table_grants` 確認 authenticated 只有 SELECT。

### Task 2.2: RPC `get_incubator`／`claim_egg`／`incubator_add`／`hatch_egg`／`discard_egg`

**Files:**
- Modify: `supabase/migrations/supabase-migrate-20261108b-incubator.sql`
- Modify: `js/supabase-auth.js`（5 個 wrapper，經 `this._rpc`）

**Interfaces:**
- `get_incubator() returns jsonb` → `{ eggs: [{slot,rarity,need,progress}|null, …2], slot2: {ever,on,last}, streak }`（先 `_incubator_sync`）
- `claim_egg() returns jsonb` → `{ slot, rarity, need, balance }`；錯誤碼 `'incubator_full'`、`'not_enough_diamonds'`（`raise exception using errcode = 'P0001', message = …`）。原子：`select … for update` 鎖 `user_account`；空位 = slot 0 空 → 0；否則 slot2_on 而 slot 1 空 → 1；扣 3 鑽；server `random()` 擲 30／40／20／10；need 由稀有度。
- `incubator_add(p_count int) returns jsonb` → `{ eggs, ready: int[] }`；`p_count` clamp `0..20`；`last_add_at` 20 秒內再 call → 回傳現狀唔加（防 spam）；加落 slot 0（有蛋未滿）同 slot 1（`_incubator_sync` = true 而且有蛋未滿）。
- `hatch_egg(p_slot int, p_gen int) returns jsonb` → `{ entry, rarity, is_dupe, chain_key }`；要 `progress >= need`；`chain_rarity` 揀 `rarity = egg.rarity and gen = p_gen`（冇就 gen 1）；派寵用 Task 0.1 `_obtain_gacha_entry`；刪蛋。
- `discard_egg(p_slot int) returns jsonb` → `{ ok: true }`；`progress >= need` 嘅蛋 → error `'egg_ready'`。
- Client：`SupabaseAuth.getIncubator()`、`claimEgg()`、`incubatorAdd(count)`、`hatchEgg(slot, gen)`、`discardEgg(slot)`（匿名回 `null`）。

- [ ] **Step 1: 寫 5 個 RPC**（`security definer`、`search_path = public`、`revoke … from public, anon`、`grant execute … to authenticated`）。
- [ ] **Step 2: 寫 client wrapper**，跑 `npm run lint`、`npm run typecheck`。
- [ ] **Step 3: SQL 驗證（用戶執行 migration 後）**：測試帳號 300 鑽 → `claim_egg()` ×1 → balance 297；slot2 未解鎖時再 claim → `incubator_full`；`incubator_add(10)` ×1 → progress 10；20 秒內再 call → 仍然 10；手動 `update user_eggs set progress = need` → `hatch_egg(0,1)` 有 entry、蛋刪咗；`discard_egg` 夠數蛋 → `egg_ready`。

---

## Part 3 — 孵化器 client

### Task 3.1: 純邏輯 `IncubatorRules`

**Files:**
- Create: `js/incubator/rules.js`（`type="module"` 載入、檔尾 `Object.assign(globalThis, { IncubatorRules })`，Rule 119；`// @ts-check`）
- Modify: `index.html`、`sw.js`、`tools/deploy/site-files.json`
- Test: `tests/unit/incubator-rules.test.js`

**Interfaces:**
- Produces: `IncubatorRules = { NEED, ODDS, CLAIM_COST: 3, SLOT2_FIRST: 7, SLOT2_AGAIN: 3, HATCH_LV: {normal:0,rare:2,epic:3,legend:4}, rollRarity(rand), makeEgg(rarity), syncSlot2(s2, streak), slotState(i, eggs, s2), freeSlot(eggs, s2), builtInCorrect(results, customIds), applyRound(eggs, s2, add), stageOf(progress, need), perSeg(need) }`
  - `s2 = { ever: boolean, on: boolean, last: number }`；`syncSlot2` **回傳新物件**唔改舊：`on && streak < last` → `on = false`；`!on && streak >= (ever ? 3 : 7)` → `on = true, ever = true`；`last = streak`。
  - `slotState(0) = "open"`；`slotState(1) = s2.on ? "open" : eggs[1] ? "frozen" : "locked"`（`s2` 已經 sync 過）。
  - `applyRound` 回傳 `{ eggs, ready: number[] }`：只加 open 而未滿嘅蛋，`min(need, progress + add)`；唔刪蛋。
  - `stageOf`：`≥1 → 4`、`≥.75 → 3`、`≥.5 → 2`、`≥.25 → 1`、否則 0；`perSeg(need) = need <= 30 ? 1 : 5`。

- [ ] **Step 1: 寫測試**（每項一個 `test()`）：
  - `rollRarity(() => .29) === "normal"`、`.31 → "rare"`、`.71 → "epic"`、`.95 → "legend"`。
  - `makeEgg("legend")` → `{ rarity:"legend", need:200, progress:0, seen:0 }`。
  - `syncSlot2`：新用戶 streak 6 → `on false`；7 → `on true, ever true`；之後 12 → `on true`；0 → `on false`；2 → false；3 → true（`ever` 之後門檻 3）。
  - `slotState`：`on false` 而 `eggs[1]` 有 → `"frozen"`；冇 → `"locked"`。
  - `freeSlot`：slot 0 空 → 0；slot 0 有、`on true`、slot 1 空 → 1；`on false` → `null`。
  - `builtInCorrect([{qid:"q1",correct:true},{qid:"c1",correct:true},{qid:"q2",correct:false}], new Set(["c1"])) === 1`；`builtInCorrect([], …) === 0`（Review Focus 5）。
  - `applyRound`：兩隻 open 各 +10；slot 1 frozen → 只 slot 0 加；未滿 25/30 加 10 → 30 而 `ready` 含 0；已滿嘅蛋唔再加；蛋唔會被刪（Review Focus 2、3）。
  - `stageOf(49,200) === 0`、`(50,200) === 1`、`(200,200) === 4`；`perSeg(30) === 1`、`perSeg(80) === 5`。
- [ ] **Step 2: 跑** → FAIL；**Step 3: 實作**；**Step 4: 跑** `npm test` → PASS；`npm run lint`、`npm run typecheck`；`tests/unit/esm-bridge.test.js` 綠。

### Task 3.2: 狀態同同步 `Incubator`

**Files:**
- Create: `js/incubator/incubator.js`（classic；用 `Store`，Rule 115）
- Modify: `js/storage.js` `defaultState()` 加 `incubator: { eggs: [null, null], s2: { ever: false, on: false, last: 0 } }`；`js/sync.js` pull 時套用 server `get_incubator`
- Test: `tests/unit/incubator-state.test.js`

**Interfaces:**
- Consumes: `IncubatorRules`、`SupabaseAuth.*Egg*`／`getIncubator`／`incubatorAdd`、`calcStreak()`、`Store`
- Produces: `Incubator.state() => { eggs, s2, streak }`（已 sync）；`Incubator.claim() => Promise<{ slot, rarity, need } | { error: "incubator_full"|"not_enough_diamonds"|"network" }>`；`Incubator.addRound(data) => Promise<number[]>`（ready slots）；`Incubator.hatch(slot) => Promise<{ entry, rarity, isDupe, candyGain, newlyUnlockedGen } | null>`；`Incubator.discard(slot) => Promise<boolean>`；`Incubator.markSeen(slot, progress)`
  - 登入：一律等 RPC，成功先寫本地（server 回傳覆蓋）；失敗 → `{ error: "network" }`，本地唔改（Review Focus 1）。
  - 匿名：本地扣鑽／擲／`obtainPokemon(chainKey, "rare")`（同 gacha 本地 fallback）。

- [ ] **Step 1: 寫測試**（匿名路徑，vm 載入 storage／store／rules／incubator）：300 鑽 claim → 297、`eggs[0]` 有；第二次 claim（slot 2 未解）→ `incubator_full`、鑽唔變；2 鑽 → `not_enough_diamonds`；`addRound({ results:[10 條內置 correct] })` → progress 10；`discard(0)` 夠數蛋 → `false`；`hatch(0)` 未夠 → `null`。
  登入路徑（stub `SupabaseAuth.isLoggedIn = () => true`、`claimEgg = () => Promise.reject(new Error("net"))`）：`claim()` → `{ error: "network" }`，本地鑽同 `eggs` 完全唔變（Review Focus 1）。
- [ ] **Step 2–4:** FAIL → 實作 → PASS；lint／typecheck。

### Task 3.3: 入口＋孵化器頁（sheet）

**Files:**
- Create: `js/incubator/egg-art.js`（`IncubatorArt.eggSVG(tier)`、`IncubatorArt.defs()`；tier = `plain|great|ultra|master`，照 prototype `eggArt`）
- Create: `js/incubator/sheet.js`（`IncubatorUI.open(slot?)`、`IncubatorUI.refreshEntries()`；分段環、5 階段、熱度軌、逐格亮起、題數拉霸、凍結／鎖住、撳蛋對白、丟棄確認 `App.showModal` confirm-box）
- Create: `css/incubator.css`（由 `tools/prototype/incubator/incubator.css` 搬：去走 `#incu-dev*` prototype 控制）
- Modify: `index.html`：`#sheet-battle` 加 `#btn-home-incubator`（喺 Bag 後）；`#view-gacha .gacha-info` 加 Claim 行＋「View Incubator ›」；`#sheet-gacha` 後面加 `#sheet-incubator`（`ph-sheet ph-sheet-down`）；`<link>` css；scripts
- Modify: `js/app/boot.js` `_bootHomeButtons`（綁 `btn-home-incubator`）、`sw.js`、`site-files.json`、`CODEBASE_INDEX.md`

**Interfaces:**
- Consumes: `Incubator.*`、`IncubatorRules.*`、`App._openSheet/_closeSheet`、`App.closeGachaSheet`、`Gacha.open`
- Produces: `IncubatorUI.open(slot?: 0|1)`、`IncubatorUI.refreshEntries()`（Battle 捲頁副題、Battle dock 紅點 `.incu-dot`、Claim 行狀態）

- [ ] **Step 1: 搬 UI**（行為同 prototype 一致；Claim 撳掣用 `Guard.asyncClick`；粒子 loop 只喺 sheet 開住時跑）。
- [ ] **Step 2: 測試**：`npm test`、`npm run lint`、`npm run typecheck`、`npm run test:e2e`；`tools/responsive/` 測試（新 sheet）。
- [ ] **Step 3: 瀏覽器驗收**（440×956、1000×500、wide）：Battle → Incubator；Lucky Draw → Claim（扣 3 鑽、拉霸停喺啱嘅數）；Slot 2 鎖住文案「7-day (first time)」；凍結畫面；丟棄 KEEP／DISCARD；console 冇 error。

### Task 3.4: 結算孵蛋小視窗

**Files:**
- Create: `js/incubator/hatch.js`（`IncubatorHatch.play(egg, got) => Promise<void>`：小視窗演出按 `HATCH_LV`，之後填 `Gacha._ensureInspect()` 結果卡、隱藏 `.gi-again`、加 Done；Done 先 resolve）
- Modify: `js/app/settlement.js` `onSetComplete`：`rewards` 之後 `const ready = await Incubator.addRound(data)`；`showView("view-settlement")` 之後 2400ms 逐隻 `await IncubatorUI.hatchSlot(slot)`（離開結算頁就停，蛋留喺孵化器）
- Modify: `tests/fixtures/app-surface.json`（`--update`）

**Interfaces:**
- Consumes: `Incubator.hatch(slot)`、`IncubatorArt.eggSVG`、`Gacha._ensureInspect`、`GACHA_BALL`（Common 用 `{ ray:"#cfd8dc", label:"COMMON" }`）
- Produces: `IncubatorUI.hatchSlot(slot: 0|1) => Promise<void>`

- [ ] **Step 1: 實作**（照 prototype `playHatch`／`showResultCard`；`AnimSpeed.begin("incubator")`／`end` 喺 Done 同中途離開）。
- [ ] **Step 2: 測試**：`npm test`（app-surface 更新後綠）、lint、typecheck、e2e。
- [ ] **Step 3: 驗收**：差 3 題 → 答一回合 10/10 → 結算 2.4 秒後彈窗 → 結果卡 → Done；兩隻同時夠數 → 逐隻；第一隻 Done 之前撳下巴 Home → 第二隻仍喺孵化器（Review Focus 2）；自訂題回合只計內置題；四級演出（30／80／140／200）時長遞增。

---

## Part 4 — 之後另開計劃（唔喺今次範圍）

- 10 連新流程（一擲十粒、升級波、OPEN ALL、Legend 留最後；spec §5）。
- 保底 pity 進度條（要 server）；Lucky Draw 大堂快龍 idle rig。
- 結算卡學習連結（🔊 讀英文名＋例句，spec §6／§9 P5）；全套聲效細調（spec §7 有、今次只加 Task 1.3 用到嗰幾個）。
- 孵化器每日上限（上線後睇數據再決定；而家只計內置題）。
