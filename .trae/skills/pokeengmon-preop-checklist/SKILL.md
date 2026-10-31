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

## Rule 16 — Audio volume prefs are a separate localStorage key (v145)

Player Music / SFX sliders live in `pokeengmon_audio_v1` (`loadAudioPrefs` / `saveAudioPrefs` in `js/storage.js`). Do NOT fold them into `pokeengmon_state_v1` or clear them in `clearGameProgress` / `resetState`. CaptureAudio routes BGM through `bgmBus` and SFX through `sfxBus` (`setBgmScale` / `setSfxScale`); designed base gains (town 0.1, battle 0.15) stay hardcoded — the slider is a 0–1 multiplier only.

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
