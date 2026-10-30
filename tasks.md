# Tasks — 五種進化石 + 精靈進化場景

> 對應 [spec.md](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/spec.md)
> 介面文字：全英文

## 執行順序（每項完成後自檢）

- [x] **T1. 進化條件核心（`js/storage.js`）**
  - 新增 `STONE_KINDS`、`STONE_LABELS`、`STONE_ITEM_MAP`、`TRADE_LIKES_REQUIRED`、`entryNextEvolution()`、`canEvolveNow()`、`canStoneEvolve()`。
  - `defaultState()` 加 5 個石 key 及 `trainerLikes: 0`。
  - 條件跟官方：`level-up` 用 `evo.minLevel`（null 才 fallback 30）；`use-item` + 5 石 → 只要有石即可（無等級）；`trade` → likes ≥ 20。
  - `addEntryExp()`：改用 helper；伊貝石分支；回傳 `evolvedFrom`。
  - `useEntryCandy()`：帶出 `evolvedFrom`。
  - `deriveEntryFields()`：同一 helper replay，登出再登入不退化。
  - 驗證：`node --check js/storage.js`；console 跑 spec §4.2。

- [x] **T2. 道具層（`js/pet.js`）**
  - `ITEM_KINDS` 加 5 石。
  - `rollDrops()` 加 10% 石掉落、5 種各 20%。
  - `canUse()` / `useItem()` 石分支（消耗、`entry.stone`、觸發進化、回傳 `evolvedFrom/evolvedTo/branch/stone`）。
  - 驗證：`node --check js/pet.js`；掉落 chip 文案。

- [x] **T3. 進化場景（新檔 `js/evolve-scene.js` + `js/capture.js`）**
  - `CaptureAudio.playMusicOnce(url, volume, maxSeconds)` → bgmBus、可停、timeout 自動停。
  - `EvolveScene.open/close`：GIF、叫聲、8 秒交替、5 秒 fanfare、完結後 backdrop 關閉、BGM 恢復。
  - 驗證：`node --check`；瀏覽器完整流程。

- [x] **T4. App / Pokedex 接線（`js/app.js`、`js/pokedex.js`）**
  - Partner Care 石 tile（`.pc-items.stones`）＋ 點擊／拖放。
  - `_pcUse` 石成功 → patchEntry（branch / stone_used）→ 開場景 → onDone 重開 Partner Care。
  - `onSetComplete`：場景完結後才 queueMoveLearn / gen unlock。
  - `_renderSettlement`：有進化時不重開城鎮 BGM。
  - `showEvolveModal(species, onDone)` 改接 `EvolveScene`。
  - `Pokedex.feedCandy` 用 `res.evolvedFrom` 開場景。
  - `renderHome()` 加 `_checkPendingEvolutions()`（防重入、逐隻播場景，供未來 likes）。
  - 驗證：`node --check`；手動四條觸發路徑。

- [x] **T5. 雲端（`js/sync.js` + migration）**
  - `localEntryFromServer` 讀 `stone_used`。
  - `patchEntry` 支援 `stone_used`。
  - `pushItems` 加 `items_stones`，schema 錯誤 retry 舊 payload。
  - `pull` 讀 `items_stones` 及 `trainer_likes`（null 保留本機）。
  - 新增 `supabase/migrations/supabase-migrate-20261031-stone-evolution.sql`（`stone_used`、`items_stones`、`trainer_likes` + grants）。
  - 驗證：`node --check js/sync.js`；未跑 migration 時 retry 成功。

- [x] **T6. 資產與文件（`index.html`、`sw.js`、`css/style.css`、`prd.md`、disclaimer）**
  - 複製 2 首 mp3 到 `assets/bgm/`。
  - `index.html` 加 script；`sw.js` ASSETS 加 3 個檔案。
  - 加石 tile / 進化場景 CSS。
  - disclaimer credits + prd.md §3.11。
  - 驗證：檔案存在、路徑正確、`?v=` 一致（本地預覽需跑 sync-version）。

- [x] **T7. 端到端驗證**
  - spec §4 全部項目；瀏覽器實測；回報結果。

> 注意：T5 migration 需要用戶在 Supabase SQL Editor 執行；未執行時功能仍可本機運作。
