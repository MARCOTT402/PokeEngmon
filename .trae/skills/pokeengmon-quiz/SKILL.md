---
name: pokeengmon-quiz
description: PokeEngmon quiz rules: SM-2 due-card sessions, settlement exits and Gym conclude, the user-specified app keyboard layout, blank-input font matching, and drawing from multi-unit pools. Read before changing js/quiz.js, js/sm2.js, the settlement screen or question drawing.
---

# PokeEngmon 答題（SM-2／鍵盤／結算）

> 幾時讀：改 `js/quiz.js`、`js/sm2.js`、結算畫面、抽題邏輯之前。
> 由 `pokeengmon-preop-checklist` 按題目拆出（2026-11-06）。下面係每條 Rule 嘅**現行要點**（原文條列照抄）；事故經過、code 範例、原因分析喺 `references/incidents.md`，要查來龍去脈先開。
> 新事故：寫入 `references/incidents.md`（`### Rule N — 標題` 加喺尾），呢度加要點；preop checklist 加 `## Rule N — 標題` 一行指向（跟 `post-fix-lesson-capture`）。

## Rules

### Rule 7 — SM-2 sessions only pull DUE cards

`buildSession` in `js/sm2.js` must only pick cards with `next_review_at <= now` (overdue first, brand-new cards fill the tail randomly). NEVER pad a set with not-yet-due cards — if a topic runs dry, the set is short and the user is told to pick other courses. Do not reintroduce any backfill of not-due cards (v94's 20-hour cooldown approach was superseded by v95's due-only rule).

### Rule 44 — 刪結算頁按鈕前必查 Gym conclude 依賴

- 結算頁而家唯一出口係下巴精靈球；任何「結算後先做」嘅邏輯（gym conclude、之後新增嘅模式）都要掛喺 `btn-pd-home` handler 開頭。

### Rule 71 — 答題 App 鍵盤版面係用戶指定：提示左上、Voice mode 右上、Submit／Next 右下

- 觸控（`pointer: coarse`）顯示 App 鍵盤時，`#view-quiz` 加 `kb-on`：內容區 `#quiz-toolbar-before` 同底部 `.qa-main` 全部收起，提交／下一題只靠鍵盤右下 `#qk-go`；回饋條（綠／紅／黃）仍然喺鍵盤上方。
- 答完**唔好**收起鍵盤（右下鍵變 Next），否則用戶要搵另一粒掣。
- 鍵盤嘅提示鍵／Submit 鍵狀態要喺 `_syncCheckBtn()` 同步（disabled、Next 字樣、提示次數），新增會改提示／答題狀態嘅路徑都要 call 佢。
- 桌面（`pointer: fine`）冇 App 鍵盤，用內容區 Hint 掣＋底部 Check／Continue 主掣（顯示 `Enter`／`Ctrl H` 提示）。
- 驗證：用 mobile preset（會模擬 coarse pointer）試鍵盤；自訂闊度 ≥768 會變 fine pointer，鍵盤會消失係正常。

### Rule 74 — 答題空格：顯示字同透明 input 嘅字型（字重、字距、size、family）一定要一致，否則浮標越打越向左移

- 字重／字距要放喺 `.qb-cell`（或者佢上層），`.qb-text`、`.qb-ghost`、`.qb-input` 全部 `inherit`；唔好只改顯示字嘅 font。
- `letter-spacing` 唔會自動傳入 `<input>`（form control 預設唔繼承 font 屬性），要明寫 `letter-spacing: inherit`。
- 驗收：打 12 個字母，用 canvas `measureText`（input 嘅 computed font＋letterSpacing×字數）對比 `.qb-text` 闊度，差距要 ≤ 1px；句子題同圖片題都要測。

### Rule 77 — 揀多個單元／子單元答題：成個到期 pool 先 Fisher-Yates 洗勻再抽，唔好「過期最耐優先」或 `sort(random)`

- 抽題：揀咗嘅 topic keys 入面所有到期題（過期＋全新）混埋一齊，Fisher-Yates 洗勻成個 pool，再 `slice(0, size)`。
- 永遠唔好用 `arr.sort(() => Math.random() - 0.5)` 做 shuffle。
- 驗收：揀 2 個以上子單元，跑 `buildSession` 幾百次統計每個子單元出現比例，要接近佢喺 pool 嘅比例。

### Rule 93 — SM-2 storage：唔好逐題 parse／寫成個 cards blob；buildSession 讀一次快取，唔好為成個 pool 建卡

- `_loadCards()`／`_loadHistory()` 用「localStorage 原始字串做 key」嘅解析快取：字串一樣就重用上次 `JSON.parse` 結果；sync pull、reset 直接寫 localStorage 會令字串唔同 → 自動重新 parse，唔使加 invalidate。
- 快取 object 係共用：內部改完一定經 `_saveCards`／`_saveHistory` 寫返；對外（`listAll`／`listDue`／`listNew`／`listHistory`）一律回傳 copy。
- `buildSession` 只讀一次 cards；未有 card 嘅題當全新（到期）；張 card 等 `Quiz._renderQuestion` 出題先建。**唔好**喺 loop 入面 call `getOrCreateCard`（每次 parse＋寫 359 KB → O(N²)，手機入題等幾秒）。
- 驗收：`node tools/_test_sm2_cache.js`（Rule 7／77 行為＋快取失效）；`node tools/perf/bench.mjs --cpu 4` 嘅 `freshQuizStartMs`／`warmQuizStartMs` < 200。
