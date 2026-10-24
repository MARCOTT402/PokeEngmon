# v102：快龍拉手互動抽獎（Drag → 肚開 → 精靈球 → 背景 A → 稀有爆發 → 精靈檢視）

## Summary

把現有 v98–v101 的「金幣三連點 → 機身震動 → 金屬球搖 3 下」稀有抽演出，**完整取代**為以下流程：

1. 抽獎頁點「Insert coin to pull!」→ 進入快龍互動舞台（即時開始，不等 RPC）
2. 玩家拖拽快龍機械手向下，超過閾值 → 肚皮艙門打開
3. 依 server 結果的稀有度跌出對應精靈球：Rare = Great Ball、Epic = Ultra Ball、Legendary = Master Ball（**球種即時揭示**）
4. 精靈球滾出 → 切到「背景 A」金色粒子舞台
5. 球左右搖 2 下（每下配搖晃音效 + 漏光遞進）
6. 依稀有度爆發專屬特效（藍白閃 / 紫色魔法陣 / 金色光柱＋震屏）
7. 球開、光柱衝出螢幕 → 精靈檢視畫面（屬性、等級、六圍、NEW/重複獎勵）
8. Continue → 回到可再抽狀態

經濟結算（`gacha_pull` RPC、扣鑽、派寵、dupe 糖果/EV）**完全沿用 v99/v101 現有邏輯，不改**。

## Current State Analysis

| 檔案 | 現況 |
|---|---|
| [index.html](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/index.html#L189-L240) | `#view-gacha` 內有 `gacha-machine.dragonite`（CSS 機械頭/天線/翼）、`gacha-dome`、`gacha-body`（入幣位/旋鈕/出球口）、`gacha-taps`、`gacha-flash`、`gacha-dropzone`、`gacha-result` |
| [gacha.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/gacha.js) | `pull()` 開 RPC promise → `_startCoinPhase()` → `_tap()`×3 → `_insertCoin()` → `_rumble()` → `_dropBall()`（await `_settleResult()` → 暗転 → 球跌出 → 3 搖 + 升級 → burst）→ `_reveal()` → `_celebrate()` |
| [style.css](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/css/style.css#L560-L1065) | 第 560–1065 行為整個扭蛋機 / 金幣 / 金屬球 / 暗転 / 漏光 / 光柱樣式 |
| [capture.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/capture.js#L65-L311) | `CaptureAudio` 已有合成音：`coin`、`coinInsert`、`rumble`、`ballLand`、`leakHum`、`upgradeSting`、`wobble`、`gotcha`、`correct`、`wrong` |
| [pokedex.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/pokedex.js#L55-L167) | 精靈詳細資料的渲染參考（屬性、六圍、進化鏈） |
| [pokemon.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/pokemon.js#L9-L90) | `dexOf()`（`types`/`baseStats`）、`calcStats()`、`typeColor()`、`typeLabel()`、`typeIconURL()` |
| [sw.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/sw.js) | `CACHE_NAME = "pokeengmon-v101"`，`ASSETS` 手動列出快取檔案 |
| [app.js](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/js/app.js#L6) | `APP_VERSION = "v101"`；`showView()` 離開 gacha 時呼叫 `Gacha.abort()` |

已確認環境：Python 3.12 + Pillow 12.3 可用；GSAP 已本地化於 `vendor/gsap/gsap.min.js`；`prefers-reduced-motion` 有全域 CSS kill-switch。

## 已確認決策（來自用戶）

- **完全取代**舊金幣/震動/金屬球流程，不並存、不保留金幣步驟。
- **混合素材**：精靈球與金色背景用 CSS 繪製；快龍主體用上傳的 `50.webp` 卡通圖（去背、去水印），另加一支可拖拽的機械手臂。
- **球種即時揭示**：Rare → Great Ball、Epic → Ultra Ball、Legendary → Master Ball，不再玩「開場隱藏 → 中途升級」。
- 不加 React / Pixi.js（本專案為 vanilla JS + CSS + GSAP；Pixi 會令 SW 快取與 bundle 大幅膨脹，現有 CSS/GSAP 已足夠做 2D 粒子與光柱）。

## 素材處理（一次性，不進版控的暫存腳本）

- 來源：`c:\Users\user\Downloads\50.webp`（640×829 RGBA）。
- 輸出：`assets/gacha/dragonite.png`。
- 用暫存 Python 腳本（放 `$env:TEMP`，不留在 repo）以 Pillow 處理：
  1. 由四邊 flood-fill 移除近白背景（容差約 18，避免誤刪肚皮奶白色）
  2. 將右下角「萌娘百科」水印區域 alpha 設 0（約 x ≥ 460、y ≥ 780 的最底區域；只清白色背景部分）
  3. trim 透明邊界、保留原始比例，輸出 PNG（寬約 640 已足夠 retina）
- 失敗 fallback：直接用原圖 + CSS `mix-blend-mode: multiply`（金色底可吞白底），但優先做去背版。

## 設計與時間線

### 舞台 A：快龍拉手（`index.html` + CSS）

`#view-gacha` 的 markup 改為：

```html
<div class="gacha-stage" id="gacha-stage">
  <div class="gacha-prompt" id="gacha-prompt"></div>

  <div class="gacha-machine dragonite-art" id="gacha-machine">
    <img class="dm-art" id="dm-art" src="assets/gacha/dragonite.png" alt="Dragonite">
    <div class="dm-belly" id="dm-belly">
      <span class="dm-door left"></span>
      <span class="dm-door right"></span>
      <span class="dm-cavity"></span>
    </div>
    <div class="dm-arm" id="dm-arm" role="slider" tabindex="0"
         aria-label="Pull Dragonite's hand" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <span class="dm-bracket"></span>
      <span class="dm-arm-upper"></span>
      <span class="dm-hand"><i></i><i></i><i></i></span>
    </div>
  </div>

  <div class="gacha-dropzone" id="gacha-dropzone"></div>
  <div class="gacha-result" id="gacha-result"></div>
</div>
```

移除：`dm-head/horn/antenna/eye/snout/wing`、`gacha-dome`、`mini-ball`、`gacha-body`（coin-slot/knob/outlet）、`gacha-taps`、`gacha-flash`。

CSS 要點：

- `#gacha-machine`：`position: relative; width: clamp(200px, 58vw, 290px);` 圖片 `width:100%; height:auto;`，加輕微 idle bob（僅 transform）。
- `.dm-arm`：右側機械拉桿手（橙色金屬臂 + 三爪手掌 + 金屬支架），`position:absolute; right:-8%; top:46%; touch-action:none; cursor:grab;` 的拖拽熱區（建議 64×120px 以上）。
- 拖拽以 CSS 變數驅動：`#gacha-machine { --pull: 0px; --pull-p: 0; }`
  - `.dm-arm { transform: translateY(var(--pull)); }`
  - `.dm-arm-upper { transform-origin: 50% 0; transform: scaleY(calc(1 + var(--pull-p) * 0.35)); }`
  - `.dm-art { transform: rotate(calc(var(--pull-p) * -2deg)) translateY(calc(var(--pull-p) * 4px)); }`
  - `.dm-belly` 邊框光暈隨 `--pull-p` 增強（`box-shadow` 用 `color-mix` 或固定 rgba + opacity 變數）
- `.dm-belly`：覆蓋在圖片肚皮位置的艙門（`position:absolute; left:26%; top:54%; width:44%; height:20%;`），左右兩扇 `.dm-door` 以 `transform-origin` 向外旋開；`.dm-cavity` 為深色內腔 + 金色內光。關閉時艙門以奶白 + 橫紋漸層融入卡通肚皮。
- 開啟狀態：`#gacha-machine.belly-open .dm-door.left { transform: rotateY(-78deg); }`、`.right { rotateY(78deg); }`，cavity 亮起。
- 拖拽提示：`.gacha-pull-hint` 在 hand 階段以呼吸動畫顯示「⇣ Drag Dragonite's hand ⇣」。

### 互動判定（`js/gacha.js`）

- `MAX_PULL = 150`（px，手機可用 `Math.min(150, innerHeight * 0.22)`）、`THRESHOLD = 0.72`（進度 ≥ 0.72 觸發，不用放手）。
- `pointerdown` on `#dm-arm` → `setPointerCapture`；`pointermove` 計算 `dy = clamp(clientY - startY, 0, MAX_PULL)`，更新 `--pull` / `--pull-p`，`aria-valuenow = round(p*100)`。
- `p < THRESHOLD` 時每 80ms 最多播一次 `audio.pullCreak(p)`（拖拽繃緊聲）。
- 放手未達標 → GSAP `elastic.out(1, .45)` 回彈（`gsap` 不存在時用 CSS transition），播 `audio.pullSnap()`。
- `p ≥ THRESHOLD` → 觸發 `_bellyOpen()`：
  - 鎖定拖拽、手臂回彈、`audio.pullSnap()`
  - 180ms 後 `#gacha-machine.classList.add("belly-open")` + `audio.bellyOpen()` + haptic
  - 同時開始 `_settleResult(flow)`（見下）
- 無障礙 / 測試 fallback：`#dm-arm` 的 `keydown`（Enter/Space）或 click（非拖拽）→ 用 GSAP 自動拉到 100% 再觸發。
- `Gacha.abort()` / `_resetStage()` 必須解除 pointer capture、移除 class、`gsap.killTweensOf` 所有舞台元素、清 `--pull`。

### 結算時序（維持 v99/v101）

- `pull()` 照舊建立 `this._flow`（含背景 `gachaPull` promise），**立即**進入 `phase = "hand"`，按鈕鎖為「Pulling…」。
- 玩家拖拽期間 RPC 通常已完成；到閾值才 `await this._settleResult(flow)`。
- 若仍未回：prompt 顯示 `…`、手保持拉緊 + 低鳴（`audio.leakHum(1)` 循環一次），RPC 一到即繼續；失敗則走現有本地 fallback。
- 結算失敗（回 null）：解鎖 UI、`_resetStage()`、顯示「Something went wrong — try again.」。

### 球種映射

```js
const GACHA_BALL = {
  rare:   { cls: "ball-great",  glow: "#42a5f5" },
  epic:   { cls: "ball-ultra",  glow: "#f5b301" },
  legend: { cls: "ball-master", glow: "#d16bff" }
};
```

CSS 沿用 `.pokeball` / `.pb-top` / `.pb-mid` / `.pb-bottom` / `.pb-btn` 結構：

- `.ball-great`：藍頂 + 左右紅色弧形條（`.pb-top::before/::after`）+ 黑腰帶 + 白底
- `.ball-ultra`：黑頂 + 黃色雙弧 + 黑腰帶 + 白底
- `.ball-master`：紫頂 + 粉紅高光 + 白色 `M`（`::after` 用 clip-path 或 SVG mask）+ 黑腰帶 + 白底
- 漏光色：rare `#6ec6ff`、epic `#ffd54f`、legend `#ffffff`（沿用 `.leak-*`）

### 舞台 A → 背景 A 轉場

1. 艙門開後 420ms，生成 `.gacha-eject-ball.pokeball.giant.metal.<ball cls>` 於 `#gacha-dropzone`，用 `ball-eject` CSS 動畫：由肚位跌落 → 兩次小彈跳 → 向右滾出（`translateX + rotate`），900ms 後移除。
2. 同時間 `audio.ballEject()`（重用 `ballLand` + 低頻滾動聲）、`audio.ballRoll()`。
3. 780ms 時建立 `#gacha-scene-b`（見下），fade in 覆蓋全螢幕；快龍舞台 fade/scale 退場（`.gacha-stage.stage-b`）。

### 背景 A（`#gacha-scene-b`，JS 動態建立一次）

```html
<div class="gacha-scene-b" id="gacha-scene-b">
  <div class="gsb-bg">
    <i class="gsb-wave w1"></i><i class="gsb-wave w2"></i><i class="gsb-wave w3"></i>
    <i class="gsb-horizon"></i>
    <div class="gsb-particles" id="gsb-particles"></div>
  </div>
  <div class="gsb-spot"></div>
  <div class="gsb-stage">
    <div class="gsb-ball-wrap" id="gsb-ball-wrap">
      <div class="pokeball giant metal ball-great" id="gsb-ball"></div>
    </div>
    <div class="gsb-rings" id="gsb-rings"></div>
    <div class="gsb-magic" id="gsb-magic"></div>
    <div class="gsb-beam" id="gsb-beam"></div>
  </div>
  <div class="gacha-prompt show" id="gsb-prompt">It's rolling…</div>
</div>
```

- `position: fixed; inset: 0; z-index: 60;` 深棕黑 → 金色地平線，`.gsb-wave` 3 層模糊金色流體（`border-radius` + `filter: blur` + 緩慢位移），`.gsb-particles` 20–28 粒 CSS 金點向上飄。
- 球由右側滾入（`gsb-roll-in` 0.7s，帶 rotate），停正中。

### 搖晃與稀有爆發時間線（由球停定起計）

| t (ms) | 演出 |
|---|---|
| 0 | prompt「Something is moving…」 |
| 350 | 搖 1：`.wob` + `audio.wobble(1)` + `leak lk1` + haptic 18 |
| 1050 | 搖 2：`.wob` + `audio.wobble(2)` + `leak lk2` + `audio.leakHum(2)` + haptic 24 |
| 1800 | 依稀有度爆發（見下）；prompt 清空 |
| 2450 | 開球：`.stage-open` 等效（`.pb-top/.pb-bottom` 分離）+ 光柱升起 |
| 2900 | 光柱／整幕 GSAP zoom（scale 1.12 + 白閃），`audio.beamWhoosh()` |
| 3250 | `_revealInspect()`，背景 A 淡出 |

稀有爆發分級（`gsap` 存在時用 timeline，否則直接加 class）：

- **rare**：藍白 radial flash + 1 個衝擊波環 + 10 粒藍星，無震屏。
- **epic**：紫金 flash + `.gsb-magic`（旋轉 conic 魔法陣 + 虛線符文環）+ 2 個衝擊波 + 16 粒星 + 輕微震屏（`gsap.fromTo(document.querySelector("#gacha-scene-b"), {x:-5},{x:0})`）+ `audio.upgradeSting(1)`。
- **legend**：金色光柱 + 白閃 + `.gsb-magic` + 3 個衝擊波 + 24 粒星 + 強震屏（x:-8, elastic）+ `audio.upgradeSting(2)`。

所有粒子 / 環 / 光柱在動畫完結後由 `setTimeout` 移除（不進 `_timers`，避免中斷殘留）。

### 精靈檢視畫面（`#gacha-inspect`）

`_revealInspect(flow, s)` 建立 fixed overlay（`z-index: 80`），內容：

```html
<div class="gacha-inspect" id="gacha-inspect">
  <div class="gi-rays"></div>
  <div class="gi-card">
    <span class="gi-rarity">LEGENDARY</span>
    <img class="gi-art" id="gi-art" src="" alt="">
    <div class="gi-name">Dragonite</div>
    <div class="gi-meta">No.149 ・ Lv.20 ・ ★★</div>
    <div class="gi-types"></div>
    <div class="gi-stats"></div>
    <div class="gi-note"></div>
    <button class="btn-big btn-primary" id="gi-continue">Continue</button>
  </div>
</div>
```

- 資料來源：`entryCurrentSpecies(entry)`、`dexOf(dexId).types`、`calcStats(dexId, level, entry.ivs, entry.evs, entry.nature)`、`typeColor/typeLabel/typeIconURL`、`RARITY[rarity]`。
- `.gi-rays` 以稀有度色 conic-gradient 旋轉（epic/legend 才有）。
- `.gi-art` 用 `artworkURL(dexId)`，`onerror` fallback 去 `spriteURL(dexId)`。
- `.gi-note`：NEW! 或「You already have it! EV +1 ・ 🍬 Candy +1」（沿用現有文案）。
- 非第一次抽到時不播叫聲；新寵 `Pokedex.playCry(dexId)` 於卡片入場後 350ms。
- Continue handler：移除 overlay → `_resetStage()` → `_refreshControls()` → `App.renderHome()`；如 `s.firstExpEvolve` 存在，於此才 `App.showEvolveModal()`（避免 modal 被 inspect 蓋住）。
- 檢視畫面本身的入場／退場用 CSS `gi-in`，GSAP 只負責光柱 zoom。

## Proposed Changes

### 1. `assets/gacha/dragonite.png`（新增）

依「素材處理」章節產生。放進 `assets/gacha/`。

### 2. `index.html`

- 替換 `#view-gacha` 的 `.gacha-machine` 區塊為上文「舞台 A」結構（保留 `gacha-prompt`、`gacha-dropzone`、`gacha-result`）。
- 移除 `#gacha-taps`、`#gacha-flash`。
- 版本號：所有 `?v=101` → `?v=102`；`<p class="footer-version">v77</p>` → `v102`。

### 3. `css/style.css`

- 刪除整個 v98–v101 扭蛋機段落中不再使用的規則：`.dm-head/.dm-horn/.dm-antenna/.dm-eye/.dm-snout/.dm-wing`、`.gacha-dome`、`.mini-ball`、`.gacha-body`、`.gacha-coin-slot`、`.gacha-knob`、`.gacha-outlet`、`.gacha-taps`、`.gacha-coin-grand`、`.gc-*`、`machine-rumble`/`antenna-jitter`/`wing-flap-*`、`.gacha-dim`、`.gacha-burst`（由 `#gacha-scene-b` 取代）。
- 保留並重用：`.pokeball` 基礎、`.pb-*`、`.wob`/`ball-wobble`、`.leak-blue/gold/rainbow`、`lk1/2/3`、`.stage-open` 開球 keyframes、`.gacha-flash` 的 flash 概念（改用 scene B 的 `.gsb-flash`）。
- 新增段落（放在原扭蛋機段落位置）：
  - `.dragonite-art`、`.dm-art`、`.dm-belly`、`.dm-door`、`.dm-cavity`、`.dm-arm`、`.dm-arm-upper`、`.dm-hand`、`.dm-bracket`、`.gacha-pull-hint`、`belly-open` 狀態、`ball-eject` keyframes
  - `.ball-great/.ball-ultra/.ball-master` 三款球面裝飾
  - `#gacha-scene-b` 全套（bg/wave/horizon/particles/spot/stage/rings/magic/beam/flash + keyframes `gsb-wave-drift`、`gsb-rise`、`gsb-roll-in`、`gsb-magic-spin`、`gsb-beam-rise`）
  - `#gacha-inspect`（overlay、rays、card、types、stats、note、Continue、入場動畫）
- 所有新 hover 效果跟現有規範（`@media (hover: hover) and (pointer: fine)`、120ms ease-out-quart、只動 transform）；`prefers-reduced-motion` 由現有全域規則覆蓋。

### 4. `js/gacha.js`（重點重寫，結算部分不動）

保留：`mode/busy/_flowId/_flow/_timers/_bound`、`open/abort/_setT/_clearTimers/_lockButton/_updateDiamondDisplay/_canPull/_refreshControls/rollRarity/pickChain/_prompt/_haptic/_audio/_settleResult`。

刪除：`_bindTap`（及 `_tap/_updateDots/_showTaps`）、`_startCoinPhase`、`_insertCoin`、`_rumble`、`_ensureDim`、`_setEyes`、`_celebrate`、舊 `_dropBall`。

新增：

- `_startHandPhase()`：`phase="hand"`，`view-gacha` 加 `.playing`，顯示手部拖拽提示，`audio.ready()`，綁定 pointer/keyboard（只綁一次，檢查 `phase`）。
- `_onArmDown/_onArmMove/_onArmUp`：拖拽邏輯、`_setPull(p)`、音效節流。
- `_setPull(p)`：寫 `--pull` / `--pull-p` / `aria-valuenow`。
- `_bellyOpen(flow)`：鎖拖拽、回彈、艙門開、await `_settleResult`、`_ballDrop(s)`。
- `_ballDrop(s)`：建立射出球、播放跌落/滾出、`_openSceneB(s)`。
- `_openSceneB(s)`：建立 scene B DOM（若未存在）、滾入球、`_sceneBTimeline(s)`。
- `_sceneBTimeline(s)`：依上表排 2 搖、爆發、開球、光柱、`_revealInspect`。
- `_burst(rarity)`：分級特效（GSAP 或 class fallback）。
- `_revealInspect(flow, s)`：檢視卡 + Continue + cry + 結算 UI 復原。
- `_cleanupScene()`：移除 scene B / inspect / eject ball、kill GSAP、移除 class；由 `_resetStage()` 與 `abort()` 呼叫。
- dev hook（localhost only）：`window.__gachaForceRarity = r => ...`，讓 `_ballDrop` 的視覺 rarity 可用 `rare|epic|legend` 覆寫（只影響演出，不影響獎勵）。

`_resetStage()` 擴充：清 `--pull`、`.belly-open`、`.stage-b`、移除 scene B/inspect、prompt 清空。

### 5. `js/capture.js`（`CaptureAudio` 新增合成音，無新音檔）

- `pullCreak(p)`：低頻 saw + bandpass noise，音量隨 p 升。
- `pullSnap()`：短促低頻 thud + 金屬 tick。
- `bellyOpen()`：機械鎖扣聲（低 tone + 兩下 noise hit + 上升 pop）。
- `ballEject()`：重用 `ballLand()` 質感 + 低頻滾動。
- `ballRoll()`：0.7s bandpass noise sweep + 輕微低 tone。
- `beamWhoosh()`：上升 noise sweep + 高頻 shimmer。
- 全部遵守現有 iOS 規則：只用 Web Audio 合成、不靠 `<audio>.volume`、長 effect 不用長時間 automation ramp。

### 6. `sw.js`

- `CACHE_NAME` → `pokeengmon-v102`。
- `ASSETS` 加 `"./assets/gacha/dragonite.png"`。

### 7. `js/app.js`

- `APP_VERSION` → `"v102"`。
- 不需改路由；`showView()` 已會 `Gacha.abort()`。

### 8. 版本同步（Rule 1）

三個檔案同一版本號：`js/app.js`、`sw.js`、`index.html`（全部 `?v=102`）。

## Assumptions & Decisions

- 快龍圖以「角色本體」使用；可拖拽的手是**額外畫的機械拉桿手**（右側金屬支架 + 三爪），避免同原圖手臂重疊造成雙臂。
- 屬性／六圍需要 `POKEMON_DEX` 已載入；`dexOf()` 回 null 時，types 與 stats 區塊自動隱藏（不顯示 `undefined`）。
- 球種即時揭示後，不再保留 v100 的「升級」beat；`.pokeball.upgrade` 規則可一併移除。
- 不使用 Pixi.js / React / Tailwind；粒子與光柱用 CSS + GSAP。
- 背景 A 用 CSS 繪製（不直接貼 `main.webp`），避免圖片版權與壓縮問題；金色流體視覺對齊用戶提供的參考圖。
- 不改 Supabase schema / RPC；`gachaPull` 的 server 權威結果直接決定球種。

## Verification

1. `python -m http.server 8080`（repo root），開 `http://localhost:8080`。
2. 主頁 → 💎 → Rare Pull：
   - 按鈕立即變「Pulling…」，出現快龍與拉手提示（不等 RPC）。
   - 拖 < 72% 放手 → 手臂 elastic 回彈、無球跌出。
   - 拖 ≥ 72% → 艙門開、球跌出滾走、場景切到金色背景 A。
3. 背景 A：球滾入 → 搖 2 下（每下有聲）→ 依稀有度爆發 → 開球光柱 → 檢視卡。
4. 使用 `window.__gachaForceRarity("rare"|"epic"|"legend")` 逐個驗證：球款（Great/Ultra/Master）、爆發特效層級、震屏強度。
5. 檢視卡：名稱、No.、Lv、星數、屬性 chips（icon + 顏色）、六圍、NEW/dupe 文案、Continue 正常；新寵有叫聲，dupe 無叫聲。
6. 經濟：每次抽只扣 3 鑽一次；`user_entries`/dupe 糖果/EV、`pendingExp` 入帳與 v101 一致；Continue 後餘額正確、可立即再抽。
7. 中斷測試：動畫中途按「‹ Back to Home」→ 已結算獎勵仍在、無殘留 overlay / 無 JS error。
8. Mobile 375×667：無橫向滾動、拉手熱區可觸及、拖拽時頁面不滾動、背景 A 滿版。
9. `prefers-reduced-motion: reduce`：動畫近乎即時、流程仍可完成。
10. Console 無紅色 error；`navigator.vibrate` 不支援時不報錯。
11. 完成後 `git add` 指定檔案 → `git commit -m "v102: ..."` → `git push`（Rule 6）。

## Risks / Mitigations

- **圖片去背瑕疵**：先輸出並目視檢查；若邊緣有白邊，改為多 pass（邊緣羽化 + 去除孤立白點）；仍失敗則改用 `mix-blend-mode: multiply`。
- **拖拽與頁面滾動衝突**：`.dm-arm` 加 `touch-action: none`，pointermove `preventDefault()`，並用 `setPointerCapture`。
- **RPC 延遲**：沿用 v101 hold 狀態（「…」+ 拉緊低鳴），不卡死、不重複結算（`flow.settling` 去重）。
- **GSAP 時間線與中斷**：所有 GSAP 動畫掛在 `this._tl`，`abort()/reset` 時 `kill()`；不把粒子清理 timeout 放進 `_timers`。
- **fixed overlay 被祖先 transform 影響**：`#gacha-scene-b`/`#gacha-inspect` 直接 append 到 `#view-gacha` 外層（`document.getElementById("app")`）或確認 `.view` 無殘留 transform；優先 append 到 `body`-level 容器。
- **SW 快取舊檔**：版本三檔同步 + `CACHE_NAME` bump + 新 asset 入 `ASSETS`。
