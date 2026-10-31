# PokeEngmon 產品需求文檔（PRD）

> 寶可夢主題嘅英文學習遊戲。用答題換鑽石、抽卡、捕捉同進化寶可夢嘅動機，驅動持續練習英文。
> 目前版本：**1.13.0**（2026-10 · SemVer；發佈由 semantic-release 自動）

---

## 1. 產品定位

| 項目 | 內容 |
|------|------|
| 產品名稱 | PokeEngmon |
| 目標用戶 | 小學生／需要背英文嘅學習者；家長可自行匯入詞庫 |
| 核心玩法 | 答英文題 → 賺鑽石 → 抽卡／捕捉寶可夢 → 進化 → 圖鑑收集 |
| 平台 | Web PWA（GitHub Pages），純前端 + Supabase 後端 |
| 語言 | **全英文 UI**（題目、介面、提示、按鈕都係英文），方便用戶用 Google Translate 學習 |

---

## 2. 核心價值

把「背單字／練文法」呢件苦差，包裝成「養寶可夢」嘅收集養成遊戲：

- **外在動機**：稀有抽卡爽感（快龍扭蛋機動畫）、進化、圖鑑收集、每日練習日曆
- **內在動機**：SM-2 間隔重複演算法，確保記得嘅唔浪費時間重溫，唔記得嘅會按時彈出嚟
- **補救機制**：答錯唔會就咁算，必須入 Power Up Zone 改啱先可以完成回合（教育優先）

---

## 3. 功能模組

### 3.1 答題系統（Quiz）

- 每組最多 **10 題**（`GAME_CONFIG.SET_SIZE`）；某課題到期題唔夠就出細 set，**唔會夾硬充夠**
- 題型（統一由 `Quiz._showFeedback` 處理答對／答錯回應，v114 起新增題型必須共用）：
  - **句子題**：填空（8 欄 CSV），題目圖可選
  - **圖片單字題**：睇圖聽音 → 串字
- 答題支援：
  - **Levenshtein 距離容錯**：接近嘅答案會提示「差 N 個字母」
  - **💡 Hint**：免費，顯示首字母 + 字數
  - **Skip**：當答錯計，入 Power Up Zone
  - **✕ 退出**：任何時候可退出（會彈確認）
- 計分：Perfect（10/10）→ 💎3；8–9 題 → 💎2；7 題 → 💎1；≤6 → 💎0
- 答對後 **650ms 自動跳下一題**；答錯顯示答案解析，**手動撳 Continue**（或 Enter；唔會強制跳走）
- **鍵盤流（v148）**：每題（含圖片單字／Power Up）自動 focus 輸入框；Enter 提交／Continue 後可直接打下一題，唔使滑鼠再撳輸入位

### 3.2 Power Up Zone（改錯強制區，v93+）

第 10 題完成後，錯題**唔直接結算**，要入 Power Up Zone 全部改啱先可以完成回合：

- 三階腳架：
  - 第 1 次仍錯 → 只俾 Hint（關鍵詞高亮 + 提示 + 首字母）
  - 第 2 次仍錯 → 顯示完整解析 + 正確答案，要求重做到啱
- 清除條件：**Levenshtein 距離必須 = 0**（唔係只 exact match）
- 每改啱一題 → +5 EXP 浮字
- 全部改啱後 → 全屏「ALL FIXED」慶祝 pop，先至統一更新錯題嘅 SRS 狀態，再入 WARNING 捕捉頁
- 左上角 ✕ 可退出（會警告「fixes will be lost」）

### 3.3 寶可夢系統

- **拍檔（Partner）**：答題 EXP 固定落入當前拍檔（唔係最新捕捉到嗰隻）
- **回合 EXP 分級制（v130 / v136）**：按 `round(score/total×10)` × 有無用 Hint 對照百分比表發放（短 set 全對＝10/10 檔）；記憶光芒 bonus（答對到期題 ×1.5）在此基礎上額外疊加

| 分數 | 無用 Hint | 有用過 Hint |
|---|---|---|
| 10/10 | 100% | 50% |
| 9/10 | 90% | 40% |
| 8/10 | 80% | 30% |
| 5–7/10 | 50% | 25% |
| 1–4/10 | 30% | 15% |
| 0/10 | 10% | 10% |

- **新手期保底**：拍檔 Lv.1–10 期間 `pct = max(0.50, 分級結果)`，低分回合墊高到 50%，全對無 hint 照攞 100%；每回合下限 10 EXP；無拍檔時固定 12 EXP 入 `pendingExp`
- **圖鑑（Pokédex）**：1–649 全圖鑑（Gen 1–5），5 個世代分頁 + 頂部浮動世代 hub（捲落收起、捲上浮出）；世代圖示用封面傳說（Mewtwo / Ho-Oh / Groudon / Dialga / Reshiram）；未解鎖世代顯示純「?」佔位格（**零圖片請求、零外形洩露、零流量**）
- **世代解鎖（v127）**：初始只有 Gen 1；擁有該代**全部進化鏈（連傳說）** → 自動解鎖下一代，彈慶祝窗
- **GenPack 按需下載（v127）**：世代解鎖當刻先至下載該代資料包（GIF + 叫聲 + 數據 JSON，約 3–11 MB），解鎖前零流量零儲存；下載有進度條，SW cache-first 持久化，斷線下次啟動自動續傳（v1.15.15 起 manifest 亦包該代精靈對戰 atlas（`assets/battle/pkmn/{front,back}`）同全代共用嘅招式動畫 sheets，確保安裝後離線都打得到 Gen2–5）
- **進化**：線性進化（最多 3 階）+ 分支進化（伊貝隨機分支；wurmple / clamperl / tyrogue 等按原作分支）
- **IV/EV**：每隻新抽嘅 IV 隨機 0–31；重複抽到 → +1 可自由分配 EV（單項上限 252、總和 510）
- **等級／進度**：`level` 由 `exp` derive；`stage` 由 `chainKey + exp + dupes + branch` derive（v99 起改為 server-side 權威）
- **稀有度（Gen 2–5 自動計算，v127）**：legend = 官方 legendary/mythical；epic = 最終階段 BST ≥ 600；rare = BST ≥ 500；normal = 其餘。Gen 1 維持手調不變

### 3.4 抽卡系統（Gacha）

- **普通抽已永久移除**（v72）：唔再派普通抽券，回合獎勵只保留鑽石 + EXP
- **稀有抽（唯一抽法）**：耗 💎3，機率 rare 80% / epic 15% / legend 5%
- **世代池（v127）**：抽卡池只含目前最高已解鎖世代；`gacha_pull` RPC 加 `p_gen` 參數，server 用 `max_unlocked_gen(uid)` 二次驗證（防前端亂傳）
- **快龍扭蛋機 UI（v102）**：
  - 主頁撳 💎 → 入快龍頁 → 拖／撳 `#dm-arm` ≥ 72% → 快龍肚仔開艙跌球 → 全屏稀有度爆發動畫 → 檢視卡
  - 檢視卡兩個掣：「💎 ×3 TO GO!」（唔夠鑽會 disabled + 顯示差額）、「‹ Back to Home」
- **服務端權威（v99+）**：`gachaPull` RPC 由 server 原子扣鑽 + roll rarity / chain，前端唔改數值
- **RPC fail（v140）**：已登入且 RPC 已發起但失敗 → **中止**（「try again」），唔本地假派寵；匿名／真離線先至本地 fallback。pendingExp 入帳必須先 snapshot（v138）
- 重複處理：首次解鎖新種 → 拍檔；重複 → EV+1 或糖果+1（視乎稀有度）

### 3.5 捕捉系統（Capture）

- Three.js 3D 場景，投精靈球捉野生寶可夢
- 捕捉成功率 `0.80 + attempts × 0.05`（上限 0.95），server `settle_capture` RPC 決定（防金手指）
- **世代池（v127）**：捕捉池只含目前最高已解鎖世代；`obtain_capture` RPC dex 上限放寬至 649 + server 端世代驗證
- **dex 契約（v135）**：`obtain_capture(p_chain_key, p_dex_id)` 必須傳 **stage1 dex**（場景顯示嗰隻），唔好傳已進化形態；參數用 `p_` 前綴避免 plpgsql 同 column 撞名（42702）
- BGM：WARNING→草叢 0.55，第一下 400ms 內收到 0.32，第 3 下充電撳完拋出後 6.2 秒線性淡出至 0（iOS WebKit 長 ramp 有 bug，用 JS 定時逐格調 gain）
- 捕捉成功唔會自動替換拍檔（避免數據混亂）；首次獲得寶可夢先自動設為拍檔

### 3.6 SM-2 記憶曲線

- 每條題一張 card（`user_cards`），記錄 `next_review_at`、`interval_days`、`ease_factor`
- **間隔梯級**：`[1, 3, 7, 15, 30]` 天；初始 EF 2.5，下限 1.3
- 抽題規則（v95 起）：**只抽到期卡**（`next_review_at <= now`），過期最耐優先，唔夠先補全新題；**未到期卡一律唔抽** —— 某課題做晒後用戶要揀其他課題，唔可以死做刷啱啱做過嘅題
- 「記憶光芒」（彩虹流動橫幅 + 拍檔頭像彈跳）：答對即將到期嘅字 → EXP ×1.5
- 圖片題同句子題共用同一套 SM-2 邏輯，圖片題 SRS key 加 `w:` 前綴避免撞 key

### 3.7 帳戶與同步

- **匿名模式**：首次用 `device_id`（UUID）玩，數據存 localStorage；匿名用戶**唔上傳雲端**（RLS 依賴 `app.device_id` session 變數，PostgREST 設唔到）
- **Google OAuth**：redirect 模式 + `prompt=select_account`（每次必彈帳戶選擇）
  - 首次連接 Google → `import_state` RPC 上傳本地進度（一次性鎖定，鑽石固定 20 粒）
  - 舊 Google 帳戶 → 從雲端拉取；本地有進度會彈覆蓋警告
- **Sign out**：清除本地所有遊戲進度（保留 `device_id` + `customQuestions`），防止切換帳戶時舊數據被誤傳
- **同步策略（v99 起）**：
  - **敏感數值**（鑽石、寶可夢、EXP、IV/EV、糖果）→ 全部行 server RPC，本地唔直寫
  - **非敏感**（trainer name、SM-2 cards / history）→ 背景 queue 非阻塞同步（1s debounce + beforeunload flush）
  - **pull**：page load + 登入後，以本地 `updated_at` 較新為準合併

### 3.8 練習日曆（Calendar）＋ Streak ＋ Gym Challenge

- 顯示每日答題量（顏色深淺）；雲端表 `user_practice_days`（`upsert_practice_day`）
- 連續練習日數：今日未練則由昨日起計仍存活；主頁 ⚡ `xN days`；`bestStreak` 上雲 `report_best_streak`
- **Gym Challenge**：每未領嘅 10 日 milestone（≤ 當前 streak）主頁出按鈕；全題庫隨機 10 題；Hint／Power Up 可用，但**全對且無 hint** 先可 `claim_gym_badge`；徽章用 PokéAPI item sprite（boulder→rising 循環）
- 圖鑑 detail：底欄「Back to Pokédex」關 modal；grid 先返主頁

### 3.9 Leaderboard（v131–v137）

- 主頁 badge chip → Top 50（按持有**進化鏈數** desc）
- `get_leaderboard()` SECURITY DEFINER；anon／authenticated 都可讀；回傳 `gym_badges int[]`
- Partner：sprite + 名由 `partner_exp`／`branch` **derive**（唔信 DB 舊 `level`）；優先 active entry
- YOU 行：本地覆蓋名／拍檔顯示，**排名用 server `total_owned`**（唔用 `collectedCount` 灌水）；名旁顯示 Gym 徽章 icon

### 3.10 家長功能

- CSV 匯入自訂題目（存 `customQuestions`，跨帳戶登出都保留）
- 內建詞庫：`Q_folder/grammar/grammar.csv`（句子題）、`Q_folder/vocab/vocab.csv`（圖片單字題）
- Settings 頁：重置進度（要輸入正確訓練員名先 confirm；名要 `escapeHTML`）、查看版本、匯入 CSV

### 3.11 音效與無障礙

- 全域 BGM：Flat Water（BGM channel），設計基數音量 0.1，捕捉場景暫停、結算 jingle 完後恢復
- 進化場景：先播進化前叫聲 → `assets/bgm/evolution.mp3` 8 秒（同時交替閃動進化前／後 GIF）→ 進化後叫聲 → `assets/bgm/evolution-fanfare.mp3` 5 秒；完結後恢復 Flat Water BGM
- **音量設定（v145–v146）**：Settings 兩個連續滑動條（Music／Sound Effects，0–100%）；`localStorage` `pokeengmon_audio_v1` 持久化（refresh／關網再開都 keep；清進度唔抹）；拖 SFX 停 ~180ms 播 `obtained-pokemon` preview（跟 sfxBus 倍率）
- **UI 掣 click（v147）**：全部 button／chip／menu 短合成 tap（`uiTap`），跟 SFX %；document capture 委派一次
- 答對／答錯 SFX：Web Audio API 合成（兼容 iOS 自動播放限制）
- 圖片題 TTS：Azure `en-US-JennyNeural` rate -10%，本地 mp3 + **v116 起 speechSynthesis 兜底**（mp3 缺失都唔會靜音）
- 寶可夢叫聲：本地 1-151 mp3，僅首次解鎖播放
- 對戰 UI 素材（feat/battle-system branch）：HP 框、對話框、對戰背景、訓練家、精靈球、屬性／狀態徽章、**招式特效圖**均為 Pokémon FireRed/LeafGreen 原裝圖（© Nintendo / Creatures Inc. / GAME FREAK inc.），來源 The Spriters Resource（rippers: redblueyellow、desgardes、Superjustinbros、Spherical Ice、EternalLight、wormintheworks）及 pret/pokefirered decomp；存於 `assets/battle/ui/`、`assets/battle/fx/`、`assets/trainers/`；對戰字體用 DotGothic16（Fontworks，SIL OFL，Google Fonts，存 `assets/fonts/dotgothic16-latin.woff2`）
- 對戰文字全英文（Gen 3 風格："X used Y!"、"It's super effective!"、"X fainted!"）；命中音效跟 PokeRogue `se/` 取樣（`hit` / `hit_weak` / `hit_strong`，按相剋強弱選）
- **逐招原裝動畫（v1.12.7）**：536 招使用 Pokémon Reborn / PokeRogue 的 `battle-anims` 影格資料（`assets/battle/anim/<slug>.json` + `sheets/` 96px spritesheet，60fps、GRAPHIC 圖層、focus anchor、blend/mirror/angle 全保留），由 `js/battle/moveanim.js` 播放；v1.15.17 補埋 PokeRogue 冇資源嘅 27 招（surf / confusion / rest / transform / snowscape / sludge-wave / trick-room 等），**唔新增任何 PNG**，全部由 `tools/gen_missing_anims.js` 重用現有 PRAS sheets 重新編排影格，**563 招全部有動畫，再冇 fallback**。素材來源 `pagefaultgames/pokerogue-assets`（beta）；all Pokémon artwork © Nintendo / Creatures Inc. / GAME FREAK inc.
- **PokeRogue 對戰精靈圖 + 召出／換寵流程（v1.13.0）**：對戰畫面上我方用 back sprite、對手用 front sprite，素材為 PokeRogue 動畫圖集（Gen 1-5，1-649，`assets/battle/pkmn/<side>/<dex>.png` + `index.json` atlas 影格，由 `tools/fetch_pkmn_sprites.py` 抽取；v1.15.14 補齊 152-649），由 `js/battle/sprites.js` 以 canvas 逐幀播放（frameRate 10，跟 PokeRogue）。召出流程抄 PokeRogue `SummonPhase`：拋球 650ms 水平飛 → 150ms Cubic.easeOut 落定 → 500ms 自轉 1440°/Cubic.easeIn 跌落 → 開球閃光音效 → 精靈 scale 0.5→1（250ms Sine.easeIn）+ 球色 tint 淡出；HP 資訊框跟 `showInfo`/`hideInfo` 滑入（1000ms Cubic.easeOut）／滑走（500ms Cubic.easeIn）。換寵跟 `leaveField`：舊寵即時消失（無 FRLG 紅光收回）→ HP 框滑走 → 拋新球召出。
- **PokeRogue 對戰文字框／字體／音效（v1.14.0）**：對話框改用 PokeRogue `ui-window`（`images/ui/bg.png` 320×48 style 1）9-slice（`borderSize 8` → 13px）；文字用 `TextStyle.MESSAGE`（`pokemon-emerald-pro.ttf`＝PokeRogue "emerald" 字體，#f8f8f8 字 + #6b5a73 影，shadow 4,5 @96 ≈ 字高 4~5%）；打字機 delay 20ms／字（`MessageUiHandler` 預設），打完先跟尾出 `prompt` 精靈（7×9 4 幀）；SFX 全部取 PokeRogue `audio/ui`、`audio/se`（`select`、`pb_throw`、`pb_rel`、`hit`／`hit_weak`／`hit_strong`、`faint`、`stat_up`／`stat_down`，經 `CaptureAudio.playOnce` 走 SFX 音量）。素材來源 `pagefaultgames/pokerogue-assets`（beta）；字體版權見 `assets/fonts/`。
- **PokeRogue 換精靈頁 + 文字框排版（v1.15.0）**：底部改為 PokeRogue 原版排版 —— message window 全寬（高 = 闊度 15%）、command window 冚喺右邊上面（冇中間縫），講對話時成個 command window 收埋。撳 POKéMON 入換精靈頁，UI/UX 全抄 PokeRogue `PartyUiHandler`（320×240 design 等比縮放，`container-type: inline-size` + cqw 單位）：`party_bg` 冚底部 75%；出戰緊嗰隻喺左邊大格 `party_slot_main` (9,91.5) 110×49；後備右欄 5 格 `party_slot` x=143、top=44+28i 175×24；訊息框 (1,209) 262×30 顯示 "Choose a Pokémon."；右下 CANCEL 掣（中心 (291,224) 52×16 + `party_pb`）；暈咗用 `_fnt` 幀、HP 條／數值收埋；格子內部照抄偏移（icon 中心 (4,4)、名 (24,10)、Lv label (32,22)、HP 條 (8,31) 100×7 + `party_slot_hp_overlay` 按 ratio 橫向壓縮、HP 數值右對齊 (105,36)；後備格名 (21,2)、HP 條 (72,6)）；點格 → 右下 options window（SEND OUT / CANCEL，`addWindow` 闊 ≥94、高 16n+13）→ SEND OUT 接現有拋球換寵流程；暈咗強制換寵時冇 CANCEL。素材 `assets/battle/party/` 來源 `pagefaultgames/pokerogue-assets`（beta）。
- **AI 訓練家梯隊（v1.15.15）**：10 個訓練家逐個解鎖（擊敗前一個先開下一個），由 Lv.5 Youngster Timmy 一路升到 Lv.82 Champion Alder；後 5 個用 Gen 2–5 精靈砌隊（Rival Ethan → Gym Leader Jasmine → Champion Steven → Champion Cynthia → Champion Alder）。開戰前會 `ensureGenDataLoaded()` 載入對應世代圖鑑資料，避免未解鎖世代嘅 stats／屬性算唔到。
- **精靈特性系統（v1.15.16）**：`data/abilities.json`（PokeAPI 非隱藏特性，slot 1 預設，`tools/fetch_abilities.py` 抽取，649 隻全齊）＋ battle engine 實裝 16 個常見特性 —— 免疫類：Levitate（地面）、Volt Absorb（電，吸返 1/4 HP）、Water Absorb（水，吸返 1/4 HP）、Flash Fire（火，吸後自己火招 ×1.5，換走消失）、Lightning Rod（電，SpA+1）；數值類：Huge Power／Pure Power（攻 ×2）、Guts（異常時攻 ×1.5 且 burn 唔扣攻）、Thick Fat（火冰傷半）、Overgrow／Blaze／Torrent／Swarm（HP≤1/3 對應屬性 ×1.5）、Unaware（無視對方 stat stage）；觸發類：Intimidate（上場對手攻 -1）、Sturdy（滿 HP 致命傷留 1）、Speed Boost（回合完速 +1）；防禦類：Hyper Cutter（攻唔會被降）、Insomnia／Vital Spirit（唔瞓）、Limber（唔麻痺）、Immunity（唔中毒）。特性觸發全部有對戰文字訊息。同期修咗三個遺留 bug：`stat_changes` 嘅 PokeAPI stat 名（`attack` 等）從未 map 落 `statStages.atk` → 所有升降能力招形同虛設；屬性 0 倍免疫被 min-1 clamp 夾成 1 傷；status 類異常招（Spore／Thunder Wave 等）`ailment_chance=0` 被當 0% → 從未中過（依 PokeAPI 慣例改為必中附加）；burn 減攻 double-dip（effectiveStat × computeDamage 各減一次 → ×0.25）改為只喺 computeDamage 減一次。
- **場地效果系統（v1.13.0，Gen 5 規則）**：**天氣** —— Sunny Day／Rain Dance／Sandstorm／Hail／Snowscape 開 5 回合天氣（互斥、新蓋舊，同一天氣重出失敗）；晴天火招 ×1.5／水招 ×0.5，雨天反轉；沙暴回合末磨非岩／地／鋼寵 1/16 HP，雹磨非冰寵 1/16 HP；Solar Beam 雨／沙／雹下威力減半，Thunder 雨天必中，Blizzard 雹天必中，Weather Ball 跟天氣轉屬性（火／水／岩／冰）兼威力 50→100。**場地陷阱** —— Spikes 撒對面最多 3 層（換入分別扣 1/8、1/6、1/4 max HP，飛行屬性／Levitate 免疫）、Stealth Rock 按岩屬性對換入寵相性 ×1/8 max HP 扣血（4× 弱岩直接半血）；換入先食釘子、後觸發上場特性（Gen 順序），釘死直接入 faint 流程。**光牆／反射壁** —— 開喺自己嗰邊 5 回合，Reflect 物理傷半、Light Screen 特殊傷半，critical hit 無視壁。對戰畫面中上位置有場地狀態 chip 列：天氣 icon＋回合倒數、雙方各自 Reflect／Light Screen 回合數、Spikes 層數、Stealth Rock 標記，無場地效果時收埋。
- 無障礙：`user-scalable=no` 已移除；所有 hover 動效只用 `@media (hover:hover)` 觸發；支援 `prefers-reduced-motion`

---

## 4. 經濟系統

| 資源 | 獲得 | 消耗 | 邊個控制 |
|------|------|------|----------|
| 💎 鑽石 | 答題獎勵（server RPC；匿名／離線 fallback 用相對門檻 `==total→3 / ≥total-2→2 / ≥total-3→1`） | 稀有抽 💎3 | server（登入 RPC fail 唔本地假加鑽） |
| ⭐ 星星 | 重複抽到同種（每 5 次 +1⭐） | — | server derive |
| 🍬 糖果 | rare 重複 | 進化 | server |
| EXP | 答題 + Power Up 改錯 | 升級／進化 | server derive |

**所有敏感數值都係 server 權威**（v99 起），前端只能睇、唔能改。

---

## 5. 非功能需求

| 項目 | 要求 |
|------|------|
| 離線可用 | Service Worker 容錯式逐個快取（唔用 `caches.addAll`）；答題可離線，同步排隊等上線 |
| 自動更新 | SW `skipWaiting` + 前端偵測 `controllerchange` → 自動刷新；**唔再有用戶確認彈窗** |
| 防金手指 | 鑽石／捕捉率／抽卡／EXP 全部 server RPC；column-level grants 收回 anon 直寫；每個 RPC 用 `auth.uid()` 驗證 |
| 隱私 | 只用 Google OAuth 取 uid + email；匿名模式唔上傳任何答題記錄 |
| 效能 | 純靜態前端 + Supabase；圖片 `object-fit: contain` 響應式高度 `clamp(180px, 27dvh, 260px)` |
| 兼容 | Chrome / Edge / Safari 最新版；iPhone Safari 特別處理（Web Audio、TTS、安全區） |
| 無障礙 | WCAG AA 對比度；支援 `prefers-reduced-motion`；可放大縮小 |

---

## 6. 版本演進要點

| 版本 | 重點 |
|------|------|
| v1–v47 | 基礎答題 + 寶可夢收集 |
| v48 | 取消普通抽，改為答題直接派寶可夢 |
| v72 | 永久隱藏普通抽，回合獎勵只剩鑽石 + EXP |
| v83 | Sign out 清除本地進度（防 cheat） |
| v86 | Google OAuth 加 `prompt=select_account`，每次必揀帳戶 |
| v87 | 加 `supabase-config.js` 修復 GitHub Pages 404 |
| v91 | 修復 `uidGen` 非 UUID → user_entries push 400 |
| v92 | 修復 upsert 缺 `resolution=merge-duplicates` → 409 |
| v93 | **Power Up Zone** 強制改錯機制 |
| v95 | SM-2 抽題改為「只抽到期卡」，唔再 backfill |
| v99 | **安全硬化**：column-level grants、RPC 全部 server 權威、敏感欄收回 anon 寫權 |
| v100–v102 | 快龍扭蛋機抽卡 UI（拖手臂、稀有度爆發、檢視卡） |
| v106–v108 | Import 一次性鎖定 + server clamp；移除本地 Import/Export Save UI |
| v109 | 「All caught up」常駐彈窗（代替 3 秒 toast） |
| v112 | **Q_folder 重構**：所有題型集中放 `Q_folder/<type>/`，附帶 CSV + images + audio |
| v113 | 修復 gacha 抽 lv1 寶可夢冇招式（Sync.pull 要 await loadPokemonDex） |
| v114 | **統一答題回應**：所有題型必須經 `Quiz._showFeedback`，新增題型唔可以另起爐灶 |
| v115 | 圖片題 TTS mp3 搬入 `Q_folder/vocab/vocab_audio/`，補返缺失嘅 `wordAudioURL()` |
| v116 | **TTS 兜底**：mp3 缺失時自動用瀏覽器 speechSynthesis 讀出，保證唔會靜音 |
| v117 | 內建 fallback 題（data.js QUESTION_BANK）全數遷移入 grammar.csv，題目統一由 CSV 驅動 |
| v119 | Settings 自訂題教學彈窗加「AI出題指引.md」超連結（新分頁打開） |
| v120 | 全域 BGM 音量 0.4 → 0.25 |
| v127 | **Gen 2–5 世代擴充**：+498 隻（#152–649）、世代解鎖制（儲齊全鏈開下一代）、GenPack 按需下載、圖鑑 5 代分頁 + 浮動 hub、未解鎖世代純「?」格、SQL 遷移（`chain_rarity.gen`、`gacha_pull(p_gen)`、`obtain_capture` 放寬 649） |
| v130 | 回合 EXP 分級制：按分數 × 有無用 Hint 對照百分比表；拍檔 Lv.1–10 保底 50% × levelSpan |
| v131 | Leaderboard Top 50 prototype（主頁 chip 入口） |
| v132 | Leaderboard live RPC：`get_leaderboard()` SECURITY DEFINER；anon 可讀 |
| v133–v134 | Leaderboard：partner sprite（`EVOLUTION_CHAINS.find`）；RPC 回傳 `partner_exp`／`branch` |
| v135 | 捕捉：`obtain_capture` 傳 stage1 dex；SQL 參數改 `p_chain_key`/`p_dex_id` 修 42702 ambiguous |
| v136 | 短 set EXP：`round(score/total×10)` 正規化，5/5 全對攞 100% span（唔再當 5 分落 50% 檔） |
| v137 | Leaderboard：partner Lv 由 exp derive（唔再用 DB 舊 level）；YOU totalOwned 用鏈數，唔再用 collectedCount 灌水 |
| v138 | Gacha fallback：`pendingExp` 先 snapshot 再清零，RPC 唔再永遠傳 0 |
| v139 | 鑽石 offline fallback 跟 server 相對門檻；reset modal escapeHTML 防 XSS |
| v140 | 登入 RPC fail 唔再 silent 本地派寵／加鑽；Sync.pull 先 normalize dex_ 再 load gen；ownedSpecies null 自動 repair |
| v141 | RARITY fallback 改 `|| RARITY.normal`（舊 `"common"` key 唔存在會白屏） |
| v144 | 全域 BGM 換 *Flat Water*（BGM channel），音量 0.1；移除 One Summer's Day |
| v145 | Settings 連續滑動條調 Music／SFX（0–100%）；`pokeengmon_audio_v1` 本地持久化 |
| v146 | SFX slider debounce preview：`obtained-pokemon.mp3`（停上一段防疊聲） |
| v147 | 全部 UI 掣短 click SFX（`CaptureAudio.uiTap` + document capture 委派） |
| v148 | 答題／Power Up 每題自動 focus 輸入框（含圖片題），鍵盤連續打字 |

---

## 7. 未來方向（暫唔做，留記錄）

- Gen 6–9 擴充：PokeAPI 官方動態 GIF 只覆蓋到 #649，Gen 1–5 已到位，Gen 6+ 要另搵素材來源先至做
- 鑽石獎勵曲線調整、回合長度選擇（5/10/20）、未擁有物種加權抽獎（v72 UX review 否決）
- `award_round_diamonds` 回合真實性驗證、`obtain_capture` 回合證明、`add_entry_exp` 速率限制（已記低，未排期）
