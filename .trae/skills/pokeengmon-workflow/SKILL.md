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
- **localhost 唔行 versioned cache-first**（`IS_DEV`）：本地改 code 唔 bump 版本，cache-first 會食舊檔。所以本地 bench 唔反映 SW 收益；SW 邏輯用 `npm test`（`tests/unit/sw-strategy.test.js`）（vm stub，20 項：分流、慢網 3 秒轉 cache、離線即刻 cache、離線冇 cache 回 `Response.error()` 唔 hang）。
- **`saveState()` 合併寫入**（`js/storage.js`）：記憶體 `_state` 一直最新（`loadState` 讀記憶體），只係延後落 localStorage；150 ms 內多次 call 合併一次（重度存檔 190 KB 每次寫 ~4 ms @4× CPU）。`pagehide`／`beforeunload`／`visibilitychange: hidden` 即刻 `flushState()`。**之後即刻要讀 localStorage 原文、或者會 `removeItem` 其他 key 嘅流程**（reset、登出清進度）用 `saveState({ now: true })`。Node 測試 stub 咗 `setTimeout` 嘅要改用 `{ now: true }`／`flushState()`。
- **預載下一題**（`Quiz._preloadNext`，render 後 400 ms）：只預載 `queue[1]`；word 題 `new Image()`＋`CaptureScene.audio.preloadWord(wordAudioURL(word))`（只 fetch＋decode 入 `_oneShotBufs`，冇 AudioContext 唔做）；句子題 `findQuestionImage`。`playWord` 撞正預載緊會排隊（`waiters`／`failers`），預載失敗唔快取，照行 fallback。
- 驗收：headless 連續 20 次 `saveState` → localStorage 寫 1 次、hidden 即刻落地、NaN 照兜底；word 題答第 1 題時 `_oneShotBufs[下一題].buf` 已有、下一題圖片已 request；SW controller 之後離線 reload 開到（冇 fatal）；`_test_sm2_cache`、`_test_sync_queue`、`_test_numeric_guards`、`_test_battle` 全過。

### Rule 103 — 開機減重：音效拆去 `js/audio.js`、three.js 捕捉場景按需 `import()`、BGM 降 bitrate、emerald 字型拉丁子集、第一次開 App 延後註冊 SW

- **`js/audio.js`**（classic script，喺 `app.js` 之前）：成個 `CaptureAudio`（BGM、SFX、單字錄音）由 `capture.js` 搬出嚟，開機即用。`window.CaptureScene` 而家係 **facade**：`.audio`、`primeAudio`、`bgmPrime`、`startBGM`／`stopBGM`／`duckBGM`、`isSupported`、`_resize` 即刻得；`play(opts)` 會先 `load()`（`import("capture.js?v=…")`，query 由 `audio.js` 自己 `currentScript.src` 抄，唔使另外 bump）再轉交真場景。`index.html` **冇咗** `<script type="module" src="js/capture.js">`，import map 要保留（dynamic import 都靠佢解析 `three`）。
- `capture.js` 尾段 `window.CaptureScene._attach(new PokemonCaptureScene())`；真場景嘅 `this.audio = window.CaptureScene.audio`（同一個 instance，BGM 狀態唔可以有兩份）。**新加音效寫 `audio.js`；新加要 three.js 嘅功能經 `CaptureScene.load()`**，唔好喺 classic script 直接用 `window.PokemonCaptureScene`（未載）。 facade 係 `Proxy`：自己冇嘅屬性（`state`、`resultEl`、`tap`…）載咗之後轉交真場景，未載返 `undefined`（`test-keys` W27／W28 靠呢個）；facade 新加欄位一定要喺 object 入面先初始化，否則載完之後 set 會寫咗去真場景。
- 預載：開機 `CaptureScene.preload(20000)`、`Quiz._begin` `preload(1500)`（一 set 做完就係捕捉）。`preload` 會揀**最早**嗰個時間（舊版 20 秒 timer 排咗之後答題嘅 1.5 秒請求被食咗，要 14 秒先載好）。`load()` 失敗唔快取、會 report `capture-load`；`_captureThenSettle` 原有 try/catch 會直接跳去結算。
- BGM：`flat-water.mp3` 128k → 80k（主頁 gain 0.1，聽唔出），`wild-battle.mp3` 192k → 112k，兼剝走封面圖（ffprobe 見 `video` stream 就係有封面）。指令：`ffmpeg -i in.mp3 -map 0:a -vn -codec:a libmp3lame -b:a 80k -ar 44100 -map_metadata -1 -id3v2_version 0 out.mp3`。
- 字型：`pokemon-emerald-pro.ttf` 5 MB（33,000 中日文字形）→ `pokemon-emerald-pro-latin.woff2` 12 KB（`python -m fontTools.subset … --unicodes="U+0000-024F,U+02B0-036F,U+0370-03FF,U+2000-206F,U+20A0-20CF,U+2100-22FF,U+2460-27BF,U+FFFD" --layout-features='*' --flavor=woff2`）。CSS 兩個同名 `@font-face` 用 **互補** `unicode-range`；ttf 只喺出現中日文先下載，唔 precache。
- **量度要睇實際傳輸量**：GitHub Pages 會 gzip JS／CSS／JSON（例如 `moves.json` 241 KB → 20 KB、全部開機 JS 1.3 MB → 393 KB），bench 嘅 `decodedBodySize` 會誇大；mp3／png 先係真重量。改之前亦要確認個 fetch **幾時真係開始**——主頁 BGM 本身喺 `App.init`（資料載完）先 fetch，「再延後」實測冇分別，已還原。
- SW：install 會 precache ~14 MB。**第一次開**（冇 controller）等 `load` ＋ 8 秒＋idle 先 `register`；已有 controller 照即刻 register／update。
- 驗收（headless，冇 CPU 降速）：開頁 4 秒內 resource 冇 `three`／`capture.js`／`.ttf`、冇 SW registration；拉丁字 `document.fonts.check` true 而 ttf 未 request，渲染中文先 request；`Quiz._begin` 後約 1.5 秒 `CaptureScene._real` 有、`_real.audio === CaptureScene.audio`；`CaptureScene.play()` 撳三下 resolve `{caught,…}`；load＋8 秒後有 SW registration；`test-capture-fit` 等 responsive suite 照舊。

### Rule 104 — 場景按需載入（Rule 103）之後：「可以互動」嘅 state 一定要等場景物件起好先出；輸入 handler 要查 ready

- 捕捉場景 `STATE.IDLE` 有兩個意思：「未開始」同「等玩家撳波」。three.js 改咗 lazy `import()` 之後，WARNING 畫面期間 state 仲係 idle 但 `this.ball` 未起 → 一撳（或者鍵盤 Space）`tap()` 就讀 `this.ball.scale` 出 TypeError（Guard 恢復卡）。
- 修法：`play()` 一開始就 `_setState(STATE.ENCOUNTER)`（WARNING／warp 期間唔接受 tap）；`tap()` 再加 `!this.ball` 保險。
- 通則：把同步建立改成 lazy／async 之後，逐個入口（pointer、keyboard、外部 API、測試 helper）檢查「物件未 ready 時會唔會被呼叫」。facade `play()` 變咗 async：量「開始時」嘅狀態要等 `CaptureScene._real`。
- 驗收：`tools/responsive/test-anim-speed.mjs`（A7／A8）、`tools/responsive/test-keys.mjs`（W27／W28）；手動：WARNING 畫面狂撳／狂按 Space 唔可以出錯。

### Rule 105 — 可揀 BGM（Music track）：buffer 按 url 快取、`stopTownBGM` 要清 `_townPending`、新曲 loudness-match＋crossfade loop、選用大音檔唔 precache

- 曲目表 `BGM_TRACKS`（`js/storage.js`）係唯一來源；加曲要同步 migration 嘅 `user_account_bgm_track_check`。`state.bgmTrack` ↔ 雲端 `user_account.bgm_track`（nullable：null = 未揀過，pull 時用本機值 backfill；有值就跟雲端）。寫雲端經 `Sync.patchAccount`（白名單驗證），唔好塞入 `pushState` 嘅 fallback 鏈（缺欄會連 curve_mode 一齊跌落 legacy 分支）。
- 「async load 完先自己開始播」嘅 pending flag：**叫停嘅路徑一定要清**。`stopTownBGM` 而家會清 `_townPending`，否則 load 未完就入對戰／扭蛋，load 完 town BGM 會疊落去。所有叫停之後都有對應 `startTownBGM()` 恢復，所以清 pending 安全。
- 切歌：`audio.switchTownTrack()`——播緊就淡出換；對戰／扭蛋期間（冇 `_townSrc`）只改 state，完場 `startTownBGM()` 自然讀新 url。buffer 按 url 快取（`_townBufs`），pending 完成時要核對 `_townUrl() === url`。
- 新音檔：ffmpeg 揀中段（`-ss 120`）、尾 3 秒 qsin crossfade 入頭 3 秒做無縫 loop、`ebur128` 量 loudness 對齊 Flat Water（約 -13～-15 LUFS，連續噪音寧願細少少）、`alimiter` 防 clip、80k 44.1k。指令見 incidents。
- 選用嘅大音檔（每首 ~1.8 MB）**唔加 sw.js precache**（開機減重，Rule 103）；`/assets/` 本身 cache-first，播過一次就離線可用。sw.js 留註解講明。
- 驗收：headless 切歌 → `_townSrcUrl` 換、`buffer.duration === 180`、`loop`；`stopTownBGM` 後切歌 → 冇 `_townSrc`、冇 pending；`startTownBGM` → 播新曲；reload 後 radio 保持；SQL 查 `role_column_grants` 有 `bgm_track`（Rule 54）；`test-sheets`、`test-touch-targets` 照過。

### Rule 106 — 單元測試：用 `npm test`（`node:test`）＋`tests/helpers/load.js`；vm 跨 realm 要先 clone 先 deepEqual；timer 要 unref；ESLint 跨檔 global 自動生成

- 新邏輯／修 bug 嘅測試一律寫入 `tests/unit/<topic>.test.js`（`node:test` + `node:assert/strict`），**唔好再開 `tools/_test_*.js` 一次性 script**；CI release 前跑 `npm run lint` + `npm test`。
- 載入 App script 用 `loadScripts(files, { expose: [...] })`：每次 call 係全新 vm context（`storage.js` 嘅 `_state` 等模組級快取唔會跨測試污染）；`fetch` 讀 repo 檔；`localStorage` 替身支援 `Object.keys`（`_backupCorruptState` 靠佢）。
- vm 入面嘅 Array／Object 同 Node 唔同 realm：`assert.deepEqual` 會報「same structure but not reference-equal」→ 先 `JSON.parse(JSON.stringify(x))` 或 `{ ...obj }` 先比較。
- App 有 `setInterval`／debounce `setTimeout`（Guard 上報、`saveState` 合併）→ loader 已 `unref`，否則測試 process 吊住唔完；自己寫 context 都要照做。
- Characterization test 記錄**現行為**（`MAX_LEVEL` = 99，唔係 100）；發現疑似 bug 寫 `KNOWN:`，唔好喺測試 task 順手改產品碼。寫完做一次 mutation（故意改壞產品碼 → 測試要紅 → `git checkout --` 還原）。
- `npm run test:e2e` 有 fail 時，**先對 `.trae/skills/pokeengmon-responsive/SKILL.md`「互動測試」表嘅「已知 fail」欄**（同測試檔第一行註解），唔好淨係對 memory 就話係新 regression。未列入嘅 fail 先用 `elementFromPoint`／toast／modal 狀態搵出實際原因。
- ESLint：跨檔 global 由 `tools/audit/gen-eslint-globals.mjs` 生成（`prelint`），`no-redeclare` 要 `builtinGlobals: false`、`no-unused-vars` 用 `vars: "local"`；warning 上限喺 `package.json` `--max-warnings`，只准減。
→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

### Rule 108 — 清死碼：先用工具列清單（ESLint、`tools/audit/unused-css.mjs`、`unused-assets.mjs`），動態拼接一律當「有用」；刪 CSS 前後影 shots 做像素比較

- 死 function／變數：`npm run lint`（`no-unused-vars`）＋全文搜尋名（`js`、`index.html`、`tools`、`tests`、`_seed*.html`）。只出現一次即係只有定義。**刪之前要睇清楚係咪「漏咗用」**：例如 Pokédex `otherCards`／`evButtons` 係 `7b7e45b` 將配招搬去背包之後留低嘅殘骸，要用 `git log -S` 查出處先刪。刪完要再掃一次，因為會連帶出現新嘅死碼（例如 `addEvPoint`、`SupabaseAuth.allocEv`）。
- 死 CSS：`node tools/audit/unused-css.mjs`。佢只會刪「所有 selector 都引用咗 source 完全冇出現過嘅 class／id」嘅 rule。動態 class 唔一定有連字號，例如 `" lb-top" + rank`、`` `z${i}` ``，所以任何喺 `${` 或者 `" +` 前面嘅字都當前綴，以佢開頭嘅 class 一律列做 dynamic，唔刪。第一版只認 `foo-${` 就誤判咗 46 條。
- 死 asset：`node tools/audit/unused-assets.mjs`。目錄字面值（`const BASE = "assets/battle/anim/"` 之後再拼接）成個目錄當動態。結果只係報告，唔會自動刪。
- 改 repo 檔唔好用 Git Bash 嘅 `sed -i`：會將 CRLF 檔成個轉行尾（`tests/unit/battle.test.js` 試過 538 行全部變）。要用 Edit 工具，或者用 Python 讀寫 bytes。commit 前用 `git diff --numstat` 睇吓有冇「全檔 +N/−N」。
- 刪 CSS 前要先 `node tools/responsive/shots.mjs --out <before>`，刪完再影 `<after>`，然後 `--compare` rects 加逐像素比較；兩者都要零差異（每次全套大約 12 分鐘，要喺背景跑）。
→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

### Rule 109 — 型別檢查：`npm run typecheck` 要 0 錯；改／加檔就順手開 `// @ts-check`，加入 `types/ts-check-files.json`（清單只准加）；只可以用 JSDoc cast，唔准為過 check 改行為

- 設定：`tsconfig.json`（`allowJs`、`checkJs: false`、`noEmit`、`moduleDetection: legacy`，classic script 共用一個 global scope，同 `index.html` 載入方式一樣；排除 `js/capture.js`）。只有第一行係 `// @ts-check` 嘅檔先會檢查。2026-11-07 有 26／43 個檔開咗。
- 新增 global：
  - 只係 `window.X = …` 嘅模組，或者檔尾有 `module.exports` 嘅檔（TS 當佢 CommonJS，`const` 唔係 global），要喺 `types/globals.d.ts` 加 `declare var X: any;`。
  - 頂層已經有 `const X` 嘅檔**唔准**再 declare，會撞 TS2451。
- 開 `// @ts-check`：用 Python bytes 加喺第一行，保留 BOM 同行尾（Rule 108），然後加入 `types/ts-check-files.json`（排好序）。`tests/unit/ts-check-ratchet.test.js` 會擋住「拎走檔頭」、「加咗檔頭但冇入清單」，同埋「檔頭同清單項目一齊拎走」：清單數目唔可以少過 `MIN_CHECKED`（加檔就順手改大），而且 git HEAD 清單入面嘅檔一定仲要喺清單。
- 修錯只可以用 JSDoc cast，例如 `/** @type {HTMLElement | null} */ (el.closest(...))`。唔准為咗過 check 改邏輯。
- 驗收要用「未定義 global → TS2304」嚟證明 check 生效。`Sync.nope()` 呢類**唔會**紅，因為 `globals.d.ts` 將大部分模組宣告做 `any`。
- 仲未開嘅大檔（`checkJs: true` 時 345 個錯，主要係 DOM 型別收窄）：`app.js` 173、`battle.js` 56、`quiz.js` 28、`bag.js` 24。改到嗰個檔先順手清，唔做大搬遷。
→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

### Rule 111 — 砌 HTML 用 `html```＋`Html.render()`（`js/core/html.js`）：字串自動 escape、巢狀唔會雙重 escape；可信 markup 先用 `Html.raw()`；屬性值一定加引號

- 新 code 砌 `innerHTML` 一律寫 `Html.render(el, html`…${value}…`)`。字串會經 `escapeHTML`（`js/core/dom.js`，全 App 唯一嘅 escape）；數字照出；`null`／`undefined`／`false` 唔出任何嘢；陣列直接放入 `${list.map(x => html`<li>${x}</li>`)}`。
- `html``` 嘅結果係 `SafeHTML`，放入另一個 `html``` 唔會再 escape。**唔好自己再 `escapeHTML()` 一次**，會變 `&amp;amp;`。
- 自己砌、完全冇用戶／server 字串嘅 markup 先可以用 `Html.raw()`。`Html.render(el, "純字串")` 會當純文字 escape。
- 屬性值一定加引號（`value="${x}"`）。escape 擋唔到 `href="javascript:…"`，URL 要自己驗證。
- 函數入面已經有局部變數叫 `html`（例如 `let html = ""`，`avatars`／`bag`／`battle`／`calendar`／`explain`／`keys`／`leaderboard` 都有）會遮住個 tag；嗰度照舊用 `escapeHTML`，或者將局部變數改名。
- 舊 `innerHTML`（約 170 處）唔做大搬遷：改到嗰段先順手換。總計劃 P5 會做一次審計，處理含用戶資料嘅位。
→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

### Rule 113 — 部署：Pages 只發佈 `tools/deploy/site-files.json` 列明嘅 tracked 檔；加新 runtime 檔要同時入 `index.html`、`sw.js` ASSETS 同部署清單（`npm test` 會擋）

- 流程：push `main` → `release` job（lint → test → typecheck → semantic-release）→ `deploy` job（`needs: release`，checkout `ref: main` 攞埋 release commit 嘅新版本號）→ `node tools/deploy/build-site.cjs _site` 照搬原檔（冇 build step）→ upload-pages-artifact → deploy-pages。測試唔過就唔會部署。
- 要 repo Settings → Pages → Source =「GitHub Actions」。想還原，改返「Deploy from a branch: main」即刻生效。改完設定可以喺 Actions → Release → Run workflow 手動部署。
- 部署清單（`include` 用檔案或者以 `/` 結尾嘅目錄；`excludeSuffixes` 排除 `.md`／`.py`／`.txt`／`.sql`／`.gitkeep`）。只揀 `git ls-files` 有嘅檔，所以未 commit 嘅檔唔會上線。`Q_folder` 入面嘅 AI 指引、prompt、改名腳本唔會發佈；`_seedtest.html` 唔發佈但唔好刪（e2e 要用）。
- 加新 JS／CSS／資料檔：`index.html` script／link、`sw.js` ASSETS、部署清單三處都要有。`tests/unit/sw-assets.test.js`（真正喺 vm 執行 `sw.js` 攞完整 ASSETS）同 `tests/unit/deploy-manifest.test.js`（漏檔、內部檔外洩、空清單）會擋。
- 本地預覽正式網址會有乜：`node tools/deploy/build-site.cjs <dir>`，再用 `.claude/launch.json` 嘅 `site-preview`（port 8099）開嗰個目錄。
→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

### Rule 114 — 驗收動畫要用 headless Chrome 錄影格；Browser pane 隱藏時瀏覽器會暫停 requestAnimationFrame，截圖睇唔到動畫

- `tabs_context` 話 pane「hidden」嘅時候，背景頁嘅 rAF 會停，Pixi ticker、`MoveAnim`、`PokeSprite` 全部唔郁。`await MoveAnim.play()` 會一直唔返（試過 45 秒 timeout），截圖亦只會影到靜止畫面。
- 做法：用 `tools/responsive/` 嗰套 headless Chrome＋CDP（`Page.captureScreenshot`）。撳掣之後喺固定時間點（例如 120／260／420／600／850 ms）影相，再砌成對照圖；`Runtime.exceptionThrown` 同 `console.error` 要收集，要係 0。
- 「current vs 新」對照頁要用 App 真嘅模組（`PokeSprite`、`MoveAnim`），唔好自己抄一份，否則唔係公平比較。PokeRogue 精靈 png 係 atlas，要用 `assets/battle/pkmn/index.json` 嘅 `f` 格資料（`[sx, sy, sw, sh, ox, oy]`、10 fps）裁格。
- 喺 `tools/` 開嘅頁面要用 `<base href="../">`，素材同 `js/` 先會行返 App 嘅相對路徑。呢類頁面一定要經 http server 開。Browser pane 有時會用 `file:`／`data:` 直接開檔案，咁樣素材同 `fetch` 全部會失敗，所以頁面開頭要檢查 `location.protocol`：唔係 http(s) 就顯示指引同正確連結，唔好繼續載入。錯誤訊息要截短，唔好倒出成段 URL。另外，8080 server 停咗嘅話，Service Worker 會用快取嘅 `index.html` 頂替任何頁面，表面睇落好似開錯咗頁。
→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。

### Rule 115 — 讀寫本地存檔：新 code 用 `Store`（`get`／`select`／`update`／`subscribe`）；要跟住資料更新畫面就 `subscribe`，唔好喺每個改資料嘅地方自己 call render

- `js/store.js` 包住 `storage.js`：`Store.update(st => { … })` 改完自動 `saveState()`，照用 150 ms 合併寫入（Rule 102）；要即刻寫入 localStorage 就加 `{ now: true }`。
- `Store.subscribe("diamonds", (value, state) => …)` 會回傳 unsubscribe。佢只會比較有人訂閱嘅頂層欄位（用 JSON 簽名），所以喺物件入面原地改都偵測到；同一輪同步 code 入面幾多次存檔，都只會通知一次，攞到最後嘅值。`"*"` 代表每次存檔批次都通知。
- 舊 code（`loadState()` 改完再 `saveState()`）一樣會觸發通知，因為 `storage.js` 嘅 `saveState()` 會叫 `Store._changed()`。所以 91 處 `saveState` 唔使一次過改，P2.2 拆 `app.js` 嗰陣先分批換。
- `Store` 係 classic script 嘅頂層 `const`，**唔會掛上 `window`**（Rule 75）。喺其他檔用 `typeof Store !== "undefined"` 判斷有冇，唔好寫 `window.Store`，否則 typecheck 會報 TS2551。
- 訂閱者 throw 唔會影響其他訂閱者，錯誤會經 `Guard.report` 上報。
→ `.trae/skills/pokeengmon-workflow/SKILL.md`（要點）；事故原文 `.trae/skills/pokeengmon-workflow/references/incidents.md`。
