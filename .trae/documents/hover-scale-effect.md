# Hover 輕微放大效果（全部可點元素）

## Summary

作為 UI 設計師建議：為全站可點擊元素加 `@media (hover: hover) and (pointer: fine)` 包住的 `:hover` 放大效果 —— 只有桌面滑鼠會觸發，手機觸控完全不受影響（唔會有「點完卡住放大」嘅 sticky-hover 問題）。放大值按元素尺寸分級（大按鈕 1.02、中卡 1.05、細 icon 1.08），配合現有 `.12s ease` transition，滑鼠移走自動回復原狀。

## Current State Analysis

- `css/style.css`（約 1430 行）**完全冇任何 `:hover` 規則**，只有 `:active` 按壓回饋（`scale(.97)` 等）
- 大部分按鈕已有 `transition: transform .12s ease`，hover 規則一加即有平滑動畫
- 部分可點元素**冇 transform transition**，直接加 hover 會「即放大」無動畫，需先補 transition：
  - `.btn-nav`（[style.css L48](file:///c:/Users/user/Documents/trae_projects/PokeEngmon/css/style.css#L48)）
  - `.btn-mini`（L259）、`.topic-chip`（L265，已有 border-color/background transition，要加 transform）
  - `.dex-cell`（L731）、`.dex-art`（L747）、`.dex-candy button`（L791）
  - `.cal-cell`（L859）
- 已有 transform transition 唔使改 base rule：`.btn-big`（L36-42）、`.chip-btn`（L60）、`.icon-btn`（L83-89）、`.pd-menu-btn`（L153-160）、`.quiz-exit-btn`（L330-337）、`.word-image-btn`（L377-383）、`.hero-sprite.clickable`（L212）、`.entry-gate-btn`（L1299-1306）
- 不可點狀態要排除：`.dex-cell:not(.owned)` 同普通 `.cal-cell` 係 `cursor: default`；`:disabled` 按鈕（如唔夠鑽石嘅 Rare Pull）唔准放大
- 版本：當前 `v95`（`js/app.js` L6、`sw.js` L2、`index.html` `?v=95`）

## Proposed Changes

### 1. `css/style.css` — 補 transform transition（7 處小改）

| 選擇器 | 改動 |
|---|---|
| `.btn-nav` | 加 `transition: transform .12s ease;` |
| `.btn-mini` | 加 `transition: transform .12s ease;` |
| `.topic-chip` | 現有 `transition: border-color .15s, background .15s;` 改為 `transition: border-color .15s, background .15s, transform .12s ease;` |
| `.dex-cell` | 加 `transition: transform .12s ease;` |
| `.dex-art` | 加 `transition: transform .12s ease;` |
| `.dex-candy button` | 加 `transition: transform .12s ease;` |
| `.cal-cell` | 加 `transition: transform .12s ease;` |

### 2. `css/style.css` — 檔尾新增統一 hover block

一個 `@media` 包住全部規則，統一管理，手機零影響：

```css
/* ---------- Desktop hover lift (mouse only; touch unaffected) ---------- */
@media (hover: hover) and (pointer: fine) {
  /* 大按鈕／全寬選項：細幅度，避免水平溢出感 */
  .btn-big:hover:not(:active):not(:disabled),
  .btn-google:hover:not(:active):not(:disabled),
  .pd-menu-btn:hover:not(:active),
  .word-image-btn:hover:not(:active),
  .entry-gate-btn:hover:not(:active),
  .topic-chip:hover:not(:active) {
    transform: scale(1.02);
  }

  /* 中型格子／pill：中幅度 */
  .dex-cell.owned:hover:not(:active),
  .dex-art:hover:not(:active),
  .chip-btn:hover:not(:active),
  .btn-mini:hover:not(:active),
  .dex-candy button:hover:not(:disabled) {
    transform: scale(1.05);
  }

  /* 細 icon 按鈕／日曆格：幅度最大，小目標要明顯啲先 feel 到 */
  .icon-btn:hover:not(:active),
  .btn-nav:hover:not(:active),
  .quiz-exit-btn:hover:not(:active),
  .cal-cell.lv1:hover, .cal-cell.lv2:hover, .cal-cell.lv3:hover,
  .hero-sprite.clickable:hover {
    transform: scale(1.08);
  }
}

/* 尊重系統減少動態設定 */
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: .01ms !important; }
}
```

**設計決策（點解咁做）：**

- **`:not(:active)` 守衛**：hover 規則 specificity（0,3,0）高過現有 `.btn-big:active`（0,2,0），唔加守衛會冚咗按下嘅 `scale(.97)` 回饋。加咗之後按下時 hover 自動失效，`:active` 正常發揮
- **`:not(:disabled)` 守衛**：disabled 按鈕（鑽石唔夠嘅 Rare Pull 等）唔放大，保持「唔撳得」嘅視覺
- **`.course-head` 唔加 scale**：佢喺 `overflow: hidden` 嘅 `.course-card` 入面，放大會被卡邊裁切；佢只係展開/收起嘅 affordance，真正嘅「選項」係 `.topic-chip`，已涵蓋
- **`.topbar-name`、`.csv-guide summary` 唔加**：純文字觸發點，放大文字觀感差
- **`.dex-cell` 只限 `.owned`**：未擁有格子 `cursor: default` 唔可點，唔應有 hover 回饋
- **transform-origin 唔使特別設定**：預設 center 已係想要效果
- **唔加 shadow 變化**：用戶淨係要求放大縮小，保持最小改動

### 3. 版本號同步 v95 → v96（Pre-op Checklist Rule 1）

三個檔同一版本號：

- `js/app.js`：`APP_VERSION = "v95"` → `"v96"`
- `sw.js`：`CACHE_NAME = "pokeengmon-v95"` → `"pokeengmon-v96"`
- `index.html`：全部 `?v=95` → `?v=96`

### 4. Commit + push（Pre-op Checklist Rule 6）

```powershell
git add css/style.css js/app.js sw.js index.html
git commit -m "v96: desktop hover scale-up on all clickable elements"
git push
```

（PowerShell 5：用 `;` 串連，唔好用 `&&`）

## Assumptions & Decisions

- 用戶已確認範圍＝**全部可點元素**、**桌面手機兩邊兼顧**（用 `@media (hover: hover)` 實現，手機無 hover 效果但唔受影響）
- 純 CSS 改動，**零 JS 改動**，冇 Supabase / SM-2 / 遊戲邏輯風險
- 放大倍率 1.02 / 1.05 / 1.08 三級係設計師建議值；實裝後如想更明顯可微調（改一個數值就得）

## Verification

1. **桌面瀏覽器**開 `index.html`（或直接睇 GitHub Pages 線上版）：
   - 滑鼠指住 Start Quiz / Gacha / Pokédex 等 `pd-menu-btn` → 輕微放大，移走回復
   - 課程頁指住 topic-chip → 放大；Pokédex 指住已擁有格子 → 放大；未擁有（黑色剪影）格子 → **唔放大**
   - 答題頁 ✕ 退出掣、Hint/Submit/Skip → 放大
   - 按住唔放（`:active`）→ 仍然係縮細反饋，唔係放大
   - 鑽石唔夠時 Rare Pull（disabled）→ 唔放大
2. **手機／DevTools 觸控模擬**：點擊各元素後唔會卡住放大狀態
3. `git push` 後線上版本顯示 `v96`（Settings / Footer 版本號），確認三檔版本號一致
