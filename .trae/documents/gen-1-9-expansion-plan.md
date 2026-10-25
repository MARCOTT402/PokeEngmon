# Plan — Gen 1–5 擴充（#152–649）+ 世代解鎖 + 分代圖鑑

> 目標版本：整合完成後 bump 到 **v120**
> 原型優先：第一步先出 `prototype/gen-pokedex.html` 俾用戶睇效果，確認後先整合入遊戲。
> 範圍決策（v2）：用戶確認只做 **Gen 1–5（#1–649）**，動態圖 100% 跟原先做法（PokeAPI 官方 GIF），零第三方依賴。
> 下載策略（v3，用戶提出）：**世代資料包按需下載** — 用戶解鎖某世代時先 download 該代素材包（GIF + 叫聲 + 資料 JSON），未解鎖嘅世代完全唔佔裝置空間/流量。

---

## 1. Summary

- 寶可夢資料由 151 隻擴充到 **649 隻（Gen 1–5）**，資料來源：PokeAPI（evolution-chain / species / pokemon / move endpoints + 官方動態 GIF），全部素材跟現有 Gen 1 做法，無第三方依賴。
- 新增**世代解鎖系統**：初始只有 Gen 1；擁有該代**全部進化鏈（連傳說）**→ 自動開放下一代；捕捉同抽獎池**只包含目前最高已解鎖世代**。
- Pokédex 改版：**5 個世代分頁**，頂部浮動世代 hub（scroll down 隱藏 / scroll up 顯示），世代圖示用封面傳說 sprite；未解鎖世代顯示鎖定狀態。
- **世代資料包按需下載**：repo 照舊 commit 全部素材（GitHub Pages 靜態限制），但 client 只在解鎖某代時下載該代嘅 GIF/叫聲/資料 JSON（進度彈窗 + manifest 校驗 + 斷點續傳），未解鎖世代零流量零儲存。
- 每條鏈有 rarity（normal/rare/epic/legend）：**Gen 1 維持現有 hand-tuned 分佈不變**（保護現有玩家進度），Gen 2–5 用算法生成。

## 2. 用戶已確認決策

| 決策 | 結果 |
|---|---|
| 解鎖條件 | 擁有該世代**全部鏈包括傳說**（hardcore） |
| 動態圖 | 全部跟原先做法：PokeAPI 官方 black-white animated GIF（已核實覆蓋 1–649），離線下載到 `assets/animated/{id}.gif` |
| 世代圖示 | 各代封面傳說：Mewtwo(150) / Ho-Oh(250) / Groudon(383) / Dialga(483) / Reshiram(643) |
| 素材下載時機 | **解鎖該世代時先下載該代資料包**（用戶提出）：進度彈窗 + manifest 校驗 + 斷點續傳；未解鎖世代零下載 |

## 3. 已核實外部資源（Phase 1 探索結果）

- PokeAPI `generation/{n}` endpoint **冇圖示**，純數據 → 所以用封面傳說 sprite 做 icon。
- PokeAPI 動態 GIF（`.../generation-v/black-white/animated/{id}.gif`）：**覆蓋 1–649**（152 ✓、649 ✓；650 起 404，所以範圍定喺 649 啱啱好）。
- PokeAPI 叫聲 `cries/pokemon/latest/{id}.ogg`：**全覆蓋**，但係 OGG → 需 **ffmpeg** 轉 MP3（iOS 唔支援 OGG）。腳本開始時檢查 `ffmpeg -version`，冇就提示 `winget install ffmpeg`。
- 官方 artwork `other/official-artwork/{id}.png`：1–649 全覆蓋；app 本身已有 `sprite.onerror` fallback 機制保底。

## 4. 關鍵架構決策：跨代進化鏈截斷政策

**問題**：正史進化會跨代（golbat→crobat、pikachu 嘅 baby 係 pichu、eevee→espeon/leafeon…）。若跟正史合併，現有玩家嘅 chainKey/stage/ownedSpecies 全部要遷移，風險高。

**決策**：**所有進化鏈按世代截斷，每代自給自足**——
- Gen 1 鏈完全維持現狀（golbat 唔會變 crobat；eevee 維持 3 分支）。
- 跨代進化嘅後段（crobat、blissey、steelix、scizor、espeon、umbreon、leafeon、glaceon 等）喺佢哋自己嘅世代成為**獨立鏈嘅 stage 1**，可以直接捕捉/抽到。
- 跨代 baby（pichu、cleffa、togepi 等）喺自己世代做獨立單段鏈（pichu 唔進化）。
- 好處：零遷移、解鎖條件簡單（「擁有 Gen N 全部鏈」）、抽獎池簡單（鏈屬於且只屬於一代）、腳本可完全自動生成。
- 實作：由 PokeAPI chain 建 parent→child 圖，**cut 晒所有跨代 edge**，每個剩餘 connected component 係一條鏈，root = 冇 in-gen parent 嘅節點，branches = 多於一個 in-gen child 嘅節點。

## 5. 世代範圍同圖示

| Gen | Dex 範圍 | 數量 | 地區 | Icon |
|---|---|---|---|---|
| 1 | 1–151 | 151 | Kanto | Mewtwo |
| 2 | 152–251 | 100 | Johto | Ho-Oh |
| 3 | 252–386 | 135 | Hoenn | Groudon |
| 4 | 387–493 | 107 | Sinnoh | Dialga |
| 5 | 494–649 | 156 | Unova | Reshiram |

## 6. Rarity 算法（Gen 2–5；Gen 1 不變）

逐鏈判定（順序優先）：
1. **legend**：鏈內任何 species `is_legendary` 或 `is_mythical`（PokeAPI species endpoint 有呢兩個 flag）。
2. **epic**：最終階段 base stat total ≥ 600（pseudo-legendary 線：tyranitar(2)、salamence(3)、metagross(3)、garchomp(4)、hydreigon(5)、goodra(5)）。
3. **rare**：最終階段 BST ≥ 500（御三家線會落入呢層，同玩家預期相符）。
4. **normal**：其餘。
閾值寫喺腳本頂部 config，可改完重跑。

## 7. Proposed Changes

### Phase A — 原型（第一個交付物）
- **新檔 `prototype/gen-pokedex.html`**（獨立頁，唔入 app、唔入 SW cache）：
  - 頂部浮動世代 hub：5 粒圓角 chip（封面傳說 artwork 圖 + 羅馬數字 + 地區名），橫向可 scroll，`position: sticky; top: 0`；scroll down 時 `translateY(-110%)` 收起、scroll up 彈出（transform transition 200ms）。
  - 世代頁內容：標題列（Gen II · Johto · 45/100 owned）+ 現有 `.dex-cell` 風格 grid（owned 彩色 / unowned 剪影）。
  - 鎖定世代：chip 加 🔒 灰化；撳入去顯示鎖定橫幅「Complete Gen {N-1} to unlock!」+ 全剪影 grid。
  - Demo 狀態寫死：Gen 1 全齊、Gen 2 部分、Gen 3–5 鎖定。圖片用 PokeAPI CDN URL（原型在線用）。
  - 用戶確認效果後先進入 Phase B/C。

### Phase B — 資料同素材管道
- **新檔 `tools/fetch_gen_data.py`**（一次性離線腳本，可 resume、skip 已存在）：
  1. fetch 全部 evolution chains + species 1–649 + pokemon 1–649（learnset、stats）。
  2. 按第 4 節截斷政策建鏈 + 第 6 節 rarity 算法。
  3. 英文名用 species `names[en]`（自動處理 Nidoran♀/♂、Mr. Mime、Farfetch'd、Ho-Oh 等）。
  4. 輸出：
     - `js/gens-data.js` — `GENS` 陣列（gen、name、range、iconDex）+ Gen 2–5 鏈定義；Gen 1 鏈**唔郁**，維持喺 `data.js`。呢個檔好細（幾 KB），開 app 即載。
     - `data/pokemon-gen{N}.json` — **按代拆檔**（gen 1 = 現有 `pokemon-151.json` 唔郁；gen 2–5 各自一檔），欄位 shape 同現有完全一致（執行時先讀取確認 shape）；某代解鎖時先 fetch。
     - `data/moves.json` — 補齊到 Gen 5 最後一招 ≈ #559（一次性擴充現有檔；招式純文字、細，開 app 載入，唔使拆）。
     - `assets/gen-packs/gen{N}.json` — **每代素材 manifest**（該代全部 `animated/{id}.gif` + `cries/{id}.mp3` 路徑 + byte size），下載管理器用嚟計進度同斷點續傳校驗。
- **新檔 `tools/fetch_gen_assets.py`**：
  - `assets/animated/{id}.gif`：152–649 由 PokeAPI black-white/animated 下載（同 Gen 1 完全同源）；404 就記 log 兼 skip，app 層 fallback 靜態 sprite。
  - `assets/cries/{id}.mp3`：152–649 由 PokeAPI OGG 下載 + ffmpeg 轉 MP3。
  - `assets/gen-icons/{1..5}.png`：5 隻封面傳說 official artwork。
  - 全部 request 加 0.1–0.2s delay，skip 已存在檔案（可中斷重跑）。

### Phase C — 遊戲整合
- `js/data.js`：載入 `gens-data.js`；`EVOLUTION_CHAINS` 變成 5 代全量（每條鏈加 `gen` 欄位）；`SPECIES` 加 `gen`；新增 `chainsOfGen(n)`、`genOfChain(chainKey)`、`pullablePool(gen, rarity)`。`PULLABLE` 結構保留。
- `js/storage.js`：state 加 `unlockedGen`（default 1）；新增 `isGenComplete(n)`（該代每條鏈都有 entry）、`recomputeUnlockedGen()`——`obtainPokemon()` 成功後呼叫，逐代向上檢查；啟動時跑一次（舊玩家已儲齊 Gen 1 會自動開 Gen 2）。**新解鎖時回傳 newlyUnlocked gen，由 app.js 喺結算流程後彈慶祝窗 + 觸發 `GenPack.download()`**。
- `js/gacha.js`：`pickChain()` 改用 `pullablePool(st.unlockedGen, rarity)`（未擁有加權邏輯不變）。
- `js/capture.js`：遭遇池同樣只取 `unlockedGen`（odds 函數不變，只換池）。
- `js/pokedex.js`：重構為世代分頁（hub + 單代 grid + 鎖定態），detail modal 邏輯重用現有 L54–167。**未解鎖世代嘅 grid 用純「?」placeholder cell，完全唔 fetch 圖片**（零流量）；已解鎖世代先正常渲染 sprite。
- `index.html`：`view-pokedex` 加 `#gen-hub` 容器（現有 L231–240 結構上擴建）；引入 `js/gens-data.js` + `js/genpack.js`（**位置要喺 data.js 之前**）。
- `css/style.css`：`.gen-hub`、`.gen-chip`（active/locked 態）、`.gen-lock-banner`、資料包下載進度彈窗樣式；hover 動效跟現有 `@media (hover:hover)` 規則。
- `js/pokemon.js`：`loadPokemonDex()` 改為**按代載入**——啟動只載 Gen 1（現有 `pokemon-151.json`）；新增 `ensureGenDataLoaded(gen)` 喺解鎖時 fetch `data/pokemon-gen{N}.json` 兼合併入 `POKEMON_DEX`（L51–66 擴建）。
- **新檔 `js/genpack.js`** — 世代資料包下載管理器：
  - `GenPack.download(gen, onProgress)`：fetch manifest → 逐檔 `fetch()`（行經 SW，自動入 runtime cache）→ 回調更新進度條 → 完成後 `localStorage` 記 `genPacks[N]="done"`。
  - 斷點續傳：`partial` 狀態嘅代喺下次 online 啟動時自動補下；個別檔失敗記低重試，唔阻塞整體（漏網之魚由 runtime cache-on-fetch 補底）。
  - 解鎖慶祝彈窗整合：「🎉 Gen II · Johto Unlocked! Downloading region pack…」+ 進度條；下載期間用戶可照玩（背景繼續）。
- `sw.js`：**pre-cache 維持只放 Gen 1 素材**（現有 `Array.from({length:151}…)` 唔郁）；fetch handler 對 `assets/animated|cries|gen-icons|gen-packs`、`data/pokemon-gen*.json` 嘅同源 GET 做 **cache-first 持久儲存**（下載過就永久離線可用）；`data/moves.json` 留喺 pre-cache。
- **SQL 遷移 `supabase-migrate-20261026-gen-expansion.sql`**：`gacha_pull` RPC 加 `p_gen` 參數 + server 端鏈表加 gen 欄同 Gen 2–5 資料（執行時先讀 `supabase-schema.sql` 確認現有實作）；前端 `SupabaseAuth.gachaPull` wrapper 傳 `unlockedGen`；RPC 失敗照舊 fallback 本地 roll。
- 版本 bump v120 三處（`app.js` APP_VERSION、`sw.js` CACHE_NAME、`index.html` 全部 `?v=120`）。
- 文件更新：`prd.md`、`arch.md` 補世代系統章節。

### Phase D — 驗證
1. `node --check` 全部改動 JS。
2. 本地開頁：Gen 1 玩家進度完整（chainKey/stage/圖鑑冇走位）；圖鑑 5 頁切換 + hub 捲動收放；鎖定代顯示正確。
3. 模擬儲齊 Gen 1（dev hook / console 改 state）→ 確認自動解鎖 Gen 2、捕捉+抽獎池只剩 152–251。
4. Gen 2+ 新寶可夢：動態 GIF 顯示、叫聲播放（Web Audio）、招式由對應 `pokemon-gen{N}.json` 正確 derive。
5. 資料包下載流程：模擬解鎖 Gen 2 → 慶祝彈窗 + 進度條出現；下載完成後斷網 → 該代 GIF/叫聲/資料全部離線可用；下載到一半斷網 → 重新上線自動續傳到 done。
6. `python tools/git_commit_push.py` 分階段 commit（prototype → data+assets → 整合）。

## 8. 風險同注意事項

- **下載量（build 時）**：約 498 張 GIF + 498 個叫聲（OGG→MP3）+ 約 400 個新招式 + 649 pokemon JSON，腳本要可 resume；預計素材增量幾十 MB，GitHub Pages 1GB 限制內。
- **repo 體積**：所有素材仍要 commit 上 GitHub（靜態 hosting 限制）——按需下載慳嘅係 **client 流量同裝置儲存**，repo 體積冇分別。
- **傳說 5% 抽率 + 全鏈解鎖條件** = 後期解鎖慢：用戶已明確選擇 hardcore，唔改。
- **ffmpeg 依賴**：叫聲轉檔需要；腳本會先檢查。
- **解鎖當下離線**：慶祝彈窗照出、資料包標記 `partial`，下次 online 啟動自動續傳；完成前該代圖片/叫聲用現有 fallback（靜態 sprite / 無聲）頂住，唔會 crash。
- 寶可夢官方 artwork 若個別 404，`spriteURL` fallback 已存在。

## 9. 未喺本 plan 範圍

- **Gen 6–9（#650–1025）**：今次唔做。將來要擴充時注意 PokeAPI 官方動態 GIF 只到 649，Gen 6+ 需另覓來源（如 Showdown）。
- 地區形態（Alolan/Galarian 等，dex 10001+）。
- 世代專屬 BGM / 場景。
- 捕捉場景 Three.js 視覺改動（重用現有）。
