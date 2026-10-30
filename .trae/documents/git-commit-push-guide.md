# PokeEngmon — Commit & Push 教學（寫給 AI 助手）

> 目標：任何 AI 助手（或你自己）睇完呢份就可以安全地幫 PokeEngmon 執行程式碼提交與推送。
> 配套工具：`tools/git_commit_push.py`（一鍵 add / commit / push）。

---

## 0. 為什麼一定要 push

PokeEngmon 係純靜態網站，由 **GitHub Pages 直接部署 `main` 分支**：

- Repo：`https://github.com/MARCOTT402/PokeEngmon.git`
- 部署分支：`main`
- 本地改動 **唔 commit、唔 push，線上就完全唔會變**

所以每次改完，任務都唔算完成，直到 commit + push 成功。

---

## 1. 三條硬性規則

### 規則 1：版本號要三處同步

只要今次改動會影響前端（JS / CSS / HTML），更新版本時 **三個檔案要用同一個號碼**：

| 檔案 | 位置 |
|------|------|
| `js/app.js` | `const APP_VERSION = "vNN";` |
| `sw.js` | `const CACHE_NAME = "pokeengmon-vNN";` |
| `index.html` | 所有 `?v=NN` 查詢參數 |

漏改任何一個 → 瀏覽器繼續食舊 cache，用戶見到舊版。
（純文檔 / 純工具腳本改動唔需要 bump。）

### 規則 2：Commit message 格式

```
type(vNN): 簡短描述
```

`type` 用 `feat` / `fix` / `chore` / `docs` / `refactor`。例：

```
fix(v116): harden system-voice TTS fallback for picture words
```

### 規則 3：Shell 係 Windows PowerShell 5

- **唔支援 `&&`**，串連指令要用 `;`
- 唔好用 `cmd.exe` 語法
- 終端每次都會印一堆 `CLIXML` / `PSSecurityException` 噪音，**屬正常，可忽略**

---

## 2. 手動流程（4 步）

```powershell
git status
git add Q_folder/vocab/vocab.csv js/app.js
git commit -m "v117: update picture words"
git push
```

檢查點：

1. `git status` — 確認改動範圍正確，**唔好掃到 `.env`、`supabase-config.local.js` 等密鑰檔**
2. `git add` — 用明確路徑，唔好盲目 `git add -A`（除非明知全部都要提交）
3. `git commit` — 訊息要有 version prefix
4. `git push` — 冇 push 等於冇做

驗證：

```powershell
git log -1 --oneline
git status --short
```

---

## 3. 一鍵腳本：`tools/git_commit_push.py`

### 需求

- Python 3.8+（本機已裝 3.12）
- 已安裝 git 並喺 PATH
- 唔需要 `pip install` 任何套件

### 基本用法

```powershell
# 最常用：stage 全部改動 → commit → push
python tools/git_commit_push.py -m "v117: add new picture words"

# 唔想寫 message：自動生成 chore(v116): update N file(s)
python tools/git_commit_push.py

# 只提交指定檔案（推薦，避免誤提交）
python tools/git_commit_push.py --paths Q_folder/vocab/vocab.csv js/app.js -m "v117: update words"

# 先睇會做咩，唔真做
python tools/git_commit_push.py --dry-run

# 只 commit，遲啲先 push
python tools/git_commit_push.py -m "wip" --skip-push

# 加詳細說明
python tools/git_commit_push.py -m "fix(v118): fix sync" --body "Root cause: pull() ran before POKEMON_DEX loaded."
```

### 參數

| 參數 | 作用 |
|------|------|
| `-m, --message` | commit 標題；冇 prefix 會自動加 `vNN:` |
| `--body` | commit 內文（另起一段） |
| `--paths ...` | 只 stage 指定路徑（可多個） |
| `--branch` | 指定分支（預設目前分支） |
| `--repo` | 指定 repo 根目錄（預設自動偵測，喺任何子資料夾都可執行） |
| `--skip-push` | 只 commit |
| `--dry-run` | 只印指令，唔執行 |

### 腳本做咗啲咩

1. 自動搵 repo 根目錄，確認目前分支（唔係 `main` 會警告）
2. 用 `git status -z` 讀變更，印出精簡摘要（1000+ 檔案都唔會刷屏）
3. 安全檢查：見到 `.env`、`supabase-config.local.js`、`*.pem`、`*.key` 即中止（exit 2）
4. 檢查有冇未解決嘅 merge conflict，有就中止
5. `git add`（指定路徑或 `-A`）
6. 冇嘢可提交 → 直接結束（exit 0）
7. 用 **stdin** 餵 commit message（`git commit -F -`），避免中文亂碼
8. `git push`（首次會自動 `-u origin main`）
9. 失敗時按原因給提示（non-fast-forward / 認證 / 網絡）
10. 最後印 commit hash + 工作區狀態

### Exit code

| Code | 意思 |
|------|------|
| `0` | 成功（或本身冇嘢要提交） |
| `1` | git 操作失敗（commit / push 出錯） |
| `2` | 環境或安全問題（非 git repo、detached HEAD、未設身份、密鑰檔、conflict） |

---

## 4. 常見錯誤排查

| 症狀 | 原因 | 解決 |
|------|------|------|
| `nothing to commit, working tree clean` | 未 `git add`，或真係冇改動 | 先 `git status`，再 `git add` |
| `! [rejected] ... non-fast-forward` | 遠端有其他人／之前嘅 commit | `git pull --rebase origin main` 後再 push |
| `Author identity unknown` | 未設 `user.name` / `user.email` | `git config --global user.name "..."` + `user.email "..."` |
| Commit message 變 `???` | PowerShell 編碼問題 | 用腳本（stdin 傳 message）或 `git commit -F msg.txt` |
| `fatal: not a git repository` | 唔喺 repo 入面 | `cd` 去 PokeEngmon 根目錄，或用 `--repo` |
| `detached HEAD` | 之前 checkout 咗某個 commit | `git checkout main` |
| push 403 / authentication failed | 憑證過期 | 重新登入 Git Credential Manager 或更新 PAT |
| 網站仲係舊版 | 未 push / SW 未更新 / 版本號漏同步 | 睇 `git log`、確認已 push、檢查三處版本號 |
| `CLIXML` + `PSSecurityException` | 本機 PowerShell profile 被 ExecutionPolicy 擋 | 可忽略，唔影響 git / python |
| 一次 1000+ 個新檔案 | 批量新增素材 | 用 `--paths` 分批提交，或確認無誤後一次 `-A` |

---

## 5. AI 助手的執行清單

**做完任何改動之後，必須：**

- [ ] 跑 `git status` 確認改動範圍
- [ ] 有 bump 版本就三處同步（app.js / sw.js / index.html）
- [ ] 只 `git add` 相關檔案，唔好夾帶密鑰檔
- [ ] commit message 用 `type(vNN): 描述`
- [ ] 一定要 `git push`
- [ ] push 後用 `git log -1 --oneline` 確認
- [ ] 向用戶報告實際 commit hash

**絕對唔好：**

- 唔好 `git push --force`（尤其 `main`）
- 唔好 `--no-verify` 跳過 hook
- 唔好未 push 就同用戶講「已更新」
- 唔好把 `supabase-config.local.js` 加入版本控制（`.gitignore` 已擋）

**用戶話「網站仲係舊版」時，先查：**

```powershell
git status
git log -3 --oneline
git log origin/main -1 --oneline
```

多數情況係本地有改動但未 commit / 未 push。
