---
name: pokeengmon-prototype
description: How to build a PokeEngmon prototype / 設計稿 / mock-up for the user to review. Read BEFORE writing any prototype file (tools/prototype/*), whenever the user says "做個 prototype 俾我睇", asks for a design draft, or a new feature needs a visual check. Covers the real-app injection pattern (build.mjs + early.js + proto.css/js), seeding demo state with real functions, the inventory of in-game Pokémon assets to use, the anti-"AI look" checklist, edge-state checklist, verification at 440×956 and 1280×800, and how to hand the URL to the user.
---

# PokeEngmon Prototype（設計稿）做法

> 幾時讀：寫任何 `tools/prototype/*` 之前；用戶話「做個 prototype 俾我睇」；新功能要先俾用戶睇樣。
> 相關 Rule：118（高保真、載真 CSS／markup）、121（localhost 要註銷真 SW）、122（本 skill 由來：唔用遊戲現有嘢、AI 味、圖睇唔到、改錯地方）。事故原文 `references/incidents.md`。

## 0. 一句講晒

**Prototype ＝ 真 app ＋ 你嘅改動。** 唔好開一頁新 HTML 自己仿外觀。用戶要睇嘅係「呢個功能放入遊戲之後係點」，唔係一張獨立 mock。

## 1. 動手前：先盤點，唔好估

逐項答清楚先開始畫：

1. **呢樣設定而家喺邊度？** Grep state 欄位同模組。例如隊伍已經喺背包（`st.myTeam`、`BagUI.getTeam()`、`BagUI.open()`），頭像已經有 `Avatars.mine()`／`Avatars.openPicker()`，PvP 戰績係 `st.pvpWins`／`st.pvpLosses`。**已經有地方設定嘅嘢，新畫面只顯示＋連過去，唔好再整一個編輯器。**
2. **流程會唔會變？** 例如「有 My Team 就唔使再開揀隊頁」：prototype 要真係改流程（monkeypatch `BattleUI._.openTeamSelect`），等用戶試到。
3. **畫面喺邊個容器入面？** App 全部畫面都喺紅色 Pokédex 外框（`.frame-screen`）入面；battle menu 等係 display-window overlay。開真 app 睇一次（第 5 節嘅 URL），截圖對照，先決定落點。
4. **唔好作數據。** State 冇嘅嘢（例如連勝）唔好擺上畫面；要加就喺交付時寫明「需要新欄位」。

## 2. 做法（揀一個）

### A. 真 app 植入（預設；改現有畫面／流程都用呢個）

抄 `tools/prototype/battle-menu/`（或 `incubator/`）：

| 檔 | 做咩 |
|---|---|
| `build.mjs` | 讀真 `index.html` → `<head>` 最前插 `<base href="../../">`＋`early.js`；`</body>` 前插 `proto.css?v=時間`／`proto.js?v=時間` → 寫 `tools/prototype/<名>-app.html`。**改完 css／js 要再跑一次**（cache-busting）。 |
| `early.js` | localStorage 加 namespace（`proto_<名>:`，唔郁用戶真存檔）、停 SW 註冊、localhost 註銷現有 SW（Rule 121）。直接抄最新 `incubator/early.js`，只改 namespace。 |
| `proto.js` | ① seed 示範存檔（用真函數）② 跳過登入閘（包 `App.openLoginHub`）③ 植入新 DOM（插喺真 markup 旁邊）④ monkeypatch 流程（`BattleUI._.xxx`、`BagUI.close` 等，經 `B.xxx` 物件屬性 call 先包得到）⑤ 🧪 dev panel 切換狀態 ⑥ 開機自動去要睇嘅畫面。 |
| `proto.css` | 只寫新部件；現有畫面一粒 CSS 都唔重寫。**CSS 入面 `url()` 係相對 CSS 檔**（`../../../assets/...`），唔係相對 `<base>`。 |

### B. 單一畫面（DOMParser）

只係睇一個靜態畫面、唔使跑 app 邏輯：跟 Rule 118，`tools/prototype-ted.html` 做法（`fetch("index.html")` 攞 `#app`）。

**禁止**：自己寫一頁 HTML 仿 app 外觀、自己畫卡片／漸變／emoji icon。

## 3. Seed 示範存檔（坑）

- 用真函數：`obtainPokemon(chainKey, "rare")`，再設 `stage`／`level`／`pet.hp`／`pet.status`；`st.myTeam` 放 uid。
- **進化閘**：等級高過進化等級會即刻彈進化畫面（Pikachu Lv34 → Raichu）。要嘛 seed 已進化嘅 `stage`，要嘛等級低過門檻。
- **能量閘**：新存檔能量 0，打 Trainer 會被擋。`App.init` 會重算 ledger，所以要喺開機**之後**先補（`Energy.status(st); st.energy.points = 50; saveState()`）。
- **Seed 版本號**：`SEED_V` 改咗就重置舊 prototype 存檔，唔好叫用戶清 localStorage。
- 名同頭像：`early.js` 開 `window.__protoRawGet` 讀本機真 app 存檔（`STORAGE_KEY`），有就用用戶真嘅 `playerName`／`trainerAvatar`；冇就用 app 預設（`The PokéEngmon Trainer`），**唔好自己作個名（例如 Ash）**——用戶會以為綁錯欄位。dev panel 加輸入格試長名。

## 4. 遊戲現有素材（優先用呢啲，等畫面似 Pokémon）

| 素材 | 路徑 | 用法 |
|---|---|---|
| 戰鬥場景（有雙方草地台） | `assets/battle/ui/bg-{grass,cave,sand,water,…}.png`（240×112） | 人物／Pokémon 企喺台上；我方台喺左下（x 2%–51%），對面台 x 46.7%–100%、y 40–80%，要冚就冚晒 |
| PokeRogue 視窗 9-slice | `assets/battle/ui/pr-window-1.png`，`border: 8px solid transparent; border-image: url(...) 8 fill stretch` | 資料框、小牌、提示；白字 `#f8f8f8`＋影 `#6b5a73` |
| 戰鬥字體 | `font-family: "PokeRogueEmerald", "DotGothic16", monospace` | 數字、Lv、標籤（Inter 留俾長句） |
| HP 條色 | 綠 `#58d080`／黃 `#f8c030`／紅 `#f05848`；細條直接用 `.bag-minihp`（`.mid`／`.low`／`.faint`） | 任何「比率」條 |
| 狀態／屬性 icon | `assets/battle/ui/status-{brn,par,slp,frz,psn,tox,fnt}.png`、`type-*.png` | 隊伍格、資料框 |
| Pokémon | `animatedURL(dex)`（`assets/animated/<dex>.gif`，同背包 My Team 一樣）、`spriteURL(dex)` | 用 `entryCurrentSpecies(e)` 攞現時形態 |
| 訓練員頭像 | `Avatars.url(id)`／`Avatars.mine()`；全身像 80×80，`image-rendering: pixelated` | **直接企喺場景上，唔好用深色框包住** |
| Poké Ball | `assets/battle/ui/poke-ball-big.png`（12×12）、`assets/items/poke-ball.png`、`assets/battle/party/party_pb.png` | 標題 icon、空格 |
| Party 介面 | `assets/battle/party/party_*.png`（CSS 見 `.party-slot`） | 隊伍相關 |
| 徽章 | `assets/badges/1–16.png` | 成就／Trainer Card |

**外框語言**：背包嗰套 ——`#1b1b22` 2px 粗邊、`#e03a32` 紅、米白 `#fbf7ec`、實心底影 `0 3px 0 #1b1b22`、號碼牌 `#2b5cb8`（隊長紅）。新部件同背包／Pokédex 一致，唔好另起一套。

## 5. 反「AI 味」檢查（交之前逐項過）

- [ ] 冇通用 dashboard 部件：圓環圖、KPI 數字卡、漸變 glow、玻璃擬態、emoji 當 icon。
- [ ] 數據用遊戲比喻表達：勝率 → 戰鬥資料框＋HP 式條；隊伍 → 背包隊伍格；人物 → 企喺戰鬥台。
- [ ] Sprite 有「地」企（草地台／陰影），唔係浮喺色塊入面；冇深色方框包住人物。
- [ ] 數字、Lv、標籤用 PokeRogueEmerald；全部素材 `pixelated`。
- [ ] 顏色只用 app 現有色（上表＋`css/style.css`），冇新嘅 pastel／紫藍漸變。
- [ ] 新部件同隔籬現有部件睇落係同一個遊戲。
- [ ] **每個視覺元素代表一樣獨立資料**：唔好將同一個數字畫兩次（例如 62% 再畫一條 62% bar）。諗唔到有意義嘅數據就唔好擺，或者喺 plan 提出新數據（例如 Trainer Lv）並用 dev panel 俾用戶比較方案。
- [ ] 撳得嘅嘢直接撳（例如撳頭像就換），唔好額外加「CHANGE」之類嘅掣。
- [ ] 現有畫面冇用／重複嘅部分（例如厚 hero 寫滿冇用 info）可以提議拎走或者合併，唔好淨係喺下面加嘢。

## 6. 細節檢查（狀態要齊）

- [ ] 空（0 隻／未設定）、部分（1–5 隻）、滿（6 隻）。
- [ ] Pokémon 格要有名（唔可以淨係 sprite＋Lv）；長名 ellipsis。
- [ ] 標籤同數值擺同一行（`PvP WIN RATE …… 62%`），唔好上下疊浪費高度。
- [ ] 異常：Faint（灰＋FNT、跳過；「隊長」標記跟第一隻未暈嘅）、狀態異常 icon、低 HP 色。
- [ ] 未登入／0 場／有戰績三種文案。
- [ ] 深色 modal（例如 tier picker）入面嘅新字對比夠唔夠。
- [ ] 背景素材有冇漏出（例如對面草地台喺資料框兩邊露出）。
- [ ] 文字唔斷行、唔重疊；長名 ellipsis。
- [ ] 觸控範圍 ≥ 32px；`:focus-visible`；`prefers-reduced-motion` 關動畫。
- [ ] 寬版（≥ 620px／desktop 兩欄）用 `@media` 調比例，唔好同時寫 `left`＋`right`＋`width`（`width` 會贏，`right` 無效）。

## 7. 驗證

1. `preview_start {name: "static-proto"}`（8094）。
2. 開 `http://localhost:8094/tools/prototype/<名>-app.html`；440×956 同 1280×800 各行一次**完整流程**（入口 → 改設定 → 返嚟 → 開戰等）。
3. 導航後第一張截圖可能係過場（半透明重疊），再影一張先判斷。
4. Console：Supabase 401（未登入）係預期；其他 error 要處理。
5. 用 JS 讀 state 證明流程（例如 `BattleUI._.S.teamEntries`、`team-select-modal` 冇開）。

## 8. 交付

- 喺 Browser pane 開住，並俾 URL。**唔好叫用戶喺檔案預覽開 HTML**：檔案預覽唔經 server，相對路徑嘅圖全部睇唔到。
- 講清楚：邊啲係 prototype 先有（monkeypatch、dev panel），邊啲正式做要改邊個檔，有冇要用戶決定嘅（新欄位、規則）。
- 唔郁正式檔（`index.html`、`js/`、`css/`）；prototype 檔放 `tools/prototype/`，唔會 deploy（`tools/deploy/site-files.json` 冇列）。
