# PokeEngmon 架構文檔（ARCH）

> 純前端 SPA + Supabase（PostgreSQL + Auth + REST）。無 Node、無 build step，直接 deploy 去 GitHub Pages。
> 目前版本：**v131**（2026-10）

---

## 1. 技術棧

| 層 | 技術 |
|----|------|
| 前端 | 原生 HTML/CSS/JS（無框架、無 build step） |
| 動畫 | GSAP（快龍扭蛋）、Three.js（捕捉場景） |
| 後端 | Supabase（PostgreSQL + PostgREST + GoTrue Auth） |
| 圖鑑素材 | PokeAPI sprites + 本地 649 個 pixel GIF（Gen 1 入 SW pre-cache；Gen 2–5 由 GenPack 解鎖後按需下載）+ 官方 artwork |
| 音效 | 本地 BGM + 寶可夢叫聲 MP3 + Azure TTS（圖片題單字）+ 瀏覽器 speechSynthesis 兜底 |
| 部署 | GitHub Pages（靜態，main branch root） |
| PWA | Service Worker + manifest.json，容錯式逐個快取 |

---

## 2. 目錄結構

```
PokeEngmon/
├── index.html              # 單一入口，所有 view 用 .active 切換
├── sw.js                   # Service Worker（CACHE_NAME 跟 APP_VERSION）
├── manifest.json           # PWA manifest
├── prd.md / arch.md        # 產品需求 / 架構（就係呢兩份）
├── AI出題指引.md            # 家長貼俾 AI 出題嘅 prompt
├── supabase-config.js      # Supabase URL + anon key（已 commit，公開金鑰）
├── supabase-schema.sql     # 完整 schema + RPC + RLS（reference）
├── supabase-migrate-*.sql  # 遷移腳本（按日期）
├── css/style.css
├── js/
│   ├── app.js              # 主流程：路由、主畫面、結算、進化、modal、版本號
│   ├── data.js             # EVOLUTION_CHAINS、SPECIES、GAME_CONFIG、RARITY、wordAudioURL()、pullablePool
│   ├── gens-data.js        # GENS（Gen 1–5 metadata）+ EVOLUTION_CHAINS_G25（tools/fetch_gen_data.py 生成）
│   ├── genpack.js          # GenPack：世代資料包按需下載（manifest + 4 並發 + SW cache 持久化 + 續傳）
│   ├── storage.js          # LocalStorage 層：loadState、saveState、obtainPokemon、deriveEntryFields、migrateEntries
│   ├── quiz.js             # 答題邏輯 + _showFeedback（所有題型共用嘅回應入口）
│   ├── powerup.js          # Power Up Zone（回合尾改錯）
│   ├── sm2.js              # SM-2 SRS：computeBestQ、updateCard、computeEF、buildSession（只抽到期卡）
│   ├── sync.js             # 雲端同步：pushState（淨 trainer_name）、pull、queueUpsert、_flush
│   ├── supabase-auth.js    # Google OAuth + 所有 RPC wrapper（awardRoundDiamonds、gachaPull、obtainCapture、addEntryExp、useEntryCandy、allocEv、importState、settleCapture、migrateAnonymous、getLeaderboard）
│   ├── gacha.js            # 快龍扭蛋機 UI + 稀有度爆發動畫（v102）
│   ├── capture.js          # Three.js 捕捉場景 + 音頻管理（Web Audio API）
│   ├── pokedex.js          # 圖鑑 UI
│   ├── pokemon.js          # 寶可夢數值：expAtLevel、levelSpan、IV/EV、進化、initialMoves、learnsetOf
│   ├── calendar.js         # 練習日曆
│   ├── leaderboard.js      # Leaderboard Top 50（v132 live RPC + mock fallback）
│   └── explain.js          # 錯題解析（關鍵詞箭咀）
├── data/
│   ├── pokemon-151.json    # Gen 1（151 隻）寶可夢資料（含 learnset），SW pre-cache
│   ├── pokemon-gen2…5.json # Gen 2–5 資料（同 shape），GenPack 解鎖後先載入
│   └── moves.json          # 技能資料（威力、命中、PP、屬性、效果；563 招）
├── assets/
│   ├── animated/           # 1-649.gif（pixel 動畫；Gen 2–5 由 GenPack 下載）
│   ├── cries/              # 1-649.mp3（叫聲；Gen 2–5 由 GenPack 下載）
│   ├── gen-icons/          # 1-5.png 世代圖示（封面傳說 artwork）
│   ├── gen-packs/          # gen2-5.json manifest（檔案清單 + size 校驗）
│   ├── bgm/                # 背景音樂
│   └── types/              # 屬性 icon
├── Q_folder/               # 所有考題集中放呢度，方便擴充新題型
│   ├── questions/          # 句子題
│   │   ├── questions.csv
│   │   └── questions_images/
│   └── picture_words/      # 圖片單字題
│       ├── picture_words.csv
│       ├── picture_words_images/
│       └── picture_words_audio/   # 單字發音 mp3（<word>.mp3，Azure Jenny -10%）
├── tools/
│   ├── gen_word_tts.py     # 離線生成圖片題 TTS mp3（用 Azure Speech）
│   ├── fetch_gen_data.py   # 離線抓 PokeAPI → 生成 gens-data.js + pokemon-gen{2..5}.json（299 條鏈 + rarity）
│   ├── fetch_gen_assets.py # 離線抓 Gen 2–5 GIF/叫聲/圖示/manifest（叫聲 OGG → ffmpeg → MP3）
│   ├── gen_chain_sql.py    # 由 gens-data.js 生成世代 SQL 遷移（chain_rarity insert）
│   └── git_commit_push.py  # 一鍵 git add/commit/push（見 .trae/documents/git-commit-push-guide.md）
└── .trae/
    ├── documents/          # 歷次 plan / spec / 設計文檔
    └── skills/             # 兩個常駐 skill：preop-checklist、question-authoring
```

---

## 3. 前端模組關係

```
index.html
  └─ 載入所有 js（global functions / objects，無 module system）
     │
     ├─ data.js ───────────── EVOLUTION_CHAINS / SPECIES / GAME_CONFIG / RARITY / wordAudioURL / pullablePool
     ├─ gens-data.js ──────── GENS / EVOLUTION_CHAINS_G25（Gen 1–5 鏈 + rarity，腳本生成）
     ├─ genpack.js ────────── GenPack.status() / download() / resumePending()（世代資料包下載）
     ├─ storage.js ────────── loadState() / saveState() / obtainPokemon() / deriveEntryFields()
     ├─ pokemon.js ────────── expAtLevel() / addEntryExp() / entryCurrentSpecies() / initialMoves()
     ├─ sm2.js ────────────── SM2.computeBestQ() / updateCard() / buildSession()（只抽到期卡）
     ├─ supabase-auth.js ──── SupabaseAuth（OAuth + 所有 RPC wrapper，要 mount 上 window）
     ├─ sync.js ───────────── Sync.pushState()（淨 trainer_name）/ Sync.pull() / Sync.queueUpsert()
     ├─ quiz.js ───────────── Quiz（_showFeedback 係所有題型嘅唯一回應入口）
     ├─ powerup.js ────────── PowerUp（Power Up Zone 三階腳架）
     ├─ gacha.js ──────────── 快龍扭蛋機（拖手臂 → 跌球 → 爆發 → 檢視卡）
     ├─ capture.js ────────── 捕捉場景 + audio 子模組（正確/錯誤 SFX、playWord、_speakFallback）
     ├─ pokedex.js / calendar.js / explain.js
     └─ app.js ────────────── App（路由 + 協調所有模組 + 版本號 + 啟動流程）
```

所有模組用 **global function / object** 溝通，無 import/export。
例外：`capture.js` 係 ES module，但照樣 mount 上 `window.CaptureScene`。

---

## 4. 資料流

### 4.1 本地狀態（LocalStorage）

```
pokeengmon_state_v1 = {
  device_id, playerName, diamonds,
  unlockedGen,           # 目前最高已解鎖世代（v127，初始 1）
  entries: [{ uid, chainKey, stage, exp, level, ownedSpecies, ivs, evs, moves, candies, dupes, branch, ... }],
  activeUid, records: { "YYYY-MM-DD": [...] },
  customQuestions, totalSets, totalCorrect, bestStreak,
  pendingExp,            # 冇拍檔時暫存嘅 EXP
  _googleMigrated        # 已經連接咗 Google 帳戶
}

pokeengmon_sm2_cards_v2  → { cardId: { card_id, card_type, next_review_at, interval_days, ease_factor, ... } }
pokeengmon_sm2_history_v2 → [ { card_id, ts, q_score, response_ms, levenshtein_distance, is_typo } ]
pokeengmon_auth_session   → { access_token, refresh_token, expires_at, user }
```

**關鍵**：`level / stage / ownedSpecies / moves / stars` 係 `(chainKey, exp, dupes, branch)` 嘅 **deterministic derived 欄位**，由 `deriveEntryFields()` 重推；server row 經 `localEntryFromServer()` / `adoptServerEntry()` 落地。

### 4.2 雲端資料模型（Supabase）

| Table | PK | 說明 |
|-------|----|------|
| `user_account` | `id uuid` | 鑽石、統計、trainer name、`imported_at`（一次性 import 鎖） |
| `user_entries` | `id uuid` | 擁有嘅寶可夢（chain_key, exp, dupes, branch, candies, ivs, evs） |
| `user_cards` | `(account_id, card_id)` | SM-2 卡片狀態（句子題 + `w:` 前綴嘅圖片題共用） |
| `user_history` | `id bigserial` | 答題記錄（q_score, response_ms, levenshtein_distance） |
| `user_captures` | `id bigserial` | 捕捉記錄（每次捕捉無論成功失敗都寫一條） |
| `user_imports` | `id bigserial` | import_state 審計記錄（v106 加） |
| `chain_rarity` | `chain_key` | 全 498 條鏈嘅 `rarity` + `gen` + `stage1_dex`（捕捉池 = rarity='normal'；`gacha_pull` / `obtain_capture` 都查呢張表；v127 加 gen 欄） |

### 4.3 同步方向

```
本地（localStorage）──敏感操作──▶ 雲端 RPC（server 權威）
本地（localStorage）──pushState──▶ 雲端（淨 trainer_name）
本地（localStorage）◀──pull────── 雲端（完整還原 account/entries/cards）
```

**v99 起嘅規則**：
- **敏感數值**（diamonds、entries、exp、IVs/EVs、candies）→ 全部行 server RPC，前端直寫會被 column-level grants 擋（403）
- **非敏感**（trainer_name）→ `Sync.pushState()`
- **SM-2 cards/history** → `Sync.queueUpsert()` / `queueHistory()`，背景 queue 1s debounce + `beforeunload` flush

**觸發時機**：
- `pushState`：trainer name 改變
- RPC：答題結算（`awardRoundDiamonds`）、稀有抽（`gachaPull`）、捕捉（`obtainCapture`）、EXP（`addEntryExp`）、糖果（`useEntryCandy`）、EV（`allocEv`）、import（`importState`）
- `pull`：page load（已登入）、登入後、import 後

---

## 5. 關鍵流程

### 5.1 首次使用（匿名）
1. `ensureDeviceId()` 生成 UUID，存 localStorage
2. RLS policy 用 `app.device_id` session 變數過濾
3. **匿名用戶唔上傳 user_cards / user_history**（PostgREST 設唔到 session 變數，RLS 會擋）— 匿名進度純本地

### 5.2 Google OAuth 登入
1. `SupabaseAuth.signInWithGoogle()` → 清本地 `pokeengmon_auth_session` → redirect 去 Google（URL 必須有 `prompt=select_account`）
2. Google redirect 返 `#access_token=...`
3. `tryParseSessionFromURL()` 從 **hash fragment**（唔係 query string）解析 → 存 localStorage
4. `migrateAnonymous(deviceId)` RPC：
   - 帳戶已存在 → pull 雲端
   - 匿名數據存在 → 搬去 auth uid → pull
   - 全新 → return true → push 本地上去（觸發 `importState`，一次性鎖定，鑽石固定派 20 粒）
5. `st._googleMigrated = true`
6. Toast 顯示實際登入嘅 email（俾用戶核對係咪預期帳戶）

### 5.3 答題結算
1. `onSetComplete(data)` 計算 score + EXP（v130 分級制）
2. EXP 分級表（% of 当前拍檔 `levelSpan`）：

| 分數 | 無用 Hint | 有用過 Hint（該回合任何一題撳過就算） |
|---|---|---|
| 10/10 | 100% | 50% |
| 9/10 | 90% | 40% |
| 8/10 | 80% | 30% |
| 5–7/10 | 50% | 25% |
| 1–4/10 | 30% | 15% |
| 0/10 | 10% | 10% |

3. **新手期保底**：拍檔 Lv.1–10 期間 `pct = max(0.50, 分級結果)`，低分回合墊高到 50%，全對無 hint 照攞 100%。每回合下限 10 EXP。
4. 如有錯題 → 入 Power Up Zone，**全部改啱先至結算**
5. 調用 `SupabaseAuth.awardRoundDiamonds(score, total)` RPC → server 返回權威餘額，前端採用（**唔好本地 `+=`**）
6. RPC 失敗 → fallback 本地計算（離線可用）
7. `addEntryExp(entryId, delta)` RPC 更新拍檔等級／進化
8. SM-2 卡片背景 `queueUpsert`（唔阻塞 UI）

### 5.4 Power Up Zone（v93 起）
1. 答題 set 完成後，錯題進入 `PowerUp.start(wrongList, onDone)`
2. 每題三階腳架：
   - 第 1 次仍錯 → 只俾 Hint（關鍵詞高亮 + 首字母 + 字數 + Levenshtein 差距）
   - 第 2 次仍錯 → 顯示完整解析 + 正確答案，要求重答至 Dist=0
3. 改啱一題 → +5 EXP（`EXP_PER_FIX`）+ 浮字動畫
4. 全部改啱 → 全屏 ALL FIXED 慶祝 pop → 先統一更新所有錯題嘅 SRS → 先跳入 WARNING 捕捉頁
5. 用戶中途退出 → 彈確認「fixes will be lost」，確認後放棄本回合

### 5.5 稀有抽（v102 快龍扭蛋機）
1. 主頁撳 💎 → 入快龍頁
2. 用戶拖／撳 `#dm-arm` ≥ 72% → 觸發動畫
3. **即時開動畫**（唔等 server），背景同時調用 `SupabaseAuth.gachaPull(initExp, unlockedGen)` RPC
4. RPC 返回：原子扣 💎3、server roll rarity（rare 80% / epic 15% / legend 5%）、按 `p_gen` 過濾 `chain_rarity` roll chain、生成 entry row（server 仲會用 `max_unlocked_gen(uid)` 驗證世代解鎖）
5. 前端 `adoptServerEntry()` 落地 → 全屏稀有度爆發動畫 → 檢視卡
6. 檢視卡兩個掣：「💎 ×3 TO GO!」（再抽）/「‹ Back to Home」
7. 鑽石唔夠 → 按鈕 disabled + 顯示「Need 💎3 (you have N)」
8. RPC 失敗 → fallback 本地 `obtainPokemon(chainKey, "rare")`（離線可用）
9. 快龍頁揭示時每次播叫聲（覆蓋「僅首次解鎖播放」嘅一般規則）

### 5.6 捕捉
1. Three.js 場景 → `onCaught` callback
2. `SupabaseAuth.obtainCapture(chainKey, dexId)` RPC 生成 server 端 entry（server 決定 IV 等）
3. `SupabaseAuth.settleCapture(dexId)` RPC 記錄 `user_captures`（每次捕捉必寫，無論成功失敗）
4. 捕捉成功唔會自動替換拍檔
5. BGM 音量曲線：WARNING→草叢 0.55 → 第一下 400ms 收到 0.32 → 拋出後 6.2 秒線性淡出到 0（**用 JS setInterval 逐格調 gain.value**，唔好用 AudioParam 長 ramp — iOS WebKit 有 bug）

### 5.7 TTS 兜底（v116）
1. `playWord(url, onFail)` 試 fetch mp3 → decodeAudioData → 播
2. 失敗 → `_speakFallback(word)`：
   - 等 `onvoiceschanged`（最多 1.5s 超時）
   - 優先揀 `en-*` 語音
   - `rate 0.85 / pitch 1 / volume 1`，講之前 `cancel()` 清隊列
3. 完全失敗 → 顯示「🔇 Audio unavailable」常駐提示（唔係 3 秒 toast）

### 5.8 世代解鎖 + GenPack 按需下載（v127）
1. **解鎖判定**：`recomputeUnlockedGen()` 逐代檢查 `chainsOfGen(n)` 每條鏈都有 entry（`isGenComplete`）→ 全齊就解鎖下一代；`obtainPokemon()`（本地路徑）同 `adoptServerEntry()`（RPC 路徑）落地後都會 re-run
2. **觸發點**：回合結算後（捕捉路徑，`App.onSetComplete` 尾延遲彈出）、稀有抽檢視卡關閉時（gacha 將 `newlyUnlockedGen` stash 入 `App._pendingGenUnlock` → `_goHome` / `_pullAgain` 調 `App.maybeShowGenUnlock()`）
3. **慶祝窗 + 下載**：`showGenUnlock(gen)` 彈慶祝卡 → `GenPack.download(gen)` fetch `assets/gen-packs/gen{N}.json` manifest → 4 並發逐檔下載（經 SW cache-first 持久化）→ 進度條 → `ensureGenDataLoaded(gen)` fetch `data/pokemon-gen{N}.json` 併入 `POKEMON_DEX`
4. **啟動還原**：`App.init()` 按 owned entries 嘅 gens 逐個 `ensureGenDataLoaded(g)` + `GenPack.resumePending()` 背景補下未完成包（done/partial 狀態記 localStorage）
5. **池過濾**：前端 `pullablePool(unlockedGen, rarity)` 決定抽卡/捕捉池；server 端 `gacha_pull(p_gen)` / `obtain_capture` 用 `max_unlocked_gen(uid)`（SECURITY DEFINER，逐代查 `chain_rarity` vs `user_entries`）二次驗證
6. **圖鑑**：未解鎖世代 cell 係純「?」DOM（`cell.disabled = true`），**唔生成任何 `<img>`** → 零圖片請求、零外形洩露；世代 hub 捲動收放（`_bindHubScroll`）

---

## 6. 防金手指設計（v99 起）

| 機制 | 做法 |
|------|------|
| 鑽石 | `award_round_diamonds` RPC（security definer）server 計算 + 累加，前端唔可以硬寫 |
| 抽卡 | `gacha_pull` RPC 原子扣鑽 + server roll rarity/chain，前端唔控制結果 |
| 捕捉成功率 | `settle_capture` RPC server 用 `random()` 決定 |
| EXP / 糖果 / EV | `add_entry_exp` / `use_entry_candy` / `alloc_ev` RPC server 計算 |
| 匯入進度 | `import_state` RPC 一次性鎖定（`user_account.imported_at`），鑽石固定派 20，server clamp 上限（entries ≤151, exp ≤1.25M, candies ≤99, dupes ≤100） |
| Column-level grants | 收回 anon 對敏感欄（diamonds、entries.exp、entries.candies 等）嘅直寫權限 |
| Leaderboard 讀取 | `get_leaderboard()` SECURITY DEFINER（繞過 RLS 讀跨用戶 active entry + total owned）；public/anon 權限已 revoke，只有 authenticated 可 call；匿名前端自動 fallback mock |
| RPC 身份驗證 | 每個 SECURITY DEFINER RPC 內部用 `auth.uid()` 驗證 caller；`revoke execute from public, anon` + `grant execute to authenticated` |
| Sign out | `clearGameProgress()` 清除 localStorage，防止離線改數再 sign in 上傳 |
| RLS | anon 綁定 device_id；auth 綁定 auth.uid()；用戶只可讀寫自己數據 |
| plpgsql 變數 | `v_` 前綴命名，避免同 column 撞名（42702 ambiguous） |

**已知暫緩**（記低咗但未做）：`award_round_diamonds` 無回合真實性檢查、`obtain_capture` 無回合證明、`add_entry_exp` 無速率限制。

---

## 7. 已知坑位（重要！）

> 詳見 `.trae/skills/pokeengmon-preop-checklist/SKILL.md`，呢度只係精選

1. **Version bump 要改 3 個檔**：`app.js` + `sw.js` + `index.html` 嘅 `?v=NN`，三處同號
2. **Upsert 必須有 `Prefer: resolution=merge-duplicates`**，否則 `on_conflict` 唔生效 → 409
3. **`uuid` column 要用 valid UUID**（`crypto.randomUUID()`），唔好用 base36 timestamp → 400 Invalid input
4. **`chain_key` 要用鏈名**（如 `bulbasaur`），唔好用 `dex_<id>`，否則 render 搵唔到 chain
5. **敏感數值唔好再 pushState**：v99 起一律行 RPC，直寫會被 403 擋
6. **新增 RPC 必須 live smoke-test**：本地 fallback 會令壞 RPC 睇落冇事
7. **Sync.pull 前要 `await loadPokemonDex()`**：否則 `initialMoves()` 返回空陣列，新抽嘅寶可夢無招式（v113 教訓）
8. **新增題型必須共用 `Quiz._showFeedback`**：唔好另起爐灶（v114 教訓）
9. **Service Worker 用容錯式逐個快取**：`caches.addAll()` 一個 404 全盤失敗
10. **圖片題 mp3 放 `Q_folder/picture_words/picture_words_audio/`**：唔好放返 `assets/tts/`
11. **Gen 2–5 entry 在 Sync.pull derive 前要 `ensureGenDataLoaded(g)`**：否則 `initialMoves()` 讀唔到 POKEMON_DEX → 招式變空（v113 同款坑嘅世代版）
12. **改 RPC 簽名必須先 `drop function` 舊版**：default 參數會撞 overload → PostgREST 300 ambiguous（v127 `gacha_pull` 加 `p_gen` 時教訓）
13. **未解鎖世代圖鑑格係純「?」**：唔可以用剪影或者背後藏 `<img>`，否則洩露外形兼白耗流量
14. **跨代進化鏈要截斷**：crobat / espeon / steelix 等喺自己世代做獨立 stage-1 鏈，Gen 1 鏈零改動（零遷移）

---

## 8. 部署

1. 改完代碼 → bump 版本（3 處同步）
2. `python tools/git_commit_push.py -m "vNN: ..."` 或手動 `git add / commit / push`
3. GitHub Pages 自動部署（main branch root，幾十秒）
4. Service Worker `CACHE_NAME` 改 → 瀏覽器下次開頁面自動安裝新 SW → `skipWaiting` 接管 → 前端 `controllerchange` 自動刷新
5. Supabase schema 變更：Dashboard → SQL Editor 跑對應日期嘅 `supabase-migrate-*.sql`（**唔好跑成個 schema 檔**，會同已存在嘅 policy / function 衝突）；最新一個係 `supabase-migrate-20261026-gen-expansion.sql`（`chain_rarity` 加 gen + 299 條 insert + `max_unlocked_gen` + `gacha_pull(p_gen)` + `obtain_capture` 649）
