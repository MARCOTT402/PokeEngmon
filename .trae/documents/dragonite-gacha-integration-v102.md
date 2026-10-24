# v102：快龍拉手抽獎整合入遊戲（Prototype → 正式版）

## Summary

將已驗收嘅 Prototype（`prototype/dragonite-gacha.html`）整合入正式遊戲，取代現有「金幣三連點」稀有抽演出：

**主頁 💎 → 快龍頁（拉手 → 肚開 → 跌球）→ 背景 A（搖 2 下 → 稀有爆發 → 光柱）→ 全屏精靈卡（播叫聲）→「💎×3 TO GO!」再抽 或「‹ Back to Home」**

已確認決策：
- 卡片頁「💎×3 TO GO!」＝**即場再抽一次**（背景 RPC 扣鑽 → 返回拉手階段）；唔夠鑽 → 灰化 + 顯示差額。
- 卡片出場**每次都播叫聲**（覆蓋舊「只限新寵」規則）。
- 無 TAP TO START 頁（遊戲入場彈窗已解鎖音頻）；Prototype 嘅稀有度 pills / 靜音 toggle **唔入正式版**。
- 經濟結算完全沿用 v99/v101：`gacha_pull` RPC server 權威，失敗/離線行本地 fallback；演出只係視覺。

## Current State（已核實）

- [gacha.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/gacha.js)：`pull()` 起 RPC + `_flow`；`_settleResult(flow)` 扣鑽派寵一次過落地；`_startCoinPhase → _tap×3 → _insertCoin → _rumble → _dropBall（3搖+升級）→ _reveal → _celebrate`。`abort()` 會背景補結算。`_setT/_clearTimers/_refreshControls/_prompt/_haptic/_audio` 沿用。
- [index.html](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/index.html#L189-L240)：`#view-gacha` 有 title、topbar（💎數 + Cost:💎3）、info（odds chips）、stage（prompt/machine/taps/flash/dropzone/result）、controls（`#btn-do-pull`）、hub-bar（`#btn-gacha-home`）。
- Prototype 已驗證：拖拽（Pointer Events + `--pull` CSS vars）、三款球 `ball-great/ultra/master`、背景 A、2 搖、分級爆發、光柱、檢視卡、Continue 重置；曾修復 Continue 後 `triggered` 未重置 bug（整合時要帶埋呢個修正）。
- 現有資源：`Pokedex.playCry(dex)` / `prepareCry(dex)`、`artworkURL/spriteURL`、`dexOf().types`、`calcStats()`、`typeColor/typeLabel/typeIconURL`、`RARITY`、`entryCurrentSpecies`、GSAP 本地 vendor、`assets/cries/<dex>.mp3`。

## Proposed Changes

### 1. 新素材

- 複製 `prototype/assets/dragonite.png` → `assets/gacha/dragonite.png`。
- `sw.js`：`CACHE_NAME` → `pokeengmon-v102`；`ASSETS` 加 `"./assets/gacha/dragonite.png"`。

### 2. `index.html`（#view-gacha 改寫）

保留：title、topbar、info、`#gacha-prompt`、`#btn-do-pull`、hub-bar。
移除：`#gacha-taps`、`#gacha-flash`、`#gacha-result`、machine 內嘅 dome/body/head/wing/antenna。

```html
<div class="gacha-stage" id="gacha-stage">
  <div class="gacha-prompt" id="gacha-prompt"></div>
  <div class="gacha-machine dragonite-art" id="gacha-machine">
    <img class="dm-art" src="assets/gacha/dragonite.png" alt="Dragonite" draggable="false">
    <div class="dm-belly" id="dm-belly">
      <span class="dm-cavity"></span>
      <span class="dm-door left"></span><span class="dm-door right"></span>
    </div>
    <div class="dm-arm" id="dm-arm" role="slider" tabindex="0"
         aria-label="Pull Dragonite's hand" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <span class="dm-bracket"></span><span class="dm-arm-upper"></span>
      <span class="dm-hand"><i></i><i></i><i></i></span>
    </div>
  </div>
  <div class="gacha-dropzone" id="gacha-dropzone"></div>
</div>
```

按鈕文案：
- 待機：`💎 ×3 TO GO!`（`btn-do-pull`，enabled）
- 唔夠鑽：disabled + `Need 💎3 (you have N)`（沿用「灰化唔隱藏」規則）
- 進行中：disabled（拉手階段按鈕退場 / 顯示 `Pulling…`）

版本：`?v=101` → `?v=102` 全部三處（+ footer 版本字如有）。

### 3. `css/style.css`

刪除 v98–v101 舊演出規則：`.dm-head/horn/antenna/eye/snout/wing`、`.gacha-dome`、`.mini-ball`、`.gacha-body/coin-slot/knob/outlet`、`.gacha-taps`、`.gacha-coin-grand/.gc-*`、`machine-rumble/antenna-jitter/wing-flap-*`、`.gacha-dim`、`.gacha-burst`、`.gacha-celebrate/gacha-beam/gacha-ring/gacha-star/gacha-rare-get/gacha-poke-glow`、`.pokeball.upgrade`、`stage-rumble`、舊 `.gacha-result` 入場樣式。

保留 / 重用：`.pokeball` 基礎 + `.pb-top/mid/bottom/btn`、`.wob`/`ball-wobble`、`.leak-*`/`lk1/2/3`、`.stage-open` 開球 keyframes、`.stage-drop`。

新增（由 Prototype 移植，class 名沿用 prototype 以減少移植風險）：
- 舞台 A：`.dragonite-art`、`.dm-art`（`--pull/--pullp` 驅動）、`.dm-belly/.dm-door/.dm-cavity`、`.dm-arm/.dm-bracket/.dm-arm-upper/.dm-hand`、`belly-open` 狀態、`.gacha-pull-hint`、`ball-eject` keyframes、`.eject-ball`
- 球款：`.ball-great/.ball-ultra/.ball-master`（紋理跟 Prototype；舊 `.ball-blue/yellow/purple` 若無其他地方引用可一併刪）
- 背景 A：`#gacha-scene-b`（fixed、深金地平線、3 層 `.gsb-wave`、`.gsb-particles`、`.gsb-spot`、`gsb-roll-in`、`.gsb-ring/.gsb-star`、`.gsb-magic`、`.gsb-beam`、`.gsb-flash`、`.pb-light` 開球內光）
- 檢視卡：`#gacha-inspect`（fixed、`.gi-rays`、`.gi-card`、`.gi-rarity/.gi-art/.gi-name/.gi-meta/.gi-types/.gi-stats/.gi-note`、`.gi-actions` 雙掣列）
- 全部新 hover 跟專案規範（`@media (hover:hover) and (pointer:fine)`、120ms ease-out-quart、只動 transform）；reduced-motion 由全域規則覆蓋
- 細屏（≤700px 高）：快龍收細、卡上限高度可捲動

### 4. `js/gacha.js`（重寫演出層，結算層不動）

保留：`mode/busy/_flowId/_flow/_timers/_bound`、`open/abort`、`pull()`（RPC 啟動部分）、`_settleResult`、`rollRarity/pickChain`、`_setT/_clearTimers/_prompt/_haptic/_audio/_updateDiamondDisplay/_canPull`。

刪除：`_bindTap/_tap/_updateDots/_showTaps`、`_startCoinPhase/_insertCoin/_rumble`、`_ensureDim/_setEyes`、舊 `_dropBall/_reveal/_celebrate`。

新增（移植 Prototype 邏輯）：

- 常數 `MAX_PULL = 150`、`THRESHOLD = 0.72`；球種映射：
  `GACHA_BALL = { rare:{cls:"ball-great",glow:"leak-blue"}, epic:{cls:"ball-ultra",glow:"leak-gold"}, legend:{cls:"ball-master",glow:"leak-rainbow"} }`
- `_startHandPhase()`：`phase="hand"`、`view-gacha.playing`、提示 `⇣ DRAG DRAGONITE'S HAND ⇣`、`audio.ready()`；pointer/keyboard 監聽喺 `open()` 綁一次，handler 內檢查 phase。
- `_onArmDown/_onArmMove/_onArmUp`：`setPointerCapture`、dy clamp → `--pull/--pullp` + aria；`p≥THRESHOLD` 即觸發；未達標放手 → GSAP elastic 回彈 + `audio.pullSnap()`；`pullCreak(p)` 80ms 節流。Enter/Space/單擊 → `_autoPull()`（GSAP 拉到底觸發）。
- `_triggerPull()`：鎖拖拽、手臂回彈、`pullSnap` → 180ms 艙門開 `bellyOpen` → **await `_settleResult(flow)`**（RPC 未完成時 hand 保持拉緊 + prompt「…」，沿用 v101 hold 狀態）→ 600ms `_dropBall(s)`。結算失敗 → 解鎖 + `_resetStage()` + 錯誤提示。
- `_dropBall(s)`：依 `s.rarity` 建 `.eject-ball.pokeball.<ball cls>` 喺肚位跌出彈跳滾走（`ballLand`+`ballRoll`）→ `_openSceneB(s)`。
- `_openSceneB(s)`：lazy 建立 fixed overlay 掛 `document.body`（避免 fixed containing block 問題）；球由右滾入；時間線（`_setT` 記錄）：350 搖1（`wobble(1)`+lk1+haptic）→ 1050 搖2（`wobble(2)`+lk2+`leakHum`）→ 1800 分級爆發（rare 藍閃+1環+10星 / epic 紫金閃+魔法陣+2環+16星+輕震 / legend 金柱+大閃+魔法陣+3環+24星+強震，`upgradeSting(1/2)`）→ 2450 開球（pb-light + 上下分離）→ 2850 光柱 + GSAP zoom + `beamWhoosh` → 3250 `_revealInspect(flow, s)`。震屏只震 overlay 元素，**唔好震 body**（記憶教訓：body transform 會令 .hub-bar fixed 移位）。
- `_revealInspect(flow, s)`：全屏卡（rarity chip、`artworkURL`→`spriteURL` fallback、名字、No./Lv/星、types chips、`calcStats` 六圍、NEW! 或 dupe `EV point +1 ・ 🍬 Candy +1`）；**每次出卡 350ms 後 `Pokedex.playCry(dex)`**；動作列：
  - `💎 ×3 TO GO!` → `_pullAgain()`：關卡 overlay → `_cleanupScene()` → `pull()`（`_canPull()` 不足時 disabled + `Need 💎X more`）
  - `‹ Back to Home` → `_cleanupScene()` → `App.showView("view-home")`
  - `firstExpEvolve` → 卡關閉後（任一掣）先 `App.showEvolveModal()`；`App.renderHome()` 照舊；`busy=false`、`_refreshControls()`
- `_cleanupScene()`：移除 scene B / inspect / eject ball、`gsap.killTweensOf`、清 `--pull`、`belly-open`；`resetAll` 要連 `dragging/triggered/curP` 一齊重置（Prototype 教訓）。`_resetStage()` 與 `abort()` 都呼叫。
- dev hook（只限 localhost）：`window.__gachaForceRarity` 覆寫**視覺**稀有度方便驗收，經濟結果不變。

### 5. `js/capture.js`（CaptureAudio 加合成音，無新音檔）

新增：`pullCreak(p)`、`pullSnap()`、`bellyOpen()`、`ballRoll()`、`beamWhoosh()`；重用 `ballLand/wobble/leakHum/upgradeSting/gotcha`。全部 GainNode 音量、短 automation（iOS 規則）。

### 6. 版本同步（Rule 1）

`js/app.js` `APP_VERSION="v102"`、`sw.js` `CACHE_NAME`、`index.html` 全部 `?v=102`。

## 流程時序總表（整合後）

| 階段 | 觸發 | 內容 |
|---|---|---|
| 待機 | 主頁 💎 入頁 / 再抽重置 | 快龍 idle bob、`💎 ×3 TO GO!`、Back to Home |
| hand | 按 `💎 ×3 TO GO!` | RPC 背景開始、提示拉手、按鈕退場 |
| opening | 拉 ≥72% | 手臂回彈 → 180ms 肚開 → await 結算（hold「…」）→ 600ms 跌球滾走 |
| sceneB | 跌球後 | 金場滾入 → 搖2（聲+漏光）→ 分級爆發 → 開球光柱 zoom |
| inspect | 爆發後 | 全屏卡 + 叫聲（每次都播）+「💎 ×3 TO GO!」/「‹ Back to Home」 |

## Assumptions

- 「3x diamonds to go」＝ `💎 ×3 TO GO!`（ Rare Pull 成本維持 `GAME_CONFIG.RARE_PULL_COST=3`，文案統一兩處）。
- Prototype 工具列（pills/mute）屬開發用，唔入正式版。
- 檢視卡取代舊 `gacha-result`；`Gacha.abort()` 行為不變（中途離開照樣背景結算）。
- 主頁入場彈窗已解鎖音頻，唔使 TAP TO START。

## Verification

1. 實作前 invoke `pokeengmon-preop-checklist` skill 核對版本三檔規則。
2. `python -m http.server 8080` → browser agent 開 `http://localhost:8080`：
   - 主頁 💎 → 快龍頁（無 TAP TO START，有 `💎 ×3 TO GO!` + Back to Home）
   - 拉手 <72% 回彈；≥72% → 肚開跌球 → 背景 A → 搖2 → 爆發 → 光柱 → 卡
   - `__gachaForceRarity` 驗證三款球 + 三級爆發
   - 卡：資料完整、叫聲播、`💎 ×3 TO GO!` 即刻再抽（鑽石 -3 一次）、Back to Home 正常
   - 鑽石不足：兩處按鈕灰化顯示差額
   - 動畫中途 Back to Home：獎勵已落地、無殘留 overlay、無 JS error
   - 375×667 無橫向滾動、拖手可觸及
3. 全過後 commit + push（Rule 6）。

## Risks / Mitigations

- **fixed overlay 被祖先 transform 影響**：scene B / inspect 掛 `document.body`；震屏只震 overlay。
- **拖拽 vs 頁面滾動**：`.dm-arm` `touch-action:none` + `setPointerCapture` + preventDefault。
- **RPC 慢**：hold 狀態（「…」+ 拉緊）；`flow.settling` 去重；abort 背景結算。
- **舊 CSS 殘留撞名**：新舊 `dm-*` class 名重用（arm/belly 係新義），舊規則要刪乾淨；`RARITY[].ballClass` 無引用可留。
- **音效 iOS**：全部合成 + GainNode；叫聲用現有 `Pokedex.playCry`（已處理解鎖）。
