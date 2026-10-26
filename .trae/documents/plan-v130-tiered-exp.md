# v130：回合經驗值分級制（按分數 × Hint 使用）+ 新手期保底

## Summary

重做答題回合 EXP 計算：
1. **新手期保底**：拍檔 Lv.1–10（頭 10 級）期間，回合 EXP **保底 50% × levelSpan**——分級表計出嚟低過 50% 就攞 50%，但本身高過 50%（例如全對無 hint = 100%、9/10 無 hint = 90%）就照攞高嗰個，即 `pct = max(0.50, tierPct)`。
2. **Lv.11 起純分級制**：按回合分數（0–10）× 該回合有無用過 Hint（任何一題用過就算）對照百分比表發放。
3. 為支援判定，Quiz 需新增「每題有無撳過 💡 Hint」嘅追蹤，並隨 `results` 傳到結算。

鑽石獎勵、記憶光芒 bonus 公式、Power Up Zone `+5 EXP/題` 全部維持不變。

## Current State Analysis

- 結算入口：[js/app.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/app.js#L517-L536) `onSetComplete(data)`
  - 現時：`perfect ? span×0.50 : span×0.09`（v129 改動），下限 `Math.max(10, ...)`；無拍檔時固定 `GAME_CONFIG.EXP_BASE = 12` 入 `pendingExp`。
  - `data.results` 元素結構由 [js/quiz.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/quiz.js#L406-420) `finish()` 建立：`{ qid, chosen, correct, memory }` —— **冇 hint 標記**。
- Hint 按鈕：[js/quiz.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/quiz.js#L296-308) `hint()`，每題開始時喺 [js/quiz.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/quiz.js#L107) 重新 enable —— 即每題可用一次，但而家完全無記錄。
- `this.results = []` 喺 [js/quiz.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/quiz.js#L38) 初始化；`results.push` 有兩處：submit（L267-275）同 skip（L338-343）。
- EXP 入帳：本地 `addEntryExp(entry, rewards.exp)` + 登入時背景 `SupabaseAuth.addEntryExp(entry.uid, rewards.exp)`（RPC，server 權威累加）—— 今次唔使郁。
- 記憶 bonus：`memoryBonus = round((expGain / total) × 0.5 × memoryCorrect)` —— 會自動跟住新 expGain 放大縮細，唔使改。

## Proposed Changes

### 1. `js/quiz.js` — 追蹤每題 Hint 使用

- **初始化**：喺 `this.results = []`（L38）同一處加 `this._hintUsed = new Set();`（記 question index）。
- **`hint()`（L296-308）**：成功顯示 hint 後加 `this._hintUsed.add(this.idx);`（放喺 `locked` guard 之後、disable 按鈕之前/之後均可）。
- **submit `results.push`（L267-275）**：加欄位 `hint: this._hintUsed.has(this.idx)`。
- **skip `results.push`（L338-343）**：同樣加 `hint: this._hintUsed.has(this.idx)`（skip 前撳過 hint 都照記）。
- **`finish()` map（L418）**：改為 `({ qid, chosen, correct, memory, hint: !!r.hint })`，等 `onSetComplete` 收得到。

### 2. `js/app.js` — `onSetComplete` 改用分級表

取代現時 L523-529 嘅 `perfect ? 0.50 : 0.09` 邏輯：

```js
let expGain = GAME_CONFIG.EXP_BASE;
if (entry) {
  ensureEntryPokemonData(entry);
  const dexId = entryCurrentSpecies(entry)[0];
  const level = entry.level || 1;
  const span = levelSpan(dexId, level);
  let pct;
  /* 分級表：分數 × 有無用 hint（全回合任何一題用過就算） */
  const usedHint = data.results.some(r => r.hint);
  const s = data.score;
  if (s >= 10)      pct = usedHint ? 0.50 : 1.00;
  else if (s === 9) pct = usedHint ? 0.40 : 0.90;
  else if (s === 8) pct = usedHint ? 0.30 : 0.80;
  else if (s >= 5)  pct = usedHint ? 0.25 : 0.50;
  else if (s >= 1)  pct = usedHint ? 0.15 : 0.30;
  else              pct = 0.10;       // 0/10 有無 hint 都係 10%
  /* 新手期保底：Lv.1–10 最少 50% span；分級表高過 50% 就照攞高嗰個 */
  if (level <= 10) pct = Math.max(0.50, pct);
  expGain = Math.max(10, Math.round(span * pct));
}
```

- 保留 `Math.max(10, ...)` 作安全下限（高級時唔會觸發，只防極端細 span）。
- 無拍檔情境維持 `EXP_BASE = 12` 入 `pendingExp`，唔跟分級表。
- 註解更新為繁中說明新表。

### 3. 版本 bump（三處同步，缺一不可）

- `js/app.js`：`APP_VERSION = "v130"`
- `sw.js`：`CACHE_NAME = "pokeengmon-v130"`
- `index.html`：全部 `?v=129` → `?v=130`（19 處）

### 4. Commit + Push

- `python tools/git_commit_push.py -m "v130: tiered round EXP by score x hint usage; 50% span flat for Lv.1-10" --paths js/app.js js/quiz.js sw.js index.html`

## Assumptions & Decisions

- 「有用過 hints」= 該回合**任何一題**撳過 💡 Hint（用戶已確認），包括用喺答錯 / Skip 嘅題上。
- 「頭 10 級」= 拍檔當前等級 `level <= 10`；呢段期間 50% 係**保底唔係封頂**——`pct = max(0.50, tierPct)`，Lv.11 起純用分級表（用戶確認）。
- Skip 題唔當用 hint（除非 skip 前撳過）；冇撳就係冇用。
- 鑽石規則（10 對 3💎 / 8–9 對 2💎 / 7 對 1💎）同記憶光芒 ×1.5 bonus 唔變。
- Power Up Zone `EXP_PER_FIX = 5` 唔變。
- PowerUpZone / 回顧頁用到 `results` 嘅其他地方唔受影響（只係多咗個 `hint` 欄位）。

## Verification

1. 本機開頁面，揀一個課題做一組：
   - Lv.≤10 拍檔：低分回合 EXP 應保底 ≈ 50% span；全對無 hint 回合應攞 100% span（唔會被壓返落 50%）。
   - Lv.≥11 拍檔：
     - 全對唔撳 hint → 100% span（即剛好接近升一級）。
     - 全對但中途撳過一次 hint → 50% span。
     - 9/10 無 hint → 90%；有用 → 40%。
     - 0/10 → 10%（下限 10）。
2. DevTools Console 冇錯誤；`data.results` 入面正確帶 `hint` 旗標。
3. 登入狀態下 Network 見 `add_entry_exp` RPC 200。
4. Settings 頁版本顯示 v130；hard refresh 後 `?v=130`。
