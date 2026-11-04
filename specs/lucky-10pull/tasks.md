# Lucky Draw 10 連抽 — 任務清單

> 前置：SQL、`data.js`、`supabase-auth.js`、`capture.js`、`index.html`、`style.css` 已完成。

- [ ] **T1 狀態與常數**（`js/gacha.js`）
  - 加 `GACHA_CHARGE_MS=3000`、`GACHA_MULTI_THRESHOLD=0.35`
  - `Gacha` 加 `_charging/_charged/_chargeTimer/_chargeStart/_holdStart/_holdMs/_suppressClick/_multi/_multiResults/_multiMeta/_pendingEvolves`
  - `_canMultiPull()`

- [ ] **T2 充能狀態機 + 成本 chip**
  - `_startCharge / _chargeTicker / _chargeComplete / _cancelCharge / _setCostChip`
  - `_refreshControls` 支援 charged 狀態與新文案
  - `open()` / `_resetStage()` 復位 ×3

- [ ] **T3 輸入整合**
  - pointerdown 啟動充能；pointermove 拖拽取消充能；charged 後 35% 觸發 10 連
  - pointerup 記錄 holdMs、suppress click
  - keyboard hold 3s → keyup 觸發；短按 = 單抽
  - click 吞掉長按後嘅 click

- [ ] **T4 10 連結算**
  - `_beginMultiPull`
  - `_settleMulti`（9× gachaPull 順序 + 1× gachaPullLucky；本地 fallback 同樣 9+1）
  - `_applyServerPull` / `_applyLocalPull` / `_pickLuckyChainLocal`
  - pendingExp 只入第一抽；進度 prompt；失敗不本地假派

- [ ] **T5 10 連演出**
  - `_triggerMultiPull`
  - `_dropBalls`（5×2 tray）
  - `_openSceneBMulti`（`gsb-multi`）
  - `_sceneBTimelineMulti`（rare→epic→legend）
  - `_revealMultiResults`

- [ ] **T6 結算頁**
  - `_ensureMulti`（`#gacha-multi`）
  - `_fillMultiResults`（summary + 5×2 cell）
  - `_showMultiDetail`（重用 gi-card）
  - `_refreshMultiAgainButton` / `_multiAgain` / `_closeMulti` / `_flushEvolves`

- [ ] **T7 中斷復位**
  - `abort()` 依 `flow.multi` 分流；隱藏 overlay；flush 進化
  - `_cleanupScene()` 加充能/overlay 復位
  - `_pendingEvolves` 保留與清空時機

- [ ] **T8 CSS 補強**
  - `.gm-cell { font-family: inherit; }`
  - `.gm-close:active` 回饋

- [ ] **T9 Headless 驗證**
  - 單抽 regression（iPhone SE + 17 Pro Max）
  - 10 連：3200ms hold → 扣 30 → 10 卡 5×2
  - 不足 30 鑽拒絕
  - 保底不出 normal
  - reduced-motion
  - 中途關閉獎勵照落地
  - console 無 error

- [ ] **T10 Rule 25 教訓**
  - 寫入 `.trae/skills/pokeengmon-preop-checklist/SKILL.md`
  - `chain_rarity normal` 陷阱、MCP 無法偽造 `auth.uid()`

- [ ] **T11 交付**
  - 總結改動與驗證結果
  - 等用戶明確指示才 commit / push（不可包含 working tree 內用戶 dock 改動）
