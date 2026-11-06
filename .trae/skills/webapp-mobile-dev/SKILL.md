---
name: webapp-mobile-dev
description: Mobile-first web app UI workflow entry point — input-layer decoupling (Rule 3). Baseline device, simulator, safe-area, RWD and acceptance checks live in pokeengmon-responsive; the sheet interaction spec and gestures live in pokeengmon-ui-sheets.
---

# Web App 手機開發工作流（Mobile-First + RWD）

適用於任何手機 web app / PWA 的 UI 開發。

> 基準機、手機外框模擬器、安全區、RWD／斷點、驗收清單、sheet 定位已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md`（唯一來源）；本檔只保留輸入分層（Rule 3）；sheet 互動規格同手勢已搬去 `.trae/skills/pokeengmon-ui-sheets/`。目標：**一路寫、一路喺同一部「假手機」上睇同測**，唔需要每次上真機。

## Rule 1 — 基準機先定，唔好邊做邊改

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §2；原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md` A 部分。

## Rule 2 — 本地永遠用「手機外框模擬器」開發

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §12；原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md` A 部分。

## Rule 3 — 輸入與遊戲邏輯解耦

開發時就分層，唔好等到加鍵盤/滑鼠才重構：

```
Pointer / Keyboard / Gamepad  →  Input 層  →  語意動作  →  App / Game State
                                   { type:"answer", payload }
                                   { type:"nav", dir }
                                   { type:"confirm" }
```

- DOM 事件只准喺 Input 層綁；遊戲邏輯只訂閱「語意動作」。
- Phase 2 加鍵盤/滑鼠 = 新增一個 mapping，**唔改**遊戲邏輯。

## Rule 4 — RWD 喺手機做完之後才做（唔好偷步）

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §1、§3、§4、§7；原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md` A 部分。

## Rule 5 — 每次改完嘅驗收清單

→ 已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` 正文 §12「每次改完驗收清單」；原文見 `.trae/skills/pokeengmon-responsive/references/incidents.md` A 部分。

## Rule 6 — 捲頁（Sheet）互動規格（mobile-first）

→ 定位（原 6.1）已整合入 `.trae/skills/pokeengmon-responsive/SKILL.md` §5；互動規格（原 6.2–6.10）同手勢（原 Rule 7）已搬去 `.trae/skills/pokeengmon-ui-sheets/`（摘要喺 `SKILL.md`，原文 `references/sheet-spec.md`）。

## Rule 7 — 手勢互動：左右掃分頁 + 箭咀拖曳展合

→ 見 `.trae/skills/pokeengmon-ui-sheets/references/sheet-spec.md`（原文）。

---

## 本專案對應位置

- 模擬器：`tools/device-preview.html`、`tools/preview-iphone.mjs`
- 外殼 CSS：`css/style.css` 的 `.pd-shell`（`max(env(), var(--sim-*))`）
- 基準機設定：`DEVICES` 表（`iphone-17-pro-max` 為預設）
