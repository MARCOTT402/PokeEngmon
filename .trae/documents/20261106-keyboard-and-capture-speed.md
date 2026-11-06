# 計劃：電腦端全鍵盤操作 + 動畫倍速（捕捉／扭蛋／進化）（2026-11-06）

> 兩個獨立功能，可以分開做、分開 commit。建議次序：**B（動畫倍速，細、即刻見效）→ A（鍵盤，分期）**。
> 改碼前照讀：preop 總索引 → `pokeengmon-responsive`（§10 鍵盤／focus，Rule 88）、`pokeengmon-ui-sheets`、`pokeengmon-quiz`、`pokeengmon-battle`。

---

## 現況（盤點結果）

### 鍵盤
- 冇統一嘅 key router；`document.addEventListener("keydown")` 散落各處：
  - `js/app.js:2403` Auth 卡 Esc 關閉
  - `js/app.js:3827` Enter：結算頁 = Continue；答題頁 = Next／確認彈窗
  - `js/app.js:3863` Esc：關 sheet → wide overlay 返主頁 → 答題設定
  - `js/app.js:3945` Ctrl/Cmd+P 播圖片題語音；`:3955` Ctrl+H 提示
  - `js/quiz.js:422` 輸入格 Enter 交卷；`js/gacha.js:1127` 扭蛋 arm Enter/Space
- `:focus-visible` 樣式已經有（`css/style.css:5079`，Rule 88），即係 Tab 已經「睇得到」，但好多可撳嘢係 `<div>`（背包 `.bag-slot`、戰鬥 `.party-slot`／`.team-slot`／`.tl-chip`、圖鑑 `.mv-wrap`…）→ Tab 唔到、Enter 冇反應。
- 背包靠 drag & drop（`js/bag.js:529` `api.bind`）→ 鍵盤完全用唔到。
- 捕捉只聽 `pointerdown`（`js/capture.js:932`）→ 三下 tap 冇鍵盤版。
- 冇快捷鍵說明。

### 捕捉計時（`js/capture.js`）
- 動畫係 **GSAP tween/timeline + 一堆 `setTimeout` + Three.js `clock.getDelta()`** 混用：
  - WARNING 2600ms（`:1013`）、hide 560ms、warp 950ms
  - throw hit-stop（`:1875`）、impact → absorb 180ms／shakes 1250ms（`:1964-1965`）
  - shakes timeline ≈ 4.75s、suspense（`:2065`、`:2099`）、gotcha 自動完結 3000ms（`:2106`）、走甩 3500ms（`:2207`）、`_escapeTimers`
  - BGM `duckBGM(0, 6200)`：設計係「第 3 下搖剛好靜晒」，要跟倍速
  - CSS：`#view-capture.active { animation: capture-in .45s }`、warning／warp 嘅 CSS transition
- 1× 全程（唔計用戶三下 tap）大約 16 秒；2× ≈ 8 秒；3× ≈ 5.5 秒。
- 音量設定存 `localStorage`（`js/storage.js` `loadAudioPrefs`／`saveAudioPrefs`）；Settings 有兩處 UI：Home `#sheet-setting`（`index.html:343`，主力）同舊 `App.openSettings()` modal（`js/app.js:2000`）。

---

> ✅ B 部分 2026-11-06 完成（未 commit），見 Rule 95。

## B. 動畫倍速（1× / 2× / 3×）：捕捉 + 扭蛋 + 進化

### 決定（已確認 2026-11-06）
- 設定只存本機（`localStorage`，key `pe_anim_speed`），**唔上雲**；預設 1×。Settings 顯示名「Animation speed」。
- 套用到**捕捉、扭蛋、進化**三個動畫。
- 只加快「等嘅部分」；用戶要做嘅互動（捕捉三下 tap、扭蛋拉 arm 嘅手感彈簧）唔變。
- 音效唔變 pitch、唔加速（快咗會失真）；只係各音效觸發時間跟住提早。BGM fade／音樂 cut 時長除以倍速。

### 共用 helper：`js/anim-speed.js`（`window.AnimSpeed`）
- `AnimSpeed.get()`：讀 `pe_anim_speed`（只接受 1／2／3，其他 → 1）；`AnimSpeed.set(v)`。
- `AnimSpeed.begin(tag)`：`gsap.globalTimeline.timeScale(spd)` + `<html>` 設 `--anim-spd`；回傳 `spd`。
- `AnimSpeed.end(tag)`：還原 `timeScale(1)`、`--anim-spd: 1`。用 tag 記住邊個 begin 咗，`end` 只還原自己嗰次；任何中斷／關閉路徑都要叫（否則之後全 app GSAP 都快咗）。
- `AnimSpeed.ms(ms)` = `ms / spd`（場景 begin 之後用嗰次 begin 嘅值，唔好中途變）。
- 加入 `index.html` script 次序（喺 capture／gacha／evolve-scene 之前）同 `sw.js` ASSETS；`CODEBASE_INDEX.md` 加一行。

### 步驟
1. **helper**：如上開 `js/anim-speed.js`。
2. **Settings UI**：`#sheet-setting` 加一個「Gameplay」區，「Animation speed」三格 segmented（`1×｜2×｜3×`，`role="radiogroup"`，左右箭咀切換，跟 `.au-seg` 寫法）；`App.openSettings()` modal 同步加（或確認呢個 modal 已冇入口就淨改 sheet）。改完即時寫入，下一次動畫生效。
3. **capture.js 計時統一**：
   - `play()` 開頭 `this._spd = AnimSpeed.begin("capture")`；加 helper `_after(ms, fn)` = `setTimeout(fn, ms / this._spd)`，回傳 id；把上面列出嘅 `setTimeout`（包括 `_setET`、`finishTimer`、`_hideWarning`、`_startWarp`、`breakFree` 裂開聲）全部換成 `_after`。
   - GSAP 由 `begin` 處理；**`_finish()` 同 `_resetScene()` 一定叫 `AnimSpeed.end("capture")`**（try/finally 式保證）。
   - Three：`_update(dt)` 入面粒子／burst／trail 用 `dt * this._spd`；草／鏡頭呼吸唔使改（純氛圍）。
   - `duckBGM(…, ms)`、`stopBGM(fadeMs)` 喺捕捉入面傳 `ms / this._spd`。
   - CSS：warning／warp／result card 嘅 animation／transition-duration 用 `calc(原值 / var(--anim-spd, 1))`。
4. **gacha.js**（GSAP 13 處 + 唯一 timer wrapper `_setT`（`js/gacha.js:100`）+ scene B 嘅 `.gsb-*` CSS animation 約 9 條）：
   - 放手拉 arm 之後（開始抽獎動畫嗰刻）`AnimSpeed.begin("gacha")`；結果卡出現／關閉、`_clearTimers()` 中斷時 `AnimSpeed.end("gacha")`。
   - `_setT(fn, ms)` 改做 `setTimeout(fn, ms / spd)`（只喺 begin 之後嘅流程；拉 arm 前嘅彈簧唔受影響，因為未 begin）。
   - `.gsb-*` animation-duration／delay 改 `calc(… / var(--anim-spd, 1))`。
   - 十連抽（`_sceneBTimelineMulti`）同單抽（`_sceneBTimeline`）兩條路都要。
5. **evolve-scene.js**（常數 `LEAD_MS 900`、`FLICKER_MS 8000`、`FLICKER_STEP 400`、`MUSIC_CUT_MS 11000`、`CRY_GAP_MS 1200`、`FANFARE_MS 5000`，全部經 `_later`）：
   - `open()` 開頭 `spd = AnimSpeed.begin("evolve")`；`_later(ms)` 用 `ms / spd`；進化音樂 cut 同 fanfare 長度都除以 spd（音樂唔變速，只係早啲 cut，加短 fade 避免「咔」一聲）。
   - `close()`／`_clearAll()` 叫 `AnimSpeed.end("evolve")`。
   - 閃動間隔 `FLICKER_STEP` 最少保留 150ms（3× 時 133ms 太閃，照顧光敏感），即係閃動次數減少而唔係閃得更密。
   - `#pc-sprite.glow-evo`（`evo-glow 1.5s`）都套 `--anim-spd`。
6. **HUD 提示**：倍速 ≠ 1 時，三個場景右上角細字顯示「2×」，等用戶知道係設定造成。
7. **驗證**：
   - Browser preview：localhost `__testCapture()` 分別跑 1×／2×／3×，量 `play()` 到 `onComplete` 時間（扣除 tap），預期約 16s／8s／5.5s；捉到同走甩兩條路都跑。
   - 扭蛋：單抽、十連抽各跑 1×／3×，量放手到結果卡時間；拉 arm 手感 1× 同 3× 一樣。
   - 進化：用 dev 觸發一次進化，1×／3× 量 `open` 到 `onDone`。
   - **還原檢查**：每個場景完咗（同中途關閉）之後 `gsap.globalTimeline.timeScale() === 1`、`--anim-spd` 係 1；連續「捕捉 → 扭蛋」確認冇殘留加速。
   - console 冇 error；音效次序冇亂（搖三下、gotcha 聲、扭蛋開波聲對得上動畫）。
8. **收尾**：`CODEBASE_INDEX.md` 加 `js/anim-speed.js` 同捕捉／扭蛋／進化行註明倍速；加 Rule（GSAP globalTimeline／`--anim-spd` 改咗一定要喺所有結束／中斷路徑還原）。

---

## A. 電腦端全鍵盤操作

### 決定
- 新 module **`js/keys.js`**（`window.Keys`）：全 app 唯一嘅新 keydown 入口，用「情境」決定按鍵意思：**modal／彈窗 > 開住嘅 sheet > 當前 view**。
- 舊有 handler（Enter／Esc／Ctrl+P／Ctrl+H）**第一期唔搬**，`Keys` 尊重 `e.defaultPrevented`，避免撞鍵；第四期先考慮收編。
- 打字中（`input`、`textarea`、contenteditable、答題 App 鍵盤輸入格）一律唔攔單字母快捷鍵，只處理 Esc／Enter。
- 快捷鍵功能所有裝置都開（實體鍵盤 iPad 都受惠）；**快捷鍵提示（kbd 小字）只喺 `(hover: hover) and (pointer: fine)` 顯示**，手機截圖零變化。
- `?` 開快捷鍵一覽（modal，按情境列出當前畫面可用嘅鍵）。
- **基本操作只靠 `↑↓←→` + `Enter` + `Esc` 就做到晒**（唔記得字母鍵都用得）：
  - 方向鍵 = **空間導航**：喺當前情境（modal > sheet > view）入面，搵嗰個方向最近嘅可撳元素，焦點移過去（用 `offsetLeft/Top` 或 rect 中心點計距離，方向夾角 ±45° 內優先；戰鬥 scale／旋轉畫面用舞台座標，Rule 90）。
  - `Enter` = 撳當前焦點；`Esc` = 返回／關（同現有 Esc 次序一致）。
  - 每個畫面打開時自動將焦點放喺「主要掣」（例如主頁 CTA、結算 Continue、捕捉畫面），所以第一下方向鍵就有起點，唔使先撳 Tab。
  - 例外：焦點喺 `input`／`textarea`／`range` slider／`radiogroup`（例如倍速 segmented）時，方向鍵保持原生行為；喺答題輸入格入面 `←→` 係移游標。
  - 字母／數字快捷鍵係「加快用」嘅捷徑，唔係必需；`?` 一覽同畫面上嘅 kbd 提示幫用戶記。

### 建議按鍵表（初稿，可改）
| 畫面 | 按鍵 |
|---|---|
| 全域（必有） | `↑↓←→` 移焦點（空間導航）、`Enter` 撳、`Esc` 返回／關；`Tab`／`Shift+Tab` 都照用 |
| 全域（捷徑） | `Space` 撳、`?` 快捷鍵一覽、`H` 返主頁（非答題時） |
| 主頁 | `Enter` 開始答題（CTA）、`1–4` 下巴四掣（Battle／Leaderboard／Friends／Settings）、其他 bezel 掣（圖鑑、背包、扭蛋、育成、Quests、日曆）用字母：`D` 圖鑑、`B` 背包、`G` 扭蛋、`P` 育成、`Q` Quests、`C` 日曆（實際對照開工時按 DOM 定） |
| 選題 | 方向鍵喺單元格移動、`Space` 揀／取消、`Enter` 開始 |
| 答題 | 現有 Enter／Esc／Ctrl+P／Ctrl+H 保留；選擇題 `1–4`／`A–D` 揀答案 |
| 捕捉 | `Space`／`Enter` = tap（三下）、結果卡 `Enter` = Continue |
| 結算 | `Enter` Continue（已有） |
| 扭蛋 | `Space`／`Enter` 拉（已有）、結果 `Enter` 繼續 |
| 圖鑑 | 方向鍵喺格仔移動、`Enter` 開詳情、`Esc` 關、`←/→` 詳情內上／下一隻 |
| 背包 | 方向鍵揀格、`Space` 拎起 → 方向鍵移去目標 → `Space` 放低（鍵盤版 drag & drop）、`Esc` 取消；道具用 `Enter` 開選單 |
| 戰鬥 | `1–4` 招式、`S` 換 Pokémon、`B` 背包、`M` Mega、`Y`／`N` 是非問題（`askYesNo`）、`Esc` 返上一層選單 |
| 好友／排行榜／日曆 | Tab + Enter 即可；排行榜 `←/→` 切 tab |

### 分期
**第一期：基建（唔改任何現有行為）**

> ✅ 2026-11-06 完成（未 commit）：`js/keys.js` 基本層——空間導航、Enter／Space、Esc、自動起點＋還焦點、Tab 困住、`?` 一覽、Settings 入口。headless 驗收 wide＋phone 全程淨用方向鍵／Enter／Esc；responsive 測試同 baseline 一致。未做：div 掣逐個補 `role`（而家靠 `cursor:pointer` 自動認）、kbd 提示 badge（第二期）。另外發現：home sheet 開咗仍然 `aria-hidden="true"`（讀屏 bug，未修）。
1. `js/keys.js`：`Keys.register(contextName, matchFn, handlers)`、`Keys.activeContext()`（modal → sheet → view）、輸入格判斷、`?` 一覽。加入 `index.html` script 次序同 `sw.js` ASSETS。
2. 通用「div 當掣」修補：所有可撳 `<div>` 加 `role="button" tabindex="0"`（喺各 render 函數入面加），`Keys` 做一個 delegated handler：焦點喺 `[role=button]` 上撳 Enter／Space → `el.click()`。
3. Modal／sheet 焦點管理：開時焦點跳去第一個可撳嘢（或 ✕）、Tab 困喺入面（focus trap）、關時焦點返去開佢嘅掣。wide 右欄常駐 sheet（`data-wide-default`）唔困焦點（Rule 84）。
4. 空間導航：`Keys.moveFocus(dir)`，候選 = 當前情境內可見、未 `disabled`／`inert` 嘅可撳元素；揀方向內距離最近（主軸距離 + 2×副軸偏移）；冇候選就唔郁（唔好跳出 modal）。每個 view／sheet／modal 打開時 `Keys.focusPrimary()` 放焦點喺主要掣（`data-kbd-primary` 標記）。方向鍵移焦點一律令 `:focus-visible` 出框。
5. `kbd` 提示樣式：`.kbd-hint` 細 badge，只喺 fine pointer 顯示（Rule 88 hover 規則同一個 media query）。

**第二期：主流程（最常用）**

> ✅ 2026-11-06 完成（未 commit）：主頁 S／1–4／D／G／C／Q／B、選題 S、頁面 H、捕捉 Space／Enter、扭蛋結果卡焦點＋Esc、結算 Continue 自動焦點；鍵盤模式 badge；`?` 列「On this screen」。答題冇選擇題（全部打字），所以冇 1–4／A–D。下一步：第三期（圖鑑格、背包鍵盤拎起放低、戰鬥 1–4／S／B／M／Y／N）。
5. 主頁快捷鍵 + 選題 + 答題選擇題數字鍵。
6. 捕捉 `Space`／`Enter` tap（`capture.js` 加 keydown，只喺 `#view-capture.active` 同 `state === IDLE`；`e.repeat` 唔計，防長按連 tap）。
7. 扭蛋結果、結算確認焦點順序。

**第三期：複雜畫面**
8. 圖鑑格仔方向鍵（roving tabindex）。
9. 背包鍵盤拎起／放低（重用 drag 嘅 drop 邏輯，唔另寫一套；`aria-live` 讀出「已拎起 Pikachu」）。
10. 戰鬥：招式／換寵／背包／Mega／是非掣快捷鍵；戰鬥畫面有 `transform: scale` 同手機直向旋轉（Rule 90），焦點框要喺 scale 後都睇得清。

**第四期（可選）**
11. 收編散落嘅舊 keydown 入 `Keys`，統一 Esc 次序；加快捷鍵設定開關（唔想要嘅用戶可以關）。

### 驗證（每期）
- **淨用 `↑↓←→` + `Enter` + `Esc`**（唔用任何字母鍵）行同一條路線一次，確認每一步都去到。
- Browser preview 1440×900（wide）同 1024×768（tablet）：**淨用鍵盤**由主頁 → 選題 → 答完 → 捕捉 → 結算 → 返主頁行一次；第三期加圖鑑、背包換位、打一場 AI 戰。
- 手機 440×956 截圖同改之前一樣（`tools/responsive/shots.mjs`），確認 kbd 提示冇出現、觸控行為冇變。
- 喺答題輸入格打 `1`、`b`、`h` 等字母，確認唔會觸發快捷鍵。
- console 冇 error；`tools/responsive/test-*.mjs` 照跑。
- 收尾：`CODEBASE_INDEX.md` 加 `js/keys.js` 一行；新 Rule（快捷鍵唔可以喺輸入格觸發／modal 優先）。

---

## 已確認（2026-11-06）
- 鍵盤兩層都做：基本層（`↑↓←→` + `Enter` + `Esc`，必有）＋捷徑層（字母／數字鍵，包括主頁字母鍵）。先做基本層，再加捷徑層。

- 動畫倍速套用到捕捉、扭蛋、進化；設定只存本機。

## 待用戶決定
1. 捷徑層按鍵表可唔可以照初稿？特別係主頁字母鍵同戰鬥鍵。（開工時未答就照初稿）
