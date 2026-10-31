# [1.14.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.13.0...v1.14.0) (2026-10-31)


### Features

* **battle:** ability system with 16 abilities ([d4932e3](https://github.com/MARCOTT402/PokeEngmon/commit/d4932e3df9e56f222d572096d82126ade56428d5))
* **battle:** add Gen 2-5 battle sprite atlases (dex 152-649) ([409d2f4](https://github.com/MARCOTT402/PokeEngmon/commit/409d2f46d66fe8f1413906b7112757dd516da85b))
* **battle:** AI trainer ladder up to Lv.82 with Gen 2-5 teams ([bd26f53](https://github.com/MARCOTT402/PokeEngmon/commit/bd26f53d472a070de4a8fd6fcb8c954cb0e04a1c))
* **battle:** complete battle polish, animations and responsive layout ([4f42e2a](https://github.com/MARCOTT402/PokeEngmon/commit/4f42e2ae352948b483df805b7e002062c41a416f))
* **battle:** custom animations for 27 moves missing from PokeRogue ([a8d1471](https://github.com/MARCOTT402/PokeEngmon/commit/a8d14710ae3fd332f8f68d6aa38676e167f579a0))
* **battle:** field effects - weather, entry hazards, and screens (Gen 5) ([2d3983a](https://github.com/MARCOTT402/PokeEngmon/commit/2d3983a258536dbe3b1abdc65d022667eb459405))
* **battle:** FireRed-style battle UI, AI trainer ladder and battle engine ([aa6f2f7](https://github.com/MARCOTT402/PokeEngmon/commit/aa6f2f73abc66c45c08c797508e491e339c2529d))
* **battle:** FRLG opening intro with trainer sprites and ball throw ([824fac9](https://github.com/MARCOTT402/PokeEngmon/commit/824fac90b3ad3d5da789df82456cfa870aeee99c))
* **battle:** PvP flow - matchmaking, format draw, then team select ([51d3603](https://github.com/MARCOTT402/PokeEngmon/commit/51d36036ad337d00f46545df6d645e684a890e09))
* **battle:** use original FRLG sprites for battle UI ([13fe848](https://github.com/MARCOTT402/PokeEngmon/commit/13fe848bc9aa845e05b5a50706e0d52312d3d8b3))

# [1.13.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.12.0...v1.13.0) (2026-10-30)


### Features

* **battle:** add full move data, type chart, move loadouts & Other Moves ([23b50ea](https://github.com/MARCOTT402/PokeEngmon/commit/23b50ea27d588025687e4e98e5149d154d0a25f0))
* **questions:** three-tier categories (category > unit > topic) and rename Q_folder to grammar/vocab ([5649406](https://github.com/MARCOTT402/PokeEngmon/commit/56494063a68e17c73d70db11b74b8ad3b9768587))

# [1.12.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.11.0...v1.12.0) (2026-10-30)


### Bug Fixes

* **quiz-junior:** idle balls bounce only inside the ball box; thrown balls may reach the question card ([e801af7](https://github.com/MARCOTT402/PokeEngmon/commit/e801af792a68574b911a13b37cd6129b45eadd42))


### Features

* **quiz-junior:** per-blank pokeballs, bounded playfield, livelier physics, L1 removes distractor, L2 master ball, keep hint button ([f3dd6b2](https://github.com/MARCOTT402/PokeEngmon/commit/f3dd6b22a406fa5cf90a6f25351e38de683ff2b9))

# [1.11.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.10.0...v1.11.0) (2026-10-30)


### Bug Fixes

* **quiz-junior:** flash red on all wrong answers; fix Q-value mapping ([2c8a7f0](https://github.com/MARCOTT402/PokeEngmon/commit/2c8a7f0522dbfc4437428ace15daf13201fe9c70))
* **quiz-junior:** ghost uses typed length, not prefix length; wrong input no longer re-reveals hint letters ([688de41](https://github.com/MARCOTT402/PokeEngmon/commit/688de4143640adecee5f6adf82b08fc9ad553112))
* **quiz-junior:** L1 hint letters are fixed, not regenerated on input ([35869bb](https://github.com/MARCOTT402/PokeEngmon/commit/35869bb88fc9416df4e1d7d5d68a5d29bf733497))
* **quiz-junior:** label is sibling of ball, always stays below regardless of rotation ([3264fe6](https://github.com/MARCOTT402/PokeEngmon/commit/3264fe6c3053ef34fc15690e83dd1e80e06d95d7))
* **quiz-junior:** separate underscores per letter in L1/L2 hints ([ccc0aaa](https://github.com/MARCOTT402/PokeEngmon/commit/ccc0aaa390e9d842c2ee2a5906434a7b5df91cbd))
* **quiz-junior:** use _answerFor instead of undefined _currentAnswer ([c246920](https://github.com/MARCOTT402/PokeEngmon/commit/c246920375d2ac8c3013c4c5850d9aae7e2e5a76))
* **quiz:** progress bar starts at 0/10, not 1/10 ([1a4756a](https://github.com/MARCOTT402/PokeEngmon/commit/1a4756aa452e09aef2ee60654602eb11cd94383d))


### Features

* **quiz-junior:** aligned widths, non-rotating labels, lively balls, throw escapes arena, spin force from circling ([c34a184](https://github.com/MARCOTT402/PokeEngmon/commit/c34a1844ec5daec6a7c74b8f70a2e4b0fd4d2a8d))
* **quiz-junior:** physics-based bouncing pokeballs with drag-to-throw mechanic ([1bceff4](https://github.com/MARCOTT402/PokeEngmon/commit/1bceff4ea322874073dea26dd08635e899656575))
* **quiz:** junior catch mode for low-EF words (EF < 1.8) ([4e8aafa](https://github.com/MARCOTT402/PokeEngmon/commit/4e8aafa297c594b85a27296e4fdacbcb69a96f90))
* **sm2:** add forgetting curve modes (junior/standard/teen/adult) ([eaedd02](https://github.com/MARCOTT402/PokeEngmon/commit/eaedd02a32ea14481d421dd42c263739bf40f676))

# [1.10.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.9.0...v1.10.0) (2026-10-30)


### Bug Fixes

* **quiz:** allow closing the report hub by tapping outside ([bc389ed](https://github.com/MARCOTT402/PokeEngmon/commit/bc389ed7b504294fa5196fd39f5eec317e1e8f02))


### Features

* **quiz:** add card drawer and report-issue hub ([103a55d](https://github.com/MARCOTT402/PokeEngmon/commit/103a55d922605b084e4250525cecdb902ca9b8a5))
* **reports:** upload problem reports to Supabase ([6528ff3](https://github.com/MARCOTT402/PokeEngmon/commit/6528ff3bc7963ad3ff433b14eb7db6a7946f43bb))

# [1.9.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.8.3...v1.9.0) (2026-10-30)


### Features

* **exp:** score clean completions only ([79cc6d6](https://github.com/MARCOTT402/PokeEngmon/commit/79cc6d619ac50ef084f885cce354e38ae9980129))
* **quiz:** inline word blanks, two-level hints and same-set requeue ([0ada2cf](https://github.com/MARCOTT402/PokeEngmon/commit/0ada2cfb960208dde5e7b81c883f23fe3edfeb3b))
* **quiz:** review-time bubble before answering and hint-aware progress ([7151edb](https://github.com/MARCOTT402/PokeEngmon/commit/7151edbe511db2ba13f127e4ffce25a59336bc0f))
* **sm2:** recalibrate EF/interval model and add last_review_at ([9fcb614](https://github.com/MARCOTT402/PokeEngmon/commit/9fcb614ac164eb5c07596ef3230fd5bac918d81a))
* **sync:** persist last_review_at and add DB migration ([c74ce68](https://github.com/MARCOTT402/PokeEngmon/commit/c74ce6804ca97957b718fe3c046739574c3db70c))
* **ui:** bundle Inter font, wrong-answer sound and quiz keyboard shortcuts ([462ee4c](https://github.com/MARCOTT402/PokeEngmon/commit/462ee4cdc110f266a4981ae57f9f9e8a8298804e))

## [1.8.3](https://github.com/MARCOTT402/PokeEngmon/compare/v1.8.2...v1.8.3) (2026-10-29)


### Bug Fixes

* **gym:** serve badge sprites locally (PokeAPI items path was 404) ([9f7f3b3](https://github.com/MARCOTT402/PokeEngmon/commit/9f7f3b3ca86deca71262b6c30061005498604be1))

## [1.8.2](https://github.com/MARCOTT402/PokeEngmon/compare/v1.8.1...v1.8.2) (2026-10-29)


### Bug Fixes

* **pet:** new or switched-in partner no longer loses 50 HP instantly ([e7643da](https://github.com/MARCOTT402/PokeEngmon/commit/e7643dae0c66ae28a8ddae7ef3239b94f6041b40))

## [1.8.1](https://github.com/MARCOTT402/PokeEngmon/compare/v1.8.0...v1.8.1) (2026-10-29)


### Bug Fixes

* **sync:** patch user_account by id so item bag and clock sync actually persist ([0c17af4](https://github.com/MARCOTT402/PokeEngmon/commit/0c17af47a9377dd33e4294acc93e3a04db369891))

# [1.8.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.7.1...v1.8.0) (2026-10-29)


### Bug Fixes

* open Partner Care from the home sprite even with a single Pokemon ([df4090e](https://github.com/MARCOTT402/PokeEngmon/commit/df4090eb49a67fd2559facbc94256d2ad33d788a))


### Features

* add partner pet care system (feeding, health, items, faint) ([f3219c5](https://github.com/MARCOTT402/PokeEngmon/commit/f3219c5a61aba1f2fb00682e6189a8632f4dfa62))
* **pet:** 15:00 HKT decay, server clock offset, cloud backup for pet state and items ([79f9378](https://github.com/MARCOTT402/PokeEngmon/commit/79f9378bc877aedc990868959d0a0201569d1ce2))

## [1.7.1](https://github.com/MARCOTT402/PokeEngmon/compare/v1.7.0...v1.7.1) (2026-10-29)


### Bug Fixes

* route picture word audio through a dedicated bus so BGM and SFX volume settings no longer affect it ([569fd03](https://github.com/MARCOTT402/PokeEngmon/commit/569fd03cb353bc1ad8a4f47f1b95e457d2ece873))

# [1.7.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.6.0...v1.7.0) (2026-10-29)


### Features

* auto-play the word audio once when a picture word question appears ([45b0e2c](https://github.com/MARCOTT402/PokeEngmon/commit/45b0e2ccec06e69974c8bbb34f4f08c72154d04d))

# [1.6.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.5.0...v1.6.0) (2026-10-29)


### Features

* sync name_customized flag and restore review history from Supabase ([fed9de6](https://github.com/MARCOTT402/PokeEngmon/commit/fed9de67010a0dd918de71fdd6519f4ed306b6aa))

# [1.5.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.4.0...v1.5.0) (2026-10-29)


### Features

* sync Pokemon nature to Supabase so stats stay identical across devices ([5437631](https://github.com/MARCOTT402/PokeEngmon/commit/5437631268a2109e8358641457791a107b87961a))

# [1.4.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.3.1...v1.4.0) (2026-10-29)


### Features

* store full practice set details in cloud so the calendar restores history across devices ([389f849](https://github.com/MARCOTT402/PokeEngmon/commit/389f849f482b3e9e485cb3f38bbf4b1127f8d48b))

## [1.3.1](https://github.com/MARCOTT402/PokeEngmon/compare/v1.3.0...v1.3.1) (2026-10-29)


### Bug Fixes

* defer OAuth post-login merge until after first paint so the overwrite modal is not hidden behind the boot loading overlay ([1527955](https://github.com/MARCOTT402/PokeEngmon/commit/1527955305e311c467a4e79562fdb5805d7b49e8))

# [1.3.0](https://github.com/MARCOTT402/PokeEngmon/compare/v1.2.0...v1.3.0) (2026-10-29)


### Features

* add boot loading overlay so first paint is never a white screen ([f366c01](https://github.com/MARCOTT402/PokeEngmon/commit/f366c01238908be3615b45744b5952bdcf5d4413))

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
