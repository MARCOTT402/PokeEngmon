# Tasks — fix-gacha-no-moves-v113

- [ ] 1. `js/sync.js`: add `await loadPokemonDex();` before entries are mapped through `localEntryFromServer` in `pull()`.
- [ ] 2. `js/storage.js`: in `migrateEntries()`, re-derive moves via `deriveEntryFields(e).moves` for entries with missing/empty moves (guarded by `POKEMON_DEX`).
- [ ] 3. Bump version v112 → v113: `js/app.js` APP_VERSION, `sw.js` CACHE_NAME, `index.html` ?v= params.
- [ ] 4. Verify: pull gacha → Pokédex shows lv1 moves; existing broken entries repaired on reload; capture still has moves.
- [ ] 5. Commit + push to main.
