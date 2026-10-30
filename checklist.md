# Checklist — 五種進化石 + 精靈進化場景

> 對應 [spec.md](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/spec.md) / [tasks.md](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/tasks.md)

## 道具與掉落

- [x] `defaultState().items` 有 `thunder / moon / fire / leaf / water`，預設 0
- [x] `Pet.ITEM_KINDS` 包含 5 種石
- [x] `rollDrops()` 每回合獨立 10% 掉石，掉石時 5 種各 20%（實測 20000 次 ≈ 9.87%）
- [x] 結算 chip 顯示石名（例如 `🔥 Fire Stone +1`）

## 進化條件（官方）

- [x] `level-up` 用 `evolvesTo.minLevel`（小火龍 16、火恐龍 36 已驗證）
- [x] 石進化無等級門檻（比卡超用 Thunder Stone 即進化）
- [x] 錯石有清楚提示（`Pikachu needs a Thunder Stone`）
- [x] 伊貝由石決定分支（water→134 / thunder→135 / fire→136），並寫入 `branch`
- [x] trade 進化要 20 likes（0 likes 停喺第二階，20 likes 觸發 Alakazam）
- [x] `deriveEntryFields()` 用同一套條件 replay，石進化登出再登入唔會退化

## Partner Care

- [x] 道具區下面新增 5 個石 tile，可點擊／拖放
- [x] 石 tile 顯示數量、不可用時 disabled
- [x] 顯示下一進化提示（例如 `Evolves at Lv.36 (now Lv.16).`）
- [x] 用石成功 → 消耗 1 粒 → 觸發進化場景 → 完結後重開 Partner Care

## 進化場景

- [x] 顯示進化前 GIF + 播一次進化前叫聲
- [x] 播 `assets/bgm/evolution.mp3` 同時交替閃動前／後 GIF 8 秒
- [x] 8 秒後只顯示進化後 GIF + 播一次進化後叫聲
- [x] 播 `assets/bgm/evolution-fanfare.mp3` 5 秒
- [x] 完結前唔可以 backdrop 關閉；完結後顯示 `Tap outside to continue` 並可點擊外面返回
- [x] 場景期間城鎮 BGM 暫停，完結後恢復（結算畫面 3.2 秒恢復已避開進化）

## 觸發路徑

- [x] 升級進化（`onSetComplete`）→ 場景完結後才學招／世代解鎖
- [x] 餵糖果進化（`Pokedex.feedCandy`）→ 場景完結後才學招
- [x] 用石進化（Partner Care）
- [x] 主頁／登入 `_checkPendingEvolutions()`（trade likes 等外部條件，逐隻播放、防重入）

## 雲端

- [x] `patchEntry` 支援 `branch` 及 `stone_used`
- [x] `pull` 讀 `items_stones`、`trainer_likes`（null 保留本機）
- [x] `pushItems` 帶 `items_stones`，column 未存在時 retry 舊 payload
- [x] migration `supabase-migrate-20261031-stone-evolution.sql` 已建立（**需用戶在 Supabase SQL Editor 執行**）

## 資產與文件

- [x] `assets/bgm/evolution.mp3`、`assets/bgm/evolution-fanfare.mp3` 已存在
- [x] `index.html` 載入 `js/evolve-scene.js`
- [x] `sw.js` ASSETS 包含 2 首新曲 + `evolve-scene.js`
- [x] disclaimer 加 Evolution / Fanfare Evolution credit；`prd.md` §3.11 已更新
- [x] 全部修改檔案 `node --check` 通過；瀏覽器實測無 console error
