# PokeEngmon — Claude Code 項目記憶

寶可夢主題英文學習 PWA。純前端（原生 HTML/CSS/JS，無框架、無 build step）+ Supabase（Postgres + Auth + RPC），deploy 去 GitHub Pages（`main` root）。用戶以廣東話溝通，回覆用廣東話（技術詞可保留英文）。

## 開工前必讀（按次序）

1. `CODEBASE_INDEX.md` — 功能 → 檔案對照；用戶未指明檔案時先睇呢份，唔好一開始全 repo 盲掃。
2. `arch.md` — 詳細架構（index 唔夠先睇）。
3. `.trae/skills/pokeengmon-preop-checklist/SKILL.md` — **硬性 pre-flight checklist（Rule 1–61+）**。改碼、改 SQL、改 UI overlay／sheet、release 之前，用 Grep 搵相關 Rule 再讀（檔案好大，唔使成份讀）。
4. 產品需求：`prd.md`；功能 spec／tasks：`spec.md`、`tasks.md`、`.trae/specs/`；設計／計劃文件：`.trae/documents/`（最新 backlog：`backlog-20261104-items-1-16.md`）。

## 永遠生效嘅規則（同 Cursor 共用）

@.cursor/rules/pokeengmon-core.mdc
@.cursor/rules/versioning-release.mdc
@.cursor/rules/git-sync.mdc
@.cursor/rules/token-workflow.mdc

## 修完 bug 之後（硬性要求）

跟 `.trae/skills/post-fix-lesson-capture/SKILL.md`：每次修正／被用戶糾正／第二次先做啱，同一輪就要喺 preop checklist 尾加新 `Rule N`（或引用已有 Rule），回覆結尾寫 `Skill: Rule N added` 或 `Skill: already covered by Rule N`。

## Superpowers 用法（本段優先於 Superpowers skills）

- **觸發範圍**：只有新功能／大改動先行 brainstorm → spec → plan 全流程；bug fix、小改動、文案／樣式微調直接做，唔使 brainstorm。
- **文件位置**：spec／design 寫入 `.trae/specs/`，plan／task 寫入 `.trae/documents/`（檔名 `YYYYMMDD-<topic>.md`）；唔好開 `docs/superpowers/`。
- **Commit**：plan 入面唔好有自動 commit 步驟；只喺用戶要求時用 `python tools/git_commit_push.py` commit，唔好手動 bump 版本（semantic-release 負責）。
- **Worktree／分支**：預設直接喺 `main` 工作，唔開 worktree；只有用戶要求或大型實驗性改動先開。
- **TDD／驗證**：project 冇 `npm test`，唔好為咗 TDD 起 test framework。驗證用 preop checklist 指定嘅方法（瀏覽器 preview 檢查、console 冇 error、必要時一次性 Node script）；verification-before-completion 照用，證據就係呢啲檢查結果。
- **同現有規則嘅次序**：改碼前照讀 preop checklist 相關 Rule；修完 bug 照做 post-fix lesson capture（加 Rule N）。Superpowers 指引同本檔或 `.cursor/rules/*` 衝突時，以本檔為準。

## 常用指令

- 本地 iPhone 外框預覽：`npm run preview:iphone`（`tools/device-preview.html`，基準 iPhone 17 Pro Max 440×956，見 Rule 30）
- 本地改版本號預覽：改 `package.json` version → `npm run sync-version`（release 由 CI semantic-release 自動 bump，唔好手改 `js/app.js`／`sw.js`／`index.html` 版本）
- Commit／push（只喺用戶要求時）：`python tools/git_commit_push.py --paths …`，Conventional Commits（`feat:`／`fix:`／`docs:`／`chore:`）
- Supabase migration：新檔放 `supabase/migrations/supabase-migrate-YYYYMMDD[x]-<name>.sql`，由用戶自己喺 Supabase 執行

## 改功能後要同步

- 新增／搬檔案：更新 `CODEBASE_INDEX.md`；新 JS／asset 要加入 `sw.js` ASSETS 同 `index.html` script 次序。
- 新增可寫 column：同一份 migration 加 column-level grant（Rule 54）。

## 環境

- Windows 11；PowerShell 5.1 唔支援 `&&`。UTF-8 檔案編輯優先用 Edit 工具或 Python（`index.html` 有 BOM 問題前科）。
