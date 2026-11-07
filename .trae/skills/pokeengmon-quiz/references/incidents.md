# PokeEngmon 答題（SM-2／鍵盤／結算） — 事故紀錄同原文（references）

> 由 `pokeengmon-preop-checklist` 原文搬入（2026-11-06），每條 Rule 原文照錄。主要點喺 `../SKILL.md`。

### Rule 7 — SM-2 sessions only pull DUE cards

`buildSession` in `js/sm2.js` must only pick cards with `next_review_at <= now` (overdue first, brand-new cards fill the tail randomly). NEVER pad a set with not-yet-due cards — if a topic runs dry, the set is short and the user is told to pick other courses. Do not reintroduce any backfill of not-due cards (v94's 20-hour cooldown approach was superseded by v95's due-only rule).

### Rule 44 — 刪結算頁按鈕前必查 Gym conclude 依賴

Incident (2026-11-04)：刪結算頁「Back to Home」掣時發現 Gym 模式嘅 badge 判定（`Gym.conclude`）掛喺 `btn-settle-home` onclick，靠 `_gymSettleData` 觸發。刪掣前要將呢段邏輯搬去唯一剩低嘅出口（下巴精靈球 `btn-pd-home`），否則 gym badge 永遠唔會判。

- 結算頁而家唯一出口係下巴精靈球；任何「結算後先做」嘅邏輯（gym conclude、之後新增嘅模式）都要掛喺 `btn-pd-home` handler 開頭。

### Rule 71 — 答題 App 鍵盤版面係用戶指定：提示左上、Voice mode 右上、Submit／Next 右下

Incident (2026-11-05，Quiz v2)：第一版將 Check／Continue 放喺鍵盤上面嘅全寬主掣，答完仲會收起鍵盤。用戶畀截圖要求手機／平板鍵盤跟固定版面：鍵盤頂部白色工具列（左＝查看提示、右＝語音模式），3 行 QWERTY（第 3 行左 `'`、右 ⌫），底行 `123`／space／右下 ✓ Submit（答完變 → Next）。

- 觸控（`pointer: coarse`）顯示 App 鍵盤時，`#view-quiz` 加 `kb-on`：內容區 `#quiz-toolbar-before` 同底部 `.qa-main` 全部收起，提交／下一題只靠鍵盤右下 `#qk-go`；回饋條（綠／紅／黃）仍然喺鍵盤上方。
- 答完**唔好**收起鍵盤（右下鍵變 Next），否則用戶要搵另一粒掣。
- 鍵盤嘅提示鍵／Submit 鍵狀態要喺 `_syncCheckBtn()` 同步（disabled、Next 字樣、提示次數），新增會改提示／答題狀態嘅路徑都要 call 佢。
- 桌面（`pointer: fine`）冇 App 鍵盤，用內容區 Hint 掣＋底部 Check／Continue 主掣（顯示 `Enter`／`Ctrl H` 提示）。
- 驗證：用 mobile preset（會模擬 coarse pointer）試鍵盤；自訂闊度 ≥768 會變 fine pointer，鍵盤會消失係正常。

Skill: Rule 71 added

### Rule 74 — 答題空格：顯示字同透明 input 嘅字型（字重、字距、size、family）一定要一致，否則浮標越打越向左移

Incident (2026-11-05，Quiz v2)：`.qb-cell` 入面係「顯示字 `.qb-text`＋透明 `.qb-input`（只睇到 caret）」疊埋。Quiz v2 CSS 將 `.qb-text` 改做 `font-weight: 800`，圖片題 `.quiz-sentence` 又加咗 `letter-spacing: .04em`，但 input 仍然係 600、冇字距 → 每打一個字 caret 就落後少少，用戶見到浮標「輸入多幾個字後移左位」。

- 字重／字距要放喺 `.qb-cell`（或者佢上層），`.qb-text`、`.qb-ghost`、`.qb-input` 全部 `inherit`；唔好只改顯示字嘅 font。
- `letter-spacing` 唔會自動傳入 `<input>`（form control 預設唔繼承 font 屬性），要明寫 `letter-spacing: inherit`。
- 驗收：打 12 個字母，用 canvas `measureText`（input 嘅 computed font＋letterSpacing×字數）對比 `.qb-text` 闊度，差距要 ≤ 1px；句子題同圖片題都要測。

Skill: Rule 74 added

### Rule 77 — 揀多個單元／子單元答題：成個到期 pool 先 Fisher-Yates 洗勻再抽，唔好「過期最耐優先」或 `sort(random)`

Incident (2026-11-05)：用戶反映揀咗單元／子單元後，一個 set 嘅題目集中喺某一個子單元。`SM2.buildSession` 先揀過期最耐嘅舊卡（同一課題通常一齊做，到期時間相近 → 成批來自同一子單元），再用有偏差嘅 `sort(() => Math.random() - 0.5)` 補新題（pool 按課題排序，洗唔散）；最後只 shuffle 抽出嚟嗰 10 題嘅次序。

- 抽題：揀咗嘅 topic keys 入面所有到期題（過期＋全新）混埋一齊，Fisher-Yates 洗勻成個 pool，再 `slice(0, size)`。
- 永遠唔好用 `arr.sort(() => Math.random() - 0.5)` 做 shuffle。
- 驗收：揀 2 個以上子單元，跑 `buildSession` 幾百次統計每個子單元出現比例，要接近佢喺 pool 嘅比例。

Skill: Rule 77 added

### Rule 93 — SM-2 storage 逐題 parse 令入題卡幾秒

- 症狀：揀全部課題撳 Start，手機要等幾秒先出第一題；介面似卡死。
- 根因：`SM2.buildSession` 對 pool 每一題 call `getOrCreateCard`，而 `getOrCreateCard` 每次 `JSON.parse(localStorage)` 成個 cards blob（1,380 題 → 359 KB），新卡仲要 `JSON.stringify`＋`setItem` 成個 blob＝O(N²)。
- 實測（headless Chrome、CPU 4× 降速、1,380 題）：全新用戶 4,586 ms → 31 ms；已有卡 3,575 ms → 30 ms；每答一題寫入 10.2 ms → 1 ms。
- 修正：`js/sm2.js` 原始字串 key 解析快取＋`buildSession` 只讀一次、唔為 pool 建卡（見 SKILL.md Rule 93）。
- 測試：`tools/_test_sm2_cache.js`（15 項）、`tools/perf/bench.mjs`。
- 計劃：`.trae/documents/20261106-stability-performance.md` §5.1。

Skill: Rule 93 added

### Rule 107 — 平板／手機答題快打，撳咗字母冇輸入

- 症狀（2026-11-07 用戶報告）：平板或手機答題時打得快，撳咗 App 鍵盤字母但冇字入到格。
- 根因：`js/quiz.js` `_buildKeyboard()` 喺 `click` 先 `_kbInsert`。快打時兩隻手指重疊，第二隻係非 primary pointer → 冇 `click`；Chrome 仲會取消第一隻嘅 click。
- 重現（headless Chrome CDP 觸控）：舊碼「多指重疊打 world」→ 輸入格係空（5 個字全冇）；重疊 `h e ⌫` → 空。
- 修正：字母／⌫／123 改喺 `pointerdown` 執行；Submit／Hint 用同一 `pointerId` 喺同一粒鍵 `pointerup` 先執行；`click` 只收 `detail === 0`。
- 測試：`tools/responsive/test-quiz-keyboard.mjs`（17 項，新碼全 pass，舊碼 8 fail）。
- 測試陷阱：CDP 觸控模擬中途淨放一隻手指唔生效（要全部 `touchEnd`）；同一個 Chrome 轉 viewport／mobile 之後觸控會失效 → 每個尺寸開新 Chrome。

Skill: Rule 107 added
