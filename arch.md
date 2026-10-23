# PokeEngmon 架構文檔（ARCH）

> 純前端 SPA + Supabase（PostgreSQL + Auth + REST）。無 Node、無 build step，直接 deploy 去 GitHub Pages。

---

## 1. 技術棧

| 層 | 技術 |
|----|------|
| 前端 | 原生 HTML/CSS/JS（無框架） |
| 動畫 | GSAP、Three.js（捕捉場景） |
| 後端 | Supabase（PostgreSQL + PostgREST + GoTrue Auth） |
| 圖鑑素材 | PokeAPI sprites + 本地 pre-download 嘅 151 個 pixel GIF |
| 音效 | 本地 BGM + 寶可夢叫聲 MP3 |
| 部署 | GitHub Pages（靜態） |
| PWA | Service Worker + manifest.json |

---

## 2. 目錄結構

```
PokeEngmon/
├── index.html              # 單一入口，所有 view 用 .active 切換
├── sw.js                   # Service Worker（CACHE_NAME 版本化）
├── manifest.json           # PWA manifest
├── supabase-config.js      # Supabase URL + anon key（已 commit）
├── supabase-schema.sql     # 完整 schema + RPC + RLS（reference）
├── supabase-migrate-*.sql  # 遷移腳本（按日期）
├── css/style.css
├── js/
│   ├── app.js              # 主流程：路由、主畫面、結算、進化、modal
│   ├── data.js             # EVOLUTION_CHAINS、SPECIES、GAME_CONFIG、RARITY
│   ├── storage.js          # LocalStorage 層：defaultState、load/save、clearGameProgress
│   ├── quiz.js             # 答題邏輯
│   ├── sm2.js              # SM-2 SRS：listAll、upsertCard、appendHistory
│   ├── sync.js             # 雲端同步：pushState、pull、queueUpsert、_flush
│   ├── supabase-auth.js    # Google OAuth + RPC（awardRoundDiamonds、settleCapture、migrateAnonymous）
│   ├── gacha.js            # 抽卡動畫 + obtainPokemon 調用
│   ├── capture.js          # Three.js 捕捉場景
│   ├── pokedex.js          # 圖鑑 UI
│   ├── pokemon.js          # 寶可夢數值：expAtLevel、levelSpan、IV/EV、進化
│   ├── powerup.js          # 強化／糖果
│   ├── calendar.js         # 練習日曆
│   └── explain.js          # 錯題解析
├── data/
│   ├── pokemon-151.json    # 151 隻寶可夢資料
│   └── moves.json          # 技能資料
├── assets/
│   ├── animated/           # 1-151.gif（pixel 動畫）
│   ├── cries/              # 1-151.mp3（叫聲）
│   ├── bgm/                # 背景音樂
│   ├── types/              # 屬性 icon
│   └── tts/w/              # 單字發音
├── questions.csv           # 預設題庫
├── picture_words.csv       # 圖片詞庫
└── .trae/skills/...        # pre-op checklist skill
```

---

## 3. 前端模組關係

```
index.html
  └─ 載入所有 js（global functions，無 module system）
     │
     ├─ data.js ───────────── EVOLUTION_CHAINS / SPECIES / PULLABLE / RARITY
     ├─ storage.js ────────── loadState() / saveState() / obtainPokemon()
     ├─ pokemon.js ────────── expAtLevel() / addEntryExp() / entryCurrentSpecies()
     ├─ sm2.js ────────────── SM2.listAll() / SM2.upsertCard() / SM2.appendHistory()
     ├─ supabase-auth.js ──── SupabaseAuth（OAuth + RPC）
     ├─ sync.js ───────────── Sync.pushState() / Sync.pull() / Sync.queueUpsert()
     ├─ quiz.js / gacha.js / capture.js / pokedex.js / ...
     └─ app.js ────────────── App（路由 + 協調所有模組）
```

所有模組用 **global function / object** 溝通，無 import/export。

---

## 4. 資料流

### 4.1 本地狀態（LocalStorage）

```
pokeengmon_state_v1 = {
  device_id, playerName, diamonds,
  entries: [{ uid, chainKey, stage, exp, level, ownedSpecies, ivs, evs, ... }],
  activeUid, records: { "YYYY-MM-DD": [...] },
  customQuestions, totalSets, totalCorrect, bestStreak
}

pokeengmon_sm2_cards_v2  → { cardId: { card_id, card_type, next_review_at, ... } }
pokeengmon_sm2_history_v2 → [ { card_id, ts, q_score, response_ms, ... } ]
pokeengmon_auth_session   → { access_token, refresh_token, expires_at, user }
```

### 4.2 雲端資料模型（Supabase）

| Table | PK | 說明 |
|-------|----|------|
| `user_account` | `id uuid` | 鑽石、統計、trainer name |
| `user_entries` | `id uuid` | 擁有嘅寶可夢（chain_key, stage, exp, level, owned_species[]） |
| `user_cards` | `(account_id, card_id)` | SM-2 卡片狀態 |
| `user_history` | `id bigserial` | 答題記錄（q_score, response_ms, levenshtein_distance） |
| `user_captures` | `id bigserial` | 捕捉記錄（dex_id, success, new_pokemon） |

### 4.3 同步方向

```
本地（localStorage）──pushState──▶ 雲端（Supabase）
本地（localStorage）◀──pull────── 雲端（Supabase）
```

**pushState 觸發時機**：gacha reveal、quiz 完成、capture 成功、新帳戶 migrate。
**pull 觸發時機**：page load（已登入／已 migrate）。
**SM-2 cards/history**：`queueUpsert` / `queueHistory` 背景 flush（1 秒 debounce + beforeunload）。

---

## 5. 關鍵流程

### 5.1 首次使用（匿名）
1. `ensureDeviceId()` 生成 UUID，存 localStorage
2. `Sync.pushState()` 以 anon 身份寫入 `user_account`（`device_id` 綁定）
3. RLS policy `account_anon_rw` 用 `current_setting('app.device_id')` 過濾

### 5.2 Google OAuth 登入
1. `SupabaseAuth.signInWithGoogle()` → redirect 去 Google
2. Google redirect 返 `#access_token=...`
3. `tryParseSessionFromURL()` 解析 hash → 存 localStorage
4. `migrateAnonymous(deviceId)` RPC：
   - 帳戶已存在 → return false → pull 雲端
   - 匿名數據存在 → 搬去 auth uid → return false → pull
   - 全新 → return true → push 本地上去
5. `st._googleMigrated = true`

### 5.3 答題結算
1. `onSetComplete(data)` 計算 exp
2. `awardRoundDiamonds(score, total)` RPC（server 計算 + 累加 diamonds）
3. `addEntryExp(entry, exp)` 更新拍檔等級／進化
4. `saveState()` + `Sync.pushState()` 同步

### 5.4 抽卡
1. `st.diamonds -= 3` + `saveState()`
2. 動畫 → `obtainPokemon(chainKey, "rare")` 建立 entry
3. `Sync.pushState()` 同步 diamonds + entry

### 5.5 捕捉
1. Three.js 場景 → `onCaught` callback
2. `obtainPokemon(chainKey, "normal")` 建立 entry
3. `settleCapture(dexId, 1)` RPC 記錄（只寫 `user_captures`，唔寫 `user_entries`）
4. `Sync.pushState()` 同步 entry

---

## 6. 防金手指設計

| 機制 | 做法 |
|------|------|
| 鑽石 | `award_round_diamonds` RPC（security definer）server 計算，前端唔可以硬寫 |
| 捕捉成功率 | `settle_capture` RPC server 用 `random()` 決定 |
| Sign out | `clearGameProgress()` 清除 localStorage，防止離線改數再 sign in |
| RLS | anon 綁定 device_id；auth 綁定 auth.uid()；用戶只可讀寫自己數據 |

---

## 7. 已知坑位（重要！）

> 詳見 `.trae/skills/pokeengmon-preop-checklist/SKILL.md`

1. **Version bump 要改 3 個檔**：`app.js` + `sw.js` + `index.html` 嘅 `?v=NN`
2. **Upsert 必須有 `Prefer: resolution=merge-duplicates`**，否則 `on_conflict` 唔生效 → 409
3. **`uuid` column 要用 valid UUID**（`crypto.randomUUID()`），否則 → 400 Invalid input
4. **`chain_key` 要用鏈名**（如 `bulbasaur`），唔好用 `dex_<id>`，否則 render 搵唔到 chain
5. **改 diamonds/entries/exp 後必須 call `Sync.pushState()`**，否則 pull 會覆蓋本地

---

## 8. 部署

1. `git push` 去 GitHub
2. GitHub Pages 自動部署（`main` branch root）
3. Service Worker `CACHE_NAME` 改 → 瀏覽器自動更新
4. Supabase schema 變更：Dashboard → SQL Editor 跑 `supabase-migrate-*.sql`
