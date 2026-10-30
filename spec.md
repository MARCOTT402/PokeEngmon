# Spec — 五種進化石 + 精靈進化場景

> 狀態：待用戶批准（Spec Mode）
> 介面文字：全英文；對話與文件：繁體中文（香港用語）

---

## 1. 目標

1. 在 Partner Care 的道具區新增 5 種進化石：Thunder / Moon / Fire / Leaf / Water Stone。
2. 每完成一個答題回合有 10% 機會掉落 1 粒石；掉落時 5 種石各佔 20%。
3. 進化條件跟官方：
   - 等級進化用 `evolvesTo.minLevel`（例如 Charmander 16、Charmeleon 36、Caterpie 7）。
   - 用石進化只要有對應石即可，**不設等級門檻**；伊貝分支由石決定，不再隨機。
   - Trade 進化（Kadabra／Machoke／Graveler／Haunter）改為「收集 20 likes」；likes 功能尚未實作，暫時停喺第二階，並預留主頁觸發。
4. 新增進化場景（hub 彈窗），依序播放：
   - 顯示進化前 GIF + 播一次進化前叫聲
   - 播 `1-41. Evolution.mp3` 同時交替閃動前／後 GIF 約 8 秒
   - 只顯示進化後 GIF + 播一次進化後叫聲
   - 播 `3-31. Fanfare Evolution.mp3` 5 秒後完結
   - 完結後等用戶點擊 hub 以外地方返回

---

## 2. 已鎖定規格

### 2.1 道具與掉落

- 新道具 key（`st.items` 扁平欄位）：`thunder`、`moon`、`fire`、`leaf`、`water`。
- `Pet.ITEM_KINDS` 擴展為 `["food","premium","revive","thunder","moon","fire","leaf","water"]`。
- `defaultState().items` 補齊 5 個石 key = 0；`Pet.items()` 自動補 0。
- 掉落（`Pet.rollDrops()`，完美與非完美回合都適用）：
  - 先照現有食物／復活藥規則
  - 再獨立擲 `Math.random() < 0.10` → 有石掉落
  - 掉落時 5 種石均等（各 20%），`addItem(stone, 1)`，結算 chip 顯示例如 `🪨 Thunder Stone +1`
- Partner Care 道具區分兩行：原本 3 個食物／復活藥 tile；下面新增 `.pc-items.stones` 5 個石 tile。
  - 石 tile 用 emoji 圖示（⚡ 🌙 🔥 🍃 💧）＋名稱＋數量，不加新圖片 asset。
  - 可點擊／拖放，行為同現有道具；不可用時 disabled。

### 2.2 進化條件（單一真相來源）

在 `js/storage.js` 新增 helper，`addEntryExp()` 與 `deriveEntryFields()` 共用：

```js
const STONE_KINDS = ["thunder","moon","fire","leaf","water"];
const STONE_LABELS = { thunder:"Thunder Stone", moon:"Moon Stone", fire:"Fire Stone", leaf:"Leaf Stone", water:"Water Stone" };
const STONE_ITEM_MAP = { "thunder-stone":"thunder", "moon-stone":"moon", "fire-stone":"fire", "leaf-stone":"leaf", "water-stone":"water" };
const TRADE_LIKES_REQUIRED = 20;

entryNextEvolution(entry) -> {
  fromDex, target|null, needLevel, stone|null, trade:false, branchIndex|null,
  options: [{ target, needLevel, stone, trade, branchIndex }]   // 伊貝未選分支時
}
canEvolveNow(entry, info) -> boolean        // 等級／石／likes 條件全部達成？
canStoneEvolve(entry, kind) -> { ok, msg, target?, branchIndex? }
```

規則（依 `data/pokemon-151.json` 官方資料）：
- 線性階段：目標 = `chain.stages[entry.stage]`；`evo = dexOf(fromDex).evolvesTo.find(id)`。
- `trigger:"level-up"`：`needLevel = evo.minLevel`；若官方資料 minLevel 為 null（Gen2+ 特殊進化），沿用 30 作近似。
- `trigger:"use-item"` + 5 種石：`stone = STONE_ITEM_MAP[evo.item]`，**不設等級門檻**；有石就用得。
- `trigger:"trade"`：`trade = true`，條件 = `(st.trainerLikes || 0) >= 20`；likes 未實作時 `trainerLikes` 預設 0 → 不會進化。
- 其他道具／特殊進化（Gen2+ 非這 5 種石）：維持舊行為（視作無石、30 級自動進化）。
- 伊貝分支：`entry.branch` 已存在 → 用該分支；未存在時由 `entry.stone` 對應（water→Vaporeon、thunder→Jolteon、fire→Flareon），並寫入 `entry.branch`。無石 → 停在伊貝。
- `addEntryExp()` 回傳新增 `evolvedFrom`（進化前 dexId），供場景使用。
- `useEntryCandy()` 回傳新增 `evolvedFrom`。
- `deriveEntryFields()` replay 必須用同一套 helper；`out.branch` 未定時可由 `out.stone` 推出，確保登出再登入不會退化。

Trade 進化（本作 chain 內）：`abra 64→65`、`machop 67→68`、`geodude 75→76`、`gastly 93→94`；現階段停喺第二階，等 likes 功能。

### 2.3 使用石（Partner Care）

- `Pet.canUse(kind, entry)`：石種類 → 只要 `countOf > 0 && canStoneEvolve(entry, kind).ok` 就可用（不受餵食時段／血量影響）。
- `Pet.useItem(kind, entry)` 石種類流程：
  1. 檢查數量與 `canStoneEvolve`
  2. `addItem(kind, -1)`、`entry.stone = kind`、`saveState()`
  3. `addEntryExp(entry, 0)` 觸發進化
  4. 回傳 `{ ok:true, msg, evolvedFrom, evolvedTo, branch, stone }`
- 失敗訊息（英文）：
  - 未到官方等級：`Charmeleon needs Lv.36 to evolve`
  - 石不適用：`That stone has no effect on Pikachu`
  - 需要其他石：`Pikachu needs a Thunder Stone`
  - 已完全進化：`Already fully evolved`
  - Trade 未達 likes：`Kadabra needs 20 likes to evolve`
- 使用成功後：`Sync.patchEntry(uid, { branch })`（如有）＋ `Sync.patchEntry(uid, { stone_used: kind })`，再開進化場景；場景完結後重新打開 Partner Care。

### 2.3b Trade 進化與主頁觸發（為 likes 功能預留）

- `defaultState()` 加 `trainerLikes: 0`（likes 功能之後寫入）。
- `App.renderHome()` 尾段呼叫 `App._checkPendingEvolutions()`：
  - 掃描所有 entries，凡 `entryNextEvolution(entry)` 現時條件已達成（例如 likes 由登入／同步變成 ≥20）→ `addEntryExp(entry, 0)` 完成進化，收集 `{fromDex, toDex, entry}`。
  - 逐隻以 `EvolveScene` 順序播放，全部完成後 `renderHome()` 一次。
  - 加 `_evoChecking` 防重入；冇進化就靜靜返回。
- 現階段 likes 恆為 0，所以唔會觸發；likes 功能上線後只需更新 `st.trainerLikes`，主頁／登入即會自動播進化。

### 2.4 進化場景（新檔 `js/evolve-scene.js`）

公開 API：`EvolveScene.open({ fromDex, toDex, onDone })`。

流程（時間由 `open()` 起計）：
1. `App.showModal(html, true)`（暫時停用背景點擊關閉）
2. 停止城鎮 BGM；顯示進化前 GIF（`animatedURL(fromDex)`）；`Pokedex.playCry(fromDex)`
3. +900ms：`CaptureScene.audio.playMusicOnce("assets/bgm/evolution.mp3", 0.7, 8000)`；每 400ms 交替顯示前／後 GIF，維持 8 秒
4. 8 秒後：只顯示後 GIF；`Pokedex.playCry(toDex)`
5. +1200ms：`playMusicOnce("assets/bgm/evolution-fanfare.mp3", 0.8, 5000)`；顯示 `Tap outside to continue`
6. 5 秒後完結：掛上 backdrop click → `close()`
7. `close()`：清 timers、停所有場景音效、重開城鎮 BGM、`onDone && onDone()`

- `playMusicOnce(url, volume, maxSeconds)` 加在 `CaptureAudio`：經 `bgmBus`、回傳 `{ stop }`、到時自動停；沿用 `_oneShotBufs` 快取。
- 叫聲沿用 `Pokedex.playCry`（sfxBus 音量設定）。
- GIF 用兩張疊圖 + opacity 切換，避免 src 重載。
- 觸發點：
  - 回合結算升級進化（`App.onSetComplete`）：場景完結後才 `queueMoveLearn` / `maybeShowGenUnlock`。
  - 餵糖果進化（`Pokedex.feedCandy`）。
  - 使用石進化（`App._pcUse`）。
  - 主頁外部條件進化（`App.renderHome` → `_checkPendingEvolutions`，供未來 likes）。
- 保留 `App.showEvolveModal(species, onDone)` 作為入口，內部改為 `EvolveScene.open`。

### 2.5 雲端持久化

新增 migration `supabase/migrations/supabase-migrate-20261031-stone-evolution.sql`：
```sql
alter table public.user_entries add column if not exists stone_used text;
alter table public.user_account add column if not exists items_stones jsonb;
alter table public.user_account add column if not exists trainer_likes integer;
grant select, update (stone_used) on public.user_entries to authenticated;
grant select, update (items_stones, trainer_likes) on public.user_account to authenticated;
notify pgrst, 'reload schema';
```
- `localEntryFromServer()` 讀 `stone_used` → `entry.stone`。
- `Sync.patchEntry()` 支援 `stone_used`。
- `Sync.pushItems()` 加 `items_stones`；若後端回 schema/column 錯誤，自動 retry 舊 3 欄（避免未跑 migration 時連食物都同步唔到）。
- `Sync.pull()` 若 `acct.items_stones` 存在才覆蓋本機石數量（null = 保留本機）；若 `acct.trainer_likes` 存在 → `st.trainerLikes`。
- migration 未跑時：本機石與進化照常運作，只係未上雲；log warning，不阻塞。
- `trainer_likes` 只作未來 likes 功能寫入；本 spec 只讀不寫。

### 2.6 資產

- 複製：
  - `C:\Users\user\Desktop\1-41. Evolution.mp3` → `assets/bgm/evolution.mp3`
  - `C:\Users\user\Desktop\3-31. Fanfare Evolution.mp3` → `assets/bgm/evolution-fanfare.mp3`
- `sw.js` ASSETS 加上述 2 個 mp3 及 `./js/evolve-scene.js`。
- `index.html` 在 `js/pokedex.js` 之後、`js/app.js` 之前加 `<script src="js/evolve-scene.js?v=...">`。
- `App.openDisclaimer()` Music & Sound Credits 加進化曲與 fanfare（Pokémon RGBY 原聲，© Nintendo / Creatures Inc. / GAME FREAK inc.）。
- `prd.md` §3.11 補進化場景音效與 5 種石。
- `css/style.css` 加 `.pc-items.stones`、`.pc-item.stone`、`.evolve-scene`、`.evo-stage`、`.evo-gif` 樣式。

---

## 3. 明確不改

- 不改現有食物／復活藥掉落率與效果。
- Trade 進化改為 20 likes 條件（本 spec 實作條件判定，likes 功能本身不在本 spec）。
- 不改 Gen2–5 非這 5 種石的道具進化行為（維持近似 30 級）。
- 不改 APP_VERSION（由 semantic-release 管）；本地預覽用 `python tools/sync_app_version.py`。
- 不新增石頭 PNG asset。

---

## 4. 驗證

1. `node --check js/storage.js js/pet.js js/app.js js/pokedex.js js/sync.js js/evolve-scene.js`
2. 單元式 console 驗證：
   - Pikachu Lv.5 用 Thunder Stone → 直接進化 Raichu（無等級門檻）
   - Eevee Lv.5 用 Water/Thunder/Fire Stone → 對應 Vaporeon/Jolteon/Flareon，branch 正確；無石停在伊貝
   - Charmander Lv.16 進化 Charmeleon；Charmeleon Lv.35 冇 Fire Stone → 不進化；Lv.36 自動進化 Charizard
   - Kadabra Lv.99、trainerLikes 0 → 不進化；設 `st.trainerLikes = 20` 後 `renderHome()` → 自動進化 Alakazam 並播場景
   - `deriveEntryFields` 對以上 entry 重推 stage 一致（模擬 pull）
3. Partner Care：石 tile 數量、disabled 狀態、點擊／拖放、成功後場景、關閉後回到 Partner Care。
4. 回合結算 10% 掉落（可用 console 改 seed 手動多跑）；掉落 chip 顯示正確。
5. 進化場景：計時順序、GIF 交替、叫聲、兩首音樂、完結後點外面關閉、BGM 恢復。
6. 未跑 migration 時：`pushItems` 仍成功同步食物（retry 路徑）；console 只有 warning。
7. 瀏覽器實測（`python -m http.server` 或現有預覽方式）。

---

## 5. 待批准後執行

見 `tasks.md`。
