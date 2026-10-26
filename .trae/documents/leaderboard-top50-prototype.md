# Leaderboard Top 50 Prototype 實施計劃

## Summary
喺主頁 topbar 鑽石 chip 旁加一個 Pokémon gym badge 風格嘅 icon chip 作為入口，點擊後進入全屏 Leaderboard 頁，顯示 Top 50 訓練員：排名、訓練員名、partner 寶可夢（動態 sprite + 名）、partner 等級、持有寶可夢總數。**Partner 定義 = 每個用戶當前親自設定嗰一隻 active 拍檔**（本地玩家 = `getActiveEntry()`；未來真後端 = `user_entries.active = true` 嗰條 entry），唔係等級最高/最新捕捉嗰隻。排名準則 = 持有寶可夢總數（desc）。Prototype 階段用 deterministic mock data，唔改 Supabase；真實玩家（本地 state）會插入排名並 highlight，增加真實感。版本 v130 → v131（app.js / sw.js / index.html 三處同步）。

## Current State Analysis（已核實）
- **Topbar 入口位**：[index.html](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/index.html#L31-L35) L31-35 `.topbar-res` 內有 `#btn-top-diamond`（chip）+ `#btn-login`（🔐）+ `#btn-settings`（⚙️）。新 badge chip 插喺鑽石 chip 之後、🔐 之前。
- **全屏頁 pattern**：[index.html](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/index.html#L232-L246) `view-pokedex` — `<section class="view">` + 內容 + `.hub-spacer` + `.hub-bar` 底部返回掣；切換用 [app.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/app.js#L14-L24) `App.showView(id)`；open 流程參考 [pokedex.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/pokedex.js#L19-L26) `Pokedex.open()`。
- **返回掣綁定**：[app.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/app.js#L1062-L1067) L1062-1067（`btn-home-pokedex` / `btn-dex-back` 等）。
- **Sprite 資源**：[data.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/data.js#L32-L36) `animatedURL(id)` = 本地 `assets/animated/{id}.gif`（1-151），onerror fallback 去 `spriteURL(id)`（remote PNG）。同 `renderHome()` hero-sprite 用法一致。
- **寶可夢名（唔使 load POKEMON_DEX）**：`EVOLUTION_CHAINS` 每條 chain `stages: [[dexId, enName, zhName], ...]`，mock 直接由呢度抽，避免 async dex 載入依賴。
- **玩家數據**：[storage.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/storage.js#L19-L23) `loadState().entries`（每條 entry 有 `ownedSpecies: [dexId]`）、`st.playerName`、`getActiveEntry()`、`entryCurrentSpecies(entry)` → `[dexId, name]`。持有總數 = 所有 entry `ownedSpecies.length` 總和（species 唔會跨鏈重複）。
- **Chip 樣式**：[style.css](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/css/style.css#L56-L64) `.chip` / `.chip-diamond` / `.chip-ticket` / `.chip-btn` 可直接複用。
- **版本現狀**：`APP_VERSION = "v130"`（app.js L6）、`CACHE_NAME = "pokeengmon-v130"`（sw.js L2）、index.html 全部 `?v=130`（css L22 + scripts L329-345）。sw.js ASSETS 用容錯式逐個 cache，新 js 檔要加入清單。

## Proposed Changes

### 1. `index.html`
- **入口 chip**（`.topbar-res` 內，`#btn-top-diamond` 之後）：
  ```html
  <button class="chip chip-btn chip-badge" id="btn-top-leaderboard" aria-label="Leaderboard" title="Leaderboard">
    <!-- inline SVG gym badge（八角徽章 + 中間圓心，金/藍配色） -->
  </button>
  ```
- **新增 `view-leaderboard` section**（仿 view-pokedex 結構）：
  - 標題 `🏅 Leaderboard` + 副標 `Top 50 Trainers · Ranked by Pokémon owned`
  - `#lb-you`：玩家排名卡（僅當玩家喺 Top 50 以外先顯示，sticky 喺列表上方）
  - `#leaderboard-list`：排行榜行容器
  - `.hub-spacer` + `.hub-bar` > `btn-lb-back`「‹ Back to Home」
- **script tag**：`<script src="js/leaderboard.js?v=131"></script>` 放 `pokedex.js` 之後、`app.js` 之前；頁內所有 `?v=130` → `?v=131`（css + 全部 script）。

### 2. `js/leaderboard.js`（新檔）
- `const Leaderboard = { open(), render(), _mockRows(), _playerRow() }`，唔自綁事件（統一由 app.js 綁，同其他 screen 一致）。
- **Mock 數據**：定死 seed 嘅 mulberry32 PRNG 生成 50 行 —— 每次 reload 一致，唔會閃爍：
  - 名：內置 pool（宝可夢風 trainer 名 + 常見英文名，全英文）
  - partner：由 `EVOLUTION_CHAINS` 隨機抽 chain + stage（直接攞 dex id + 英文名）
  - `partnerLevel`：1–100 加權（中間高等級多啲）
  - `totalOwned`：1–151 加權分佈，保證排序後有梯度
- **玩家行 `_playerRow()`**：`loadState()` → 總數 = Σ `ownedSpecies.length`；partner = **`getActiveEntry()`（玩家當前設定嘅 active 拍檔）** → `entryCurrentSpecies()`；名 = `st.playerName`；無 partner 顯示 "—"、level 顯示 0；標記 `isYou: true`。
- **Mock 用戶嘅 partner**：代表「嗰位訓練員當前設定嘅拍檔」，由 mock 數據直接賦值（隨機抽 chain + stage 後固定）。
- **合併排序**：mock 50 + player → `totalOwned` desc（平手 → `partnerLevel` desc）→ slice 首 50。玩家入到 Top 50 就喺列表內 highlight；入唔到就喺 `#lb-you` 顯示實際名次（e.g. "Your Rank: #57"）。
- **行 HTML**（grid）：rank（#1-3 用 🥇🥈🥉，其餘數字）→ sprite `<img>`（`animatedURL` + onerror → `spriteURL`，`loading="lazy"`）→ trainer 名 + `· partner 名` → `Lv.X` → 總數 + `Pokémon`。
- 全英文 UI（項目硬規則）；無 POKEMON_DEX async 依賴，`open()` 即時 render。

### 3. `css/style.css`
- `.chip-badge`：金色徽章調（border `#ffd54f` / background `#fff8e1`，同 chip-ticket 同族），內嵌 svg 20×20px。
- `.lb-row`：卡片式 grid `44px 52px 1fr auto`，zebra 底色；Top 3 金/銀/銅背景 tint + rank 放大；`.lb-you` 藍邊 highlight。
- `#lb-you`：sticky top 卡（圓角、藍調背景、陰影）。
- Sprite `image-rendering: -webkit-optimize-contrast`（跟現有 sprite 規則 L71 一齊加 selector 或獨立 rule）。
- RWD：<360px 收細 sprite / rank 欄。`.hub-bar` / `.hub-spacer` 複用現有樣式，唔使新寫。
- Rows 非互動元素，唔加 hover 動效（符合項目 hover 規則）；badge chip 本身行 `.chip-btn` 現有 transition。

### 4. `sw.js`
- `CACHE_NAME` → `"pokeengmon-v131"`。
- `ASSETS` 加 `"./js/leaderboard.js"`（容錯式逐個 cache 機制下安全）。

### 5. `js/app.js`
- `APP_VERSION` → `"v131"`。
- 按鈕綁定區（L1062-1067 附近）加：
  - `btn-top-leaderboard` → `Leaderboard.open()`
  - `btn-lb-back` → `this.renderHome(); this.showView("view-home");`（同 btn-dex-back 一致）

### 6. Commit + push
- 用 `python tools/git_commit_push.py` 一鍵提交推送（commit message：`feat: leaderboard top 50 prototype — mock data, ranked by Pokémon owned (v131)`）。

## Assumptions & Decisions
- **Mock data only**：今次唔改 Supabase。未來真後端需要 `SECURITY DEFINER` 嘅 `get_leaderboard()` RPC（而家 RLS 擋 cross-user read）+ 新 migration 檔 —— 列為 follow-up，唔喺今次範圍。RPC 到時會讀每個帳戶 `user_entries.active = true` 嗰條 entry（即係用戶當前設定嘅拍檔）嘅 current species + level。
- **Partner 欄定義**：每個用戶**當前設定嘅 active 拍檔**（唔係最高等級/最新捕捉）。本地玩家行用 `getActiveEntry()`；`user_entries` 表本身已有 `active boolean` 欄支援。
- **排名準則**：持有寶可夢總數（用戶已確認）。
- **「持有總數」定義**：Σ 每條 chain entry 嘅 `ownedSpecies` 長度（species 唔跨鏈重複，總和 = 圖鑑進度）。
- **Badge icon**：inline SVG gym-badge（八角星徽章），唔用 emoji、唔加新圖檔資產，貼合「用 Pokémon badge icon」要求且任何分辨率清晰。
- **玩家插入 mock 排名**：prototype 即刻有「自己喺榜上」嘅感覺；真後端上線時無縫替換。
- UI 全部英文（項目硬規則）；文件/註釋可以中文。

## Verification
1. 本地開 `index.html`：主頁鑽石右邊出現 badge chip；點擊入 Leaderboard 頁，50 行 mock + 玩家 highlight（或 `#lb-you` 卡）正常顯示；sprite 圖正常（包括 onerror fallback）。
2. 「‹ Back to Home」返回主頁正常；hub-bar 喺 iPhone 安全區位置正常。
3. Console 無 error（特別留意 `Leaderboard` 未定義 / sprite 路徑 404）。
4. 三處版本號一致 v131（app.js / sw.js / index.html 全部 `?v=`）。
5. push 後 GitHub Pages 部署，SW 自動更新（skipWaiting 機制），hard refresh 確認新版。
