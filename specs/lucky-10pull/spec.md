# Lucky Draw 10 連抽 — 實作規格（第二階段）

## 1. 目標與已定案需求

在扭蛋頁（Lucky Draw / 快龍拉手）新增 **10 連抽**：

| 項目 | 定案 |
| --- | --- |
| 觸發 | 按住手杆 **≥ 3000ms** 完成充能，再向下拉 → 10 連 |
| 價錢 | **30 寶石**（10 × 3，原價，冇折扣） |
| 保底 | 第 10 抽必中 **未持有** 的 Legend 或 Epic，**50/50** |
| 結算頁 | **5×2 卡片格**；點卡彈出詳情（重用 `.gi-card` 樣式） |
| 單抽 | 維持現有行為：直接拉過 72% 即扣 3 寶石 |

## 2. 已完成（勿重做）

- **SQL**（已部署 live DB，project ref `gcfoeaxxeerqixaistaf`）
  - `supabase/migrations/supabase-migrate-20261104-lucky-10pull.sql`
  - RPC `gacha_pull_lucky(p_gen int default 1) returns jsonb`
  - 原子扣 3 鑽；50/50 legend/epic；優先未持有（同稀有度 → 另一個稀有度 → 任何 `rare/epic/legend` 未持有）；全滿則 dupe
  - 已修正：fallback **排除 `normal`**（`chain_rarity` 有 normal 列，client `GACHA_BALL['normal']` 不存在會 crash）
  - 回傳 `{entry, rarity, is_dupe, balance}`
- `js/data.js`：`MULTI_PULL_COUNT: 10`、`MULTI_PULL_COST: 30`
- `js/supabase-auth.js`：`gachaPullLucky(gen)` → `_rpc("gacha_pull_lucky", { p_gen: gen || 1 })`
- `js/capture.js`：`chargeTick(p)`、`chargeReady()`
- `index.html`：`.dm-arm` 內充能環 SVG（`.dm-charge/.dmc-track/.dmc-bar`）＋ `.dm-10x`
- `css/style.css`：充能環、`.charging/.charged`、`.dm-10x`、`.gacha-cost.multi`、`.gc-10x`、`.eject-ball.mini`、`#gacha-multi` / `.gm-*` / `.gsb-multi`、reduced-motion

## 3. 待實作：`js/gacha.js`（唯一需要改的檔案）

### 3.1 常數與狀態

新增常數：

```js
const GACHA_CHARGE_MS = 3000;      // 充能時長
const GACHA_MULTI_THRESHOLD = 0.35; // 充能後只需拉 35% 即發動
```

`Gacha` 物件新增狀態：

```js
_charging: false, _charged: false, _chargeTimer: null, _chargeStart: 0,
_holdStart: 0, _holdMs: 0, _suppressClick: false,
_multi: null, _multiResults: null, _multiMeta: null,
_pendingEvolves: [],
```

### 3.2 充能狀態機

- `_startCharge()`：`phase==="idle"` 才可；加 `machine.charging`；`_prompt("CHARGING 10×… 0%")`；3 秒 timer；每 260ms 遞歸 `_chargeTicker()` 播 `audio.chargeTick(p)` 並更新百分比。
- `_chargeComplete()`：
  - 不夠 30 鑽 → `_cancelCharge()` + `_prompt("Need <gem> ×30 for 10× — drag for single pull")` + haptic，**不進入 charged**。
  - 夠 → `_charging=false; _charged=true`；`machine` 換上 `charged`；`_setCostChip(true)`；`_prompt("READY! PULL DOWN FOR 10×")` 並加 `.almost`；`audio.chargeReady()`。
- `_cancelCharge()`：清 `_chargeTimer`、移除 `charging/charged`、`_setCostChip(false)`、清 prompt。
- `_setCostChip(multi)`：改寫 `#gacha-cost` 內容為 `Cost: <gem> ×3` 或 `×30` + `<span class="gc-10x">10×</span>`，toggle `.multi`。
- `_canMultiPull()`：`loadState().diamonds >= GAME_CONFIG.MULTI_PULL_COST`。

### 3.3 輸入整合（pointer + keyboard + click）

- `_onArmDown`：記錄 `_holdStart`、`_suppressClick=false`，如可負擔（單抽或 10 連）則 `_startCharge()`。
- `_onArmMove`：
  - `!this._charged && p > 0.10` → `_cancelCharge()`（真拖拽 = 單抽）。
  - `this._charged` 且 `p >= GACHA_MULTI_THRESHOLD && _canMultiPull()` → `_triggerMultiPull()`。
  - 否則沿用 `p >= GACHA_THRESHOLD && _canPull()` → `_triggerPull()`。
- `_onArmUp`：`_holdMs = now - _holdStart`；`_suppressClick = _holdMs > 600`；未觸發 → `_cancelCharge()` + 回彈 + `_refreshControls()`。
- click handler：`_suppressClick` 為 true 時吞掉一次 click（避免長按放手變單抽）。
- keyboard：
  - `keydown` Enter/Space（非 repeat）→ 啟動充能（同 pointerdown）。
  - `keyup`：`_charged` → `_triggerMultiPull()`；否則取消充能，若 `holdMs < 600` 才 `_tryAutoPull()`（短按 = 單抽）。
- `_refreshControls()`：idle 且 `!_charging && !_charged` 才改提示；文案：
  - 夠 30：「⇣ DRAG FOR 1 PULL ・ HOLD 3s FOR 10×」
  - 只夠單抽：原本「⇣ DRAG DRAGONITE'S HAND ⇣」
  - 不夠單抽：原本提示賺寶石。

### 3.4 10 連經濟結算 `_settleMulti(flow)`

- flow 建立（`_beginMultiPull`）：`{ id, multi:true, authed, gen, pendingExp, settled, settling, settlement }`；同步 `_clearTimers()`、`busy=true`、停 town BGM、`Pokedex.unlockAudio()`。
- server path（`authed`）：**順序 await** 9 次 `SupabaseAuth.gachaPull(initExp, gen)`（只有第 1 次傳 `pendingExp`，之後傳 0），最後 1 次 `SupabaseAuth.gachaPullLucky(gen)`。
  - 每次 response 用 `_applyServerPull(r, applyPending)`：`st.diamonds = r.balance`、`adoptServerEntry`、dupe/candy、`pendingExp` 入帳（沿用單抽 `_settleResult` 邏輯）。
  - 任何一次 `null` → `settled=true; settlement=null`；**已落地嘅抽數保留**，不作本地假派（Rule 5 / v140）。
- 本地 path（匿名/離線）：一次扣 30 鑽，9 次 `rollRarity("rare") + pickChain` + 1 次 `_pickLuckyChainLocal(gen)`（50/50 legend/epic，優先未持有，排除 `normal`），每次 `_applyLocalPull`（`obtainPokemon` + pendingExp 只第 1 次）。
- 進度提示：`OPENING 3/10…`（只限 `flow.id === this._flowId`）。
- 回傳 `{ results, evolves, newlyUnlockedGen, balance }`；`results[i] = { rarity, chainKey, entry, isDupe, candyGain, firstExpEvolve, newlyUnlockedGen }`。

### 3.5 10 連演出

- `_triggerMultiPull()`：`_beginMultiPull()` → 旗標/phase、清充能 class、`_setCostChip(true)`、手臂回彈、180ms 開艙門 → `await _settleMulti` → 600ms `_dropBalls`。
- `_dropBalls(flow, results)`：dropzone 內生成 10 個 `.eject-ball.mini`，由肚仔 GSAP 彈到 **5×2 tray**（34px、gap 8、delay i*50ms、bounce.out）；約 1000ms 後 `_openSceneBMulti`。
- `_openSceneBMulti`：重用 `_sceneB`，`.gsb-ball-wrap` 換入 `<div class="gsb-multi">` 5×2 精靈球（按各自稀有度球種）；提示「10 POKÉMON INCOMING…」。
- `_sceneBTimelineMulti`：按 **rare → epic → legend** 順序逐粒 wobble + 開球 + `.revealed`（間隔 240ms）；legend 加 flash/震屏/`upgradeSting(2)`，epic 加 flash/輕震。
- `_revealMultiResults`：收起 scene B → 顯示結算 overlay；`_flow=null`、`busy=false`、`App.renderHome()`。

### 3.6 結算頁 `#gacha-multi`

- `_ensureMulti()`（lazy 掛 body）：
  - `.gm-card` / `.gm-close` / `.gm-title`（LUCKY <span>10×</span>）/ `.gm-summary` / `.gm-warn` / `.gm-grid` / `.gm-actions`（`.gm-again`、`.gm-done`）/ `.gm-detail.hidden` > `.gi-card.gm-detail-card`。
- `_fillMultiResults`：
  - summary：`LEGEND ×n` / `EPIC ×n` / `RARE ×n` / `N NEW`；
  - grid 5×2：`.gm-cell[data-rarity][data-idx]`、`.gm-badge.new|dupe`、artwork（`onerror` → sprite）、名、`Lv.x ★`；
  - 點 card → `_showMultiDetail(idx)`。
- `_showMultiDetail(idx)`：重用 `.gi-rarity/.gi-art/.gi-name/.gi-meta/.gi-types/.gi-stats/.gi-note`，播 `Pokedex.playCry`；點背景關閉。
- `_refreshMultiAgainButton()`：夠 30 → `<gem> ×30 10× AGAIN`；否則 disabled + `Need <gem> ×30 (you have n)`。
- `_multiAgain()`：執場 → flush 進化 → `_setPull(1)` → `_triggerMultiPull()`。
- `_closeMulti()`：隱藏 overlay、`_cleanupScene()`、cost chip 復位、phase idle、flush 進化、`App.maybeShowGenUnlock()`、`App.renderHome()`。
- `_flushEvolves(list)`：逐個 `App.showEvolveModal(species, next)`（簽名已確認 `showEvolveModal(species, onDone, fromDex)`）。

### 3.7 中斷與復位

- `abort()`：`flow.multi ? _settleMulti(flow) : _settleResult(flow)`；重置充能；隱藏 `#gacha-multi`；flush `_pendingEvolves` + `_pendingEvolve`。
- `_cleanupScene()`：加 `charging/charged` 移除、`_cancelCharge()`、`_suppressClick=false`、隱藏 `#gacha-multi`；保留 `_pendingEvolves` 不被清空。
- `_resetStage()` / `open()`：`_setCostChip(false)`，確保重入頁面時回復 ×3。

### 3.8 少量 CSS 補強（`css/style.css`）

- `.gm-cell { font-family: inherit; }`（button 預設字體唔繼承）。
- `.gm-close:active { transform: scale(.9); }`（可選，保持按鈕回饋）。

## 4. 驗證（headless）

工具：`python -m http.server 8080` + `node tools/preview-iphone.mjs --device iphone-se --headless`（同時跑預設 iPhone 17 Pro Max；Rule 37 要求 safe-area=0 也驗）。

1. **單抽 regression**：`pointerdown` → 立即 `pointermove` +130px → 扣 3 鑽、單張檢視卡。
2. **10 連**：`pointerdown` → 等 3200ms（`charging`→`charged`）→ `pointermove` +130px → 30 鑽全扣、10 張卡、5×2 格。
3. **不足 30 鑽**：3 秒後拒絕並顯示 `Need ×30`，唔會扣鑽。
4. **保底**：測試帳號（rich）已全 legend/epic → 第 10 抽為 dupe 指定稀有度，不出 normal。
5. **reduced-motion**：充能環靜態、演出壓縮、結算頁仍可用。
6. **中途關閉**：10 連進行中按 Home → 獎勵照樣落地、無卡死。
7. 檢查 console 無 error、`#gacha-multi` 5×2 無 overflow（SE 667px）。

## 5. 其他

- **Rule 25**：完成後把本次教訓寫入 `.trae/skills/pokeengmon-preop-checklist/SKILL.md`：
  - `chain_rarity` 含 `normal` → 保底查詢必須 `rarity in ('rare','epic','legend')`；
  - MCP SQL 無法偽造 `auth.uid()`，需用 `pg_temp` + rollback 測試 plpgsql。
- **版本**：semantic-release 擁有版本，不手動 bump（Rule 1）。
- **Commit**：未獲明確指示前不 commit；working tree 內用戶自己的 dock 改動不可包含。
