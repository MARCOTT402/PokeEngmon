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

### Rule 103 — 開機減重：音效拆去 `js/audio.js`、three.js 捕捉場景按需 `import()`、BGM 降 bitrate、emerald 字型拉丁子集、第一次開 App 延後註冊 SW

- 背景：用戶揀「先減開機下載量」。SLO：首次開 App 未到主頁 < 1.5 MB decoded；實測 5.7 MB（7.8 MB 連 idle 戰鬥 BGM）。
- 拆件：flat-water 2.2 MB、wild-battle 2.0 MB、three.js 1.2 MB、style.css 0.3 MB、moves.json 0.24 MB。再發現 SW 第一次開就 precache 19.5 MB（emerald ttf 5 MB、`assets/battle/pkmn/index.json` 3 MB），同首屏爭頻寬。
- 撞板：wild-battle 第一次轉檔反而大咗（2.0 → 2.4 MB）——原檔有封面圖 stream 被 copy；加 `-map 0:a -vn`。preload timer 先到先得，答題嗰次早請求被開機 20 秒 timer 食咗 → 改為揀最早時間。
- 結果：開機（4 秒內）decoded 3.6 MB（無 three／capture／ttf）；BGM 共慳 1.7 MB；字型 5 MB → 12 KB；SW 延後註冊。

Skill: Rule 103 added

### Rule 104 — 場景按需載入（Rule 103）之後：「可以互動」嘅 state 一定要等場景物件起好先出；輸入 handler 要查 ready

- 2026-11-07：寫 `tools/responsive/test-anim-speed.mjs` 時，測試喺 `play()` 之後即刻等 `state === 'idle'`——開場 state 本身就係 idle，即刻 `tap()` → `Cannot read properties of undefined (reading 'scale')`。追落去係真 bug：Rule 103 將 three.js 改做按需載入之後，WARNING 畫面期間用戶撳畫面都會觸發。鍵盤 Space（Rule 97）都係同一個入口。
- 第二個陷阱：`CaptureScene` 變咗 Proxy facade，`play()` 先 `await import()`，所以 `play()` 後即刻讀 GSAP timeScale 仲係 1（倍速未 begin）——測試要等 `_real`。

### Rule 105 — 可揀 BGM（Music track）：buffer 按 url 快取、`stopTownBGM` 要清 `_townPending`、新曲 loudness-match＋crossfade loop、選用大音檔唔 precache

- 2026-11-07：用戶要喺 Setting 揀背景音樂（原有 Flat Water ＋ 兩首 3 小時 focus 音檔 cut 到 3 分鐘 loop），選擇要上雲。
- 改 `_loadTownBuffer` 做按 url 快取時發現：舊 code `stopTownBGM` 冇清 `_townPending`——boot 時 buffer 未 load 完就入對戰／扭蛋，load 完會自己 `startTownBGM()`，同 battle BGM 疊聲。切歌令「load 中」嘅窗口變多（新曲第一次要 fetch 1.8 MB），所以一併修。
- 音檔處理（brown noise 原本 -20.1 LUFS，isochronic -13.6，Flat Water -12.7）：
  `ffmpeg -ss 120 -t 183 -i in.mp3 -filter_complex "[0:a]aresample=44100,asplit=3[h][b][t];[h]atrim=0:3,asetpts=PTS-STARTPTS,afade=t=in:d=3:curve=qsin[hh];[t]atrim=180:183,asetpts=PTS-STARTPTS,afade=t=out:d=3:curve=qsin[tt];[b]atrim=3:180,asetpts=PTS-STARTPTS[bb];[hh][tt]amix=inputs=2:normalize=0[x];[x][bb]concat=n=2:v=0:a=1,volume=<dB>dB,alimiter=limit=0.89:level=false[o]" -map "[o]" -c:a libmp3lame -b:a 80k out.mp3`
  （brown +5.9 dB → -15.4 LUFS；isochronic -0.6 dB → -14.7 LUFS；兩首都正好 180.0 秒）
- Migration `supabase-migrate-20261107-bgm-track.sql` 經 MCP 執行，查 `role_column_grants`／check constraint 確認。

Skill: Rule 105 added

## Rule 106 — 單元測試：用 `npm test`（`node:test`）＋`tests/helpers/load.js`；vm 跨 realm 要先 clone 先 deepEqual；timer 要 unref；ESLint 跨檔 global 自動生成

- 2026-11-07 商用級計劃 Phase A：10 個 `tools/_test_*.js`（308 項）遷移去 `tests/unit/`，只換 pass/fail helper，數目 308 = 308；新增 39 項 characterization。
- 第一次跑 probe：`loadState()` 之後 process 唔完（Guard／`saveState` timer）→ loader `unref`。
- `_buildCells` 測試 6 個「失敗」全部係 vm 跨 realm array 比較，唔係產品 bug → clone 後比。
- `expAtLevel(25, 100)` 回 970299（99³）：`MAX_LEVEL = 99` 係設計，測試假設錯。
- ESLint 第一次跑 209 個 `no-redeclare` error：ESLint 9 預設 `builtinGlobals: true`，將「本檔頂層宣告」同 generated globals 撞 → 關 `builtinGlobals`。
- 測試發現（未修，記入計劃 §9 KNOWN）：彎撇號 `’` ≠ `'` 會判錯。

- 同日：e2e `test-pane-locks` W2／W4 fail，我只對 memory 清單就報「唔係已知問題」。其實 responsive skill 測試表早已寫明「W2／W4（guest 登入提示）」。Headless 證實：W2 = guest Friends toast＋登入框；W4 = CTA 中心 `elementFromPoint` 撳中 `lb-login-modal`。教訓：e2e fail 先對 skill 表嘅已知 fail 欄。

Skill: Rule 106 added

## Rule 108 — 清死碼：先用工具列清單（ESLint、`tools/audit/unused-css.mjs`、`unused-assets.mjs`），動態拼接一律當「有用」；刪 CSS 前後影 shots 做像素比較

- 2026-11-07 商用級計劃 Phase B Task 4。JS：ESLint 20 個 warning 降到 0；刪咗 8 個冇人 call 嘅 function（`_initBoltCanvas` 等）、Pokédex 配招／EV 殘骸（約 65 行），同埋第二輪先出現嘅 `addEvPoint`／`allocEv`。11 個檔合共 -204 行。
- CSS：掃描器第一版只認 `foo-${` 呢種動態寫法，報咗 182 條 dead。抽查發現 `" lb-top" + rank`、`ladder-zone z${zoneIdx}` 都被誤判，放寬前綴規則之後變 136 條。刪完再多咗 3 個冇人用嘅 `@keyframes`（只俾已刪嘅 rule 用），一併刪走；CSS 合共 -286 行。
- Asset：第一版報 2,258 個冇引用嘅檔，全部係 `BASE + id` 呢種動態載入。改咗規則之後剩 5 個戰鬥 UI 原始 atlas（54 KB），保留。

Skill: Rule 108 added

## Rule 109 — 型別檢查：`npm run typecheck` 要 0 錯；改／加檔就順手開 `// @ts-check`，加入 `types/ts-check-files.json`（清單只准加）；只可以用 JSDoc cast，唔准為過 check 改行為

- 2026-11-07 總計劃 P1.1。設定由「GitHub skills」session 起（`163ffd4`），交接俾呢個 session 做完。
- 26 個候選檔一次過加 `// @ts-check`，得 1 個錯：`quests.js:426` 用 `closest()` 拎到 `Element`，再讀 `.dataset` → TS2339。加 `HTMLElement | null` cast 解決。
- 原計劃嘅驗收「寫 `Sync.nope()` 會紅」行唔通，因為 `Sync` 係 `any`；改用未定義 global（TS2304）同拎走檔頭（ratchet 測試）兩個方法，兩個都會紅。

Skill: Rule 109 added

## Rule 111 — 砌 HTML 用 `html```＋`Html.render()`（`js/core/html.js`）：字串自動 escape、巢狀唔會雙重 escape；可信 markup 先用 `Html.raw()`；屬性值一定加引號

- 2026-11-07 總計劃 P1.3（現代化 Task 3）。`tests/unit/html.test.js` 8 項先寫，8 項全紅（檔案未存在），實作之後全綠。
- 設計：`SafeHTML` 包住已經安全嘅字串。`html``` 對每個值：`SafeHTML` 照放、陣列逐個處理再 join、`null`／`undefined`／`false` 變空、其餘經 `escapeHTML`。`Html.render` 對普通字串都會 escape，所以唔小心傳咗用戶字串入去都安全。
- 瀏覽器實測：`<img src=x onerror=…>` 放入 `html``` 之後只係顯示成文字，冇建立任何元素，`onerror` 冇觸發；`title` 屬性值正確。
- 改 `sw.js` 之後，第一次重新載入 preview 會被新 Service Worker 再 reload 一次，所以喺 Browser pane 跑嘅腳本會中途斷，要再跑一次。

Skill: Rule 111 added

## Rule 113 — 部署：Pages 只發佈 `tools/deploy/site-files.json` 列明嘅 tracked 檔；加新 runtime 檔要同時入 `index.html`、`sw.js` ASSETS 同部署清單（`npm test` 會擋）

- 2026-11-07 總計劃 P1.6。新測試 `sw-assets.test.js` 第一次跑就捉到 `js/gym.js` 同 `supabase/supabase-config.js` 喺 `index.html` 有載，但從來冇入 `sw.js` precache。即係首次安裝之後未上過線就離線開 App，呢兩個檔會載唔到。已補入 ASSETS。
- 同一個測試另一個紅係 vm 跨 realm 陣列比較（Rule 106），唔係真問題；clone 之後就冇事。
- 本地用 `site-preview` 開 `_site`：App 開到（1.71.1）、同源請求冇 4xx；`CLAUDE.md`、`_seedtest.html`、`tools/`、`.trae/`、migrations、`Q_folder` 指引全部 404；Service Worker 喺呢個環境 `activated`，快取咗 379 項。
- 部署：5,540 個檔、96 MB（tracked 檔總共 7,601 個）。

Skill: Rule 113 added

## Rule 109／110 補充 — 另一個 session 嘅 P1 review（2026-11-07）

- `check-z-tokens.mjs` 嘅「before」一邊用 `Number()` 讀值。`058ab55` 之後 HEAD 嘅 CSS 已經係 `var(--z-*)`，25 條全部變 NaN，所以乾淨 tree 跑預設 HEAD 都會 exit 1（誤報）。修正：兩邊各自用自己 `:root` 嘅 token 解析，邏輯抽出做 `compareZ()`，喺 `tests/unit/z-tokens.test.js` 直接測（自己對自己、字面值轉 token、改咗 token 值、改咗字面值、未定義 token）。
- `ts-check-ratchet.test.js` 可以俾人繞過：同時拎走 `// @ts-check` 同清單項目，測試照樣全綠。修正：加 `MIN_CHECKED = 27` 下限，加「git HEAD 清單入面嘅檔仍然喺清單」。重試繞過，兩項都紅。
- 教訓：防倒退嘅測試要試埋「同時改兩邊」嘅繞過方法；核對工具要喺「已經改完、已經 commit」之後再跑一次預設參數，確認唔會誤報。

## Rule 114 — 驗收動畫要用 headless Chrome 錄影格；Browser pane 隱藏時瀏覽器會暫停 requestAnimationFrame，截圖睇唔到動畫

- 2026-11-07 總計劃 P1.4。第一次喺 Browser pane 撳 Thunderbolt，兩邊動畫都好似冇播；`MoveAnim.play()` await 咗 45 秒都冇返。原因係 pane 隱藏，rAF 被暫停，唔係 code 問題。改用 headless Chrome 錄格之後，四個招式 × 5 個時間點全部正常，冇任何 error。
- 另外兩個坑：精靈 png 係多格 atlas，直接當圖片用會成格 sprite sheet 顯示晒出嚟；8080 server 被 app 停咗之後，SW 用快取 `index.html` 頂替 `/tools/…` 頁面，畫面變咗 App 嘅「System busy」。

- 用戶回報「有 error」：Browser pane 用 `data:`／`file:` 直接開咗 prototype，`<base href="../">` 同 `PIXI.Assets.load` 全部失敗；左邊精靈變爛圖，右邊狀態列倒出咗成段 data URL。我嘅錄格測試一直用 `http://localhost:8080`，所以冇捉到。已加 `location.protocol` 檢查，錯誤訊息亦截短到 160 字。

Skill: Rule 114 added

## Rule 115 — 讀寫本地存檔：新 code 用 `Store`（`get`／`select`／`update`／`subscribe`）；要跟住資料更新畫面就 `subscribe`，唔好喺每個改資料嘅地方自己 call render

- 2026-11-07 總計劃 P2.1。`tests/unit/store.test.js` 11 項先寫，全紅（檔案未存在），實作之後全綠。瀏覽器實測：`Store.update` 同舊式 `saveState()` 都通知到訂閱者。
- 第一版寫咗 `window.Store`，typecheck 報 TS2551（`Window` 冇呢個屬性）。改成直接用頂層 `const Store`，`storage.js` 用 `typeof Store !== "undefined"`。
- `deploy-manifest.test.js` 喺本地開發期間誤報：新檔未 `git add`，`git ls-files` 冇佢。改為計埋 `--others --exclude-standard`。CI 入面所有檔都已經 commit，真係漏咗 commit 嘅 runtime 檔照樣會令 CI 紅、唔會部署。

Skill: Rule 115 added

## Rule 116 — `App`／`Quiz`／`Gacha` 方法分喺 `js/app/`、`js/quiz/`、`js/gacha/`（`Object.assign(X, {…})`）；搬方法要用 AST 工具、用方法指紋證明冇改；新方法放啱職責嘅檔

- 2026-11-07 總計劃 P2.2（現代化 2.2）。`js/app.js` 4,149 行 → 72 行，加 10 個 `js/app/*.js`（共約 4,160 行）。用 TypeScript AST 搬 96 個方法（104 個成員入面，狀態屬性同常數留喺 `app.js`）。
- 驗證：
  - `app-surface.test.js` 96 個方法指紋同拆檔前一樣；喺 `index.html` 拎走 `modals.js` 會即刻紅，仲列明少咗 `showModal`、`toast`。
  - 逐行多重集合比對：原本每一行都仲喺度，只係 10 個 `},` 變成 `}`（每個檔最後一個方法），另外多咗檔頭。
  - 393 個測試全過、lint 0、typecheck 0。
- 陷阱：`OVERLAY_EXIT_MS: 200,     /* … */` 行尾註解被 AST 當成 `showView` 嘅前置註解，搬咗去 `router.js`。逐行比對冇捉到（行仍然存在），係睇 `router.js` 開頭先發現，已經搬返。

- push 之後 CI 紅（只有 `app-surface` 一項）：96 個方法指紋全部對唔上。原因係 fixture 喺 Windows 用 CRLF 生成，CI checkout 係 LF。修正：hash 之前將 `
` 統一做 `
`，用拆檔前嘅代碼重新生成 fixture，再喺 LF 副本同 CRLF working tree 兩邊都測過。CI 測試唔過，`deploy` job 就自動 skipped，正式網址一直係舊版，P1.6 嘅部署閘門第一次發揮作用。

- `init`（828 行）拆做 13 個 `_boot*` 步驟：用 AST 列出 111 句頂層語句，同埋每句宣告／用到嘅局部變數。跨段共用只有 `st`（第 86 句入面嘅 `st` 係區塊內重新宣告嘅），冇頂層 `return`、冇 `arguments`。每個步驟只包連續語句，所以執行次序唔變；腳本重新 parse 之後核對 110 句語句一字不差。指紋 diff：舊成員只有 `init` 改咗，新增 13 個 `_boot*`。瀏覽器實測：開機、登入閘、各步驟綁定嘅掣、sheet、Esc、Service Worker 都正常。

Skill: Rule 116 added

### 2026-11-07 P2.5：`Quiz`／`Gacha` 用同一方法拆

- `js/quiz.js` 2,012 → 33 行＋9 個 `js/quiz/*.js`（76 個方法）；`js/gacha.js` 1,737 → 44 行＋6 個 `js/gacha/*.js`（66 個方法）。狀態屬性同頂層常數留喺主檔。
- 驗證：
  - `app-surface.test.js` 擴展到 App／Quiz／Gacha，拆之前記錄指紋，拆完全部一樣（App 嘅指紋同上一版 fixture 完全相同）。
  - 逐行多重集合比對：只有每個檔最後一個方法嘅 `},` 變 `}`（Quiz 8、Gacha 5），另外多咗檔頭。
  - 397 個測試全過、lint 0、typecheck 0；e2e 10/11（只有已知嘅 P9b）；瀏覽器實際答一題（判對、記錄、下一題）、提示、離開、開扭蛋同拉手臂，冇 JS error。
- 新陷阱：`quiz-answer.test.js` 原本淨係載 `js/quiz.js`，拆完會 `_buildCells is not a function`；改做跟 `index.html` 載主檔＋全部 mixin。
- 拆檔 script 加咗「行尾註解會跟住下一個成員搬走」嘅自動警告，今次冇觸發。

Skill: already covered by Rule 116（已擴展）

## Rule 119 — ES module 過渡期：底層檔用 `type="module"` 載入、頂層名要 `Object.assign(globalThis, {…})`；classic script 唔可以喺載入時（包括 IIFE 入面）用 module 嘅名

- 2026-11-08 總計劃 P2.3 第一批。轉之前用 TS AST 量度：6 個檔載入時都冇人用、冇被重新賦值嘅 `let`。
- 事故：瀏覽器一開就 `ReferenceError: escapeHTML is not defined at bag.js:19`，背包模組成個開唔到。原因係 `bag.js` 喺 IIFE 入面 `const esc = escapeHTML;`，IIFE 載入時即刻執行，嗰陣 `core/dom.js`（module）未行。
  - 量度 script 同第一版測試都將 IIFE 當成「function 入面＝之後先行」，所以冇捉到；單元測試全綠都冇用，係瀏覽器 console 先見到。
  - 修正：測試將 IIFE 當載入時執行（修正後即刻列出 `js/bag.js:19 escapeHTML`）；`bag.js` 改做 `const esc = (s) => escapeHTML(s)`。
- 驗證：416 個測試、lint 0、typecheck 0；刻意拎走 bridge 入面嘅 `haptic`，測試會紅；瀏覽器開主頁、背包、答題、扭蛋、戰鬥選單、`Store.update` 冇 error；e2e。
- 另外：其他 chat 佔用咗 8080／8091／8094／8097，`autoPort` 改咗 port 但 python 參數仍然係舊 port，server 其實冇開到 → `.claude/launch.json` 加 `static-esm`（8102，`autoPort: false`）。

Skill: Rule 119 added
