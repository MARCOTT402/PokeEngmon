---
name: pokeengmon-workflow
description: PokeEngmon workflow rules: versioning and semantic-release, commits, Service Worker, asset copyright, lesson capture, handling behaviour complaints, safe browser-pane testing, and SKILL.md line endings. Read before a release, commit, adding assets, editing sw.js, or running state-changing JS in a browser.
---

# PokeEngmon 工作流程（release／git／資產／PWA／流程）

> 幾時讀：release、commit、加／換資產、改 `sw.js`、喺 browser 跑會改 state 嘅 JS、改 SKILL.md 之前。
> 由 `pokeengmon-preop-checklist` 按題目拆出（2026-11-06）。下面係每條 Rule 嘅**現行要點**（原文條列照抄）；事故經過、code 範例、原因分析喺 `references/incidents.md`，要查來龍去脈先開。
> 新事故：寫入 `references/incidents.md`（`### Rule N — 標題` 加喺尾），呢度加要點；preop checklist 加 `## Rule N — 標題` 一行指向（跟 `post-fix-lesson-capture`）。

## Rules

### Rule 1 — SemVer + semantic-release (do NOT hand-bump for releases)

- Commits on `main` must be [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …). CI runs `semantic-release` (`.github/workflows/release.yml`): bumps version, updates `CHANGELOG.md`, tags, GitHub Release.
- Release prepare runs `python tools/sync_app_version.py`, which writes the same SemVer into:
  1. `js/app.js` — `const APP_VERSION = "X.Y.Z";`
  2. `sw.js` — `const CACHE_NAME = "pokeengmon-X.Y.Z";`
  3. `index.html` — every `?v=X.Y.Z`
  4. `prd.md` header version line
- Local preview only: edit `package.json` version → `npm run sync-version`. Do **not** invent a parallel `vNN` scheme.
- Prefer `CHANGELOG.md` when answering “what changed in release X”.

### Rule 6 — Commit when asked; Conventional Commits; release via CI

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

1. **Disclaimer modal**: `App.openDisclaimer()` in `js/app.js` (~L919) — Music & Sound Credits / Data & Image Credits paragraphs. Add new attribution (title, source work, composer/author, © owner) or remove credits for deleted assets.
2. **Accuracy rule**: never credit services/archives we don't actually use for that asset (e.g. KHInsider is credited ONLY for the Pokémon soundtrack rips — a user-supplied Ghibli track must NOT be attributed to it).
3. **prd.md**: update the asset description there too (e.g. §3.10 音效與無障礙) so docs match reality.
4. **sw.js ASSETS**: new files must be added to the pre-cache list; removed files must be deleted from it (stale 404 entries don't break installs thanks to per-item caching, but they waste requests).
5. If the asset introduces a NEW rights holder (non-Pokémon), say so explicitly in the disclaimer with its own © line.

### Rule 25 — 撞板／被修正之後，同一輪就要寫入 skill（唔准等用戶開口）

- Before you report "done", append a rule to this file (or the matching project skill). The message must end with `Skill: Rule N added` or `Skill: already covered by Rule N`.
- Record the **workflow** lesson, not just the code detail. If the real failure was "I ran it without checking", "I only capture when asked", "I tested the happy path only", that is the rule.
- Do not narrow it to one symptom (e.g. only `end if;`). State the invariant that prevents the whole class of mistake.
- If the user says "that's not the lesson" — the rule was too narrow; widen it in the same turn.

### Rule 33 — 「冇彈／有彈」類投訴，先確認邊個才係想要嘅行為，唔好自作聰明移除功能

- 收到「X 會彈出 / X 冇反應」呢類描述，唔可以靠字面推斷好壞；先講清楚你理解嘅 desired behavior，或用 AskUserQuestion 確認（要彈 vs 唔要彈 vs 內嵌）。
- 任何會移除／禁用現有可見功能嘅改動，一定要先確認，唔好當成 bug fix 直接做。
- 用戶「要內容但唔要 popup」時，正解通常係**原位置 inline / accordion 展開**（同一容器、可再點收起、切換日期會換內容），而唔係刪掉功能或保留 modal。
- 修完要重現用戶原話嘅場景驗收（例如「點有紀錄嘅日期 → 應該喺日曆下方見到 Set 詳情，且冇 modal」），而唔止驗自己假設嘅方向。

### Rule 62 — 喺 Browser pane 跑會改 state 嘅 JS 之前，一定要 assert `location.host` 係 localhost

- 任何會寫 localStorage／`saveState()`／打 RPC 嘅 debug script，第一行：
- Tab Context 顯示嘅 URL 唔係 localhost（或者見到「user clicked … since an earlier tool call」提示）→ 先 `navigate` 返 localhost 再做。
- 純讀（screenshot、`get_page_text`、讀 state）先可以喺正式站做。
- 真係誤改咗：即刻停手，用 Supabase 雲端資料對返原值還原，並如實話畀用戶知。

### Rule 70 — 手砌 staged blob／改 SKILL.md：行尾要跟 repo blob（LF），唔好由工作檔抄 CRLF

- 由工作檔抽出嚟嘅片段，插入 repo blob 前一律將 CRLF 轉 LF；commit 前逐個檔 `git cat-file -p :<file>` 數 CRLF，應該係 0（混合或者全 CRLF 都唔准 commit）。
- 要寫入反斜線字樣（例如 `\r\n`）嘅文字，用 Write 工具寫獨立檔再拼接，唔好經 bash heredoc + Python 字串（雙重 escape 會變真控制字元）。
- autostash 還原衝突：唔好 `git reset --hard`。stash 會保留；將 ours（stash）／base（stash^1）／theirs（HEAD）三份統一 LF 再 `git merge-file`，寫返工作檔，`git reset -q` 取消 staging，再對 stash 做 `git diff --ignore-cr-at-eol` 確認淨係版本號唔同先 `git stash drop`。

### Rule 94 — Guard 全域錯誤邊界：新 code 唔准令畫面白屏或卡死；async 掣用 `Guard.asyncClick`；資料檔 GET 用 `Guard.fetchGet`；開機失敗一定落 `Guard.fatal`

- `js/core/guard.js` 係**第一個** script（`index.html` `<head>`，喺 `style.css`／`supabase-config.js` 之前），後面有一段內聯 shim：guard.js 載唔到時 `Guard.*` 變 no-op，其他模組唔會 ReferenceError。唔好改次序，唔好刪 shim。
- 全域 `error`／`unhandledrejection`／`<script>` 載入失敗 → `Guard.report`：本地 `pokeengmon_errlog_v1`（50 筆）＋排隊上報 RPC `log_client_errors`（server 限流 10／分鐘、200／日）。localhost 預設**唔上報**（要測設 `localStorage.pokeengmon_errlog_force_upload=1`）。
- 答題／捕捉／對戰（frame lock）中有程式錯 → `#guard-recover`（Continue／Back to Home）；`Guard.goHome()` 喺 `showView` 壞咗都會手動解鎖。新增「會鎖住畫面」嘅 view 要確保 `Guard.goHome` 識得退出佢（例如 `BattleLand.exit`）。
- 開機：`App.init()` reject → `Guard.fatal("boot")`；30 秒未完成 → `Guard.fatal("boot-timeout")`；核心 global 唔存在 → `core-missing`。兜底畫面 `#fatal-screen` 樣式內聯喺 `index.html`（CSS 載唔到都顯示），z 100000（高過 loading 99999）。
- async click：`el.onclick = Guard.asyncClick(async () => {…}, "where")`——撳時 disable、完成還原「撳之前」狀態、出錯 toast。**handler 入面唔好再用 `btn.disabled` 判斷重複撳**（Guard 已 disable，會直接 return）。事件委派（容器）出錯要自己還原子掣。
- 冪等 GET（題庫 CSV、`data/*.json`）用 `Guard.fetchGet(url, init, {tries, timeout})`；POST／RPC 唔好自動重試（Rule 5，防重複發獎勵）。題庫載唔到 → `questionBankFailed()`，選題要出「Couldn't load questions — Retry」，唔好扮「All caught up」。
- 數值兜底：`Guard.num／clamp／posDim／safeJSON`。
- 驗收：錯誤注入（答題中 click handler `null.x()` → 恢復卡＋Home 可撳；`Promise.reject(new TypeError())` → toast；`NotAllowedError` 唔記錄）、headless `Network.setBlockedURLs` 封 `js/pokemon.js`／`js/app.js` → fatal 畫面、封 `js/core/guard.js` → App 照開。

### Rule 101 — 開機唔載用唔著嘅大檔：戰鬥 BGM idle 預載、隱藏 sheet 嘅大圖 `loading=lazy`、題目圖片用 `index.json` 清單唔好逐個副檔名試

- 入場掣（entry gate）只解鎖 AudioContext＋播主頁 BGM；**唔好**喺入場一刻 `bgmPrime()`（2 MB wild-battle.mp3 fetch＋`decodeAudioData` 會令撳完卡一下）。戰鬥 BGM 由 `preloadBattleBGM()` 喺開頁 6 秒後 `requestIdleCallback` 預載；答題 submit（`quiz.js`）同 Battle Menu（`app.js`）照舊 `bgmPrime()`，`startBGM()` 未載好會自己補載＋900ms 重試。
- 擺喺隱藏 sheet／overlay 入面嘅大圖（例如 gacha `assets/gacha/dragonite.png` 325 KB）加 `loading="lazy" decoding="async"`：`display:none` 嘅 lazy 圖要顯示先下載。會被 JS 量度尺寸嘅圖唔好加。
- 題目圖片：`Q_folder/grammar/grammar_images/index.json` 由 `python tools/gen_grammar_image_index.py` 產生；`findQuestionImage()` 讀一次清單直接查，清單載唔到先退返逐個副檔名 probe。**加／刪／改名題目圖片之後一定要重跑個 script 再 commit 個 json**，否則新圖唔會出。舊做法 570 題得 1 張圖，每題最多 5 個 404。
- `three.js`（1.2 MB）未延後：`js/capture.js` 同時係 3D 場景**同**成個音效引擎（主頁 BGM、SFX），延後載會連聲都冇。要做先將 audio 拆出獨立檔（例如 `js/audio.js`），再按需 `import()` 捕捉場景。module script 本身唔阻塞 parse，SW 會 cache。
- 驗收：headless 4× CPU 開頁 6 秒內 resource 冇 `wild-battle`／`dragonite`；撳入場 < 20ms；10 秒後 `CaptureScene.audio._bgmBuf` 已載；做 10 題 `grammar_images` 404 = 0、`index.json` request 1 次；`test-capture-fit`、`test-quiz-fit` 照舊。

### Rule 102 — SW 分流（Supabase API 唔經 cache、版本化 cache-first、頁面 3 秒 timeout）、`saveState` 150ms 合併寫入、答題預載下一題

- **SW 唔可以 cache 跨域 API**：`sw.js` 舊做法係跨域請求全部 cache-first，Supabase 嘅 `GET /rest/v1/user_account?select=*`（Sync.pull）、`/battles?id=eq.…`（PvP poll）會返**上一次**嘅回應，同一部機換帳號甚至會見到上個帳號嘅資料。而家 `swRoute()`：跨域只 cache `request.destination` 係 image／audio／font／video 嘅；其他（fetch() 出去嘅 API）`skip`，交返瀏覽器。加新跨域 fetch 唔使改 SW。
- **分流表**（`swRoute`）：navigate／`/`／`index.html` → `page`（network-first，`cache: "no-cache"`，3 秒冇回應用 cache，fallback `./index.html`）；`?v=<SW_VERSION>` → `versioned`（cache-first，precache key 冇 query 所以 `ignoreSearch`）；`/assets/` → cache-first；其他同源（CSV、`data/*.json`）→ network-first＋3 秒；`sw.js` 本身 skip。`SW_VERSION` 由 `CACHE_NAME` 切出嚟，semantic-release 一齊 bump（Rule 70），唔使另外改。
- **localhost 唔行 versioned cache-first**（`IS_DEV`）：本地改 code 唔 bump 版本，cache-first 會食舊檔。所以本地 bench 唔反映 SW 收益；SW 邏輯用 `node tools/_test_sw_strategy.js`（vm stub，20 項：分流、慢網 3 秒轉 cache、離線即刻 cache、離線冇 cache 回 `Response.error()` 唔 hang）。
- **`saveState()` 合併寫入**（`js/storage.js`）：記憶體 `_state` 一直最新（`loadState` 讀記憶體），只係延後落 localStorage；150 ms 內多次 call 合併一次（重度存檔 190 KB 每次寫 ~4 ms @4× CPU）。`pagehide`／`beforeunload`／`visibilitychange: hidden` 即刻 `flushState()`。**之後即刻要讀 localStorage 原文、或者會 `removeItem` 其他 key 嘅流程**（reset、登出清進度）用 `saveState({ now: true })`。Node 測試 stub 咗 `setTimeout` 嘅要改用 `{ now: true }`／`flushState()`。
- **預載下一題**（`Quiz._preloadNext`，render 後 400 ms）：只預載 `queue[1]`；word 題 `new Image()`＋`CaptureScene.audio.preloadWord(wordAudioURL(word))`（只 fetch＋decode 入 `_oneShotBufs`，冇 AudioContext 唔做）；句子題 `findQuestionImage`。`playWord` 撞正預載緊會排隊（`waiters`／`failers`），預載失敗唔快取，照行 fallback。
- 驗收：headless 連續 20 次 `saveState` → localStorage 寫 1 次、hidden 即刻落地、NaN 照兜底；word 題答第 1 題時 `_oneShotBufs[下一題].buf` 已有、下一題圖片已 request；SW controller 之後離線 reload 開到（冇 fatal）；`_test_sm2_cache`、`_test_sync_queue`、`_test_numeric_guards`、`_test_battle` 全過。

### Rule 103 — 開機減重：音效拆去 `js/audio.js`、three.js 捕捉場景按需 `import()`、BGM 降 bitrate、emerald 字型拉丁子集、第一次開 App 延後註冊 SW

- **`js/audio.js`**（classic script，喺 `app.js` 之前）：成個 `CaptureAudio`（BGM、SFX、單字錄音）由 `capture.js` 搬出嚟，開機即用。`window.CaptureScene` 而家係 **facade**：`.audio`、`primeAudio`、`bgmPrime`、`startBGM`／`stopBGM`／`duckBGM`、`isSupported`、`_resize` 即刻得；`play(opts)` 會先 `load()`（`import("capture.js?v=…")`，query 由 `audio.js` 自己 `currentScript.src` 抄，唔使另外 bump）再轉交真場景。`index.html` **冇咗** `<script type="module" src="js/capture.js">`，import map 要保留（dynamic import 都靠佢解析 `three`）。
- `capture.js` 尾段 `window.CaptureScene._attach(new PokemonCaptureScene())`；真場景嘅 `this.audio = window.CaptureScene.audio`（同一個 instance，BGM 狀態唔可以有兩份）。**新加音效寫 `audio.js`；新加要 three.js 嘅功能經 `CaptureScene.load()`**，唔好喺 classic script 直接用 `window.PokemonCaptureScene`（未載）。 facade 係 `Proxy`：自己冇嘅屬性（`state`、`resultEl`、`tap`…）載咗之後轉交真場景，未載返 `undefined`（`test-keys` W27／W28 靠呢個）；facade 新加欄位一定要喺 object 入面先初始化，否則載完之後 set 會寫咗去真場景。
- 預載：開機 `CaptureScene.preload(20000)`、`Quiz._begin` `preload(1500)`（一 set 做完就係捕捉）。`preload` 會揀**最早**嗰個時間（舊版 20 秒 timer 排咗之後答題嘅 1.5 秒請求被食咗，要 14 秒先載好）。`load()` 失敗唔快取、會 report `capture-load`；`_captureThenSettle` 原有 try/catch 會直接跳去結算。
- BGM：`flat-water.mp3` 128k → 80k（主頁 gain 0.1，聽唔出），`wild-battle.mp3` 192k → 112k，兼剝走封面圖（ffprobe 見 `video` stream 就係有封面）。指令：`ffmpeg -i in.mp3 -map 0:a -vn -codec:a libmp3lame -b:a 80k -ar 44100 -map_metadata -1 -id3v2_version 0 out.mp3`。
- 字型：`pokemon-emerald-pro.ttf` 5 MB（33,000 中日文字形）→ `pokemon-emerald-pro-latin.woff2` 12 KB（`python -m fontTools.subset … --unicodes="U+0000-024F,U+02B0-036F,U+0370-03FF,U+2000-206F,U+20A0-20CF,U+2100-22FF,U+2460-27BF,U+FFFD" --layout-features='*' --flavor=woff2`）。CSS 兩個同名 `@font-face` 用 **互補** `unicode-range`；ttf 只喺出現中日文先下載，唔 precache。
- SW：install 會 precache ~14 MB。**第一次開**（冇 controller）等 `load` ＋ 8 秒＋idle 先 `register`；已有 controller 照即刻 register／update。
- 驗收（headless，冇 CPU 降速）：開頁 4 秒內 resource 冇 `three`／`capture.js`／`.ttf`、冇 SW registration；拉丁字 `document.fonts.check` true 而 ttf 未 request，渲染中文先 request；`Quiz._begin` 後約 1.5 秒 `CaptureScene._real` 有、`_real.audio === CaptureScene.audio`；`CaptureScene.play()` 撳三下 resolve `{caught,…}`；load＋8 秒後有 SW registration；`test-capture-fit` 等 responsive suite 照舊。
