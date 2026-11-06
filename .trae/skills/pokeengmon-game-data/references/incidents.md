# PokeEngmon 遊戲資料（寶可夢／進化／本地 state） — 事故紀錄同原文（references）

> 由 `pokeengmon-preop-checklist` 原文搬入（2026-11-06），每條 Rule 原文照錄。主要點喺 `../SKILL.md`。

### Rule 4 — `chain_key` format: frontend uses chain names, NOT `dex_<id>`

- Frontend `EVOLUTION_CHAINS` keys are species names (e.g. `"bulbasaur"`, `"nidoran"`).
- `SPECIES[dexId].chainKey` maps a Pokédex ID to its chain key.
- The `settle_capture` RPC historically wrote `chain_key = 'dex_' || dex_id`. **Do NOT do this** — it produces entries whose `chain_key` doesn't match any frontend chain, causing render crashes.
- `pull()` in `js/sync.js` converts legacy `dex_<id>` chain keys to proper chain keys via `SPECIES[parseInt(chainKey.slice(4))].chainKey`.
- `settle_capture` only writes to `user_captures` (logging). Since v99, `user_entries` changes go through RPCs (`obtain_capture` / `gacha_pull` / `add_entry_exp` / `use_entry_candy` / `alloc_ev`) — direct upsert is blocked by column-level grants.

### Rule 13 — `EVOLUTION_CHAINS` is an array

Lookup with `.find(c => c.key === key)`, NEVER `EVOLUTION_CHAINS[key]` (undefined → leaderboard `?` sprites, v134).

### Rule 15 — Defensive defaults that have bitten us

- `ownedSpecies` may be null → repair / guard before `.includes` / `collectedCount` (v140).
- `RARITY[x]` — there is no `"common"` key; use `RARITY[x] || RARITY.normal` (v141).
- Short quiz sets: EXP uses `round(score/total×10)` against the /10 tier table; diamond offline fallback uses relative thresholds vs `total` (v136/v139).
- Gacha: snapshot `pendingExp` into a local const BEFORE clearing it when calling RPC (v138).

### Rule 16 — Audio volume prefs are a separate localStorage key (v145) + three-channel taxonomy

Player Music / SFX / Voice sliders live in `pokeengmon_audio_v1` (`loadAudioPrefs` / `saveAudioPrefs` in `js/storage.js`). Do NOT fold them into `pokeengmon_state_v1` or clear them in `clearGameProgress` / `resetState`. CaptureAudio routes BGM through `bgmBus`, SFX through `sfxBus`, and word/TTS audio through `wordBus` (`setBgmScale` / `setSfxScale` / `setVoiceScale`); designed base gains (town 0.1, battle 0.15) stay hardcoded — the slider is a 0–1 multiplier only.

Channel rules:
- **Music = every file in `assets/bgm/`** (loops + reward jingles/fanfares). Use `playMusicOnce` for one-shot music, never `playOnce`; a `playOnce` on a bgm asset silently puts it under SFX.
- **SFX = synthesised cues + `assets/battle/sfx/*` + `assets/audio/wrong-answer.mp3`**. Play MP3 SFX via `playOnce` (Web Audio buffer) — never `HTMLAudioElement.volume`, iOS ignores it.
- **Voice = word pronunciation mp3 + speechSynthesis**. Keep it on `wordBus`; `SpeechSynthesisUtterance.volume` must read `_voiceScale` (speechSynthesis cannot use the bus).
- Any secondary AudioContext (e.g. `Pokedex`) MUST adopt `CaptureScene.audio.ctx` and connect its gain to `sfxBus`; a private context bypasses sliders and live changes. Clear decoded caches when the ctx changes.

### Rule 18 — Derived fields (moves / knownMoves / level / stats) depend on POKEMON_DEX — NEVER compute pre-dex

Any field derived from `POKEMON_DEX` (learnsets, growth tables, base stats, types) MUST be computed only after `POKEMON_DEX` is loaded. Computing it pre-dex produces a **degraded non-empty value** (e.g. `knownMoves = moves.slice()` while `learnsetOf()` returns `[]`, or `moves = []`), and the standard repair check (`!Array.isArray(x)`) then skips it forever — the corruption persists across reloads.

Real incident (v113 / move-pool work): `ensureEntryPokemonData` ran before dex load, wrote `knownMoves = moves` (no learnset union). Later `migrateEntries` saw a non-empty pool and skipped repair, so Other Moves stayed empty.

Defenses:
- Guard every dex-dependent backfill with `if (POKEMON_DEX && …)` — don't write the field if dex isn't ready; leave it missing/empty so a later call repairs it.
- `migrateEntries()` in `js/storage.js` is the **single post-dex repair authority** (runs after `await loadPokemonDex()` at `js/app.js` ~L2107). When adding a new dex-derived entry field, add its force-rebuild there (recompute from the canonical source, compare, save only on diff). Do NOT rely on lazy `!Array.isArray` checks alone.
- `Sync.pull()` already `await loadPokemonDex()` before `deriveEntryFields` (`js/sync.js` ~L241); any new server-row → local-entry derivation must do the same.

### Rule 19 — Re-collection after full evolution uses `is_final`; move loadouts are local-only

**Re-collection:** when every entry of an evolution chain is fully evolved (`stage >= chainMaxStage`), the next pull/capture on the same chain opens a **new** entry instead of duping into a finished one. Server RPCs (`gacha_pull`, `obtain_capture`) select the dupe target with `… and is_final = false order by obtained_at asc limit 1`. `is_final` is **client-derived** (server doesn't track `stage`); `deriveEntryFields` sets `out.isFinal = isEntryFullyEvolved(out)`, and `Sync.pull` backfills `is_final=true` to the server for any row where the client says it's final. If you add new fields that affect "fully evolved", update `isEntryFullyEvolved` and `Sync.patchEntry`'s whitelist must include `is_final`.

**Move loadouts:** `entry.moves` = held (≤4), `entry.knownMoves` = the move pool (every move learnable by any owned form at the current level). Player-custom loadouts live in `st.moveLoadouts[uid]` (localStorage only, NOT synced to the cloud — moves aren't a server column). After `pull`/`adoptServerEntry` rebuild `moves` from the pool, `applyMoveLoadout(entry)` restores the player's picks if they're still in the pool. `setEntryMoves` validates against the pool, caps at 4, and writes the loadout — never bypass it.

### Rule 69 — 由外部 API 抽遊戲資料：唔好靠單一關聯欄位；列出 skip 清單逐條核對

Incident (2026-11-05，背包第 4c 段)：用 PokéAPI `item.held_by_pokemon`／說明文字配 Mega 石 → Mega 形態，Legends Z-A 新 Mega 石（Raichunite X、Feraligite 等 24 粒）呢兩樣都冇，全部被 skip，一開始只得 46 粒；另外有形態 `abilities` 係空 array，script 直接 crash。

- 由「目標實體」反推（例如 `/pokemon?limit=…` 搵晒 `*-mega*` 形態），再用名稱規則配對（同後綴 + 最長共同前綴，平手就 skip），唔好只信一個關聯欄位。
- script 一定 print 每條 skip 同原因，完成後逐條睇：係真係唔應該有（例如 Rayquaza 冇 Mega 石），定係配對漏咗。
- 每個欄位都要預咗會空（空 array／null）：有 fallback 就標記（例如 `abilityGuess: true`），冇就 skip 並 print。
- 新加嘅 overlay 掣（例如 FIGHT 頁 MEGA）要用最長嘅文字截圖睇有冇壓住隔籬內容，有就預留 padding。
