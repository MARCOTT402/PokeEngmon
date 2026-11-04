# PokeEngmon — 16 項新需求實作 Backlog（2026-11-04）

> 狀態：Phase 0 已完成並驗證；Phase 1–6 只做規劃，尚未落地。
> 硬性規範沿用：不改正式發佈版本、不註冊新 Service Worker、不新增無關資料夾；遊戲內文案全英文；手機基準 440×956。

---

## 0. 現況盤點（需求 → 落點）

| # | 需求 | 主要落點 | 現況 |
|---|---|---|---|
| 1 | 答題鍵盤顯示規則 | `js/quiz.js`、`index.html`、`css/style.css` | ✅ 本輪完成（App 自帶鍵盤，觸控顯示／桌面隱藏） |
| 2 | 飽肚／嘔吐／HP 加速下降 | `js/pet.js`（Partner Care） | 只有餵食與健康值，冇 fullness 狀態 |
| 3 | 用藥過量中毒＋禁藥 | `js/pet.js`、未來 `bag` medicine | 未有藥品庫存與中毒狀態 |
| 4 | 當前四招持久化到 Server | `js/storage.js`、`js/sync.js`、`js/supabase-auth.js`、migration | Rule 19：moves 目前 **local-only**（`st.moveLoadouts`） |
| 5 | 最愛 remark／星號／排序 | `js/pokedex.js`、`js/storage.js`、migration | 無 favourite 欄位 |
| 6 | 送回大木博士 + claim EV unit | `js/storage.js`、`js/supabase-auth.js`、新 RPC | 有 `user_entries.ev_points`，冇 release 流程 |
| 7 | EV point unit 在背包使用 | 新 bag + `alloc_ev` 體系 | 目前直接 `allocEv`，冇「unit」道具概念 |
| 8 | 背包內改技能 | 新 bag + `setEntryMoves` | 技能編輯在別處，未集中到背包 |
| 9 | 背包分類（items/medicine/berries/key/held/pokemon） | 新 bag 模組 + migration | 完全未有 bag |
| 10 | Bag 做 Battle 頁子單元 | `js/battle/battle.js`、`index.html` | Battle Menu 是 display-window overlay；bag 未存在 |
| 11 | Pokédex 顯示「已解鎖／已開放總數」 | `js/app.js`、`js/pokedex.js` | ✅ 本輪完成 |
| 12 | 全站按鍵 hover 微放大 | `css/style.css` | ✅ 本輪完成 |
| 13 | 好友對戰缺 pre-battle 頁 | `js/friends.js`、`js/battle/battle.js` | 選隊後直接 launch battle（bug） |
| 14 | Trainer Avatar（PokéAPI 圖像）＋ sync | `js/battle/battle.js`、`js/supabase-auth.js`、migration | 無 avatar 欄位／選擇 UI |
| 15 | 背包／pre-battle／戰鬥強制橫向提示 | 新 `Orientation` 模組 + 三頁 | 全部頁面目前直向 |
| 16 | 擊敗對方後問「要唔要換 Pokémon」 | `js/battle/battle.js` `runTurnResolution` | 只有己方戰死強制換（Rule 22） |

---

## 1. 重疊與衝突點（先講清楚，避免同批檔案打架）

1. **Bag 子單元 vs Battle Menu overlay**
   - Battle Menu 已是 `position:fixed` 的 display-window overlay（z-index 120，四角 14px、黑邊）。
   - Bag **不可**再做另一個 fixed view；應為 Battle Menu 內部的二級 panel（同一 overlay 內切換 header / back），否則會兩個 overlay 疊住、`_closeAllSheets`／binder 判斷全部要再改一次。
2. **Pre-battle vs Battle 頁**
   - Pre-battle 必須用同一組 display-window overlay selector + z-index 120 + `border-radius:14px`，並經 `App.showView("view-home")` 前的 guard（Rule 53）。
   - Pre-battle 由「雙方選隊完成」事件驅動，不可在 `openTeamSelect` confirm 後直接 `launchBattle`。
3. **橫向提示跨三頁**
   - 一定要做成單一 `Orientation` 元件 + 單一 overlay；掛在 `showView` 進出 hook，不可三頁各寫一份。
   - 提示 overlay z-index 要低過 toast(3000)、高過 view overlay(120)；quiz 保持在直向，不可誤觸發。
4. **狀態欄 Pokédex 數值有兩個 writer**
   - `App.renderHome()` 與 `Pokedex.render()` 都會寫 `#home-dex-progress`。本輪已統一為「已解鎖物種聯集 / 已開放地區總數」，未來不要再寫 entry 數。
5. **Moves 持久化 vs Rule 19（local-only loadout）**
   - 現時 `entry.moves` 由 `applyMoveLoadout()` 從 `st.moveLoadouts[uid]` 還原；加 server 欄位後要定單一真相：server 為準，local 只做快取，pull 後仍要 `applyMoveLoadout` 驗證池。
6. **EV 分配 vs EV unit 道具化**
   - 保留 `alloc_ev` 舊路徑；新增 `use_ev_unit` 時必須原子扣 unit + 加 EV，不要前端先扣再 RPC。
7. **飽肚 vs 現有「Health 100 不准餵食」**
   - pet.js 目前滿血會擋餵食；新規則（滿 100 仍可吃 3 粒→嘔吐）要改 guard，屬行為反轉，需先確認（見第 4 節）。
8. **按鍵 hover 用 `transform` 會撞到置中按鈕**
   - 本輪改用獨立 `scale` 屬性（與 `transform` 分開），避免覆寫 `translate/translateX(-50%)` 類按鈕。

---

## 2. 分階段 Backlog

### Phase 0 — 本輪已完成（低風險 UI／規則）
- **目標**：11（Pokédex 解鎖數）、12（全站 hover 微放大）、1（答題鍵盤規則）。
- **涉及檔案**：`js/app.js`、`js/pokedex.js`、`css/style.css`、`js/quiz.js`、`index.html`。
- **驗證**：見第 3 節。

### Phase 1 — Bag 外殼與分類（需求 9、10）
- **目標**：Battle Menu 內新增 Bag 子面板；六個分類 tab；items/medicine/berries/held items 可讀，key items 只做結構顯示「Coming soon」；pokemon 分類顯示持有清單。
- **涉及檔案**：`index.html`（bag panel markup）、`css/style.css`（bag 樣式）、新 `js/bag.js`（或 `js/battle/bag.js`，必須加入 `sw.js` ASSETS）、`js/battle/battle.js`（Battle Menu 入口）。
- **資料結構草案**：`user_bag(account_id uuid, item_key text, category text, qty int, primary key(account_id,item_key))`；local mirror `st.bag = { items:{}, medicine:{}, berries:{}, keyItems:{}, heldItems:{} }`。
- **依賴**：無（但 item 清單與圖示要先定）。
- **驗證**：Battle Menu → Bag → 六個分類可切換；390/440 兩種闊度不溢出 display window；返回 Battle Menu 動畫與現有 overlay 一致（scaleY(0)）。

### Phase 2 — Bag 內操作（需求 5、7、8）
- **目標**：Pokémon 分頁選中精靈後可（a）用 EV point unit 加 EV、（b）改四招、（c）設/取消最愛。
- **涉及檔案**：`js/bag.js`、`js/storage.js`（`setEntryMoves`、EV unit 消耗）、`js/pokedex.js`（最愛排序／星號顯示）。
- **資料結構草案**：local `st.bag.items.evUnit`；`st.favourites` 由 server 欄位回填（見 Phase 3）。
- **依賴**：Phase 1。
- **驗證**：選精靈→用 unit 後 unit 數量與 EV 同步變化；四招上限 4 且必須在 knownMoves 池內；星號即時更新。

### Phase 3 — Server 持久化（需求 4、5、6、14）
- **目標**：技能配置、最愛、送回大木博士、Trainer Avatar 全部寫入 DB；一份 migration 完成欄位＋grant＋RPC。
- **涉及檔案**：新 migration（`supabase/migrations/…`）、`js/sync.js`（pull/patch 白名單）、`js/supabase-auth.js`（RPC wrapper）、`js/storage.js`。
- **資料結構草案**：
  - `user_entries`：`moves jsonb default '[]'`、`favourite boolean default false`、`held_item text`。
  - `user_account`：`avatar_id int`（PokéAPI species id）或 `avatar_key text`、`ev_units int default 0`；Bag 用獨立 `user_bag`。
  - RPC：`set_entry_moves(p_entry_id uuid, p_moves jsonb)`、`set_entry_favourite(p_entry_id, p_fav)`、`release_entry(p_entry_id)`（回傳獲得 unit 數）、`use_ev_unit(p_entry_id, p_stat)`。
  - 每條 client 可直寫欄位都要 `grant update (<col>) on public.<table> to authenticated;`（Rule 54）。
  - plpgsql 變數一律 `p_`/`v_` 前綴、欄位加 alias（Rule 9）。
- **依賴**：Phase 2（資料形狀定案）；需求 14 的 avatar 圖片來源要先確認（見第 4 節）。
- **驗證**：登入後改四招→重開 app 仍在；`information_schema.role_column_grants` 查到新欄；DevTools 見 RPC 200；`Sync.pull` 後 local 不被舊值覆蓋。

### Phase 4 — 照顧規則（需求 2、3）
- **目標**：fullness 0–100，滿 100 後再吃指定數量食物→嘔吐＋HP 加速下降；短時間用藥過量→中毒扣血＋禁藥冷卻。
- **涉及檔案**：`js/pet.js`（主要）、`js/bag.js`（medicine/berries 消耗）、`js/storage.js`（`st.care[uid]` 狀態）。
- **資料結構草案**：`st.care[uid] = { fullness, sickUntil, toxicTickAt, medicineWindow:[ts...], vomitCount }`（局部狀態，唔 sync）。
- **依賴**：Phase 1（medicine 庫存）；觸發數值待確認。
- **驗證**：滿肚再餵 3 次出現嘔吐提示；HP 每 tick 下降速率量測；中毒期間吃藥被拒且有提示；冷卻過後可再用。

### Phase 5 — 好友對戰流程與 Avatar（需求 13、14、16）
- **目標**：選隊→雙方就緒→**Pre-battle 頁**（雙方 Trainer Avatar、所選 Pokémon 依實際隻數排列、WIN/LOSS）→ Battle；戰鬥中擊敗對方 Pokémon 後插入換寵詢問。
- **涉及檔案**：`js/friends.js`、`js/battle/battle.js`、`index.html`（`#view-pre-battle`）、`css/style.css`（overlay 群組）、`js/supabase-auth.js`（avatar RPC）。
- **依賴**：Phase 3（avatar 欄位＋RPC）；13 依賴 14 的資料。
- **驗證**：兩個帳號各選 3 隻→兩邊都見到 pre-battle 且頭像/隻數/W-L 正確→按 Continue 才進 battle；對方未選隊時顯示等待；KO 後跳出換寵詢問且不破壞 Rule 22（switch 仍為下一回合 action）。

### Phase 6 — 橫向裝置提示（需求 15）
- **目標**：進入 Bag／Pre-battle／Battle 時若為直向，顯示「請旋轉裝置」動畫提示；離開到其他頁面前若為橫向，提示轉回直向；已符合方向則不提示。參考截圖：深色條紋背景、手機旋轉動畫、主 CTA＋「Play anyway」次按鈕。
- **涉及檔案**：新 `js/orientation.js`（需加入 `sw.js` ASSETS）或併入 `js/app.js`；`css/style.css`（overlay＋旋轉 keyframes）；三個頁面的 `showView` 進出 hook。
- **依賴**：Phase 1＋5（頁面存在）。
- **驗證**：440×956 直向進入 bag 出提示；轉橫後提示消失；由 bag 返回 home 提示轉回直向；「Play anyway」可關閉且不再重複彈（同一 session）。

---

## 3. 本輪驗證結果（實測）

- **需求 11**
  - 注入 2 個 entry（ownedSpecies `[1,2,3]`、`[4,5,6]`）：status bar 由舊邏輯 `2/151` → 新邏輯 **`6/151`**。
  - 展開 Pokédex sheet：header **`Gen I · Kanto — Unlocked 6 / 151`**，與 status bar 同一分母／同一「解鎖」定義。
- **需求 12**
  - 桌面（pointer: fine）hover Pokédex 按鈕：`getComputedStyle().scale` = **1.03**，只有 hovered 按鈕套用；其他按鈕 `none`；`prefers-reduced-motion` 下停用。
- **需求 1**
  - 觸控模式：App 鍵盤 4 行顯示、貼 display window 底部（gap 2px）；輸入格 `inputMode="none"`；`_kbInsert("a")`＋`_kbInsert("n")`＋backspace → `"a"`（input 事件正常）。
  - 桌面模式：`_isTouchDevice()` false → 鍵盤 `hidden`、input 不改 `inputMode`（實體鍵盤照用）。
  - 捕捉模式（精靈球）下自動隱藏鍵盤。

---

## 4. 需要你確認的規則細節

1. **飽肚嘔吐**：滿 100 後是「累計再吃 3 粒」還是「連續 3 次餵食」觸發？嘔吐後 fullness 歸零還是扣固定值？HP 加速下降的每 tick 幅度與持續時間？
2. **用藥中毒**：幾多次藥／幾分鐘內算過量？扣血速率？禁藥冷卻多長？所有 medicine 都計，還是只有 HP 回復類？
3. **EV point unit**：送回大木博士後轉換率（每隻固定 1 unit？依 EV 總量？）；unit 使用上限（沿用 510 EV cap？）；IV／candy 是否一併保留？
4. **Key items 範圍**：本輪只顯示空分類，還是先放幾個不可用項目（如 Bike / Rod）？
5. **Berries**：對應原作哪幾款（Oran / Sitrus / Cheri…）？各自回復量與冷卻？berries 與「飽肚食物」是否同一批道具？
6. **最愛**：排序「我的最愛」出現在 Pokédex sheet 還是 Bag 的 Pokémon 分頁？星號是否也要在 Battle 選隊／隊伍頁顯示？
7. **送回大木博士**：是否要二次確認？釋放後 exp／candy／favourite 如何處理？若該隻是 active partner 要否先擋？
8. **Trainer Avatar**：用 PokéAPI 哪一類圖（玩家 Trainer sprite？還是選一隻 Pokémon 做頭像）？存 species id 還是完整 URL？
9. **好友對戰**：對方未選隊時 pre-battle 顯示等待還是取消？WIN/LOSS 用好友對戰紀錄，還是 Trainer ladder 數據？
10. **橫向提示**：是否允許「Play anyway」繼續直向玩？每次進入都提示，還是每個 session 只提示一次？離開三個頁面時是否一律提示轉回直向？
11. **鍵盤**：Android 手機是否也要用 App 自帶鍵盤（本輪已對所有觸控裝置套用）？還是 Android 保留系統鍵盤？
12. **換寵詢問**：只在「打敗對方」後問，還是己方戰死後的強制換寵也要同一提示？詢問是否要在對手派出下一隻之前？
13. **戰鬥用道具**：Bag 的 medicine/held items 是否可在戰鬥回合中使用？held item 效果首批做哪些？
14. **Bag 入口**：只從 Battle Menu 入，還是首頁 dock 也要入口？戰鬥中 BAG 按鈕是否本輪就開同一 panel？
