# [1.2.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.1.0...v1.2.0) (2026-10-28)


### Features

* view, edit, and delete custom questions ([3e0a212](https://github.com/MARCOTT402/PokeEngmon/commit/3e0a21229a6372a5818f7c92eaf1b521f4894605))

# [1.1.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.0.0...v1.1.0) (2026-10-28)


### Bug Fixes

* do not prefix SemVer onto conventional commit subjects ([4446bdf](https://github.com/MARCOTT402/PokeEngmon/commit/4446bdf1ed6d8d7f3ed87da1de0c98ab315b0853))


### Features

* gym challenge, pokedex back, and in-app custom questions ([714bcae](https://github.com/MARCOTT402/PokeEngmon/commit/714bcae40ac597d58c0db01095434f5f53f94e31))

# 1.0.0 (2026-10-28)


### Bug Fixes

* BGM ducks at 3-tap charge, fades away on impact+absorb; repair scene BGM passthrough (v33) ([1f176a9](https://github.com/MARCOTT402/PokeEngmon/commit/1f176a9f5628dff2e98a078da71d4542d2a079db))
* BGM stops at Poké Ball impact instead of 3rd shake (v32) ([fa24e9e](https://github.com/MARCOTT402/PokeEngmon/commit/fa24e9e8a8384a114a5899d74262d19c236fc2be))
* bokeh aperture tween + EVOLUTION_CHAINS lookup in dev helper ([3977fd4](https://github.com/MARCOTT402/PokeEngmon/commit/3977fd46546073795bf9299c74c669e0aab0568c))
* choose courses topic filter now matches via questionTopicKey — v63 regression ([2f918b7](https://github.com/MARCOTT402/PokeEngmon/commit/2f918b7fce689e50bd1b391e37429c57593f5015))
* constrain capture view to app width (520px centered) on desktop (v45) ([822ce25](https://github.com/MARCOTT402/PokeEngmon/commit/822ce259ec1a04c9eba0304f2f3216a3d7cfe5c3))
* diamonds settlement走SupabaseAuth.awardRoundDiamonds RPC (防金手指) ([b1f03b6](https://github.com/MARCOTT402/PokeEngmon/commit/b1f03b6f2557dd01cb71bf112a513ba34c87669b))
* duck BGM on first tap instead of restarting it (v35) ([64ac845](https://github.com/MARCOTT402/PokeEngmon/commit/64ac8456c9727d3fa1134ff39326c5dc785406dc))
* escape path ball visibility + monAnchor reset + timer cleanup ([a529134](https://github.com/MARCOTT402/PokeEngmon/commit/a52913426a1edeb50aa9df7431c82ee9f0653948))
* EXP goes to current partner; captures no longer auto-switch partner (v53) ([aee9cc9](https://github.com/MARCOTT402/PokeEngmon/commit/aee9cc9bae8ae42ae84a9b4577228c44e7746a3c))
* Google OAuth popup→redirect + hash fragment parsing ([d2c87d3](https://github.com/MARCOTT402/PokeEngmon/commit/d2c87d336a4eb3cb04c078b6829b7f3be0faf9ff))
* harden capture scene against audio failures; clearer skip diagnostics (v34) ([8a68673](https://github.com/MARCOTT402/PokeEngmon/commit/8a6867347c996f3499db5b61fb4aedf988a27967))
* **leaderboard:** _rpcTable returns full array — _rpc was unwrapping to data[0] ([ed18b79](https://github.com/MARCOTT402/PokeEngmon/commit/ed18b794b9638c955170599ec0c73b60e78ae0d2))
* **leaderboard:** filter by exists entry instead of owned_species > 0 (old entries have NULL owned_species) ([553b8c2](https://github.com/MARCOTT402/PokeEngmon/commit/553b8c215666533d394d8fe80fb0e5808670c484))
* **leaderboard:** partner = latest entry instead of active = true, more resilient ([0162071](https://github.com/MARCOTT402/PokeEngmon/commit/01620710f47cceb5dff12f8e4d36fb7cf614ebe9))
* play BGM via Web Audio GainNode for iOS-compatible volume ramps (v41) ([a50f8d9](https://github.com/MARCOTT402/PokeEngmon/commit/a50f8d9f9c74862ad275836abc69cf984632a7fe))
* prime BGM unlock only once, stop audible blip on every quiz submit (v37) ([1a58cb7](https://github.com/MARCOTT402/PokeEngmon/commit/1a58cb799e5bf8900a46c67d9e455a346aa6a468))
* raise first-tap duck to 0.32 so throw fadeout is audible (v40) ([4508259](https://github.com/MARCOTT402/PokeEngmon/commit/450825950230bdecc72d072fb1ede241e42b99e3))
* replace long BGM automation ramp with JS-step fade to unbreak iOS SFX scheduling (v42) ([c05b12b](https://github.com/MARCOTT402/PokeEngmon/commit/c05b12ba650e8942a79adb5b2f63a97bab258b01))
* SM2 buildSession topic filter — use questionTopicKey(q) + Set/Array tolerant ([3b1e543](https://github.com/MARCOTT402/PokeEngmon/commit/3b1e5436f129f0c973930fc264d8aec5096a649b))
* **supabase:** both leaderboard migrations had nonexistent e.created_at column (only obtained_at/updated_at exist) ([877cf0b](https://github.com/MARCOTT402/PokeEngmon/commit/877cf0b33ea98f75c4a6abb10c0d1e0d24db9f81))
* unlock BGM element on quiz submit so WARNING screen has music on mobile (v36) ([c9b0c48](https://github.com/MARCOTT402/PokeEngmon/commit/c9b0c486a0460b2f230811d2ccbfe07e91ef852d))
* use muted flag for BGM unlock to eliminate first-submit audible blip (v38) ([7df5095](https://github.com/MARCOTT402/PokeEngmon/commit/7df5095735ff86d26da397536d84cde9cfb52b9a))
* **v113:** gacha/synced lv1 Pokemon showing no moves ([9eef985](https://github.com/MARCOTT402/PokeEngmon/commit/9eef9859961efc2f8f16fb7a231a9b47e12b7705))
* **v114:** picture-word questions now use the same answer feedback as sentence questions ([a97eb04](https://github.com/MARCOTT402/PokeEngmon/commit/a97eb04e3d1955be6bef3d466bca936328b53fce)), closes [#quiz-feedback](https://github.com/MARCOTT402/PokeEngmon/issues/quiz-feedback) [#quiz-word-status](https://github.com/MARCOTT402/PokeEngmon/issues/quiz-word-status)
* **v116:** harden system-voice TTS fallback for picture words ([d381afe](https://github.com/MARCOTT402/PokeEngmon/commit/d381afec3a303dad8412514b88f1362518603e71))
* **v134:** leaderboard partner sprites — EVOLUTION_CHAINS.find by key + exp/branch derive ([4577aa1](https://github.com/MARCOTT402/PokeEngmon/commit/4577aa1c552ccd0b3bee13c3626b46724b17fcee))
* **v135:** obtain_capture stage1 dex + rename params to fix 42702 ambiguous chain_key ([949d004](https://github.com/MARCOTT402/PokeEngmon/commit/949d004c00e3baa59408a48543f39009c8bfe375))
* **v136:** normalize short-set EXP to /10 scale (perfect N/N = 100% span) ([00f770e](https://github.com/MARCOTT402/PokeEngmon/commit/00f770e5e0c43a6dca74a10259ba6e3124a65148))
* **v137:** leaderboard derive partner level from exp; rank by chain count not collectedCount ([45e1aeb](https://github.com/MARCOTT402/PokeEngmon/commit/45e1aeb73440abca72a3a46dbb4b7c4e8b89ecc0))
* **v138:** gacha fallback snapshot pendingExp before clear so RPC gets real delta ([e75deb2](https://github.com/MARCOTT402/PokeEngmon/commit/e75deb268bbde02c280ca0b3054bde9d9b713f0e))
* **v139:** relative diamond fallback for short sets; escapeHTML on reset modal name ([075aac3](https://github.com/MARCOTT402/PokeEngmon/commit/075aac3928fbe8a066fc09e72f0ad178c20a7f38))
* **v140:** no silent local gacha/diamond on RPC fail; normalize dex_ before gen load; repair null ownedSpecies ([13547b6](https://github.com/MARCOTT402/PokeEngmon/commit/13547b6c241db21e7e2d974f7de99c3c64dad7b1))
* **v141:** RARITY fallback to normal instead of nonexistent common key ([9fb987e](https://github.com/MARCOTT402/PokeEngmon/commit/9fb987ed68b38db1dbfd2d33b6e221fe27d501b4))
* **v142:** picture_words CSV Image paths Q_folder case for GitHub Pages ([6d83b58](https://github.com/MARCOTT402/PokeEngmon/commit/6d83b586463a9433476a8b75cb974ea8dc695b13))
* white screen btn-top-pull null ref + add awardRoundDiamonds RPC ([1af36ed](https://github.com/MARCOTT402/PokeEngmon/commit/1af36ed911b4b61829a7d5ddcba23353a40aefbc))


### Features

* 80% capture success rate + escape path (v26) ([c867c3d](https://github.com/MARCOTT402/PokeEngmon/commit/c867c3d73178b1a963a74ac52bcd745c3099e00a))
* attempt instant BGM on page load, broaden gesture fallback (v51) ([7fe75bf](https://github.com/MARCOTT402/PokeEngmon/commit/7fe75bf3cf1d9bb0c05e01de4cc4fedd5763eafc))
* bottom hub bar on setup/pokedex/calendar; move CSV import to settings (v54) ([9c3bd0b](https://github.com/MARCOTT402/PokeEngmon/commit/9c3bd0b4d8e67a7bd7364508f92924d2ca89a157))
* diamond rewards 10/10=3, 8-9=2, 7=1 (v57) ([b440e85](https://github.com/MARCOTT402/PokeEngmon/commit/b440e85c3df08b5a500c88f2e47a1b4ec4a04a96))
* entry gate modal to unlock audio + start BGM on YES (v52) ([2e273d6](https://github.com/MARCOTT402/PokeEngmon/commit/2e273d6515cd219ec14d9cdf43f71dee1b997db9))
* global Nuvema Town BGM (0.4) + quiz correct/wrong SFX (v50) ([c59241a](https://github.com/MARCOTT402/PokeEngmon/commit/c59241ae5feff45d5ad5b8ce398fc38666825990))
* **leaderboard:** add login gate — anonymous users see Connect with Google prompt ([ab96e96](https://github.com/MARCOTT402/PokeEngmon/commit/ab96e96032c90894ecedc7feefed064523ec1de1))
* **leaderboard:** anon users can view global board + one-time login prompt popup ([0bc3977](https://github.com/MARCOTT402/PokeEngmon/commit/0bc39773b298747a11ef1b699a7f9c51cf79b5a9))
* linear BGM fadeout from throw to 3rd shake (~6.2s) (v39) ([2c4fe22](https://github.com/MARCOTT402/PokeEngmon/commit/2c4fe2258ea764d6eccd1c64e8558742ddd9ab11))
* Login Hub (Poké Ball style) + Supabase Auth integration ([1a4e52d](https://github.com/MARCOTT402/PokeEngmon/commit/1a4e52d3bd835ca2a6820808cd320518cef4d6d0))
* move reset progress to settings with type-name confirmation (v56) ([bcd2972](https://github.com/MARCOTT402/PokeEngmon/commit/bcd2972aa45af304f1e2b08c2c10de3a928754aa))
* play 'Obtained a Berry!' jingle on settlement after failed capture (v47) ([b626f64](https://github.com/MARCOTT402/PokeEngmon/commit/b626f64febbdbbc99df62b09c51d3a591ba6196f))
* play 'Obtained a Pokemon!' jingle on settlement after successful capture (v46) ([6b1ee1c](https://github.com/MARCOTT402/PokeEngmon/commit/6b1ee1cad3b3cc9d8140ddac9929efc74a57dbcb))
* replace stage-ladder SRS with full SM-2 algorithm ([eee767d](https://github.com/MARCOTT402/PokeEngmon/commit/eee767d68b3845d4c7c941efca40d5f9e61f39ba))
* restore Gen 1 Battle! (Wild Pokémon) MP3 BGM + 2.6s WARNING + localhost dev guards (v31) ([70c6288](https://github.com/MARCOTT402/PokeEngmon/commit/70c6288a362ab9a7b90dde3446b410a84f0749a3))
* stop awarding normal pull tickets on set completion (v49) ([1f61b74](https://github.com/MARCOTT402/PokeEngmon/commit/1f61b742ef9f16f40d8bbe239dfd0332d2486d27))
* Supabase Auth foundation + RPC schemas + updated sync ([ea5e0a1](https://github.com/MARCOTT402/PokeEngmon/commit/ea5e0a18c334fd757adf268688230f2cb73a6e62))
* Supabase cloud sync (optional, non-blocking) ([09ba349](https://github.com/MARCOTT402/PokeEngmon/commit/09ba3494f1310acb4510274514de913ea9c0fd50))
* **v115:** move word TTS mp3s into Q_folder and fix missing wordAudioURL ([ee5aaaf](https://github.com/MARCOTT402/PokeEngmon/commit/ee5aaaf97b12853cfc4e7d5b286719bf8a8ddda1))
* **v117:** add parent guide for custom questions ([faad578](https://github.com/MARCOTT402/PokeEngmon/commit/faad578fbb68a79c05fbcca8005e6ae6a51afbc3))
* **v119:** link AI prompt guide file in parent guide modal ([2f525ec](https://github.com/MARCOTT402/PokeEngmon/commit/2f525ecfc349bcf2d8aa62a573c6caf079b77239))
* **v144:** replace town BGM with Flat Water at volume 0.1 ([6edd4d2](https://github.com/MARCOTT402/PokeEngmon/commit/6edd4d2cec3ccde98dd2e223829270142433ff84))
* **v145:** Settings Music/SFX continuous volume sliders with localStorage persist ([8e17936](https://github.com/MARCOTT402/PokeEngmon/commit/8e17936e2f6ce98c207553b61e6db810cfd279cc))
* **v147:** UI button tap SFX; include v146 SFX slider preview ([3b2b4d7](https://github.com/MARCOTT402/PokeEngmon/commit/3b2b4d727c55855b6c76d7309070b58c01e0705d))
* **v148:** autofocus quiz/powerup answer input every question for keyboard flow ([6d423e0](https://github.com/MARCOTT402/PokeEngmon/commit/6d423e001fafb64033e289124b97138bd130eb81))
* WARNING encounter + spiral warp + Game Boy chiptune BGM (v29) ([c810129](https://github.com/MARCOTT402/PokeEngmon/commit/c810129e93dd0e726be5ecfd12dbaa55c1652447))
* WARNING encounter screen + spiral warp + Battle! BGM (v28) ([6987deb](https://github.com/MARCOTT402/PokeEngmon/commit/6987debdc19267d975aeacc94ed792578564dd46))
* WARNING encounter screen + spiral warp + Game Boy chiptune BGM (v30) ([fc4121c](https://github.com/MARCOTT402/PokeEngmon/commit/fc4121c8cb14ade89cbcd311d407bb699dd7d525))

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

Releases after the SemVer migration are produced automatically by
[semantic-release](https://github.com/semantic-release/semantic-release)
from Conventional Commits on `main`.

## [1.48.0] - 2026-10-28

### Changed

- Migrated app versioning from monotonic `vNN` tokens to SemVer `MAJOR.MINOR.PATCH`.
- Introduced `semantic-release` + GitHub Actions release workflow on `main`.
- `js/app.js` / `sw.js` / `index.html` cache-bust strings are synced from `package.json` via `tools/sync_app_version.py`.
