# v100：P&D（パズドラ）風格 Rare Pull 抽獎動畫改造

## Context

v98 已為稀有抽加入互動式金幣三連點投入；v99 改用 server 權威 `gacha_pull` RPC（async pull）。用戶提供 P&D 抽蛋動畫參考（YouTube Shorts `_35tPNLeitU`），要求稀有抽後半段改用 P&D 蛋機演出風格，並有兩項明確修改：

1. **整部扭蛋機改成「機械快龍」造型**（對應 P&D 龍蛋機嘅龍造型機器）
2. **確定演出規則改為：legend 金球開場 → 中段升彩虹**（開場已知係好嘢，中段再爆一浸）

P&D 蛋機演出嘅核心技巧（調研確認銀卵→金卵→ダイヤ→虹 稀有度預告體系）：暗転 + 聚光燈聚焦、蛋縫漏光遞進預告稀有度、確定演出升級爆點、光柱爆開 climax。

現況痛點：v99 `pull()` 要 **await RPC 先開始動畫**，用戶點掣後冇即時反饋；球一出場就暴露稀有度（冇懸念）。

## 設計

### A. 機械快龍機器（HTML + CSS）

現有 `.gacha-machine` 結構擴充（index.html 嘅 view-gacha）：

```html
<div class="gacha-machine dragonite" id="gacha-machine">
  <div class="dm-antenna"></div>
  <div class="dm-head">
    <div class="dm-horn"></div>
    <div class="dm-eye left"></div><div class="dm-eye right"></div>
    <div class="dm-snout"></div>
  </div>
  <div class="dm-wing left"></div><div class="dm-wing right"></div>
  <div class="gacha-dome">（保留 5 粒 mini-ball）</div>
  <div class="gacha-body">（coin-slot / knob / outlet 不變）</div>
</div>
```

CSS 造型要點：
- `.gacha-body` 由紅色改**橙色金屬漸層**（#f8b26a → #e8853d → #c96a2a）+ 鉚釘點（repeating radial-gradient）+ 金屬高光
- `.dm-head`：圓角橙色頭部坐落 dome 頂，黑色面罩式機械眼（`.dm-eye`）、頭頂小角（`.dm-horn`）、長天線（`.dm-antenna`，頂端小球）、奶白色鼻吻（`.dm-snout`）
- `.dm-wing`：左右細翼（青灰色金屬翼片）從機身兩側伸出
- 震動加分位：`stage-rumble` 時天線劇震、雙翼拍震（獨立 keyframes，只動 transform）
- **眼睛預告**：ball 階段時眼睛以稀有度色發光（rare 藍 / epic 金 / legend 彩虹流動）— 額外 telegraph 層

### B. 流程時間線（`_dropBall()` 起計）

金幣三連點 → 入幣 → 機身震動（維持現狀）→ 之後：

| t (ms) | 演出 |
|---|---|
| 0 | 暗転 overlay 淡入 + spotlight 聚焦球位；**球出場顏色：rare/epic 藍球、legend 金球開場** |
| 950 | `ballLand()` + haptic |
| 1400 | 搖 1 + 漏光 `lk1`（當前球色）+ `leakHum(1)` |
| 2050 | 搖 2 + `lk2` + `leakHum(2)`（純張力遞進，無升級） |
| 2700 | 搖 3 + `lk3`；**epic 升級 blue→gold**、**legend 升級 gold→rainbow**（conic-gradient 彩虹環 + hue-rotate 流動）+ 閃光 + `upgradeSting()` + 強 haptic |
| 3300 | 閃光 + **光柱從球縫爆發**（`.gacha-burst` scaleY 升起）+ `gotcha()` |
| 3700 | `_reveal()` 現有邏輯不變（開球、結算卡、`_celebrate()` GSAP 光柱星爆、叫聲、pushState）；`settling` 時移除暗転 |

升級 beat 實作：`ball.classList.add('upgrade')` → 150ms 換 ball class/leak class → 320ms 移除 `upgrade`（reflow 重啟，同 `.wob` 慣用手法）。

### C. RPC 延遲解耦（關鍵改動）

`pull()` 唔再 await RPC 先開波：
- 點掣後**即刻** `_startCoinPhase()`（金幣彈出 + 提示），RPC promise 存入 `this._rpcPromise` 背景進行
- 用戶三連點 + 震動自然耗時 2–4s，RPC 正常早已完成
- 真實稀有度最遲喺 `_dropBall()`（決定開場球色）先需要 → `_resolveResult()` await promise；若仍未回：**hold 狀態**（機身持續低鳴震動循環、prompt 顯示 "…"），RPC 一到即繼續；失敗/匿名行 v99 現有本地 fallback（原邏輯照搬）
- 所有 await 後步驟必須重新檢查 `fid === this._flowId`
- **v99 server 權威邏輯（gachaPull / adoptServerEntry / balance 還原）一字不改**

### D. 檔案改動

1. **index.html**：view-gacha 機器結構加快龍部件（上述 A）；版本 `?v=99`→`?v=100`（17 處）
2. **css/style.css**：機械快龍全套造型（頭/角/天線/翼/眼/鉚釘機身）、`.gacha-dim`（radial-gradient spotlight 挖空，z-index 5）、`#view-gacha.playing` 時 title/topbar 變暗、dropzone 提升 z-index 保持照亮、`.pokeball` 漏光體系（`--leak` 色 + `lk1/2/3` 強度 + `.pb-mid` 縫隙增亮 + `leak-rainbow` 彩虹環）、`.pokeball.upgrade`（**只動 filter/box-shadow**，避開 `.wob` 嘅 transform 衝突）、`.gacha-burst` 光柱、眼睛稀有度發光
3. **js/gacha.js**：pull() 解耦、`_resolveResult()`、hold 狀態、`_ensureDim()`（JS 動態建立暗転層）、`_dropBall()` 新時間線、升級 beat、眼睛發光控制
4. **js/capture.js** CaptureAudio 加兩個合成音（無新音檔）：`leakHum(i)`（低頻上升張力音）、`upgradeSting(step)`（上升三角波 chime + 高頻火花）
5. **版本 v100**：js/app.js `APP_VERSION`、sw.js `CACHE_NAME`、index.html `?v=`（SKILL.md PowerShell 一條龍）

### E. 風險對策

- transform 衝突：升級閃光只用 filter/box-shadow；`machine-rumble` keyframes 已內嵌 `.grand` scale；快龍翼/天線震動用獨立元素唔碰機身 transform
- class 命名用 `lk*`/`leak-*`/`dm-*`，避免同捕捉場景撞名
- reduced-motion 全域 kill-switch 已覆蓋所有新 CSS 動畫
- `_celebrate()` 保留不動（已有 gsap 守衛）

## 驗證

本地 `python -m http.server` + browser 自動化 evaluate 逐拍點斷言：
- 點掣後即刻 phase="coin"（唔等 RPC）、dim `.on` 喺 ball 階段出現
- stub `_rpcPromise` 分別回傳 rare/epic/legend：rare 永遠藍球無升級；epic 藍開場→2700 變金；legend **金開場**→2700 變彩虹
- stub 延遲 3s RPC 驗證 hold 狀態（機身持續低鳴、完成後正確繼續）
- 機械快龍部件渲染正常（head/wing/antenna/eye 存在且 rumble 時翼有動畫）
- 斷言 `_serverResult`/鑽石餘額邏輯同 v99 一致、結算卡與 `_celebrate` 正常、無紅色 JS 錯誤

完成後 commit + push（SKILL.md Rule 6）。
