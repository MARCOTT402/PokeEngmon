# Fix: Gacha lv1 Pokémon show no moves

## Problem
Pokémon obtained from gacha (and any synced entry) display **"No moves yet"** even at level 1, despite every species having level-1 moves in `data/pokemon-151.json`.

## Root cause (data-contract break)
Moves are a **derived field** computed by `deriveEntryFields()` → `initialMoves(dexId)` → `learnsetOf(dexId)` → `POKEMON_DEX.pokemon[dexId].learnset`.

`Sync.pull()` is invoked **before** `loadPokemonDex()` resolves:
- `app.js:924` — fire-and-forget `Sync.pull()` at the top of `init()`.
- `app.js:978 / 998 / 1004 / 1010` — `Sync.pull()` during the OAuth login flow.
- `loadPokemonDex()` is only awaited at `app.js:1104`, **after** all these call sites.

When `Sync.pull()` runs, `POKEMON_DEX === null`, so:
- `learnsetOf(dexId)` → `[]`
- `initialMoves(dexId)` → `[]`
- `deriveEntryFields()` sets `out.moves = []`

Entries are then `saveState()`-ed with `moves: []`. The safety net `ensureEntryPokemonData()` only refills moves when `!Array.isArray(entry.moves)` — an empty array passes that check, so moves stay `[]` forever. Fresh gacha pulls then also get overwritten by the next `Sync.pull()` cycle.

## Changes

### 1. `js/sync.js` — root-cause fix
In `pull()`, before the `entries.map(localEntryFromServer)` block, add:
```js
await loadPokemonDex();   // ensure POKEMON_DEX ready before deriving moves
```
`loadPokemonDex()` is idempotent (returns cached `POKEMON_DEX` after first load), so this only blocks until the JSON is ready.

### 2. `js/storage.js` — repair existing broken entries
In `migrateEntries()` (which runs **after** `loadPokemonDex()` at `app.js:1105`), re-derive moves for any entry whose moves are missing or empty:
```js
st.entries.forEach(e => {
  if (ensureEntryPokemonData(e)) changed = true;
  if ((!e.moves || e.moves.length === 0) && POKEMON_DEX) {
    e.moves = deriveEntryFields(e).moves;   // full replay (incl. learned moves)
    changed = true;
  }
});
```
`deriveEntryFields(e).moves` correctly includes level-up moves for entries above lv1, unlike `initialMoves()` alone.

### 3. Version bump v112 → v113
- `js/app.js` `APP_VERSION`
- `sw.js` `CACHE_NAME`
- `index.html` `?v=` cache-bust params

## Files touched
- `js/sync.js` (1 line added)
- `js/storage.js` (migrateEntries, ~5 lines)
- `js/app.js`, `sw.js`, `index.html` (version sync)

## Verification
1. Hard-reload the app (bust SW cache).
2. Pull a rare gacha → open Pokédex on the new Pokémon → moves section should list level-1 moves (e.g. Pikachu: thunder-shock, growl, …), not "No moves yet".
3. Pull a dupe of an existing Pokémon → moves still present.
4. Existing entries that previously showed "No moves yet" should now have moves after one reload (migrateEntries repairs them).
5. Capture a wild Pokémon → moves present (unchanged path, sanity check).

## Out of scope
- Server-side move storage (moves stay client-derived, by design).
- Word-image extension probing (separate low-priority item).
