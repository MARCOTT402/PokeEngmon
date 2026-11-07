# PokeEngmon 工作流程（release／git／資產／PWA／流程） — 事故紀錄同原文（references）

> 由 `pokeengmon-preop-checklist` 原文搬入（2026-11-06），每條 Rule 原文照錄。主要點喺 `../SKILL.md`。

### Rule 1 — SemVer + semantic-release (do NOT hand-bump for releases)

Source of truth: `package.json` `"version"` (`MAJOR.MINOR.PATCH`).

- Commits on `main` must be [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …). CI runs `semantic-release` (`.github/workflows/release.yml`): bumps version, updates `CHANGELOG.md`, tags, GitHub Release.
- Release prepare runs `python tools/sync_app_version.py`, which writes the same SemVer into:
  1. `js/app.js` — `const APP_VERSION = "X.Y.Z";`
  2. `sw.js` — `const CACHE_NAME = "pokeengmon-X.Y.Z";`
  3. `index.html` — every `?v=X.Y.Z`
  4. `prd.md` header version line
- Local preview only: edit `package.json` version → `npm run sync-version`. Do **not** invent a parallel `vNN` scheme.
- Prefer `CHANGELOG.md` when answering “what changed in release X”.

### Rule 6 — Commit when asked; Conventional Commits; release via CI

The live site is GitHub Pages from `main`. Local edits do nothing until committed and pushed.

- Wait for an explicit user commit/push request (Cursor user rule). Then use Conventional Commits, e.g. `feat(quiz): autofocus answer input`.
- **Fast path**: `python tools/git_commit_push.py --paths <files...> -m "feat(scope): ..."`. PowerShell 5: no `&&`, use `;`. Guide: `.trae/documents/git-commit-push-guide.md`.
- Version bumps / tags / `CHANGELOG.md` for releases are owned by **semantic-release on push to `main`**, not by hand-editing `APP_VERSION`.
- If the site shows an old build: check `git status` / whether CI release ran / SW cache name.

### Rule 10 — Service Worker fetch handler must skip non-http(s) schemes

DevTools extensions issue `chrome-extension://` requests that pass through the SW fetch handler; `caches.put()` on them throws `Request scheme 'chrome-extension' is unsupported` (uncaught promise, console noise). Guard at the top of the `fetch` listener in `sw.js`:

```js
if (!e.request.url.startsWith("http")) return;
```

### Rule 12 — Adding/replacing ANY asset? Check the copyright claims

Every time you add, replace, or remove a bundled asset — music/BGM/SFX, images, sprites, fonts, TTS voices, third-party libraries — you MUST check whether the copyright/disclaimer modal needs updating, and update it in the SAME commit. Don't leave stale or missing attributions.

Checklist:
1. **Disclaimer modal**: `App.openDisclaimer()` in `js/app.js` (~L919) — Music & Sound Credits / Data & Image Credits paragraphs. Add new attribution (title, source work, composer/author, © owner) or remove credits for deleted assets.
2. **Accuracy rule**: never credit services/archives we don't actually use for that asset (e.g. KHInsider is credited ONLY for the Pokémon soundtrack rips — a user-supplied Ghibli track must NOT be attributed to it).
3. **prd.md**: update the asset description there too (e.g. §3.10 音效與無障礙) so docs match reality.
4. **sw.js ASSETS**: new files must be added to the pre-cache list; removed files must be deleted from it (stale 404 entries don't break installs thanks to per-item caching, but they waste requests).
5. If the asset introduces a NEW rights holder (non-Pokémon), say so explicitly in the disclaimer with its own © line.

Current music credits baseline (v144): global BGM = *Flat Water* (BGM channel); battle/jingles = Pokémon RGBY soundtracks (© Nintendo / Creatures Inc. / GAME FREAK inc., via KHInsider); cries = Pokémon Showdown community; data/sprites = PokéAPI.

### Rule 25 — 撞板／被修正之後，同一輪就要寫入 skill（唔准等用戶開口）

Trigger: 用戶纠正你、同一類錯誤第二次出現、或者你第一次嘗試失敗要改做法。呢個係最強信號。

- Before you report "done", append a rule to this file (or the matching project skill). The message must end with `Skill: Rule N added` or `Skill: already covered by Rule N`.
- Record the **workflow** lesson, not just the code detail. If the real failure was "I ran it without checking", "I only capture when asked", "I tested the happy path only", that is the rule.
- Do not narrow it to one symptom (e.g. only `end if;`). State the invariant that prevents the whole class of mistake.
- If the user says "that's not the lesson" — the rule was too narrow; widen it in the same turn.

### Rule 33 — 「冇彈／有彈」類投訴，先確認邊個才係想要嘅行為，唔好自作聰明移除功能

Incident (2026-11-03 Calendar): 用戶報「點擊日曆日期會彈資訊」，當時理解成「彈窗係 bug」而加 `disableClick` 將 sheet 內日曆變唯讀；下一輪用戶報「點擊有答題紀錄嘅日期冇 popup，睇唔到紀錄」→ 還原彈窗；第三輪用戶再講「要睇得番紀錄又唔會彈窗」→ 真正想要嘅係**日曆下方內嵌展開**，唔係 modal。連續兩輪都係靠猜，白改兩次。

- 收到「X 會彈出 / X 冇反應」呢類描述，唔可以靠字面推斷好壞；先講清楚你理解嘅 desired behavior，或用 AskUserQuestion 確認（要彈 vs 唔要彈 vs 內嵌）。
- 任何會移除／禁用現有可見功能嘅改動，一定要先確認，唔好當成 bug fix 直接做。
- 用戶「要內容但唔要 popup」時，正解通常係**原位置 inline / accordion 展開**（同一容器、可再點收起、切換日期會換內容），而唔係刪掉功能或保留 modal。
- 修完要重現用戶原話嘅場景驗收（例如「點有紀錄嘅日期 → 應該喺日曆下方見到 Set 詳情，且冇 modal」），而唔止驗自己假設嘅方向。

### Rule 62 — 喺 Browser pane 跑會改 state 嘅 JS 之前，一定要 assert `location.host` 係 localhost

Incident (2026-11-05)：用 `obtainPokemon()` + 改 `pet.health`／`exp` 喺本地預覽造測試資料，但用戶之前已經將同一個 preview tab 導航去正式站 `marcott402.github.io`。Script 直接寫咗用戶真存檔（加咗隻 Bulbasaur、改咗拍檔飽肚值同 EXP）。好彩未同步上雲，靠 Supabase `user_entries` 對返原值手動還原。

- 任何會寫 localStorage／`saveState()`／打 RPC 嘅 debug script，第一行：
  `if (location.host !== "localhost:8080") throw new Error("ABORT: not localhost " + location.href);`
- Tab Context 顯示嘅 URL 唔係 localhost（或者見到「user clicked … since an earlier tool call」提示）→ 先 `navigate` 返 localhost 再做。
- 純讀（screenshot、`get_page_text`、讀 state）先可以喺正式站做。
- 真係誤改咗：即刻停手，用 Supabase 雲端資料對返原值還原，並如實話畀用戶知。

### Rule 70 — 手砌 staged blob／改 SKILL.md：行尾要跟 repo blob（LF），唔好由工作檔抄 CRLF

Incident (2026-11-05，背包第 4c 段)：(1) 同另一個 session 共用 `js/app.js`，我用 `git show HEAD:` 攞 repo 版本（LF），再由工作檔（`core.autocrlf=true` → CRLF）抽 7 行插入，commit 咗個 CRLF／LF 混合 blob；之後 `git pull --rebase --autostash` 還原 stash 時成個檔衝突（7000+ 行）。(2) 加 Rule 70 時用 heredoc 寫 SKILL.md，`git add` 冇轉行尾，commit 咗成份 CRLF（diff 1400+ 行），heredoc 入面嘅 `\r\n` 字樣仲變咗真換行。

- 由工作檔抽出嚟嘅片段，插入 repo blob 前一律將 CRLF 轉 LF；commit 前逐個檔 `git cat-file -p :<file>` 數 CRLF，應該係 0（混合或者全 CRLF 都唔准 commit）。
- 要寫入反斜線字樣（例如 `\r\n`）嘅文字，用 Write 工具寫獨立檔再拼接，唔好經 bash heredoc + Python 字串（雙重 escape 會變真控制字元）。
- autostash 還原衝突：唔好 `git reset --hard`。stash 會保留；將 ours（stash）／base（stash^1）／theirs（HEAD）三份統一 LF 再 `git merge-file`，寫返工作檔，`git reset -q` 取消 staging，再對 stash 做 `git diff --ignore-cr-at-eol` 確認淨係版本號唔同先 `git stash drop`。

### Rule 94 — Guard 全域錯誤邊界：新 code 唔准令畫面白屏或卡死；async 掣用 `Guard.asyncClick`；資料檔 GET 用 `Guard.fetchGet`；開機失敗一定落 `Guard.fatal`

- 背景：stability-performance plan §2（`.trae/documents/20261106-stability-performance.md`）。審查發現：冇全域 error／rejection handler；`App.init()` 失敗只收走 loading，留低半殘主頁；答題／對戰中 throw 之後 frame lock 唔解，下巴 Home 掣 disabled＝卡死；16 處 `onclick = async` 出錯後掣永遠灰；題庫載唔到顯示「All caught up!」誤導。
- 修正：`js/core/guard.js`（handler、ErrorLog、上報、恢復卡、fatal 畫面、helpers）、`index.html`（內聯樣式＋shim＋markup）、`js/app.js` 開機邊界、17 個 async handler 改 `Guard.asyncClick`、`data.js`／`pokemon.js` GET 重試＋失敗旗、`quiz.js` 載入失敗 Retry、migration `supabase-migrate-20261106d-client-errors.sql`（已 apply＋驗證：table 冇 client 權限、RLS on、RPC anon／authenticated 可 execute、限流 12→10→limited）。
- 撞板：`busy()` 一開始 disable 掣，`quiz.js` 回報掣 handler 用 `send.disabled` 擋重複撳 → 會即刻 return；改為唔睇 disabled。`busy` 完成時還原「撳之前」嘅 disabled，唔係硬設 false。
- 驗證：browser 錯誤注入全過；headless 封 script 四個場景啱；`tools/responsive/` sheets 28/29、overlay 10/10、pane-locks 17/19（W2／W4 喺改之前 baseline 一樣 fail）、quiz-fit 13/14（S1 21px 已知）。

Skill: Rule 94 added

### Rule 101 — 開機唔載用唔著嘅大檔：戰鬥 BGM idle 預載、隱藏 sheet 嘅大圖 `loading=lazy`、題目圖片用 `index.json` 清單唔好逐個副檔名試

- 背景：stability-performance plan §5.4／§5.6。首次開 App 未入場已經 decoded 8 MB：wild-battle.mp3 2 MB（入場 `bgmPrime` fetch＋decode）、flat-water.mp3 2.2 MB（主頁 BGM，要即刻用）、three.js 1.2 MB、dragonite.png 325 KB（隱藏 gacha sheet）。答題時每題 probe 5 個副檔名，console 一堆 404。
- 修正：`app.js` 入場唔再 `bgmPrime`、加 `preloadBattleBGM()`；`index.html` dragonite `loading=lazy`；`data.js` `_loadImageIndex`＋`_probeQuestionImage` fallback；新 `tools/gen_grammar_image_index.py`＋`Q_folder/grammar/grammar_images/index.json`；`sw.js` precache 清單。
- 結果：入場前 decoded 8,036 → 5,776 KB；入場 handler 7ms；題目圖片 404 由每題最多 5 個 → 0。
- 未做：three.js 延後（要先將 audio 拆出 capture.js；另一個 session 當時改緊 capture.js）。

Skill: Rule 101 added

### Rule 102 — SW 分流（Supabase API 唔經 cache、版本化 cache-first、頁面 3 秒 timeout）、`saveState` 150ms 合併寫入、答題預載下一題

- 背景：stability-performance plan §5.2／§5.5／§5.6。
- 發現：做 §5.5 時睇 `sw.js` fetch handler，`sameOrigin` 假就入 else 分支 cache-first → Supabase REST GET（Sync.pull 六條、PvP matchmaking／battles poll）全部經 SW cache，回應係上一次嘅；cache 只按 URL 對，唔理 Authorization → 同一部機換帳號 pull 到上個帳號嘅 `user_account`。
- 修正：`swRoute()` 分流（跨域只 cache 媒體）；頁面 network-first 3 秒 timeout；版本化 cache-first；`tools/_test_sw_strategy.js`。`storage.js` 合併寫入＋flush；`quiz.js` `_preloadNext`；`capture.js` `preloadWord`／`_loadOneShot`。
- 撞板：`tools/_test_numeric_guards.js` stub `setTimeout: () => 0`，debounce 之後永遠唔寫 → 改用 `saveState({ now: true })`。測 SW 時 stub origin 用 https、request 用 http 會變跨域 → 測試 URL 要同 origin 一致。
- 結果：20 次 saveState → 1 次寫入；下一題錄音／圖片答緊上一題時已載；離線 reload 正常；bench 冇退步、冇 page error。

Skill: Rule 102 added
