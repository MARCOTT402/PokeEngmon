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
