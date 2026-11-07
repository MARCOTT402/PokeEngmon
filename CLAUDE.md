# PokeEngmon — Claude Code 項目記憶

寶可夢主題英文學習 PWA。純前端（原生 HTML/CSS/JS，無框架、無 build step）+ Supabase（Postgres + Auth + RPC），deploy 去 GitHub Pages：push `main` → CI（lint／test／typecheck）→ semantic-release → `deploy` job 只發佈 `tools/deploy/site-files.json` 列明嘅檔（repo Settings → Pages → Source 要係「GitHub Actions」；Rule 113）。用戶以廣東話溝通，回覆用廣東話（技術詞可保留英文）。

## 開工前必讀（按次序）

1. `CODEBASE_INDEX.md` — 功能 → 檔案對照；用戶未指明檔案時先睇呢份，唔好一開始全 repo 盲掃。
2. `arch.md` — 詳細架構（index 唔夠先睇）。
3. `.trae/skills/pokeengmon-preop-checklist/SKILL.md` — **總索引（Rule 1–88+）**：按「做緊咩」揀題目 skill（workflow／supabase／auth／game-data／battle／quiz／ui-sheets／responsive），再讀嗰份 `SKILL.md`。改碼、改 SQL、改 UI、release 之前必做；可以 Grep Rule 編號或關鍵字。事故原文喺各題目 skill 嘅 `references/incidents.md`，要查來龍去脈先開。
4. `.trae/skills/pokeengmon-responsive/SKILL.md` — **響應式／版面嘅唯一來源**（已整合原 `webapp-mobile-dev` 同 preop 嘅相關 Rule）。改版面、紅框、safe-area、sheet 定位、display-window overlay、modal／toast、轉機提示、觸控範圍，或者加新 view／sheet／overlay 之前必讀；附必跑嘅 `tools/responsive/` 測試。
5. 產品需求：`prd.md`；功能 spec／tasks：`spec.md`、`tasks.md`、`.trae/specs/`；設計／計劃文件：`.trae/documents/`（最新 backlog：`backlog-20261104-items-1-16.md`）。

## 永遠生效嘅規則（同 Cursor 共用）

@.cursor/rules/pokeengmon-core.mdc
@.cursor/rules/versioning-release.mdc
@.cursor/rules/git-sync.mdc
@.cursor/rules/token-workflow.mdc

## 修完 bug 之後（硬性要求）

跟 `.trae/skills/post-fix-lesson-capture/SKILL.md`：每次修正／被用戶糾正／第二次先做啱，同一輪就要加新 `Rule N`（或引用已有 Rule）——要點寫入對應題目 skill 嘅 `SKILL.md`、經過寫入佢嘅 `references/incidents.md`、preop 總索引加標題指向；回覆結尾寫 `Skill: Rule N added` 或 `Skill: already covered by Rule N`。

## Superpowers 用法（本段優先於 Superpowers skills）

- **觸發範圍**：只有新功能／大改動先行 brainstorm → spec → plan 全流程；bug fix、小改動、文案／樣式微調直接做，唔使 brainstorm。
- **文件位置**：spec／design 寫入 `.trae/specs/`，plan／task 寫入 `.trae/documents/`（檔名 `YYYYMMDD-<topic>.md`）；唔好開 `docs/superpowers/`。
- **Commit**：plan 入面唔好有自動 commit 步驟；只喺用戶要求時用 `python tools/git_commit_push.py` commit，唔好手動 bump 版本（semantic-release 負責）。
- **Worktree／分支**：預設直接喺 `main` 工作，唔開 worktree；只有用戶要求或大型實驗性改動先開。
- **TDD／驗證**：單元測試用 Node 內建 `node:test`（零依賴，唔好加 Jest／Vitest 等 framework）。`npm test` 跑 `tests/unit/*.test.js`（用 `tests/helpers/load.js` 喺 vm 載入 global script）；新邏輯／修 bug 要加測試入 `tests/unit/`，唔好再開 `tools/_test_*.js` 一次性 script。`npm run lint`（ESLint，warning 只准減）。UI／版面用 `npm run test:e2e`（要先開 8080 static server）＋瀏覽器 preview、console 冇 error。CI 喺 release 前跑 lint + `npm test`，失敗唔會 release。verification-before-completion 照用，證據就係呢啲檢查結果。
- **同現有規則嘅次序**：改碼前照讀 preop 總索引指向嘅題目 skill；修完 bug 照做 post-fix lesson capture（加 Rule N）。Superpowers 指引同本檔或 `.cursor/rules/*` 衝突時，以本檔為準。

## 常用指令

- 測試：`npm test`（單元）、`npm run test:coverage`、`npm run lint`、`npm run test:e2e`（版面，要 8080 server）
- 本地 iPhone 外框預覽：`npm run preview:iphone`（`tools/device-preview.html`，基準 iPhone 17 Pro Max 440×956，見 Rule 30）
- 本地改版本號預覽：改 `package.json` version → `npm run sync-version`（release 由 CI semantic-release 自動 bump，唔好手改 `js/app.js`／`sw.js`／`index.html` 版本）
- Commit／push（只喺用戶要求時）：`python tools/git_commit_push.py --paths …`，Conventional Commits（`feat:`／`fix:`／`docs:`／`chore:`）
- Supabase migration：新檔放 `supabase/migrations/supabase-migrate-YYYYMMDD[x]-<name>.sql`，由用戶自己喺 Supabase 執行

## 改功能後要同步

- 新增／搬檔案：更新 `CODEBASE_INDEX.md`；新 JS／asset 要加入 `sw.js` ASSETS 同 `index.html` script 次序。
- 新增可寫 column：同一份 migration 加 column-level grant（Rule 54）。

## 環境

- Windows 11；PowerShell 5.1 唔支援 `&&`。UTF-8 檔案編輯優先用 Edit 工具或 Python（`index.html` 有 BOM 問題前科）。
