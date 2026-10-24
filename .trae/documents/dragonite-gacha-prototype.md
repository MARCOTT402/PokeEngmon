# Prototype：快龍拉手抽獎互動（獨立 HTML，先睇效果）

## Summary

先做一個**獨立可視化 Prototype**，用單一 HTML + CSS + GSAP 重現完整互動：

**拉快龍機械手 → 肚皮艙門開 → 精靈球跌出滾走 → 背景 A 金色舞台 → 搖 2 下 → 依稀有度爆特效 → 球開光柱衝出螢幕 → 精靈檢視卡**

- 唔改動遊戲任何檔案（`index.html` / `js` / `css` / `sw.js` 全部不動），唔升版本號。
- Prototype 內建 **AUTO / RARE / EPIC / LEGEND** 稀有度切換器 + Replay，方便逐級睇演出。
- 確認視覺 / 節奏 OK 之後，才另開任務整合入遊戲（對應方案見文末附錄）。

## Deliverables

| 路徑 | 內容 |
|---|---|
| `prototype/dragonite-gacha.html` | 單一檔案 Prototype：HTML + inline CSS + inline JS，載入 `../vendor/gsap/gsap.min.js` |
| `prototype/assets/dragonite.png` | 由 `c:\Users\user\Downloads\50.webp` 去背、去水印後嘅快龍圖 |

外部依賴只用專案現有資源：

- `../vendor/gsap/gsap.min.js`（本地 GSAP）
- `../assets/animated/<dex>.gif`（本地像素動畫，作檢視卡 fallback）
- `../assets/cries/<dex>.mp3`（本地叫聲）
- 檢視卡主圖用 `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/<dex>.png`，`onerror` 自動 fallback 去本地 GIF（離線亦有圖）。

## 素材處理

用暫存 Python 腳本（放 `$env:TEMP`，不進 repo）以 Pillow（環境已確認可用）處理 `50.webp`：

1. 四邊 flood-fill 移除近白背景（容差 ~18，保護奶白肚皮）
2. 右下角「萌娘百科」水印區域 alpha 設 0
3. trim 透明邊界，輸出 `prototype/assets/dragonite.png`（保留 640×829 原始比例）
4. 目視檢查邊緣白邊；如有，加 1px 羽化 / 去孤立白點再輸出

若去背後果嚴重，Prototype 先用 `mix-blend-mode: multiply` 直接貼原圖（金色底可吞白底）。

## Prototype 結構

### 0. 起始畫面（解決瀏覽器自動播放限制）

- `#start-screen`：深金背景 + 標題 `DRAGONITE PULL` + `TAP TO START`。
- 點擊後 `AudioContext.resume()`、預先解鎖音效，fade 到舞台 A。
- 右上角固定小工具列：稀有度 pills（`AUTO / RARE / EPIC / LEGEND`）+ 靜音 toggle。

### 1. 舞台 A：拉手（`#scene-a`）

```html
<section id="scene-a">
  <div class="pull-hint" id="pull-hint">⇣ DRAG DRAGONITE'S HAND ⇣</div>
  <div class="dragonite" id="dragonite">
    <img class="dm-art" src="assets/dragonite.png" alt="Dragonite">
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
  <div class="eject-zone" id="eject-zone"></div>
</section>
```

- 背景：暖金漸層 + 柔光暈 + 輕微暗角（對齊上傳參考圖的金色調）。
- 快龍圖：`width: clamp(210px, 58vw, 320px)`，底部對齊，idle 上下浮動（只動 transform）。
- `.dm-arm`：右側腰間機械拉桿手（金屬支架 + 橙色伸縮臂 + 三爪手掌），避開原圖手臂位置，唔會出現雙臂。
- `.dm-belly`：覆蓋原圖肚皮位置嘅艙門（`left:26%; top:52%; width:44%; height:19%`），左右門以奶白 + 橫紋融入原圖；開啟時 `rotateY(±78deg)`，內腔亮金光。

### 2. 拖拽邏輯

- 常數：`MAX_PULL = 150px`、`THRESHOLD = 0.72`。
- `pointerdown` on `#dm-arm` → `setPointerCapture`；`touch-action: none`。
- `pointermove`：`dy = clamp(clientY - startY, 0, MAX_PULL)`，寫 CSS 變數 `--pull` / `--pull-p`，同步 `aria-valuenow`。
- 視覺：手臂 `translateY(var(--pull))`、上臂 `scaleY(1 + p*0.35)`、快龍 `rotate(-2deg * p)`、艙門邊框光暈隨 p 增強。
- 音效：`creak(p)` 每 80ms 最多一次，音高隨 p 上升。
- 放手未達標：GSAP `elastic.out(1, .45)` 回彈 + `snap()`，提示不變。
- 進度 ≥ 72%：觸發 `openBelly()`（不用等放手）：
  1. 鎖拖拽、手臂回彈
  2. 180ms 後艙門開 + `belly()` + 畫面輕震
  3. 420ms 後 `dropBall()`
- 無障礙 / 測試 fallback：`#dm-arm` 按 Enter / Space 或直接 click → GSAP 自動拉到底再觸發。

### 3. 球跌出（`dropBall()`）

- 依稀有度建球：`rare → .ball-great`、`epic → .ball-ultra`、`legend → .ball-master`（三款純 CSS 球面，參考上傳的 Great Ball / Master Ball）。
- `.eject-ball` 從艙門位置：跌落 → 兩次小彈跳 → 向右滾出畫面（`translate + rotate`，900ms），配 `land()` + `roll()`。
- 完成後 `openSceneB()`。

### 4. 背景 A（`#scene-b`，固定全螢幕）

```html
<section id="scene-b" class="hidden">
  <div class="gsb-bg">
    <i class="gsb-wave w1"></i><i class="gsb-wave w2"></i><i class="gsb-wave w3"></i>
    <i class="gsb-horizon"></i>
    <div class="gsb-particles"></div>
  </div>
  <div class="gsb-spot"></div>
  <div class="gsb-stage">
    <div class="gsb-ball-wrap" id="gsb-ball-wrap">
      <div class="pokeball giant ball-great" id="gsb-ball"></div>
    </div>
    <div class="gsb-rings" id="gsb-rings"></div>
    <div class="gsb-magic hidden" id="gsb-magic"></div>
    <div class="gsb-beam hidden" id="gsb-beam"></div>
    <div class="gsb-flash" id="gsb-flash"></div>
  </div>
</section>
```

- 視覺：深棕黑 → 金色地平線、3 層模糊金色流體、向上飄金粒子、頂部聚光。
- 球由右側滾入（0.7s rotate），停正中；同款球（顏色/紋理延續舞台 A）。

### 5. 搖晃 + 稀有爆發時間線（球停定後起計）

| t (ms) | 演出 |
|---|---|
| 0 | 提示 `Something is moving…` |
| 350 | 搖 1：`.wob` + `wobble(1)` + 漏光 `lk1` + 畫面微震 |
| 1050 | 搖 2：`.wob` + `wobble(2)` + 漏光 `lk2` + `leak()` |
| 1800 | 依稀有度爆發（下表） |
| 2450 | 球上下分離（`.open` → `.pb-top` / `.pb-bottom` 分開） |
| 2850 | 光柱升起 + 全幕 GSAP zoom（scale 1.12）+ 白閃 + `beam()` |
| 3250 | 切到 `#inspect`（背景 A 淡出） |

稀有爆發分級：

- **RARE**：藍白 radial flash + 1 個衝擊波環 + 10 粒藍星，無震屏，`burst("rare")`。
- **EPIC**：紫金 flash + 旋轉魔法陣（conic + 虛線符文環）+ 2 個衝擊波 + 16 粒星 + 輕震屏（GSAP x:-5 → 0）。
- **LEGEND**：金色光柱 + 大面積白閃 + 魔法陣 + 3 個衝擊波 + 24 粒星 + 強震屏（GSAP x:-8, elastic）。

所有臨時粒子 / 環在動畫後 `setTimeout` 移除；GSAP 時間線統一掛 `tl`，中斷時 `tl.kill()`。

### 6. 精靈檢視（`#inspect`）

```html
<section id="inspect" class="hidden">
  <div class="gi-rays"></div>
  <div class="gi-card">
    <span class="gi-rarity">LEGENDARY</span>
    <img class="gi-art" id="gi-art" alt="">
    <h1 class="gi-name"></h1>
    <div class="gi-meta"></div>
    <div class="gi-types"></div>
    <div class="gi-stats"></div>
    <div class="gi-note"></div>
    <button id="gi-continue">CONTINUE</button>
  </div>
</section>
```

- 卡的內容：稀有度 chip、官方 artwork（fallback 本地 GIF）、名字、`No.149 ・ Lv.20 ・ ★★`、屬性 chips（本地 `../assets/types/*.png` + 屬性色）、六圍、`NEW!` / dupe 模擬文案。
- 入場：`.gi-card` 由下彈入 + 光線旋轉；新寵 350ms 後播 `cries/<dex>.mp3`。
- Continue → 關閉、重設全部 stage/class/變數、回到可再拉狀態（pills 保留）。
- 點卡背景 / Continue 都可以繼續。

### 7. Prototype 假資料

```js
const DEMO = {
  rare:   [{ dex: 1, name: "Bulbasaur", types: ["grass","poison"], stats: {...} },
           { dex: 4, name: "Charmander", types: ["fire"], stats: {...} }],
  epic:   [{ dex: 130, name: "Gyarados", types: ["water","flying"], stats: {...} },
           { dex: 94, name: "Gengar", types: ["ghost","poison"], stats: {...} }],
  legend: [{ dex: 149, name: "Dragonite", types: ["dragon","flying"], stats: {...} },
           { dex: 150, name: "Mewtwo", types: ["psychic"], stats: {...} }]
};
```

- `AUTO` 模式機率：RARE 72% / EPIC 23% / LEGEND 5%（只影響 Prototype 演出）。
- 六圍用 PokéAPI base stats 數值靜態寫入；Lv 隨機 15–30；星數由稀有度決定（Rare 1★ / Epic 2★ / Legend 3★）。
- 唔做真正 EV/IV/糖果計算（Prototype 用 mock 文案）。

### 8. 音效（全合成 + 本地叫聲）

在 Prototype 內寫一個迷你 `SFX`（Web Audio 合成，複製現有 `CaptureAudio` 的簡化版）：

- `creak(p)`、`snap()`、`belly()`、`land()`、`roll()`、`wobble(i)`、`leak()`、`burst(rarity)`、`beam()`、`ui()`
- 叫聲：`new Audio("../assets/cries/<dex>.mp3")`
- 首次點擊 START 解鎖 `AudioContext`；靜音 toggle 記住狀態（`localStorage`）。
- 所有音量經 `GainNode`，唔用 `<audio>.volume`（iOS 相容）。

### 9. RWD / 無障礙

- 用 `100dvh`；舞台 A 在 375×667 無需滾動即可拉手。
- 桌面專注 hover：手部 `cursor: grab/grabbing`；不做多餘 hover 放大。
- `prefers-reduced-motion: reduce`：跳過 GSAP 震屏 / zoom，縮短時間線為即時 class 切換。
- 所有互動元素可鍵盤操作；`#dm-arm` 有 `role="slider"` + aria 值。

## 實作步驟

1. 建立 `prototype/assets/`，用暫存 Pillow 腳本輸出 `dragonite.png`。
2. 建立 `prototype/dragonite-gacha.html`：
   - `<head>`：本地 GSAP、inline CSS（reset / 三場景 / 三種球 / 特效 / inspect / RWD / reduced-motion）。
   - `<body>`：start screen、toolbar、scene A、scene B、inspect。
   - `<script>`：`SFX`、`DEMO`、`state`（`idle | hand | opening | drop | sceneB | burst | beam | inspect`）、拖拽、掉落、場景 B 時間線、檢視卡、重置。
3. 時間線全部用 `gsap.timeline({paused:true})` 或 `gsap.delayedCall`，集中一個 `tl`，`reset()` 時 `tl.kill()`。
4. 自測：三個稀有度 pills 各跑一次、拖拽未達標回彈、Continue 重設、Replay。
5. 用 browser agent 在 `http://localhost:8080/prototype/dragonite-gacha.html` 實測（桌面 + 窄屏），必要時微調尺寸/節奏。

## Verification

1. repo root 開 `python -m http.server 8080`，瀏覽 `http://localhost:8080/prototype/dragonite-gacha.html`。
2. Start screen 點擊後有聲、進入舞台 A。
3. 拖手 < 72% 放手 → 彈回、無球；拖 ≥ 72% → 艙門開、球跌出、轉背景 A。
4. 背景 A：滾入 → 2 搖（有聲）→ 對應爆發 → 開球光柱 → 檢視卡。
5. RARE / EPIC / LEGEND 三個 pill 逐個驗證：球款、特效層級、震屏、稀有度 chip。
6. 檢視卡資料完整（名字、No.、Lv、星、屬性 chips + icon、六圍、註解），Continue 可重玩。
7. 375×667 無橫向滾動、拉手可觸及、拖拽時頁面不滾動。
8. Console 無紅色 error；GSAP 缺失時有 CSS fallback（唔會白屏）。
9. Prototype 完全唔影響遊戲：`git status` 只應見到 `prototype/` 新檔案。

## Assumptions & Decisions

- Prototype 用**獨立單檔**，唔抽共用 module，方便直接開嚟睇；確認後才整合。
- 快龍用上傳圖做主體；可拖嘅手係額外畫的右側機械拉桿手（避免與原圖手臂重疊）。
- 球款即時揭示：Rare = Great Ball、Epic = Ultra Ball、Legendary = Master Ball。
- 背景 A 用 CSS 繪製（金流體 + 粒子），唔直接貼 `main.webp`。
- 檢視卡用 mock 資料；唔接 Supabase、唔扣鑽、唔寫存檔。
- 音效全部合成 + 本地叫聲，無新音檔。

## Risks / Mitigations

- **去背白邊**：目視檢查 + 羽化；失敗改用 `mix-blend-mode: multiply`。
- **機械手遮住原圖手臂**：手臂放右側腰間（支架固定在身側），唔覆蓋原圖手臂；必要時改掛在左下側。
- **iOS fixed overlay**：用 `100dvh` + `overscroll-behavior: none`；場景 B / inspect 直接掛 `<body>`。
- **GSAP 載入失敗**：所有關鍵狀態都有 CSS class fallback（`noscript` 級降級動畫）。
- **計時器殘留**：所有 `setTimeout` 存入 `timers[]`，`reset()` 全部 `clearTimeout`。

## 附錄：確認後如何整合入遊戲（今次唔做）

- DOM：替換 `index.html` `#view-gacha` 內 `.gacha-machine`（移除金幣/taps/dome/body），加入 Dragonite 舞台結構。
- CSS：刪除 v98–v101 金幣/金屬球/暗転規則，新增本 Prototype 的三場景樣式與三款球。
- JS：`js/gacha.js` 保留 `_settleResult` 與 RPC 結算，將 `_startCoinPhase` 換成 `_startHandPhase`，新增 `_bellyOpen/_dropBall/_openSceneB/_sceneBTimeline/_revealInspect/_cleanupScene`；`_reveal` 改為檢視卡（continue 後才顯示 evolve modal）。
- `js/capture.js`：新增 `pullCreak/pullSnap/bellyOpen/ballEject/ballRoll/beamWhoosh`。
- 版本 v102：`js/app.js`、`sw.js`（`CACHE_NAME` + `ASSETS` 加 `assets/gacha/dragonite.png`）、`index.html` 全部 `?v=102`。
- 沿用 server 權威 `gachaPull` 結果決定球種，不改 schema/RPC。
