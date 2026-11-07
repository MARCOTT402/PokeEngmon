# Plan：現代化 Phase 1（地基）＋ 畫質 prototype

> ⚠ **2026-11-07 已合併入 `.trae/documents/20261107-master-engineering-plan.md`。** 次序、狀態、分工以總計劃為準；本文件保留做歷史同設計細節參考。

Spec：`.trae/specs/20261107-modernization.md`。冇 commit 步驟（用戶要求先 commit）。

## Task 1 — 類型檢查
- [ ] `tsconfig.json`（noEmit、allowJs、`checkJs: false`、classic script 共用 global、排除 `js/capture.js`）
- [ ] `types/globals.d.ts`：所有 `window.X = …` 模組、第三方（`gsap`、`webkitAudioContext`）
- [ ] `npm run typecheck`（`tsc -p tsconfig.json`）；加入 `.github/workflows/release.yml` lint／test 之後
- [ ] 喺零錯或者只差 JSDoc 嘅檔加 `// @ts-check`；記低清單入 workflow skill
- 驗收：`npm run typecheck` 0 錯；故意喺有 `@ts-check` 嘅檔寫 `Sync.nope()` → 紅

## Task 2 — 全域 z-index token
- [ ] `:root` 加 `--z-*`（同現值一樣）；全域層（≥100）字面值換 token；JS `zIndex` 同步
- [ ] 註解列出 Z-order 全景；responsive SKILL §4 改指向 token
- 驗收：`tools/audit/check-z-tokens.mjs`（替換前後每條 rule 解析出嘅數值一樣）；`shots.mjs --compare` 440×956 零差異；`test-sheets`／`test-overlay-switch` 照舊

## Task 3 — `html` helper
- [ ] `js/core/html.js`：`html\`\``（escape 字串／數字、陣列 join、`raw()` 唔 escape、null/false 變空）、`Html.render(el, tpl)`
- [ ] `tests/unit/html.test.js`（XSS、巢狀、陣列、raw）
- [ ] `index.html` 喺 `guard.js` 之後載入；`sw.js` ASSETS；`CODEBASE_INDEX.md`
- 驗收：單元測試；開 App console 冇 error

## Task 4 — 畫質 prototype
- [ ] `tools/prototype-battle-fx.html`：左「現行」（CSS 震動／閃）vs 右「PixiJS FX」，同一組 sprite／背景
- [ ] 掣：Tackle（普通）、Thunderbolt（電）、Flamethrower（火）、Critical hit；切換 bloom、倍速
- [ ] 喺 Browser pane 開，截圖畀用戶
- 驗收：console 冇 error；手機 440 闊同桌面都睇到

## Task 5 — 收尾
- [ ] `npm run lint`、`npm test`、`npm run typecheck`、`npm run test:e2e`
- [ ] 加 Rule（post-fix-lesson-capture）：Phase 1 嘅新規矩（`@ts-check` ratchet、z token、`html` helper）
