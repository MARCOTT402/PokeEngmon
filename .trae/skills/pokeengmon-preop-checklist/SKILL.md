---
name: pokeengmon-preop-checklist
description: Pre-operation checklist for PokeEngmon. Read this before every edit, version bump, or release in this repo, including the APP_VERSION/sw.js/index.html version sync rule and Supabase sync gotchas.
---

# PokeEngmon Pre-Operation Checklist

Read this file FIRST, before performing any task in this project (code edits, version bumps, releases, file changes). Treat it as a mandatory pre-flight check.

## Rule 1 — Version bump must touch three files together

When bumping the app version, ALWAYS update all three files in the same change, using the SAME version number:

1. `js/app.js` — `const APP_VERSION = "vNN";` (shown in footer and Settings)
2. `sw.js` — `const CACHE_NAME = "pokeengmon-vNN";`
3. `index.html` — every `?v=NN` query param on CSS/JS `<link>` and `<script>` tags

Why (1+2): the browser only installs a new Service Worker when `sw.js` bytes change. Bumping `APP_VERSION` alone means no new SW installs, the old cache keeps serving the old `app.js`, and users still see the old version forever.

Why (3): `index.html`'s `?v=NN` cache-busts each asset. If you bump `app.js`/`sw.js` but forget `index.html`, the browser may still load the old cached JS files.

Never bump one without the others.

PowerShell one-liner (run from repo root):
```powershell
(Get-Content index.html) -replace 'v=OLD', 'v=NEW' | Set-Content index.html; (Get-Content js/app.js) -replace 'APP_VERSION = "vOLD"', 'APP_VERSION = "vNEW"' | Set-Content js/app.js; (Get-Content sw.js) -replace 'pokeengmon-vOLD', 'pokeengmon-vNEW' | Set-Content sw.js
```

## Rule 2 — Supabase upsert requires `Prefer: resolution=merge-duplicates`

Any `POST` to `/rest/v1/<table>?on_conflict=<col>` MUST include the header:
```
Prefer: return=representation,resolution=merge-duplicates
```
Without `resolution=merge-duplicates`, PostgREST treats it as a plain INSERT. If a row with the same PK already exists, you get `409 Conflict: duplicate key value violates unique constraint` — the `on_conflict` param does NOTHING without this header.

The `_api()` helper in `js/sync.js` auto-adds this header when the path contains `on_conflict`. If you write a new fetch call that uses `on_conflict`, route it through `_api()` or add the header manually.

## Rule 3 — `uuid` columns need valid UUIDs

`user_entries.id` and other `uuid`-type columns require a valid UUID v4 string (e.g. `550e8400-e29b-41d4-a716-446655440000`). Do NOT use base36 timestamps (e.g. `lq3k7a9x2b`) — Supabase returns `400 Invalid input`.

`uidGen()` in `js/storage.js` uses `crypto.randomUUID()`. If you introduce a new ID generator, ensure it emits valid UUIDs. Existing entries with non-UUID IDs are auto-migrated in `loadState()`.

## Rule 4 — `chain_key` format: frontend uses chain names, NOT `dex_<id>`

- Frontend `EVOLUTION_CHAINS` keys are species names (e.g. `"bulbasaur"`, `"nidoran"`).
- `SPECIES[dexId].chainKey` maps a Pokédex ID to its chain key.
- The `settle_capture` RPC historically wrote `chain_key = 'dex_' || dex_id`. **Do NOT do this** — it produces entries whose `chain_key` doesn't match any frontend chain, causing render crashes.
- `pull()` in `js/sync.js` converts legacy `dex_<id>` chain keys to proper chain keys via `SPECIES[parseInt(chainKey.slice(4))].chainKey`.
- `settle_capture` should only write to `user_captures` (logging). Let `Sync.pushState()` handle `user_entries`.

## Rule 5 — Always `Sync.pushState()` after state-changing actions

Local state changes that affect diamonds, entries, exp, or level MUST trigger `Sync.pushState()`, otherwise `pull()` on next page load will overwrite them with stale cloud data.

Currently wired to:
- Gacha reveal (`js/gacha.js` `_reveal()`)
- Quiz completion (`js/app.js` `onSetComplete()`)
- Capture success (`js/app.js` `onCaught`)
- New-account migration (`js/app.js` post-OAuth)

If you add a new action that mutates `st.diamonds`, `st.entries`, entry exp/level, etc., add a `Sync.pushState()` call (guarded by `Sync.isEnabled()`).

Diamonds from quiz rewards go through `awardRoundDiamonds` RPC (server-side, anti-cheat). Gacha/capture diamond changes are local → must be pushed.

## Rule 6 — Every change must be committed AND pushed

The live site is deployed from GitHub (github.com/MARCOTT402/PokeEngmon → GitHub Pages). Local edits do NOTHING until they are committed and pushed to `main`.

After finishing ANY change in this repo:

1. `git add` the specific changed files (never `git add -A` blindly)
2. `git commit` with the version prefix, e.g. `v93: ...`
3. `git push`

Note: this shell is Windows PowerShell 5 — `&&` is NOT supported. Chain commands with `;` instead.

If the user reports "the site still shows the old version", check `git status`/`git log` first — most likely the change was never pushed.

## Rule 7 — SM-2 sessions only pull DUE cards

`buildSession` in `js/sm2.js` must only pick cards with `next_review_at <= now` (overdue first, brand-new cards fill the tail randomly). NEVER pad a set with not-yet-due cards — if a topic runs dry, the set is short and the user is told to pick other courses. Do not reintroduce any backfill of not-due cards (v94's 20-hour cooldown approach was superseded by v95's due-only rule).
