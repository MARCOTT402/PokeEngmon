---
name: pokeengmon-preop-checklist
description: Pre-operation checklist for PokeEngmon. Read this before every edit, version bump, or release in this repo, including the APP_VERSION/sw.js/index.html version sync rule and Supabase sync gotchas.
---

# PokeEngmon Pre-Operation Checklist

Read this file FIRST, before performing any task in this project (code edits, version bumps, releases, file changes). Treat it as a mandatory pre-flight check.

## Rule 1 — SemVer + semantic-release (do NOT hand-bump for releases)

Source of truth: `package.json` `"version"` (`MAJOR.MINOR.PATCH`).

- Commits on `main` must be [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …). CI runs `semantic-release` (`.github/workflows/release.yml`): bumps version, updates `CHANGELOG.md`, tags, GitHub Release.
- Release prepare runs `python tools/sync_app_version.py`, which writes the same SemVer into:
  1. `js/app.js` — `const APP_VERSION = "X.Y.Z";`
  2. `sw.js` — `const CACHE_NAME = "pokeengmon-X.Y.Z";`
  3. `index.html` — every `?v=X.Y.Z`
  4. `prd.md` header version line
- Local preview only: edit `package.json` version → `npm run sync-version`. Do **not** invent a parallel `vNN` scheme.
- Prefer `CHANGELOG.md` when answering “what changed in release X”.

## Rule 2 — Supabase upsert requires `Prefer: resolution=merge-duplicates`

Any `POST` to `/rest/v1/<table>?on_conflict=<col>` MUST include the header:
```
Prefer: return=representation,resolution=merge-duplicates
```
Without `resolution=merge-duplicates`, PostgREST treats it as a plain INSERT. If a row with the same PK already exists, you get `409 Conflict: duplicate key value violates unique constraint` — the `on_conflict` param does NOTHING without this header.

The `_api()` helper in `js/sync.js` auto-adds this header when the path contains `on_conflict`. If you write a new fetch call that uses `on_conflict`, route it through `_api()` or add the header manually.

The sync queue flush (`_flush()` in `js/sync.js`) must POST user_cards to `/user_cards?on_conflict=account_id,card_id` — a plain batch INSERT aborts the whole batch if any card already exists. The queue also flushes on `beforeunload` so answers submitted within the 1s debounce window aren't lost on page close.

## Rule 3 — `uuid` columns need valid UUIDs

`user_entries.id` and other `uuid`-type columns require a valid UUID v4 string (e.g. `550e8400-e29b-41d4-a716-446655440000`). Do NOT use base36 timestamps (e.g. `lq3k7a9x2b`) — Supabase returns `400 Invalid input`.

`uidGen()` in `js/storage.js` uses `crypto.randomUUID()`. If you introduce a new ID generator, ensure it emits valid UUIDs. Existing entries with non-UUID IDs are auto-migrated in `loadState()`.

## Rule 4 — `chain_key` format: frontend uses chain names, NOT `dex_<id>`

- Frontend `EVOLUTION_CHAINS` keys are species names (e.g. `"bulbasaur"`, `"nidoran"`).
- `SPECIES[dexId].chainKey` maps a Pokédex ID to its chain key.
- The `settle_capture` RPC historically wrote `chain_key = 'dex_' || dex_id`. **Do NOT do this** — it produces entries whose `chain_key` doesn't match any frontend chain, causing render crashes.
- `pull()` in `js/sync.js` converts legacy `dex_<id>` chain keys to proper chain keys via `SPECIES[parseInt(chainKey.slice(4))].chainKey`.
- `settle_capture` only writes to `user_captures` (logging). Since v99, `user_entries` changes go through RPCs (`obtain_capture` / `gacha_pull` / `add_entry_exp` / `use_entry_candy` / `alloc_ev`) — direct upsert is blocked by column-level grants.

## Rule 5 — Sensitive state changes go through RPCs, not pushState

Since v99, `Sync.pushState()` only pushes non-sensitive data (trainer_name; SM-2 cards/history go via the background queue). Diamonds, entries, exp, IVs/EVs, and candies are server-authoritative — direct writes are blocked by column-level grants, and `pull()` overwrites local values with cloud data on next load.

State-changing actions MUST call the matching RPC wrapper in `js/supabase-auth.js`:
- Quiz round diamonds → `awardRoundDiamonds(score, total)` (server returns the authoritative balance — use it, don't `+=`)
- Rare pull → `gachaPull(initExp, unlockedGen)` (server deducts diamonds atomically, rolls rarity/chain itself, returns the entry row → `adoptServerEntry()`)
- Capture success → `obtainCapture(chainKey, stage1Dex)` (+ `settleCapture(stage1Dex)` for logging) — **always stage1**, never evolved form dex
- EXP gains (quiz settle / Power Up batch) → `addEntryExp(entryId, delta)`
- Candy feed → `useEntryCandy(entryId, count, expDelta)`
- EV allocation → `allocEv(entryId, stat)`
- Partner switch / Eevee branch evolution → `Sync.patchEntry(entryId, { active | branch })`
- New Google account first-time import → `importState(payload)` (one-shot guard server-side)

**Logged-in RPC fail (v140):** if the user is signed in and the RPC was attempted but failed, **abort** (toast / try again) — do NOT silently fall back to local fake diamonds / fake gacha rewards. Local fallback is only for anonymous / truly offline. Silent fallback masks broken RPCs (v108 lesson) and desyncs cloud state.

Never re-add a direct diamonds/exp/entries write to `pushState()` — it will 403 once the migration SQL is applied.

## Rule 6 — Commit when asked; Conventional Commits; release via CI

The live site is GitHub Pages from `main`. Local edits do nothing until committed and pushed.

- Wait for an explicit user commit/push request (Cursor user rule). Then use Conventional Commits, e.g. `feat(quiz): autofocus answer input`.
- **Fast path**: `python tools/git_commit_push.py --paths <files...> -m "feat(scope): ..."`. PowerShell 5: no `&&`, use `;`. Guide: `.trae/documents/git-commit-push-guide.md`.
- Version bumps / tags / `CHANGELOG.md` for releases are owned by **semantic-release on push to `main`**, not by hand-editing `APP_VERSION`.
- If the site shows an old build: check `git status` / whether CI release ran / SW cache name.

## Rule 7 — SM-2 sessions only pull DUE cards

`buildSession` in `js/sm2.js` must only pick cards with `next_review_at <= now` (overdue first, brand-new cards fill the tail randomly). NEVER pad a set with not-yet-due cards — if a topic runs dry, the set is short and the user is told to pick other courses. Do not reintroduce any backfill of not-due cards (v94's 20-hour cooldown approach was superseded by v95's due-only rule).

## Rule 8 — Google OAuth: in-app sign out ≠ Google sign out

The "Connected Trainer" email comes from the JWT that Google/Supabase issued — if it shows the wrong account, the OAuth flow itself completed with that Google account. It is NOT a display bug.

- In-app sign out does NOT sign the user out of Google. Without `prompt=select_account` in the `/auth/v1/authorize` URL, Google silently re-uses the browser's current/default Google session.
- NEVER remove `prompt=select_account` from `signInWithGoogle()` in `js/supabase-auth.js`.
- `signInWithGoogle()` must clear the local session (`pokeengmon_auth_session`) BEFORE redirecting, so a failed/cancelled OAuth can't restore the previous account.
- If a user reports "signed in with account X but it shows account Y": the login click most likely ran stale pre-v85 JS (old SW cache, page open since before the deploy). Have them confirm the latest version in Settings, sign out, and retry — the account chooser should appear.

## Rule 9 — plpgsql RPC: variable names must NEVER collide with column names

Postgres defaults `plpgsql.variable_conflict = error`: if an identifier in a SQL statement could be both a plpgsql variable and a table column, the call fails at runtime with `42702 column reference "X" is ambiguous` → PostgREST returns **400**.

Real incident (v99→v108): `gacha_pull` had `where rarity = rarity` (variable `rarity` vs column `chain_rarity.rarity`) → **every rare-pull RPC 400'd for days**; the frontend's offline fallback silently masked it (pulls "worked" locally, Supabase never updated). Fixed in `supabase-migrate-20261024f-fix-gacha-pull-ambiguous.sql` by renaming the variable to `v_rarity` and qualifying the column (`cr.rarity = v_rarity`).

Prevention when writing/editing any RPC:
- Prefix declared variables with `v_` and **parameters with `p_`** (e.g. `p_chain_key`, `p_dex_id`) — v135 `obtain_capture` hit 42702 again when bare `chain_key`/`dex_id` collided with columns.
- ALWAYS qualify columns with a table alias (`cr.rarity`).
- **Smoke-test every new/modified RPC with a real authenticated call against live Supabase** — browser DevTools Network tab must show `200` from `/rest/v1/rpc/<name>`. Do NOT trust in-browser flow testing alone.
- If the user reports "Supabase didn't update after action X", FIRST check the console for `[Auth RPC] ... failed: 400` before debugging sync logic.

## Rule 10 — Service Worker fetch handler must skip non-http(s) schemes

DevTools extensions issue `chrome-extension://` requests that pass through the SW fetch handler; `caches.put()` on them throws `Request scheme 'chrome-extension' is unsupported` (uncaught promise, console noise). Guard at the top of the `fetch` listener in `sw.js`:

```js
if (!e.request.url.startsWith("http")) return;
```

## Rule 11 — Import/Export save feature was removed (v107); import_state is one-shot and server-clamped (v106)

- The manual Export/Import Save UI was **removed in v107** (`exportSave`/`handleImportFile` in `app.js`, local `importState` in `storage.js` deleted) because a tampered save file was a cheat vector. Do NOT re-add a client-side import without server-side validation.
- The remaining upload path is the post-login first-connect migration via the `import_state` RPC, hardened in `supabase-migrate-20261024e-import-tightening.sql`: **diamonds never cross the trust boundary** (client value ignored, fixed 20💎 welcome bonus), entries ≤151, exp ≤1.25M, candies ≤99, dupes ≤100, one-shot `user_account.imported_at` lock, `user_imports` audit table.
- Known adjacent RPC gaps deliberately deferred (fix in a future task, highest priority first): `award_round_diamonds` has no round-authenticity check, `obtain_capture` has no round proof, `add_entry_exp` has no rate limit.

## Rule 12 — Adding/replacing ANY asset? Check the copyright claims

Every time you add, replace, or remove a bundled asset — music/BGM/SFX, images, sprites, fonts, TTS voices, third-party libraries — you MUST check whether the copyright/disclaimer modal needs updating, and update it in the SAME commit. Don't leave stale or missing attributions.

Checklist:
1. **Disclaimer modal**: `App.openDisclaimer()` in `js/app.js` (~L919) — Music & Sound Credits / Data & Image Credits paragraphs. Add new attribution (title, source work, composer/author, © owner) or remove credits for deleted assets.
2. **Accuracy rule**: never credit services/archives we don't actually use for that asset (e.g. KHInsider is credited ONLY for the Pokémon soundtrack rips — a user-supplied Ghibli track must NOT be attributed to it).
3. **prd.md**: update the asset description there too (e.g. §3.10 音效與無障礙) so docs match reality.
4. **sw.js ASSETS**: new files must be added to the pre-cache list; removed files must be deleted from it (stale 404 entries don't break installs thanks to per-item caching, but they waste requests).
5. If the asset introduces a NEW rights holder (non-Pokémon), say so explicitly in the disclaimer with its own © line.

Current music credits baseline (v144): global BGM = *Flat Water* (BGM channel); battle/jingles = Pokémon RGBY soundtracks (© Nintendo / Creatures Inc. / GAME FREAK inc., via KHInsider); cries = Pokémon Showdown community; data/sprites = PokéAPI.

## Rule 16 — Audio volume prefs are a separate localStorage key (v145) + three-channel taxonomy

Player Music / SFX / Voice sliders live in `pokeengmon_audio_v1` (`loadAudioPrefs` / `saveAudioPrefs` in `js/storage.js`). Do NOT fold them into `pokeengmon_state_v1` or clear them in `clearGameProgress` / `resetState`. CaptureAudio routes BGM through `bgmBus`, SFX through `sfxBus`, and word/TTS audio through `wordBus` (`setBgmScale` / `setSfxScale` / `setVoiceScale`); designed base gains (town 0.1, battle 0.15) stay hardcoded — the slider is a 0–1 multiplier only.

Channel rules:
- **Music = every file in `assets/bgm/`** (loops + reward jingles/fanfares). Use `playMusicOnce` for one-shot music, never `playOnce`; a `playOnce` on a bgm asset silently puts it under SFX.
- **SFX = synthesised cues + `assets/battle/sfx/*` + `assets/audio/wrong-answer.mp3`**. Play MP3 SFX via `playOnce` (Web Audio buffer) — never `HTMLAudioElement.volume`, iOS ignores it.
- **Voice = word pronunciation mp3 + speechSynthesis**. Keep it on `wordBus`; `SpeechSynthesisUtterance.volume` must read `_voiceScale` (speechSynthesis cannot use the bus).
- Any secondary AudioContext (e.g. `Pokedex`) MUST adopt `CaptureScene.audio.ctx` and connect its gain to `sfxBus`; a private context bypasses sliders and live changes. Clear decoded caches when the ctx changes.

## Rule 13 — `EVOLUTION_CHAINS` is an array

Lookup with `.find(c => c.key === key)`, NEVER `EVOLUTION_CHAINS[key]` (undefined → leaderboard `?` sprites, v134).

## Rule 14 — Sync.pull: normalize `dex_*` BEFORE collecting gens

`pull()` must rewrite legacy `dex_<id>` chain keys first, then walk entries to `ensureGenDataLoaded(g)`. Skipping `dex_` entries during gen collect leaves Gen2+ moves empty (v140).

## Rule 15 — Defensive defaults that have bitten us

- `ownedSpecies` may be null → repair / guard before `.includes` / `collectedCount` (v140).
- `RARITY[x]` — there is no `"common"` key; use `RARITY[x] || RARITY.normal` (v141).
- Short quiz sets: EXP uses `round(score/total×10)` against the /10 tier table; diamond offline fallback uses relative thresholds vs `total` (v136/v139).
- Gacha: snapshot `pendingExp` into a local const BEFORE clearing it when calling RPC (v138).

## Rule 17 — Feature hubs must close when clicking outside

`App.showModal(html)` installs a backdrop-click handler that closes the modal. Passing a second argument `true` (`App.showModal(html, true)`) disables it.

- Feature hubs / panels (Report a problem, Partner Care, Login Hub, Pokedex detail, My Questions, etc.) MUST stay dismissable by tapping the backdrop — call `App.showModal(html)` WITHOUT `true`.
- Only destructive or blocking confirmations (Reset Progress name confirmation, quit-quiz confirmation, cloud-overwrite warning) may pass `true`, because an accidental backdrop tap must not wipe or overwrite progress.
- When adding a new hub, also wire its Cancel/close button to `App.closeModal()` so both dismissal paths exist.

## Rule 18 — Derived fields (moves / knownMoves / level / stats) depend on POKEMON_DEX — NEVER compute pre-dex

Any field derived from `POKEMON_DEX` (learnsets, growth tables, base stats, types) MUST be computed only after `POKEMON_DEX` is loaded. Computing it pre-dex produces a **degraded non-empty value** (e.g. `knownMoves = moves.slice()` while `learnsetOf()` returns `[]`, or `moves = []`), and the standard repair check (`!Array.isArray(x)`) then skips it forever — the corruption persists across reloads.

Real incident (v113 / move-pool work): `ensureEntryPokemonData` ran before dex load, wrote `knownMoves = moves` (no learnset union). Later `migrateEntries` saw a non-empty pool and skipped repair, so Other Moves stayed empty.

Defenses:
- Guard every dex-dependent backfill with `if (POKEMON_DEX && …)` — don't write the field if dex isn't ready; leave it missing/empty so a later call repairs it.
- `migrateEntries()` in `js/storage.js` is the **single post-dex repair authority** (runs after `await loadPokemonDex()` at `js/app.js` ~L2107). When adding a new dex-derived entry field, add its force-rebuild there (recompute from the canonical source, compare, save only on diff). Do NOT rely on lazy `!Array.isArray` checks alone.
- `Sync.pull()` already `await loadPokemonDex()` before `deriveEntryFields` (`js/sync.js` ~L241); any new server-row → local-entry derivation must do the same.

## Rule 19 — Re-collection after full evolution uses `is_final`; move loadouts are local-only

**Re-collection:** when every entry of an evolution chain is fully evolved (`stage >= chainMaxStage`), the next pull/capture on the same chain opens a **new** entry instead of duping into a finished one. Server RPCs (`gacha_pull`, `obtain_capture`) select the dupe target with `… and is_final = false order by obtained_at asc limit 1`. `is_final` is **client-derived** (server doesn't track `stage`); `deriveEntryFields` sets `out.isFinal = isEntryFullyEvolved(out)`, and `Sync.pull` backfills `is_final=true` to the server for any row where the client says it's final. If you add new fields that affect "fully evolved", update `isEntryFullyEvolved` and `Sync.patchEntry`'s whitelist must include `is_final`.

**Move loadouts:** `entry.moves` = held (≤4), `entry.knownMoves` = the move pool (every move learnable by any owned form at the current level). Player-custom loadouts live in `st.moveLoadouts[uid]` (localStorage only, NOT synced to the cloud — moves aren't a server column). After `pull`/`adoptServerEntry` rebuild `moves` from the pool, `applyMoveLoadout(entry)` restores the player's picks if they're still in the pool. `setEntryMoves` validates against the pool, caps at 4, and writes the loadout — never bypass it.


## Rule 20 — Browser automation silently mis-fires when the IDE preview window is 0×0

Symptom: every click "succeeds" but nothing happens; no console error; handlers all bound correctly (v1.15.0 party-screen verification burned 3 browser_use agents on this).

- FIRST check innerWidth/innerHeight via rowser_evaluate — if both are 0, the preview window is minimized/zero-sized and elementFromPoint returns null for everything. Fix with rowser_tabs({action:'activate'}) (restores the window), NOT code changes.
- 	ypeof window.X === 'undefined' is a red herring for scripts whose top-level uses const/let (battle.js's BattleUI is such a global). Probe with bare-identifier eval('typeof X') instead.
- If the bridge wedges ("WebView is not ready" even on a blank HTML file, navigate timeouts at 60s): close the wedged tab via rowser_tabs close; if still stuck, ask the user to close/reopen the preview panel — do not keep retrying navigations (each costs 60s).

## Rule 21 — Hand-made battle anims: verify in slow-mo; never emit an empty frame 0

Two pitfalls from authoring the 27 custom `assets/battle/anim/*.json` (v1.15.17):

- **Screenshot verification**: battle anims run at 60fps and many are ~260ms total, so browser_use screenshots almost always land between animations and report "nothing renders" for perfectly fine anims. Use the dev harness `tools/_anim_preview.html?slug=<a,b,c>&frameMs=400` (passes `frameMs` to `MoveAnim.play`, 4–6s per move) — screenshots then reliably catch every move mid-animation.
- **Empty frame 0**: when staggering layer entrances (e.g. trick-room tiles appearing one by one), make sure at least one layer exists in frame 0 — `MoveAnim.play` calls `drawFrame(0)` immediately, and an empty first frame shows a blank beat (and trips `tools/gen_missing_anims.js` validation). Bias stagger formulas so the first element is already visible at i=0.

## Rule 22 — The "fainted → skip action" guard in `runTurnResolution` must not swallow switch actions

Bug (reported as "對戰用戶Pokémon戰死後不能換Pokémon上場"): `js/battle/battle.js` `runTurnResolution` guarded every queued action with `if (active(state, side).hp <= 0) continue;`. A forced post-faint switch is itself a queued `{kind:"switch"}` action resolved inside that loop, so the guard skipped it → `switchTo` never ran → the turn ended with the active still at 0 HP → the forced-switch branch re-opened `showSwitchMenu(true)` forever. Symptom: player picks a healthy Pokémon, taps SEND OUT, party screen reopens every time.

Fix shape (keep this condition):

```js
if (act.action.kind === "move" && active(state, side).hp <= 0) continue;
```

Rules:
- Only `move` actions may be skipped for a fainted side. `switch` actions MUST still execute even when the outgoing Pokémon is at 0 HP — `executeMove` already guards `actor.hp <= 0`, and `animatedSwitch` skips the recall animation when `out.hp <= 0`, so a fainted-side switch is safe.
- Do NOT "fix" a stuck switch by moving forced switches outside the turn loop / giving them a free turn: PvP requires switch to stay a next-turn action (`prd.md` L162) because both clients replay the same seed with the same `Battle.turnOrder` (switch priority 6); changing turn semantics desyncs PvP.
- When adding any new action kind (item, run, etc.), decide explicitly whether the fainted guard applies to it, and write it as a positive `kind ===` list rather than a blanket `continue`.

## Rule 23 — A class with `display:flex` defeats the `hidden` attribute; visible-by-default lists don't need a reveal tap

Incident (Battle menu): `#ai-trainer-list` was only filled when the "AI Trainers" tile was tapped, so the ladder looked empty on entry. It now renders inside `renderMenu()` and the tile just collapses/expands it.

- Any repo element whose class sets `display` (e.g. `.ai-trainer-list{display:flex}`) IGNORES `el.hidden = true` (author styles beat the UA `[hidden]{display:none}` rule). Add an explicit `.<class>[hidden]{display:none}` pair in `css/style.css` before using `hidden` as a toggle.
- Content lists that are the point of a screen MUST be rendered when the view opens (in `renderMenu()` / the view's render fn), not behind a second tap. Keep the tile as a collapse/expand affordance only.
- Guard generated-item click handlers against missing prerequisites (e.g. no owned Pokémon) inside the handler too — once a list renders unconditionally, its click path is reachable in states the old reveal-flow never allowed.

## Rule 24 — plpgsql block terminators: `IF` ends with `end if;`, only the function body ends with `end;`

A migration is applied as one pasted script in the Supabase SQL Editor, so one syntax slip aborts EVERYTHING after it. Sections already executed stay applied — the file is left half-applied (tables/policies exist, RPCs don't).

- Before running a new migration, count `IF ... THEN` / `ELSIF` chains against `end if;`. Loops close with `end loop;`; only the outermost `begin ... end;` uses a bare `end;`.
- Failure mode: `42601 syntax error at or near ";"` points at the stray `end;` line, NOT at the `IF` that opened the chain — so do not reread the flagged line, count terminators instead.
- Re-running is only safe when the file is written idempotently (`create table if not exists`, `drop policy if exists` + `create policy`, `create or replace`, seed `on conflict do nothing`); keep new migrations in that shape so a failed paste can simply be re-run.

Incident (20261102c quest-config): two if-chains ended with `end;` → whole migration rejected at line 150 after tables/policies had already applied. Restructuring a `CASE`-with-correlated-subquery into plain `if / else` also removed the ambiguity that made the slip easy to miss.

## Rule 25 — 撞板／被修正之後，同一輪就要寫入 skill（唔准等用戶開口）

Trigger: 用戶纠正你、同一類錯誤第二次出現、或者你第一次嘗試失敗要改做法。呢個係最強信號。

- Before you report "done", append a rule to this file (or the matching project skill). The message must end with `Skill: Rule N added` or `Skill: already covered by Rule N`.
- Record the **workflow** lesson, not just the code detail. If the real failure was "I ran it without checking", "I only capture when asked", "I tested the happy path only", that is the rule.
- Do not narrow it to one symptom (e.g. only `end if;`). State the invariant that prevents the whole class of mistake.
- If the user says "that's not the lesson" — the rule was too narrow; widen it in the same turn.

## Rule 26 — Headless Chrome 截手機版圖：`--window-size` 出唔到 375×667，要用 CDP `Emulation.setDeviceMetricsOverride`

Incident (P1 home 原型驗收, 2026-11-03): `--headless=new --window-size=375,667` 實際視口變咗 500×572 —— new headless 有最小視窗寬（≈516px）兼扣窗框（寬 −16／高 −95）。用 `--force-device-scale-factor=2` 都冇用（只放大渲染，唔改 CSS 視口）。截圖一度以為版面右側溢出，其實係 500px 視口 + 430 max-width 居中造成嘅黑邊假象 —— 先讀 HUD/JS 實測 `innerWidth` 再斷症，唔好信截圖第一印象。

- 正解：Node ≥22 內建 WebSocket，零依賴講 CDP —— `--remote-debugging-port` 起 Chrome，`Emulation.setDeviceMetricsOverride {width:375,height:667,deviceScaleFactor:2,mobile:true}` 先係真 375×667。現成腳本：`prototype/home-p1/capture.mjs`（兼可用 `Input.dispatchTouchEvent` 做合成下拉/誤觸測試）。
- 同場兩個版面教訓：(1) 彈出式元素（offline banner）會改變固定高度預算，用 CSS 變數 `--fixed` 補償而唔係寫死；(2) sticky CTA 要設 `z-index` 高過卡內 badge，否則滾動時 badge 會透出 CTA 邊緣。

## Rule 27 — Grid 列數必須等於實際子元素數；`env(safe-area-*)` 用 `padding` 吸收，不要當成 grid row

Incident (v1.28 Home 上線後真機全紅, 2026-11-03): `.pd-shell` 寫了 `grid-template-rows: env(safe-area-inset-top) 48px 1fr 34px env(safe-area-inset-bottom)` 五列，但當時 shell 內只有 2 個 grid item（bezel、screen2），`.pd-chin` 還在 shell 外面。結果 bezel 落入第 1 列（safe-top=0 → 0px 高、內容溢出）、screen2 被壓進第 2 列（48px）、其餘 1fr/34px/safe-bottom 全部空成紅色背景 —— 版面「整個屏幕都是紅殼、內容只剩頂部一條白帶」。

- `grid-template-rows` 的數量是「軌道」數量，**不會自動對應子元素**。加/刪子元素時必須同步改列定義，否則子元素被塞進錯的軌道。
- Safe area 用 `padding-top/bottom: env(safe-area-inset-*)` + `box-sizing: border-box` 吸收（外殼高度仍 `100dvh`），Grid 只留固定內容列（`48px 1fr 34px`）。把 safe-area 寫成 row 的話，桌面/瀏覽器（inset=0）會多出兩條 0px 軌道，令所有子元素位移一列。
- 裝飾性子元素（下巴/底部裝飾）如果想參與 grid 佈局，就要放進 grid 容器內；放外面就永遠不是 grid item。
- 驗證方法（唔可以只靠肉眼睇截圖）：CDP 讀 `getBoundingClientRect()` 每個 grid item 的高度 + `scrollHeight - clientHeight`。本次正確值（375×667）：shell 667 / bezel 48 / screen2 575 / chin 34 / overflow 0。

## Rule 28 — 手寫 SVG 圖示一定要帶 `fill` 或 `stroke`，否則變黑塊或完全隱形

Incident (同上，同一輪): 由原型搬去正式碼時，部分 `<svg>` 漏了 `fill`/`stroke` 屬性。`<rect>`/`<circle>` 默認 fill 黑色 → Pokedex 與 Quest 圖示變成實心黑塊；純線段 `<path>`（交叉劍）默認 fill 但無面積 → 完全睇唔到，底部 dock 明明 5 格只見到 4 格。

- 線稿圖示統一寫齊：`fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`。
- 實心圖示必須明寫 `fill`（例如火焰 `fill="#ff7a00"`），並補 `stroke` 描邊以配合手繪風。
- 同一組（頂 dock / 底 dock）圖示用同一 stroke-width 與 viewBox 尺寸，否則視覺重量不一致。
- 驗收：截圖後逐格數目對數（5 格要見到 5 個圖示），唔係只看「有冇紅屏」。

## Rule 29 — 唔好對「按鈕本身」寫 textContent；圖鑑總數用 `TOTAL_SPECIES`

Incident (v1.29 home dock 改版, 2026-11-03): `renderHome()` 寫 `document.getElementById("td-streak").textContent = "x" + calcStreak();`。`td-streak` 按鈕內同時有 `<svg>` 火焰圖示同 `<span id="home-streak-label">`，一行 textContent 就把整個 SVG 清掉，圖示變文字。同一輪亦寫了 `POKEMON_DEX.length` —— 呢個全域根本唔存在，dock 顯示 `0/undefined`。

- 更新 dock 數值時只寫**內部 label span**（`home-streak-label`、`home-dex-progress`、`topbar-diamonds`），永遠唔郁按鈕本身。
- 圖鑑總數（Gen 1-5，649）係 `js/data.js` 的 `TOTAL_SPECIES`；單一世代 151 只係 `SPECIES` 篩選結果。
- 新寫任何 `getElementById(...).textContent =` 前，先確認該元素**只含文字**；含 SVG 或子元素就要改寫目標 span。

## Rule 30 — 手機尺寸基準與本地預覽（iPhone 17 Pro Max）

Phase 1 以手機為先，版面基準就用最大嘅 iPhone：

| 機型 | CSS 尺寸 | DPR | 安全區 top/bottom |
|---|---|---|---|
| iPhone 17 Pro Max | 440 × 956 | 3 | 62 / 34 |
| iPhone 16 Pro | 402 × 874 | 3 | 62 / 34 |
| iPhone 15 | 393 × 852 | 3 | 59 / 34 |
| iPhone SE | 375 × 667 | 2 | 0 / 0 |

- `.pd-shell` / `.ph-shell-parent` 嘅 `max-width` **必須 ≥ 440**，否則 440 闊機左右會露底色。
- 本地預覽：`npm run preview:iphone` 開 `tools/device-preview.html`（iPhone 外框 + Dynamic Island + Home indicator，可操作）。外框頁按窗口大小整體縮放，並經 `--sim-safe-top/bottom` 注入安全區；`.pd-shell` 用 `max(env(...), var(--sim-*))` 所以真機仍然用 env()。截圖：`--headless --click "#btn-entry-yes" --shot out.png`。
- 桌面 Chrome DevTools 嘅 iPhone 預設**唔會**注入 `env(safe-area-inset-*)`（iframe 內更加一定係 0），所以唔好靠 DevTools 對安全區。
- `.pd-ball` 基類係 `position:absolute; right:18px; top:10px`。任何新容器（下巴、卡角、裝飾）要用佢，必須畀容器 `position:relative` 並重置 `top/right:auto`，否則粒球會飛去 `.pd-shell` 嘅 padding 區（實測飛到 y=10，即狀態欄位置）。

## Rule 31 — `_closeAllSheets()` 唔好立即設 `hidden=true`，要等 transform 動畫跑完

Incident 1 (Home sheet close, v1.30): `_closeAllSheets()` 直接 `s.hidden = true`，結果所有 sheet 關閉時「閃一下就冇咗」—— transform `translateY(-100%)` 動畫被 `hidden` 立即中斷。

Incident 2 (cross-button transition, v1.30): 點閃電 → 再點電池，新 sheet 直接彈出冇動畫。根因：`_closeAllSheets` timer (410ms) 同 binder timer (410ms) 同時 race，新 sheet 可能被舊 timer 設 `hidden=true`。

Incident 3 (rapid toggle lock, v1.30): 快速來回點擊 5+ 次 icon 捲開捲收後，主頁 window 鎖住 — `.ph-backdrop` 留喺 DOM 有 `ph-open` + `pointer-events:auto`，遮晒主頁所有 element。根因鏈：
(a) `_closeSheet`（單獨關）冇 remove backdrop.ph-open（只有 `_closeAllSheets` 有）→ toggle close 時 backdrop 永遠留喺度
(b) 快速 cross-button → 多個 close timer 同時排 → 每個 timer 見到 stillOpen 就 skip → 冇 timer 真正執行 hidden
(c) `_openSheet` 入面 `backdrop.ph-open` 係同步加，但 `sheet.ph-open` 係 rAF 加 → cleanup timer 跑時檢查 sheet.ph-open（rAF 未跑）→ null → 唔 retry，但 backdrop.ph-open 已經喺度 → 遺留

Incident 4 (setting→diamond cross-button, v1.30): 點 setting → 點寶石，寶石 gacha 捲出來後立即消失。根因：之前加嘅 **retry + force-close loop**（retry 3×200ms = 600ms）— cleanup timer 430ms 跑時見到 gacha.ph-open → retry → 再見到 → retry → attempts>=3 強制 remove 所有 ph-open + hidden！**Force close 唔應該存在！** 如果有合法 sheet 開住（binder 410ms 後開嘅），就 skip，唔好強關。

最終正確做法（v1.30 commit `b54712f`）：
- **移除 retry + force-close loop！** 如果 `stillOpen` 存在，代表有合法 sheet 開緊 → 直接 skip，唔好 retry 唔好 force close
- 兩條 close 路徑（`_closeSheet` / `_closeAllSheets`）**完全一致**：
  1. 只 remove `ph-open` class（動畫自然播）
  2. setTimeout 430ms（比 transition 400ms + binder open 410ms 遲 20ms）
  3. 雙重 `requestAnimationFrame(() => requestAnimationFrame(...))` 確保 `_openSheet` 嘅 rAF 已經跑完
  4. 檢查 **`sheet.ph-open`** → 有 → `return`（skip，唔好 force close）；冇 → 清理所有 `.ph-open=false` 嘅 sheet + backdrop hidden
- `_closeSheet` remove 自己後即刻檢查 `anyOpen` → 冇其他 sheet 開住就一併 remove backdrop.ph-open
- 移除 `_checkCloseAllSheets()`（舊時單獨 close 完再 call closeAll → 雙 timer race）
- Binder pattern：`_sheetSwitching` debounce flag（cross-button path 先設，toggle path 唔設）
- 切換 view 時 `showView()` 最頂部 call `_closeAllSheets()`（唔等動畫）

**仍然未解決：** 快速 cross-button（間隔 < 410ms）時，後續 click 會被 `_sheetSwitching` flag skip。如果要完全解決，需要用 **last-click-wins 模式**（新 click 會 cancel 舊 timer）而唔係 debounce skip。

完整規格見 `.trae/skills/webapp-mobile-dev/SKILL.md` Rule 6。

## Rule 32 — Render 函數新增選項後，要審查所有「內部再 render」入口

Incident (2026-11-03 Calendar): `Calendar.render()` 曾加咗 `disableClick` option，但月切換 nav 的 handler 寫成 `this.render(containerId)`（冇帶 options），令同一 option 喺另一個入口失效（該 option 後來因需求改變而移除，但教訓通用）。

- 為 render 加任何 option 時，逐一列出所有會再次呼叫它嘅入口：內部 nav/pagination、sync pull 後 refresh、resize、動畫結束後 re-render。每個入口都必須傳回同一份 options（或把 options 存在 root 上）。
- 事件 handler 唔好在首次注入時 bind 一次就算；每次 render 都重綁，令 closure 永遠帶住最新 options。
- 驗收方法：用 headless 打開該情境，實際 click 一次確認行為同預期一致，而唔止係讀 code。

## Rule 33 — 「冇彈／有彈」類投訴，先確認邊個才係想要嘅行為，唔好自作聰明移除功能

Incident (2026-11-03 Calendar): 用戶報「點擊日曆日期會彈資訊」，當時理解成「彈窗係 bug」而加 `disableClick` 將 sheet 內日曆變唯讀；下一輪用戶報「點擊有答題紀錄嘅日期冇 popup，睇唔到紀錄」→ 還原彈窗；第三輪用戶再講「要睇得番紀錄又唔會彈窗」→ 真正想要嘅係**日曆下方內嵌展開**，唔係 modal。連續兩輪都係靠猜，白改兩次。

- 收到「X 會彈出 / X 冇反應」呢類描述，唔可以靠字面推斷好壞；先講清楚你理解嘅 desired behavior，或用 AskUserQuestion 確認（要彈 vs 唔要彈 vs 內嵌）。
- 任何會移除／禁用現有可見功能嘅改動，一定要先確認，唔好當成 bug fix 直接做。
- 用戶「要內容但唔要 popup」時，正解通常係**原位置 inline / accordion 展開**（同一容器、可再點收起、切換日期會換內容），而唔係刪掉功能或保留 modal。
- 修完要重現用戶原話嘅場景驗收（例如「點有紀錄嘅日期 → 應該喺日曆下方見到 Set 詳情，且冇 modal」），而唔止驗自己假設嘅方向。

## Rule 34 — 手勢（swipe / drag）實作要點

Incident (2026-11-03 Calendar): 加左右掃轉月 + 拖曳箭咀展合 sheet，容易踩以下幾點。

- 用 pointer events（`pointerdown/move/up/cancel`）+ 每次 render 用 `AbortController` 重綁，避免舊 handler 疊加。
- CSS `touch-action`：可捲動區域用 `pan-y`（保留垂直捲動、自己處理橫掃）；純拖曳 handle 用 `none`。
- 一定要做 **axis lock**（例如 6px 後判斷橫向定縱向）：縱向就即刻放手指手，交返俾 sheet 捲動，否則會搶走 scroll。
- 掃完要 suppress click，而且 flag 要**跨 re-render 保存**（掛喺 DOM element 上，例如 `grid._swipeSuppress`）；因為轉月後 `render()` 會重建 listener，local flag 會失效，synthetic click 就會誤觸日期格。
- height 由 auto ↔ 100% 係唔可以 transition 嘅：先量目標高度 → 設返起點 px → 下一 frame animate 去目標 px → 完成後才改回 `auto` / `100%`，否則會直接跳。
- **拖曳方向要跟 panel 嘅 anchor**：`.ph-sheet-down` 係 `top: 0`、由頂部向下展開，所以 **向下拖 = 展開、向上拖 = 收起**（height 增加時 handle 會向下行）。照抄「向上展開」會同手指方向相反 — 2026-11-03 實際做錯過一次要改返。Bottom-anchored sheet 才係向上拖展開。
- Headless 驗證手勢要用 CDP `Input.dispatchTouchEvent`；用 JS 合成 `PointerEvent` 會令 `setPointerCapture` 拋 `NotFoundError`，驗唔到真實行為。

## Rule 35 — sheet 內 click handler 即時 re-render 會令 document click 誤關 sheet

Incident (2026-11-03 Pokédex compact preview): 喺 sheet 入面嘅 chip／按鈕 handler 直接 `container.innerHTML = ...` 重繪，`event.target` 會變成 detached node；跟住 document 嘅 bubble click handler 做 `e.target.closest("#view-home .ph-sheet")` 會攞到 null，誤判「點咗 sheet 外面」而 `_closeAllSheets()`。症狀係撳 chip 之後內容有更新，但 sheet 已經靜靜雞關咗，之後再撳箭咀就會出現 full class 但冇內容嘅怪狀態。

- 任何 sheet 內 handler 會**同步** re-render（尤其清空 container）都要 `ev.stopPropagation()`。
- 或者延後 re-render（`setTimeout 0` / `requestAnimationFrame`），等 click 冒泡完先換 DOM。
- **最穩妥（現已採用，Rule 35 更新）**：document 嘅 click handler 喺 **capture phase** 先用 `e.target.closest()` 記低 backdrop / sheet / close button 命中結果，bubble 階段只讀呢個記錄。咁就算 handler 中途 re-render 令 target detach，判斷仍然正確 — 唔使逐個 handler 補 `stopPropagation`。
- 測試唔好只驗內容有冇更新，要同時驗返 sheet 仍然 `ph-open`。

## Rule 36 — sheet compact → full 要共用同一個頂部 unit，唔好各整一份

Incident (2026-11-03 Pokédex): 初版用自製 compact preview markup，full 再搬成個 view 入去；兩個 gen hub 係唔同 DOM，展開時頂部會 re-render／跳位，睇落似 overlap。用戶要求「上部份係同一個 unit，下部份由上部份展開出去」。

- 做法：mount 時只搬「頂部 unit」element（例如 `#gen-hub`、`#dex-progress`）入 sheet host 並 render 一次；**展開時**才把其餘 childNodes append 落去；**收起時**把其餘 nodes 搬返 view，頂部 element 完全唔動 → 同一個 unit、位置不變。
- `_unmountSheetView` 要用 `prepend`（收起狀態下 lower 內容已搬返 view，頂部 unit 要放返最前），否則次序會變。
- `expandArrow` 支援 opts `onDragStart` / `onDragEnd`：拖曳期間先放出 lower content（避免拉出空白），未夠力就收起返。
- `renderHub()` 嘅 `scrollIntoView` 喺 sheet mount 時要 skip（flag），否則一開 sheet 就橫向捲走第一格；mount 完再 `scrollLeft = 0`。

## Rule 37 — 唔好假設 `env(safe-area-inset-top)` 一定大過 0；負 offset 元素要畀 shell 留白下限

Incident (2026-11-03 紅框頂裁切): 真機 Safari 瀏覽器模式下 `safe-area-inset-top = 0`（webview 由狀態欄下方先開始），`.pd-shell` 用 `top:0` 貼死 viewport 頂，結果鑽石數值 pill（`.pd-topdiamond`，`top:-8px` 突出 bezel 上方 6px）被 viewport 頂邊裁切一半，紅框亦冇可見頂邊。手機模擬器長期注入 `--sim-safe-top: 62px`，所以呢類「safe-area=0」嘅破版喺模擬器永遠睇唔到。

- 任何靠 safe-area 留白收容嘅突出元素（負 top/right offset 嘅 pill、badge），容器 padding 要用 `max(env(...), var(--sim-*), <下限>)` 設下限，唔可以淨靠 env()。
- 驗證版面時**必須**加跑一次 safe-area=0 嘅配置（`node tools/preview-iphone.mjs --device iphone-se`），唔好只驗 17 Pro Max（62px 會 mask 晒所有頂部裁切問題）。
- 外框頂邊要可見時，用 `--frame-inset-top` 統一調整 shell `top` + `height: calc(100dvh - ...)`，並同步更新 `--frame-screen-top`（gacha overlay 定位用），三處算式要共用同一份 max() 表達式。

## Rule 38 — preview 工具 `--js`：`const` 全域（Gacha/App/Quiz）唔喺 `window` 上，要 click 真掣或 iframe `eval`

Incident (2026-11-04 Lucky Draw 驗證): `preview-iphone.mjs --js` 喺外框頁執行，`doc.defaultView.Gacha` 係 `undefined` —— app 入面 `const Gacha = {...}` 呢類 top-level const/let 只存在 global lexical scope，**唔會**變 `window` property（`loadState` 呢類 `function` 宣告先至會）。用 `w.eval('Gacha.open(...)')` 又得，但 PowerShell 巢狀引號极易 SyntaxError。

- 首選：**click 真 UI 掣**間接觸發，例如入 gacha 用 `doc.querySelector('#btn-bezel-diamond').click()`，唔使直接掂 const 物件。
- 改 state 用 `w.loadState()` / `w.saveState()`（function 宣告，有掛 window）。
- 一定要 eval：用 `w.eval('...')`，eval 字串入面只用單引號；外層 PowerShell 用雙引號，唔好再嵌雙引號。
- 模擬拖拽：`new w.PointerEvent('pointerdown', {clientY, pointerId:1, bubbles:true})` dispatch 落 `#dm-arm`，再 `pointermove` 加 clientY 偏移（≥108px 即過 72% 閾值），可無頭行完整個抽獎流程。

## Rule 39 — display-window overlay 四個角都要圓角（唔好只修被投訴嗰個角）

Incident (2026-11-04)：quiz 選題／結算、Leaderboard、Battle Menu、Friends 收成 display-window overlay 後，用戶投訴「下面起角穿出來」。第一次只加 `border-radius: 0 0 14px 14px`（底部），下一輪用戶再投訴**頂部**一樣起角——白螢幕區（`.ph-sheets`）本身四個角都係 16px 圓角，任何一個直角都會穿。

- 新 display-window overlay（position: fixed、對齊 `--frame-screen-top/bottom`、max-width 428px）**一出場就要** `border-radius: 14px`（全四角），唔好等被投訴邊個角先修邊個。
- 規則：投訴「起角／穿出」時，檢查**全部四個角**，唔好只修用戶指住嗰個。
- 同時檢查同類 overlay 是否共用同一 selector（`#view-quiz-setup, #view-settlement, #view-leaderboard, #view-friends, #view-battle-menu, #gacha-scene-b, #gacha-inspect`），改一個就要改晒。

## Rule 40 — body 級 overlay 要豁免「點外面關 sheet」全域 handler

Incident (2026-11-04)：gacha 結算卡撳「×3 TO GO!」會跳返主頁而唔係再抽。原因：`#gacha-inspect` / `#gacha-scene-b` 係 `document.body.appendChild` 掛嘅 fixed overlay，**唔喺** `#view-home .ph-sheet` DOM 入面；app.js 嘅全域 document click handler 見「click 唔喺 sheet 內」就 `_closeAllSheets()`，於是 TO GO 嘅 click 順手將 gacha sheet 關埋。

- 任何掛喺 body、但邏輯上屬於某個 sheet 流程嘅 overlay，都要喺 `e.__peHit` capture 階段加 hit-test（見 `gachaOverlay`），並喺 bubble handler 豁免。
- 日後新增 body 級 overlay（唔喺 sheet DOM 內），即刻問：「佢嘅 click 會唔會誤觸 _closeAllSheets？」

## Rule 41 — 關 sheet 有兩條路徑：改一條就要同步另一條

Incident (2026-11-04)：gacha 結算卡撳下巴 Home 掣「冇反應」——其實 Home 掣有行到 `_closeAllSheets()`，但佢只係逐個 sheet `remove("ph-open")`，**冇**好似 `_closeSheet()` 咁呼叫 `Gacha.abort()`，於是 body 級嘅 `#gacha-inspect` 結算卡冇收到、繼續蓋住成個畫面，用戶以為掣壞咗。

- `_closeSheet()`（逐個關）有 sheet-specific hooks（gacha → `Gacha.abort()`）；`_closeAllSheets()`（全部關，例如下巴 Home、戰敗跳走）必須做同樣嘅 hook，依家已加 `if sheet-gacha is open → Gacha.abort()`。
- 日後任何「關閉時要做清理」嘅 sheet（stop BGM、收 overlay、補結算），hook 要同時存在兩個函數；更好係 `_closeAllSheets` 內部逐個 call `_closeSheet`。
- body 級 overlay 嘅清理永遠要靠 abort/close hook，唔好假設 sheet 關咗佢就會自己消失。

## Rule 42 — flex column 容器做滾動區：子項要 flex: none，否則被壓扁

Incident (2026-11-04)：選題頁 `#topic-list` 設咗 `flex:1; overflow-y:auto` 但清單全部縮到 ~20px 一條、唔滾動。原因：flex column 容器嘅子項預設 `flex-shrink:1`，空間唔夠時瀏覽器寧願壓扁子項都唔溢出。修：`#topic-list > * { flex: none; }`。

- 任何 `flex column + overflow-y:auto` 嘅滾動清單，子項必須 `flex: none`（或 `flex-shrink: 0`），否則 overflow 形同虛設。
- 驗證方法：check `scrollHeight > clientHeight` 先算真滾動；單睇 CSS 有 `overflow-y: auto` 唔代表滾到。

## Rule 43 — display-window overlay 定位要對齊 .pd-screen2（計埋佢嘅 margin:6px）

Incident (2026-11-04)：Leaderboard／Battle Menu／Friends overlay 上下各凸出 6px（頂蓋住 status bar、底蓋住下巴紅邊）。原因：`--frame-screen-top/bottom` 算式冇計 `.pd-screen2` 嘅 `margin: 6px`。修：兩個算式各加 6px。

- 改紅框結構（deco／status bar／chin／pd-screen2 margin）時，必須同步更新 `--frame-screen-top/bottom` 算式，並用 `getBoundingClientRect` 對比 `.pd-screen2` 同 overlay 四邊（差值要係 0）。

## Rule 44 — 刪結算頁按鈕前必查 Gym conclude 依賴

Incident (2026-11-04)：刪結算頁「Back to Home」掣時發現 Gym 模式嘅 badge 判定（`Gym.conclude`）掛喺 `btn-settle-home` onclick，靠 `_gymSettleData` 觸發。刪掣前要將呢段邏輯搬去唯一剩低嘅出口（下巴精靈球 `btn-pd-home`），否則 gym badge 永遠唔會判。

- 結算頁而家唯一出口係下巴精靈球；任何「結算後先做」嘅邏輯（gym conclude、之後新增嘅模式）都要掛喺 `btn-pd-home` handler 開頭。

## Rule 45 — 將全頁 view 收入 display window：height:auto + 內部 fixed 轉 absolute

Incident (2026-11-04)：答題／捕捉／對戰由全頁 view 改成 display-window overlay 後，`#view-capture` 自帶 `height:100dvh`、`.battle-party` 自帶 `position:fixed; inset:0`，會撐出白螢幕區並蓋住紅框。

- 新 view 加入 display-window selector 群組時，必定同時覆寫 `height:auto`（原本有 `100dvh` 的話），並將內部 `position:fixed` 圖層改 `position:absolute; inset:0`（父 overlay 已係 fixed/relative）。
- 呢三類玩法（答題／捕捉／對戰）要 call `App._setFrameLock(true)`，用 `disabled` + `pointer-events:none` 鎖住紅框 4 個 stat 同下巴 `btn-pd-home`；離開呢三個 view 記得解鎖。
- 驗證：用 `getBoundingClientRect` 對比 overlay 同 `.pd-screen2` 四邊（差值 0）；模擬器要試 440×956 同 375×667 兩個尺寸。
- **唔可以 fade-out 呢類 overlay**：佢哋後面就係仍然 active 嘅主頁 shell，任何 `opacity` transition／`is-fading` 都會喺切頁時露出主頁（用戶見到「主頁閃一下」）。要麼即時切換，要麼先鋪一層不透明黑幕再淡出。新 overlay 亦要 `animation: none`，避免 fade-in 期間見到主頁。

## Rule 46 — 全域 popup（modal／toast）要貼 display window 頂部，z-index 要高過 view overlay

Incident (2026-11-04)：toast 原本 `bottom:30px`，正正疊住下巴 Home 鍵；modal 置中又會被 quiz／捕捉／對戰 overlay（z-index 120）蓋住，因為 `.modal-backdrop` 舊 z-index 只有 50。

- `.modal-backdrop`：`align-items:flex-start`、`padding-top: calc(var(--frame-screen-top) + 14px)`、`z-index: 1400`，`.modal-card` 用 `max-height: calc(100dvh - --frame-screen-top - --frame-screen-bottom - 28px)` 確保唔會落到 Home 鍵。
- `.toast`：`top: calc(var(--frame-screen-top) + 12px)`、`bottom:auto`、`z-index: 3000`（v1.45.3 起，要高過晒所有 app 內 modal 先睇得清）。
- 新增任何 body 級 popup 時，z-index 必須大過 120（display-window view overlay），否則喺答題／捕捉／對戰入面會完全睇唔到。
- **Z-order 全景（2026-11-04 定案）：** toast(3000) > inferno-unlock(2300) / tier-select(2200) / pvp-match(2100) / team-select(2000) > display-window overlays(120) > bezel/chin(100)；entry-gate(9000) / update-modal / qd-fly(9999) 蓋過一切係刻意嘅。
- **教訓（v1.45.3 Battle「Confirm 冇反應」）：** toast 曾卡喺 1500，被 team-select-modal(2000) 完全蓋住 —— 揀隊數量唔夠撳 Confirm 時「Pick exactly N Pokémon」有彈但用戶完全睇唔到，等於冇反應。新增任何 fixed modal（z-index 已 >1500）時，必須同時檢查**所有** toast / 全域 popup 嘅 z-index 仲高唔高過佢；「撳掣冇反應」類報告，要先查「回饋係咪彈咗但被蓋住」先好查 handler。

## Rule 47 — position:fixed overlays 必須：bezel/chin z-index 高過佢哋；exit 動畫跟 Settings sheet 一樣

Incident (2026-11-04)：新增 display-window overlays（Friends / Leaderboard / Battle Menu）後出現連串 z-index 同 binder 邏輯 bug：

**Bug 1 — bezel/chin 被攔截點擊**
- Friends/Leaderboard/Battle Menu 用 `position:fixed` 疊喺 `position:relative` 嘅 `.pd-bezel` 同 `.pd-chin` 上面（fixed stacking context 更高）→ 用戶撳頂部 Pokedex/Streak/Settings 按鈕冇反應。
- **必做：** 紅框兩個固定欄位必須有 `z-index: 100`：`.pd-bezel { position: relative; z-index: 100; }` 同 `.pd-chin { position: relative; z-index: 100; }`。
- 所有 position:fixed 嘅 view overlay（包括之後新增嘅）都設 `z-index: 120`，確保高過 bezel/chin（bezel/chin 要可撳 → overlay 之間 sheet 要蓋住 overlay → sheet z-index 再高）。
- Stacking 次序：bezel/chin (100) < display-window overlays (120) < sheets (z-index: 121+)。

**Bug 2 — binder/dockBinder 只檢查 sheet，冇檢查 fixed overlay**
- 開住 Friends view → curSheet = null → binder 走 `else → openFn()` → sheet 被開出嚟但顯示喺 Friends 後面（Friends 係 fixed，sheet 係 absolute）→ 用戶以為冇反應。
- **必做：** `binder` 同 `dockBinder` 加前置檢查 `#view-friends.active, #view-leaderboard.active, #view-battle-menu.active`；有 fixed overlay active 時先 `showView("view-home")` 再 open。

**Bug 3 — token self-cancel（同 Rule 51 詳細規格）**
- binder 入面 `token = bump → showView("view-home") → showView 內部又 bump → token mismatch → timer cancel → openFn() 冇 run`。

**Bug 4 — exit 動畫唔跟 Settings sheet 方向（搞反上/下）**
- 初次加嘅 exit 動畫係 `translateY(18px) + opacity fade`，之後又搞反方向寫咗 `translateY(-100%)`（向上），但 Settings sheet 係 bottom anchored（`.ph-sheet-up`），close 時係 `translateY(100%)` 向下捲出。
- **必做：** 所有 display-window overlay 必須有 `border: 2.5px solid #1b1b22; border-radius: 14px;`（同 `.ph-sheet` 一樣嘅黑邊框 + 圓角），否則會「唔係 exactly in display window」。
- **必做：** 所有 display-window overlay 嘅 exit 動畫必須用 **scaleY(0) + transform-origin: bottom center**，唔好用 translateY：
  ```css
  transform-origin: bottom center;
  transition: transform .4s cubic-bezier(.25,1,.5,1);
  .fixed-overlay-exit { transform: translateX(-50%) scaleY(0); pointer-events: none; }
  ```
  - **唔好用 translateY**：因為呢三個 view 係 `position:fixed`（viewport 級），translateY 會令元素移動到 display window 外嘅區域（dockbar / chin area），穿過紅框邊界
  - scaleY(0) 唔改變元素位置，只係由底部向上壓縮內容，永遠留喺 display window 範圍內
  - transform-origin: bottom center 確保由底部向上壓（同 Settings sheet close 視覺一致）
- **注意：** translate 方向唔好憑直覺寫，先確認對齊嘅 sheet 係 top anchored（`.ph-sheet-down`，close = `-100%` 向上捲）定 bottom anchored（`.ph-sheet-up`，close = `+100%` 向下捲）。
- `showView("view-home")` 時如果目前有 fixed overlay active，要先加 `fixed-overlay-exit` class → 延遲 400ms → 切 active（先播動畫，再換頁）。

**Bug 5 — closure 內部 `_sheetSwitching` 變數引用**
- 改 binder 嘅 `let _sheetSwitching` closure var → `App._sheetSwitching` 時漏咗 `dockBinder`（另一個 closure），dockbar 全部 function 即刻 ReferenceError 壞掉。
- **必做：** 改 closure-level 變數名稱時，grep 全部 closure 引用位置（`let _xxx;` 出現咗幾多個 closure 就改幾多個）；或者一開始就掛 App object 上（`App._sheetSwitching`），唔用 closure var。

## Rule 48 — Email sign up / sign in 後必須觸發 Learning Curve Mode 設定

Incident (2026-11-04)：新增 Email/Password auth 後，新用戶 sign up / Google 首次登入都冇設定 Learning Curve Mode。

- 新帳戶（`migrateAnonymous` 回 `true`）sign up / sign in 後，走 import 流程之後必須彈出 `_showCurveSetupForm()` 讓用戶揀 Junior/Standard/Teen/Adult。
- Curve mode 寫入：`setCurveMode(mode)` + `saveState()` + `Sync.pushState()`（pushState 會 patch `user_account.curve_mode`）。
- `_needsCurveSetup` flag 存喺 `loadState()` 回傳 object，`_postLogin` 完畢後檢查 → `setTimeout(() => _showCurveSetupForm(), 800)`（等 toast 顯示完）。
- signOut / 關閉 OAuth 合併流程後要重置 `_needsCurveSetup = false` + saveState。

## Rule 49 — Duolingo 風格按鈕動畫：pressed 彈出 + hover lift + vibration

Incident (2026-11-04)：用戶要求所有按鈕加 Duolingo 風格互動。

**CSS 規格：**
```css
.btn-big:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,.15); }
.btn-big:active { transform: scale(.92); box-shadow: 0 1px 2px rgba(0,0,0,.2); transition-duration: 60ms; }
@keyframes btn-pop { 0%{scale(.92);} 50%{scale(1.04);} 100%{scale(1);} }
.btn-big.pressed { animation: btn-pop 280ms cubic-bezier(.25,1,.5,1); }
@media (prefers-reduced-motion: reduce) { .pressed { animation: none; } }
```

**JS 委派：** 現有 document click SFX 委派入面加 `.pressed` class + `navigator.vibrate(12)`。用 `void btn.offsetWidth` 強制 reflow 防抖動。覆蓋範圍：`.btn-big, .btn-google, .pd-menu-btn, .icon-btn, .btn-nav, .chip-btn, .icon-link`。

## Rule 50 — Supabase Auth：Email provider + Manual Linking + Automatic Linking

Incident (2026-11-04)：由純 Google OAuth 變成 Email/Password +（未整 Apple）。新增三個 auth flow + 兩個 Supabase Dashboard 設定：

**Dashboard 必設（代碼無法替代）：**
1. Email Provider → Enable，**關閉 Confirm Email**（暫時）—— sign up 即拿 session
2. Authentication → Settings → Security → Enable **Manual Linking**（Email 帳戶可以連 Google identity）

**Auth Functions 規格（`js/supabase-auth.js`）：**
| Function | GoTrue Endpoint | Purpose |
|----------|-----------------|---------|
| `signUpWithEmail(email, password)` | `POST /auth/v1/signup` | 註冊 |
| `signInWithEmail(email, password)` | `POST /auth/v1/token?grant_type=password` | 登入 |
| `sendPasswordReset(email)` | `POST /auth/v1/recover` | 忘記密碼 |
| `linkGoogle()` | `/auth/v1/user/identities/authorize?provider=google`（需 Bearer token） | 已登入狀態下連接 provider |
| `getIdentities()` | `GET /auth/v1/user`（回 `identities[]`） | 顯示已連接 identities |

**Automatic Linking：** 同一 email 嘅 identities（Email + Google）Supabase 會自動 link 到同一個 `auth.users.id`。關閉 Confirm Email 令呢個行為更可靠。

## Rule 51 — Login Gate：未登入必須彈，sign out / OAuth cancel 後要自動再彈

Incident (2026-11-04)：新增強制登入邏輯後發現三個場景漏咗彈 Login Gate：

1. App 啟動時已冇 session → 要彈 Login Gate（isGate=true）
2. Sign out 後 → 500ms 後自動彈（等 toast 顯示完）
3. OAuth sign in cancel（user 拒絕合併 prompt 後 signOut）→ 同樣要彈

**實作規格：**
- `openLoginHub(isGate = false)`：`isGate = true` 時 Modal click outside 唔關閉，顯示 4 個入口（Continue with Google / Create Account / Sign In with Email + Password）。
- `Account Hub`（已登入）顯示 trainer name + identities list + Link 未連接 provider + Sign Out。
- **唔需要處理本地匿名用戶進度遺失**（product decision）。

## Rule 52 — binder / dockBinder token cancel pattern：先 showView，再 bump 自己 token

Incident (2026-11-04, 同 Rule 47 Bug 3)：binder 入面同時做 `showView("view-home")` 同 `setTimeout(openFn, 410)` 會引發 token self-cancel。

**標準 pattern（binder 同 dockBinder 都要用）：**
```js
if (hasFixedOverlay || curSheet) {
  if (hasFixedOverlay) this.showView("view-home");  // ← 先 call（佢會 bump _sheetSwitchToken）
  const token = (App._sheetSwitchToken = (App._sheetSwitchToken || 0) + 1);  // ← 再 bump
  App._sheetSwitching = true;
  this._closeAllSheets();
  setTimeout(() => {
    if (App._sheetSwitchToken !== token) return;  // 外部切 view bump 咗 → cancel
    App._sheetSwitching = false;
    openFn();
  }, 410);
}
```

**改 closure var 時必須同時改兩個 closure**（`binder` = 頂部 bezel，`dockBinder` = 底部 dockbar），佢哋係獨立 closure，漏改一個就 ReferenceError 全壞。

## Rule 53 — 由結算／display-window overlay 開 home sheet：唔可以用 `view-home.active` 做判斷

Incident (2026-11-04，用戶話「成日見到」)：捕捉結算頁撳 Lucky Draw 冇反應，唔會去精靈球捲出嚟嗰頁。

- **Root cause：** 結算頁等 display-window overlay 會刻意保持 `#view-home` active（紅框要留喺後面）。`openGachaSheet()` 舊 code 係 `if (!view-home.active) showView("view-home")` → active 已 true，跳過切頁 → gacha sheet 開喺結算 overlay（z-index 120）後面，用戶完全睇唔到。
- **必做：** `App._openSheet(id)` 已加 universal guard：`view-home.active` 但仲有 `.view.active:not(#view-home)` → 先 `showView("view-home")` 再開 sheet。任何新 `open*Sheet()` 都唔好再自己寫 `active` guard，直接 `showView("view-home")` 再 `_openSheet`（或交畀 `_openSheet` guard）。
- **測試路徑：** `App.showView("view-settlement")` → click `#btn-pull-rare` → 斷言 `#view-settlement` 唔再 active、`#sheet-gacha` visible；同樣試 Streak／Dex／Energy sheet 由結算頁開。
- 呢個 bug class 會影響所有「overlay 保持 home active」嘅頁：結算、選題（quiz-setup）、Battle Menu、Friends、Leaderboard。新增 page 時要當 `_openSheet` 係唯一入口。

## Rule 54 — 新增可寫 column 必須同一份 migration 加 column-level grant

Incident (2026-11-04)：Settings 改 Learning Curve Mode 後關 app 再開變返舊值。根因：`user_account.curve_mode` column 早已存在（migration 20261030），但 `authenticated` role 嘅 UPDATE 係 column-level grant，淨係開咗 trainer_name / name_customized / items_* / updated_at 等 8 欄，**冇 `curve_mode`** → `Sync.pushState()` 嘅 PATCH 被 PostgREST 拒絕（permission denied），落入 fallback（只推 trainer_name）「靜靜雞成功」→ DB 永遠係舊值 → 下次開 app `Sync.pull()` 用 DB 舊值覆蓋 local。

- **加任何 client 會直寫嘅新 column 時，同一份 migration 必須加：** `grant update (<col>) on public.user_account to authenticated;`（其他表同理）。
- **驗證（唔好信 client 測試）：** 用 SQL 查 `information_schema.role_column_grants where table_name='<t>' and privilege_type='UPDATE' and grantee='authenticated'`，確認新欄喺入面。
- **診斷呢類「改咗但重開變返」嘅投訴：** 先查 grant，再查 client catch 係咪有 silent fallback 扮成功（sync.js 嘅 legacy-schema fallback 會吞咗 permission error）。
- 已修：migration `grant_authenticated_update_curve_mode` + 補返落 `supabase-migrate-20261030-curve-mode.sql`。

## Rule 55 — 每個 auth 入口頁都要有 Google 選項；唔可以只喺 Login Hub 提供

Incident (2026-11-04)：Login Hub 有 `Continue with Google`，但 `_showSignInForm()` 只有 Email/Password 表單。第一次玩嘅用戶想「登入」直覺會撳 Sign In，入到去完全搵唔到 Google，要退出再返 Hub 先見到 —— 提問者一開始只睇 Hub 一頁就斷定「文字冇問題」，係被用戶指出盲點（第一手用戶心智 ≠ 設計者視角）。

- 任何「可以開始使用」嘅 auth 頁（Login Hub、Sign In、Sign Up、Account Hub）都必須列出所有 available providers，唔可以假設用戶會行到特定一頁。
- 覆核方法：逐頁問「新用戶入到呢頁，佢想用嘅 provider 喺唔喺度？」而唔係只看主入口。
- Sign In 頁現已加 `#si-google`（`btn-google` + `or Email` divider，同 Hub 一樣 layout）；新加 auth 頁要照抄同一結構，`signInWithGoogle()` 對新帳戶會自動建帳（`migrateAnonymous` 回 true → 觸發 Curve 設定，見 Rule 48）。
- 文案維持業界標準 `Continue with Google`（Google/GitHub/X 皆用此寫法），唔好改成長句或雙行；可發現性問題用「每個入口都提供」解決，唔係改按鈕文字。
- 驗證：`node tools/preview-iphone.mjs --headless --click "#btn-entry-yes" --js "doc.querySelector('#lh-signin').click()" --shot out.png`，確認 Sign In 頁見到 Google 掣 + 表單冇被裁切。

## Rule 56 — 換進度條星星做動畫跑手：sprite sheet 化 + `flex: none` + 光暈 + 邊界淨空

Incident (2026-11-04 Quiz progress mascot)：用戶提供 500×354 / 4 幀 / 80ms 嘅 GIF，要求換掉答題頁進度條嘅 ★。

- **唔好直接放大 GIF**：畫布四邊大量透明位、1-bit alpha 邊緣粗糙、`prefers-reduced-motion` 停唔到動畫。做法：Pillow 逐幀 `convert("RGBA")` → 用**全部幀 union bbox** 一次裁切（保留幀間彈跳位移，唔好逐幀自己裁，否則跑動會抖）→ LANCZOS 縮到 3×（實測 132×90/幀）→ 橫向拼成 528×90 PNG（32 KB），CSS `background-size: 176px 30px` + `steps(4)` 播 0.32s，配 `@media (prefers-reduced-motion: reduce) { animation: none }`。
- **flex column 內嘅進度條一定要 `flex: none`**：實測 `#view-quiz` `scrollHeight 721 > clientHeight 710` 時，14px 高嘅 `.progressbar` 被 flex-shrink 壓成 **0px**（整條進度條消失、跑手浮喺半空）。同 Rule 42 同一類問題，但唔限於「滾動清單」——任何有明確高度、又想永遠睇得見嘅 flex 子項都要 `flex: none`。
- 黃色跑手疊黃色進度條：`filter: drop-shadow(0 0 1.5px #fffdf7) drop-shadow(0 2px 2px rgba(0,0,0,.35))`，否則下半身同 `var(--yellow)` 融合。
- 邊界淨空：跑手 44×30、半寬 22px；`.progressbar` 用 `margin: 0 14px`（14 + view padding 12 = 26 ≥ 22）。實測 440×956 同 375×667，0% / 100% 都仍有 3.5px 淨空，冇被 display window 裁邊。
- 換走文字 glyph：跑手要 `aria-hidden="true"`；新 asset 要入 `sw.js ASSETS`，並且按 Rule 12 更新免責聲明／版權。
- 驗收：連續採樣 `getComputedStyle(runner).backgroundPosition` 要見到 `0 → -44 → -88 → -132` 循環（證明四幀真係播）；位置用 `getBoundingClientRect` 對 `#view-quiz` 內邊，唔好只靠肉眼睇截圖。

Skill: Rule 56 added

## Rule 57 — 10 連抽：`chain_rarity` 有 normal、保底查詢要排除；MCP 唔可以偽造 `auth.uid()`

Incident (2026-11-04 Lucky Draw 10×)：寫 `gacha_pull_lucky` 保底時，fallback「任何未持有的 rare/epic/legend」漏咗 filter，用 `pg_temp` 冒煙測試抽到 `{rarity:"normal", chain:"paras"}`；client `GACHA_BALL['normal']` 唔存在，會喺演出層 crash。

- `chain_rarity` 有 **normal / rare / epic / legend** 四種；`GACHA_BALL` 只識 rare/epic/legend。任何「保底／派球」查詢必須 `and cr.rarity in ('rare','epic','legend')`。
- 冒煙測試用 `pg_temp.test_x(p_uid)` 包 transaction，最後 `rollback`；**唔好用** `set local role authenticated` + `set_config('request.jwt.claims', ...)` 偽造 `auth.uid()`，MCP 執行環境唔生效（會回 `not authenticated`）。
- 10 連經濟：9 次 `gacha_pull` + 第 10 次 `gacha_pull_lucky`，順序 await；`pendingExp` 只傳第一抽；任何一次 RPC 回 null → 唔本地假派（Rule 5 / v140），已落地嘅抽數保留。
- 本地 fallback 的保底 `_pickLuckyChainLocal` 同樣只揀 epic/legend，並排除已持有 chain。

## Rule 58 — `_prompt()` 用 textContent：唔可以傳含 SVG 嘅字串

Incident (2026-11-04)：10 連「寶石不足」提示原本寫 `_prompt(\`Need ${GACHA_GEM_SVG} ×30\`)`，但 `_prompt` 係 `el.textContent = text`（Rule 29 同類陷阱），會將整段 `<svg …>` 原碼顯示出嚟。

- `_prompt()` 只放純文字；需要 gem icon 嘅位置（成本 chip、按鈕）用 `innerHTML` 自己砌。
- 新增任何「文字 + icon」提示前，先確認該容器係 textContent 定 innerHTML。

## Rule 59 — preview 工具卡死：先 kill 殘留 CDP Chrome，再換 `--port`

Incident (2026-11-04)：連續跑 `tools/preview-iphone.mjs --headless` 時，舊 Chrome 仍佔住 9230，新 run 連到舊 page 後卡死（120s timeout），但截圖其實已寫出。

- 每次 run 用遞增 `--port`（9230/9231/…）；run 前 `Get-NetTCPConnection -LocalPort <port>`，有 OwningProcess 就 `Stop-Process -Id <pid> -Force`。
- 工具完成後 Chrome 有時唔退出：截圖檔存在就代表 JS 已跑完，可以 kill 該 pid 收工。

## Rule 60 — 掛喺 body 嘅 overlay 必須 `stopPropagation`，否則 sheet 外部點擊 handler 會誤關

Incident (2026-11-04)：`#gacha-multi` 係 `document.body.appendChild` 嘅 fixed overlay。點 10 連結果卡想睇詳情時，click 冒泡到 `document`，命中 `#sheet-gacha` 嘅「點外面關閉」handler → `Gacha.abort()` → `_resetStage()` 收埋 overlay，畫面直接彈返 home。Debug 見到 AFTER: `phase:"idle"`, `sheetOpen:false`。

- 任何掛 body 嘅 overlay／modal root，建立時即加：
  `["pointerdown","pointerup","click","touchstart"].forEach(t => el.addEventListener(t, e => e.stopPropagation()))`
- 內部按鈕（開啟詳情／撳卡）嘅 listener 要綁喺子元素，先執行再被 root 截停冒泡。
- 驗收時必須真正 `cell.click()` 一次並截圖，唔好只驗「overlay 出到」。單靠 DOM 存在唔會發現呢類關閉 bug。

## Rule 61 — 戰鬥 EXP：battle pokemon 必須帶 `uid`，分配只計「存活 + participated」；Level Sync 只降唔升

Incident (2026-11-04)：結算畫面顯示「獲得 EXP」但實際冇加。根因係 `Battle.makeBattlePokemon` 回傳物件冇 `uid`，`grantKOExp` 記落 `pendingExp` 嘅 uid 全部係 `undefined`，`applyRewards` 用 `gainByUid[e.uid]` 查唔到 → gain 永遠 0。

- `makeBattlePokemon` 回傳必須包含 `uid: entry.uid`（同 `expLevel`）。
- `grantKOExp` 收 EXP 名單用 `team.filter(p => p.participated && p.hp > 0)`；fainted 唔派 EXP（Gen 5 規則）。
- Inferno Level Sync 用 `Math.min(e.level, levelSyncLevel)` **只降唔升**：本身低過 sync 值嘅寵唔應該被升。
- 以弱勝強加成用 `expLevel`（sync 前真實等級），唔好用 `level`，否則被壓低等級嘅寵會被誤加乘。
- 改 EXP 相關流程後，跑 `node tools/_test_battle.js`（應 97 PASS）。



## Rule 62 — 喺 Browser pane 跑會改 state 嘅 JS 之前，一定要 assert `location.host` 係 localhost

Incident (2026-11-05)：用 `obtainPokemon()` + 改 `pet.health`／`exp` 喺本地預覽造測試資料，但用戶之前已經將同一個 preview tab 導航去正式站 `marcott402.github.io`。Script 直接寫咗用戶真存檔（加咗隻 Bulbasaur、改咗拍檔飽肚值同 EXP）。好彩未同步上雲，靠 Supabase `user_entries` 對返原值手動還原。

- 任何會寫 localStorage／`saveState()`／打 RPC 嘅 debug script，第一行：
  `if (location.host !== "localhost:8080") throw new Error("ABORT: not localhost " + location.href);`
- Tab Context 顯示嘅 URL 唔係 localhost（或者見到「user clicked … since an earlier tool call」提示）→ 先 `navigate` 返 localhost 再做。
- 純讀（screenshot、`get_page_text`、讀 state）先可以喺正式站做。
- 真係誤改咗：即刻停手，用 Supabase 雲端資料對返原值還原，並如實話畀用戶知。

## Rule 63 — 一件道具有「育成效果」同「戰鬥效果」兩套：使用路徑一定要按場景分支，兩邊都要測

Incident (2026-11-05，背包 prototype)：樹果育成 = 加飽肚值，戰鬥 = 原作效果（Oran +10 HP、Sitrus +25%、Pecha／Cheri／Lum 解狀態）。`applyTo()` 只寫咗育成分支，戰鬥中餵樹果只加飽肚值、冇回血，用戶先發現。同輪複查再搵到：Antidote 只解 `psn` 唔解 `tox`；換招 overlay 開住時撳左欄另一隻，overlay 仲顯示舊嗰隻；EV Undo stack 冇按 Pokémon 分，換隻後 Undo 會扣錯隻。

- 道具定義要同時有育成欄位（`care`／`food`）同戰鬥欄位（`bHeal`／`bHealPct`／`bCure`），使用函數用 `S.battle`（正式版：戰鬥 state）分支，唔可以共用一條。
- 解狀態用陣列（`cure: ["psn","tox"]`），唔好單一字串比較。
- 戰鬥中「冇效果」（滿血又冇對應狀態）跟原作：提示 "It won't have any effect." 而且唔扣數；育成藥物照狀態 spec（滿血照扣、計過量）。
- 蓋喺主畫面上面嘅 overlay（換招頁等）要跟住「當前選中」：`select()` 入面同步更新或者關閉 overlay。
- 任何 Undo stack 換選中對象時要清空（或者每條記錄帶 uid）。
- 改完背包流程，喺 `tools/prototype-bag.html` 用 console 跑一次三個 mode（Normal／In-battle bag／In-battle switch）嘅端到端檢查，`errs` 要係空。

## Rule 64 — 同時跑幾個 setInterval／setTimeout 動畫：每個用自己嘅 local handle，唔好共用一個變數

Incident (2026-11-05，背包 prototype 戰鬥文字框)：自己畫面同對手畫面兩個框同時打字，共用一個 `typing` 變數存 interval。第一個框打完 `clearInterval(typing)` 清咗第二個框嘅 timer → 對手框得半句、`Promise.all` 永遠唔 resolve，撳極都唔去下一句。

- 每個動畫用 `const t = setInterval(...)` 自己清自己；「仲有冇動畫跑緊」用計數器（`typing++`／`typing--`）。
- 用 `Promise.all` 等幾個動畫時，要測「一長一短」兩段文字，短嗰個先完都唔可以影響長嗰個。

## Rule 65 — 喺有 Rule 60 stopPropagation 嘅 overlay 入面做拖放：pointermove／pointerup 要掛 window capture

Incident (2026-11-05，背包第 2 段)：`#bag-root` 跟 Rule 60 截停 `pointerdown／pointerup／click` 冒泡。拖放模組將 `pointerup` 掛喺 `document` → 永遠收唔到 → 拎起咗放唔低，隊伍冇變；滑鼠拖捲 chip 列都一樣卡住。

- overlay 入面嘅拖放／拖捲／撳住連加：`window.addEventListener("pointermove"|"pointerup"|"pointercancel", h, true)`（capture 階段，喺 overlay 截停之前已經收到）。
- 唔好掛 `document` bubble；亦唔好為咗拖放拎走 Rule 60 嘅 stopPropagation（會令 sheet 外部點擊 handler 誤關）。
- 驗收一定要用真滑鼠拖（`left_click_drag`）一次，唔好只 call JS 函數。

## Rule 66 — 「共用池」數值存喺個別 row：刪 row 之前要將佢嗰份搬走

Incident (2026-11-05，背包第 3a 段)：EV Point Unit 係共用池（= 全部 entry 嘅 `ev_points` 加總）。送 Pokémon 返大木博士時刪咗佢嘅 row，佢身上未用嘅 3 點跟住消失（池 17 → 15，應該係 18）。

- 任何「加總先係真數」嘅資源（共用 EV 池等），刪除／合併 row 之前，先將嗰 row 嘅份額轉去另一個 row（server RPC 同 client 本地兩邊都要做）。
- 測試要對「池總數」：刪除前總數 − 退還規則 = 刪除後總數，唔好只睇單一 row。

## Rule 67 — 將現有 view 搬入另一個容器（例如橫向紅框）：要清走佢原本嘅定位 CSS

Incident (2026-11-05，背包第 4a 段)：`#view-battle` 搬入橫向紅框 `.bl-screen` 之後，畫面偏咗去右下（top 106px、left 397px、translateX(-50%)）。原因係 display window 版本用 `position/inset/max-width/transform` 將 view 貼落直向白螢幕，搬咗位照樣生效。

- 搬 view 入新容器時，喺新容器 selector 用 `!important` 清走 `position`、`inset／top／left／right／bottom`、`transform`、`max-width／max-height`、負 margin、`100vh` min-height。
- 第一次搬完即刻 `getComputedStyle()` 睇 position／inset／transform，再截圖，唔好淨係睇 DOM 有冇搬到。
- 離開時一定要搬返原位（用 comment placeholder 記住位置），並用 `App.showView` 包一層確保任何出口都會搬返。

## Rule 68 — 戰鬥測試：名唔好寫死、推進文字要撳 `.battle-bottom`、回合完 = 選單打開

Incident (2026-11-05，背包第 4b 段)：(1) node 測試用 `chainKey: "bulbasaur", level: 30`（冇 `stage`）建隊，出嚟係 Venusaur，regex 寫死「Bulbasaur ate its…」全部 FAIL（引擎其實啱）。**更正（第 4c 段）**：物種由 `entryCurrentSpecies` 按 `stage` 決定，唔係等級；冇 `stage`（undefined）會跌落「最後一段」fallback。(2) 瀏覽器自動推進戰鬥文字撳 `#battle-text` 冇反應（`waitTap` 聽 `.battle-bottom`），又等「What will…」先出招，但回合完 `showMainMenu()` 唔會 narrate → loop 以為卡死。

- node 測試：用 `chainKey` 建隊一定要寫 `stage`（1 = 第一段），想要邊隻就寫邊段；名由 `team[i].name` 讀，或者 regex 唔包名。
- 瀏覽器推進對白：`document.querySelector('.battle-bottom').click()`（programmatic click 冇座標，唔會誤撳 RUN）。
- 判斷「輪到我」：`.battle-bottom.menu-open` + `#battle-action-menu` 顯示，唔好靠文字。
- 1v1 對手（Youngster 等）隊伍只得 1 隻：測換 Pokémon／後備觸發要揀多隻隊伍嘅對手或者用 node 測試。

## Rule 69 — 由外部 API 抽遊戲資料：唔好靠單一關聯欄位；列出 skip 清單逐條核對

Incident (2026-11-05，背包第 4c 段)：用 PokéAPI `item.held_by_pokemon`／說明文字配 Mega 石 → Mega 形態，Legends Z-A 新 Mega 石（Raichunite X、Feraligite 等 24 粒）呢兩樣都冇，全部被 skip，一開始只得 46 粒；另外有形態 `abilities` 係空 array，script 直接 crash。

- 由「目標實體」反推（例如 `/pokemon?limit=…` 搵晒 `*-mega*` 形態），再用名稱規則配對（同後綴 + 最長共同前綴，平手就 skip），唔好只信一個關聯欄位。
- script 一定 print 每條 skip 同原因，完成後逐條睇：係真係唔應該有（例如 Rayquaza 冇 Mega 石），定係配對漏咗。
- 每個欄位都要預咗會空（空 array／null）：有 fallback 就標記（例如 `abilityGuess: true`），冇就 skip 並 print。
- 新加嘅 overlay 掣（例如 FIGHT 頁 MEGA）要用最長嘅文字截圖睇有冇壓住隔籬內容，有就預留 padding。

## Rule 70 — 手砌 staged blob（HEAD + 我嘅改動）：行尾要跟 repo blob（LF），唔好由工作檔抄 CRLF

Incident (2026-11-05，背包第 4c 段)：同另一個 session 共用 `js/app.js`，我用 `git show HEAD:` 攞 repo 版本（LF），再由工作檔（`core.autocrlf=true` → CRLF）抽 7 行插入，commit 咗個 CRLF／LF 混合 blob。之後 `git pull --rebase --autostash` 還原 stash 時成個檔衝突（7000+ 行），工作樹 diff 亦變成全檔改動。

- 由工作檔抽出嚟嘅片段，插入 repo blob 前一律 `replace("
", "
")`；repo blob 本身用 `git cat-file -p HEAD:<file>` 量 `
` 數，應該係 0。
- commit 前檢查：`git diff --cached --name-only` 每個檔 `git cat-file -p :<file>` 數 CRLF，0 < CRLF < LF = 混合，唔准 commit。
- autostash 還原衝突：唔好 `git reset --hard`。stash 會保留；將 ours（stash）／base（stash^1）／theirs（HEAD）三份統一 LF 再 `git merge-file`，寫返工作檔，`git reset -q` 取消 staging，再對 stash 做 `git diff --ignore-cr-at-eol` 確認淨係版本號唔同先 `git stash drop`。
