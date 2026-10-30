# PokeEngmon 現行機制報告

> 日期：2026-10-29  
> 範圍：現行 live 的答題、SM-2 排程、Power Up、結算、同步。  
> 注意：本報告只記錄「目前用緊」的機制，不包含未實作的 Epop 新方案。

---

## 0. 高層摘要

- 每回合最多 **10 題**。
- 出題只抽 **`next_review_at <= now` 的到期卡**；未到期卡不補位。
- 答案用 **Levenshtein Distance + 動態時間期望** 評分，得到 `q = 1–5`。
- 排程是 **SM-2 變體**，但不是原版 SM-2：
  - 間隔固定階梯 `1 / 3 / 7 / 15 / 30` 天；
  - `repetition` 0–5，5 代表畢業；
  - `ease_factor` 有計、有存、有同步，但 **目前不參與間隔計算**。
- 答錯會即時寫卡；回合尾的 **Power Up Zone** 會再寫一次卡，要求改到 exact match。
- 提示（💡 Hint）對 SRS **免費**，只影響 EXP 分級。
- 回合分數 `score` 是 **第一次提交就答對的題數**；Power Up 改啱 **不會加回 score**。

---

## 1. 模組與資料流

| 模組 | 職責 | 檔案 |
|---|---|---|
| SM-2 Core | 評分、EF、repetition、interval、卡片儲存、出題池 | `js/sm2.js` |
| Quiz | 10 題流程、輸入、Hint、Skip、即時寫卡 | `js/quiz.js` |
| Power Up Zone | 回合尾錯題強制改錯、三階腳架、+5 EXP | `js/powerup.js` |
| App | 回合完成、捕捉、EXP／鑽石／掉落結算 | `js/app.js` |
| Sync | 卡片／history 背景上雲、雲端合併 | `js/sync.js` |
| Data | 題庫、`GAME_CONFIG`、組裝題目 | `js/data.js` |
| Supabase Schema | `user_cards` / `user_history` 結構 | `supabase/supabase-schema.sql` |

資料流：

```text
getAllQuestions()
  → SM2.buildSession()：只抽到期卡 → 最多 10 題
  → Quiz.submit()
      → SM2.computeBestQ()：Levenshtein + 時間期望 → q
      → SM2.updateCard()：repetition / interval / EF / next_review_at
      → SM2.upsertCard() + SM2.appendHistory()
  → Quiz.finish()：score = 第一次提交答對數
  → App.onQuizFinished()
      ├─ 有錯題 → PowerUp.start()：逐題再 updateCard()
      └─ 捕捉 → App.onSetComplete()
            → EXP / 鑽石 / 掉落（用 Quiz 第一次提交的 score）
```

---

## 2. 主要常量

| 常量 | 值 | 位置 |
|---|---|---|
| `SET_SIZE` | 10 | `js/sm2.js`、`GAME_CONFIG.SET_SIZE` |
| `LADDER` | `[1, 3, 7, 15, 30]` 天 | `js/sm2.js` L23 |
| `MAX_REP` | 5 | `js/sm2.js` L24 |
| `INITIAL_EF` | 2.50 | `js/sm2.js` L25 |
| `MIN_EF` | 1.30 | `js/sm2.js` L26 |
| EF 上限 | 3.00（hardcode 在 `computeEF`） | `js/sm2.js` L116 |
| 時間期望 | `3500 + 1200 × 目標長度` ms | `js/sm2.js` L61-L63 |
| 快速判定 | `response ≤ 0.5 × expected` → q5 | `js/sm2.js` L82-L83 |
| 正常判定 | `response ≤ 1.5 × expected` → q4 | `js/sm2.js` L84-L85 |
| `EXP_BASE` | 12 | `js/data.js` L9 |
| `EXP_PER_FIX` | 5（Power Up 每題） | `js/powerup.js` L15 |
| 鑽石 | 全對 3、`>= total-2` 2、`>= total-3` 1 | `js/data.js` L11-L13、RPC |
| 本機 history 上限 | 最近 2000 條 | `js/sm2.js` L183 |
| 雲端 pull history | 最近 300 條 | `js/sync.js` L162 |

---

## 3. 卡片資料模型

### 3.1 本機卡片（`localStorage`）

Key：`pokeengmon_sm2_cards_v2`

```js
{
  card_id: string,
  card_type: "sentence" | "word",
  next_review_at: number,   // ms epoch；新卡 = 0
  interval_days: number,    // 目前只會是 1 / 3 / 7 / 15 / 30
  ease_factor: number,      // 1.30 – 3.00
  repetition: number,       // 0–5
  lapse_count: number,
  is_mastered: boolean,     // repetition >= 5
  updated_at: number        // ms epoch
}
```

沒有 `state`、沒有 `last_reviewed_at`、沒有 `actual_days_elapsed`。

### 3.2 本機 history（`localStorage`）

Key：`pokeengmon_sm2_history_v2`，最多保留最後 2000 條。

```js
{
  device_id, card_id, ts, q_score, response_ms,
  levenshtein_distance, is_typo
}
```

### 3.3 雲端 `user_cards`

| 欄位 | 型別 | 備註 |
|---|---|---|
| `account_id` | uuid | PK 之一 |
| `card_id` | text | PK 之一 |
| `card_type` | text | sentence / word |
| `next_review_at` | bigint | ms epoch |
| `interval_days` | numeric(6,2) | 目前 1–30 |
| `ease_factor` | numeric(4,2) | 1.30–3.00 |
| `repetition` | int | 0–5 |
| `lapse_count` | int | |
| `is_mastered` | boolean | repetition >= 5 |
| `updated_at` | bigint | ms epoch |

Primary key：`(account_id, card_id)`。

### 3.4 雲端 `user_history`

| 欄位 | 型別 |
|---|---|
| `id` | bigserial PK |
| `account_id` | uuid |
| `card_id` | text |
| `ts` | bigint |
| `q_score` | numeric(3,1) |
| `response_ms` | bigint |
| `levenshtein_distance` | int |
| `is_typo` | boolean |

`user_history` 沒有 unique constraint，重複 push 可能產生重複 row。

---

## 4. `card_id` 與 `qid`

### 4.1 SRS `card_id`

```js
// 圖片單字題
`w\u0001${word.toLowerCase()}`

// 句子題
`${topic}\u0001${sentence}\u0001${answer}`
```

- 同一個英文單字，即使出現在不同課題，**共用同一張 SRS 卡**。
- 句子卡用 topic + sentence + answer；改答案＝新卡，舊卡會變 orphan。
- `card_id` 區分大小寫／空格；`qid` 則是 `q.id`，Power Up 用 `qid` 找回題目。

### 4.2 出題池

`getAllQuestions()` = 內建題庫 + 自訂題 + 圖片單字題，按 `questionKey(q)` 去重。  
`questionKey` 與 `card_id` 的格式一致（見上）。

---

## 5. 出題機制 `SM2.buildSession()`

位置：`js/sm2.js` L279-L321。

步驟：

1. 用 `topicKeys` 過濾題目（key 格式 `course\u0001topic`）。
2. 對 pool 內每一題 **lazy create** 卡片（`repetition=0`、`next_review_at=0`）。
3. 只保留 `card.next_review_at <= now` 的到期卡。
4. 到期卡再分兩組：
   - `overdue`：`next_review_at > 0`，按 `next_review_at` 由舊到新排序。
   - `fresh`：`next_review_at === 0`，用 `Math.random() - 0.5` 排序。
5. `picked = overdue.concat(fresh).slice(0, 10)`。
6. 對 `picked` 做 Fisher-Yates 洗牌。
7. 回傳題目（不是卡片）。

重要規則：

- **未到期卡一律不抽，不補位**（preop Rule 7）。
- 到期卡不足 10 題 → 出細 set；UI 會 toast「Only N questions left」。
- 完全沒有到期卡 → `[]`；UI 顯示「All caught up」。
- overdue 的「最舊優先」只影響 **揀邊 10 題**；最後會洗牌，所以畫面順序不是最舊優先。
- `fresh` 的排序不是嚴格 Fisher-Yates（是 random comparator），之後整體再 Fisher-Yates。

`listNew()` = `repetition === 0` 的卡。注意：答錯後 `repetition` 仍然是 0，所以「new」不代表「從未答過」。

---

## 6. 評分機制 `computeQ` / `computeBestQ`

位置：`js/sm2.js` L68-L109。

### 6.1 正規化

```js
input  = String(input).trim().toLowerCase()
target = String(target).trim().toLowerCase()
```

只 trim 頭尾、轉細楷；**不 collapse 中間多個空格**。

### 6.2 Levenshtein Distance

標準 DP：

```text
D[i][0] = i
D[0][j] = j
D[i][j] = min(
  D[i-1][j] + 1,              // delete
  D[i][j-1] + 1,              // insert
  D[i-1][j-1] + (a[i-1] !== b[j-1])  // substitute
)
```

### 6.3 時間期望

```js
expectedTime(target) = 3500 + target.length * 1200   // ms
lenRatio = target.length > 0 ? input.length / target.length : 0
```

### 6.4 Q 值分支（順序很重要）

| q | reason | 判定條件 | 算答對？ | EF 變化 |
|---|---|---|---|---|
| 5 | `perfect_fast` | `dist=0` 且 `response ≤ 0.5 × expected` | 是 | +0.10（上限 3.00） |
| 4 | `good_normal` | `dist=0` 且 `response ≤ 1.5 × expected` | 是 | 不變 |
| 3 | `hard_slow` | `dist=0` 且 `response > 1.5 × expected` | 是 | −0.14（下限 1.30） |
| 2 | `soft_fail_typo` | `dist=1` | 否 | 不變 |
| 1 | `premature_submit` | `dist≥1`、`lenRatio<0.5`、input 是 target 前綴 | 否 | 不變 |
| 1 | `hard_fail` | `dist≥2` | 否 | −0.20（下限 1.30） |

- `premature_submit` **最先檢查**，所以「打一半就 Enter」不會當 typo。
- `correct = q >= 3`，因此實際上只有 **dist=0** 才算答對；dist=1 是 typo，dist≥2 是 hard fail。
- 空白答案：如果 target 也是空白（零冠詞題），dist=0，可以正常答對；Skip 則強制 `hard_fail`。

### 6.5 多個可接受答案

```js
targets = word ? [q.word] : [q.answer || "", ...(q.accept || [])]
```

`computeBestQ` 逐個 target 評分，取 **最高 q**；同 q 取 **最短 dist**；回傳 `target` 方便記錄。

### 6.6 `_isCorrect` 與 `computeQ` 的分別

`Quiz._isCorrect()` 是簡化版 exact match：trim、lowercase、`\s+ → 單空格`、再比 `accept`。  
但 `submit()` **不是用 `_isCorrect`**，而是用 `computeBestQ`；而 `_isCorrect()` 目前在專案內 **沒有任何呼叫**（dead code）。所以：

- 中間多個空格 → dist=1 → typo，不會當對。
- `_isCorrect` 不會影響 SM-2 評分；它只是殘留 helper。

---

## 7. 卡片更新 `SM2.updateCard()`

位置：`js/sm2.js` L143-L159。

```js
newRep = nextRepetition(card.repetition, q)
newEF  = computeEF(card.ease_factor, reason)
newInt = nextInterval(newRep, q)
next_review_at = now + newInt * 86400000
lapse_count += (q <= 2 ? 1 : 0)
is_mastered = newRep >= 5
updated_at = now
```

### 7.1 `repetition` 轉換

| 情況 | newRep |
|---|---|
| `q >= 3` | `min(5, rep + 1)` |
| `q < 3` 且 `rep = 0` | `0` |
| `q < 3` 且 `1 ≤ rep ≤ 4` | `1` |
| `q < 3` 且 `rep = 5` | `4` |

### 7.2 `interval` 階梯

`nextInterval(newRep, q)`：

| 情況 | interval |
|---|---|
| `q >= 3`，newRep=1 | 1 天 |
| `q >= 3`，newRep=2 | 3 天 |
| `q >= 3`，newRep=3 | 7 天 |
| `q >= 3`，newRep=4 | 15 天 |
| `q >= 3`，newRep=5 | 30 天 |
| `q < 3` | 1 天 |

**EF 不參與 interval 計算**；interval 純粹由 `repetition` 和「q 是否 ≥3」決定。

### 7.3 EF 實際採用值

`Quiz.submit()` / `PowerUp.submit()` 的流程是：

```js
const updated = SM2.updateCard(card, q, response_ms);
updated.ease_factor = SM2.computeEF(card.ease_factor, judge.reason);
SM2.upsertCard(updated);
```

所以：

- `updateCard` 內部計一次 EF，但**會被覆寫**。
- 真正寫入的是 `computeEF(舊EF, judge.reason)`。
- `card._lastReason` 是殘留欄位；實際上沒有被設定，`upsertCard` 也會刪除。

### 7.4 關鍵推論

- EF 有計、有存、有同步，但 **不影響下次間隔**；它目前是「記錄用」。
- 最長間隔固定 30 天，沒有 60/90/180 天這種長期成長。
- `is_mastered` 只是 `repetition >= 5` 的鏡像。
- 畢業卡（rep=5）答錯 → rep=4、1 天；下一題答對 → rep=5、30 天。
- 學習卡（rep=1–4）答錯 → rep=1、1 天；下一題答對 → rep=2、3 天（不會回到原本的 7/15 天）。

---

## 8. Quiz 流程

位置：`js/quiz.js`。

### 8.1 開始

`Quiz.start(topics)`：

1. `drawMixedSet(10, topics)` → `SM2.buildSession()`。
2. 空 set → 「All caught up」modal。
3. 少於 10 題 → toast，照做細 set。
4. 初始化 `idx=0`、`results=[]`、`_hintUsed=new Set()`、計時器。
5. 顯示 `view-quiz`，render 第一題。

### 8.2 每題 render

- 進度 `idx+1 / set.length`。
- 難度星星。
- 記憶光芒（見第 9 節）。
- 題目圖片（`Q_folder/grammar/grammar_images/<no>.png`）。
- 圖片單字題顯示圖片卡、點圖播聲。
- 輸入框清空、enabled、自動 focus。
- 清除上題 feedback、Continue、Hint disabled 重設。

### 8.3 Submit

```js
response_ms = now - _curQuestionStart
judge = SM2.computeBestQ(text, targets, response_ms)
correct = judge.q >= 3
card = SM2.getOrCreateCard(q)
updated = SM2.updateCard(card, judge.q, response_ms)
updated.ease_factor = SM2.computeEF(card.ease_factor, judge.reason)
SM2.upsertCard(updated)
SM2.appendHistory({...})
```

- **答錯都會即時寫卡**（不是等 Power Up）。
- `results.push` 記錄：
  - `qid`, `chosen`, `correct`, `topic`
  - `memory`：用 **更新前** 的 `card.repetition > 0 && !card.is_mastered`
  - `hint`：`_hintUsed.has(idx)`
  - `_sm2`：`q_score`, `reason`, `dist`, `response_ms`, `target`
- Feedback：
  - correct → 隨機讚美。
  - premature → 「You stopped halfway…」。
  - typo → 「Almost! One tiny typo…」。
  - 其他錯 → **顯示正確答案** `The answer is "..."`。
- 前進：
  - correct → 650ms 自動跳。
  - wrong → 顯示 Continue，等玩家按。

### 8.4 Hint

- 不寫卡、不改 SRS。
- 顯示首字母 + 字數；零冠詞題提示可留空。
- `_hintUsed.add(idx)`，Hint button disabled。
- 只影響結算 EXP 分級。

### 8.5 Skip

- 當答錯計。
- 空輸入評分：
  - 有 target → `computeQ("", target)` → 通常 hard_fail q1。
  - 零冠詞 target → 強制 `q=1, reason="hard_fail"`。
- 即時寫卡 + history。
- `results` 記 `skipped: true, correct: false`。
- 顯示答案，玩家按 Continue 前進。

### 8.6 Finish

```js
score = results.filter(r => r.correct).length
total = set.length
```

- `score` 是 **Quiz 第一次提交** 的答對數。
- `results` 傳給 App 時只保留 `qid, chosen, correct, memory, hint`；`skipped` 和 `_sm2` 不傳。
- 錯題（包括 Skip）之後入 Power Up，但 **`score` 不會更新**。

### 8.7 Quit

- 確認彈窗；退出後本回合不結算。
- 已答題的卡片／history **已經寫入**，不會回滾。

---

## 9. 記憶光芒與 Bonus

位置：`js/quiz.js` L156-L182。

條件：

```js
card.repetition > 0 && !card.is_mastered
```

即 **rep 1–4** 的學習卡；rep 0 新卡和 rep 5 畢業卡都不顯示。

- 顯示拍檔 sprite + 「remembers this `${card.interval_days}` days ago」。
- `card.interval_days` 是 **原本間隔**，不是實際經過天數。例如 30 天卡拖了 100 天才做，仍然寫「30 days ago」。
- 該題答對 → 結算時每題多 0.5 份 EXP（見第 11 節）。
- `_curQuestionStart` 在這裡設定，供 `computeQ` 的 `response_ms`。

---

## 10. Power Up Zone

位置：`js/powerup.js`。

### 10.1 觸發

`App.onQuizFinished(data)`：

```js
wrongs = data.results.filter(r => !r.correct).map(r => ({q: findQuestion(r.qid), chosen: r.chosen}))
if (wrongs.length) PowerUp.start(wrongs, () => _captureThenSettle(data))
```

- 包括 Skip 題。
- 不包括「Quiz 答對但 typo」？typo 的 `correct=false`，所以會入。

### 10.2 三階腳架

| 次數 | 行為 |
|---|---|
| 第 1 次仍錯 | 顯示 Hint：關鍵詞 highlight、首字母、字母數、差距字母數；**不給答案** |
| 第 2 次仍錯 | 顯示完整答案／解析；要求玩家再打到 exact match |
| 第 3 次仍錯 | 同第 2 次（一直顯示答案） |

### 10.3 清除條件

不是 `q >= 3`，而是 **`judge.dist === 0`**（exact match，可接受答案之一）。

### 10.4 清除時寫卡

```js
card = SM2.getOrCreateCard(q)   // 已被 Quiz 答錯更新過
updated = SM2.updateCard(card, judge.q, response_ms)
updated.ease_factor = SM2.computeEF(card.ease_factor, judge.reason)
SM2.upsertCard(updated)
SM2.appendHistory({...})
```

所以同一回合同一張卡會有 **兩次寫入**：Quiz 答錯一次、Power Up 改啱一次。最終狀態由第二次決定。

### 10.5 例子

- rep=5、EF=2.5 的卡：
  - Quiz 答錯 → rep=4、1 天、EF=2.30。
  - Power Up 改啱（快速） → rep=5、30 天、EF=2.40。
- rep=4 的卡：
  - Quiz 答錯 → rep=1、1 天、EF=2.30。
  - Power Up 改啱 → rep=2、3 天、EF=2.40。
- rep=0 的卡：
  - Quiz 答錯 → rep=0、1 天、EF=2.30。
  - Power Up 改啱 → rep=1、1 天、EF=2.40。

### 10.6 +5 EXP

- 每題改啱：`EXP_PER_FIX = 5`。
- 即時本地 `addEntryExp` + 浮字。
- 完成時，如登入，batch `addEntryExp(entry.uid, fixedCount * 5)` 上雲。
- 中途 Quit：本地已加 EXP，但不會 batch 上雲；下次 pull 以 server 為準。

### 10.7 完成

- 全屏「⚡ ALL FIXED!」1.8 秒 → `_captureThenSettle(data)`。
- **不改 `data.score`、不改 `data.results`**；所以：
  - 鑽石／掉落／EXP 分級仍然用 Quiz 第一次提交的分數。
  - Power Up 改啱的題目在 `results` 仍是 `correct:false`，所以 memory bonus 不會計。
  - Gym 的 `allCorrect` 仍然會 fail。

---

## 11. 結算 `App.onSetComplete(data)`

位置：`js/app.js` L1051-L1172。

### 11.1 分數與完美

```js
perfect = data.score === data.total
```

- `score` 來自 Quiz finish（第一次提交）。
- Power Up 改啱不會令 `perfect` 變 true。
- Pet 掉落用 `data.score === data.total`。

### 11.2 EXP 分級

```js
usedHint = data.results.some(r => r.hint)
s = Math.round((data.score / data.total) * 10)
```

| `s` | 無 hint `pct` | 有 hint `pct` |
|---|---|---|
| 10 | 1.00 | 0.50 |
| 9 | 0.90 | 0.40 |
| 8 | 0.80 | 0.30 |
| 5–7 | 0.50 | 0.25 |
| 1–4 | 0.30 | 0.15 |
| 0 | 0.10 | 0.10 |

- `level <= 10`：`pct = max(0.50, pct)`（新手保底 50%）。
- `expGain = max(10, round(span * pct))`。
- `span = levelSpan(dexId, level)`，即該等級升下一級所需 EXP。
- 冇拍檔：`expGain = EXP_BASE = 12`。

### 11.3 記憶 Bonus

```js
memoryCorrect = results.filter(r => r.correct && r.memory).length
memoryBonus = round((expGain / total) * 0.5 * memoryCorrect)
rewards.exp = expGain + memoryBonus
```

- 只有 Quiz 第一次提交答對、且 `memory=true` 的題目才計。
- Power Up 改啱的題目 `correct=false`，不計。
- 拍檔 Faint → `rewards.exp = 0`；`memoryBonus` 仍存在但 UI 不顯示。

### 11.4 鑽石

- 登入：`awardRoundDiamonds(score, total)`（server 權威）。
  - `score == total` → 3
  - `score >= total - 2` → 2
  - `score >= total - 3` → 1
  - else → 0
- 匿名／離線：本地 fallback 用同一門檻。
- 已登入但 RPC 失敗：`rewards.diamonds = 0` + toast，不本地加。
- **Hint 不影響鑽石**；只影響 EXP。

### 11.5 掉落

```js
Pet.rollDrops(data.score === data.total)
```

- 全對 → 復活藥 1 + 高級食物 1（另有 10% 額外復活藥）。
- 非全對 → 普通食物 1（另有 10% 復活藥）。
- Power Up 改啱不會令非全對變全對。

### 11.6 EXP 入帳

- 有拍檔：`addEntryExp(entry, rewards.exp)`；登入再 `SupabaseAuth.addEntryExp`。
- 冇拍檔：`st.pendingExp += rewards.exp`。
- 進化／升級／學招在結算後處理。

### 11.7 Practice Record

`addPracticeRecord(data)` 記錄該回合 `score/total/results` 給日曆用。

---

## 12. 同步與雲端

### 12.1 寫入佇列

`SM2.upsertCard()`：

- 寫 localStorage。
- 如 `Sync.isEnabled()` → `Sync.queueUpsert(card)`。

`queueUpsert` 只推：

```text
account_id, card_id, card_type, next_review_at, interval_days,
ease_factor, repetition, lapse_count, is_mastered, updated_at
```

`SM2.appendHistory()` → `queueHistory` 只推：

```text
account_id, card_id, ts, q_score, response_ms,
levenshtein_distance, is_typo
```

### 12.2 Flush

- 1 秒 debounce。
- `POST /user_cards?on_conflict=account_id,card_id`，必須有 `Prefer: resolution=merge-duplicates`（preop Rule 2）。
- `POST /user_history`（plain insert，沒有 on_conflict）。
- 失敗 → unshift 回佇列，再 schedule。
- `beforeunload` 會 flush。

### 12.3 Pull

- `GET /user_cards?select=*`。
- `GET /user_history?select=...&order=ts.desc&limit=300`。
- 卡片合併：
  - 本地冇 → 用雲端。
  - 兩邊有 → `cloud.updated_at >= local.updated_at ? cloud : local`。
  - 雲端冇但本地有 → 保留本地。
- history 用 `ts + card_id` 去重，唔會 queue 回 server。

### 12.4 Push State

`Sync.pushState()` 仍會全量推 `user_cards` + `user_history`：

- cards 去重 by `card_id`，upsert。
- history plain insert。
- 因為 `user_history` 無 unique constraint，重複呼叫可能產生重複 row。

### 12.5 Schema 注意

- `interval_days numeric(6,2)`：目前最大 30，精度足夠。
- `ease_factor numeric(4,2)`：EF 上限 3.00。
- `next_review_at bigint`：ms epoch。
- `user_cards` 沒有 `state`、`last_reviewed_at`。
- `user_history` 沒有 `hint_count`、`wrong_attempts`、`actual_days_elapsed`、`calculated_next_interval_days`。

---

## 13. 數值例子（由新卡到畢業）

| 情境 | 舊 rep | q | 新 rep | interval | EF | is_mastered | 下次 |
|---|---|---|---|---|---|---|---|
| 新卡答對（快） | 0 | 5 | 1 | 1 天 | 2.60 | false | 1 天後 |
| 新卡答對（慢） | 0 | 3 | 1 | 1 天 | 2.36 | false | 1 天後 |
| 新卡答錯 | 0 | 1 | 0 | 1 天 | 2.30 | false | 1 天後 |
| 新卡 typo | 0 | 2 | 0 | 1 天 | 2.50 | false | 1 天後 |
| 新卡 premature | 0 | 1 | 0 | 1 天 | 2.50 | false | 1 天後 |
| rep=1 答對（正常） | 1 | 4 | 2 | 3 天 | 2.50 | false | 3 天後 |
| rep=2 答對（正常） | 2 | 4 | 3 | 7 天 | 2.50 | false | 7 天後 |
| rep=3 答對（慢） | 3 | 3 | 4 | 15 天 | 2.36 | false | 15 天後 |
| rep=4 答對（快） | 4 | 5 | 5 | 30 天 | 2.60 | true | 30 天後 |
| rep=5 答錯 | 5 | 1 | 4 | 1 天 | 2.30 | false | 1 天後 |
| rep=5 答錯 → Power Up 改啱（快） | 4 | 5 | 5 | 30 天 | 2.40 | true | 30 天後 |
| rep=4 答錯 → Power Up 改啱（快） | 1 | 5 | 2 | 3 天 | 2.40 | false | 3 天後 |
| rep=3 答錯 | 3 | 1 | 1 | 1 天 | 2.30 | false | 1 天後 |

---

## 14. 分析時值得注意的 Quirks

1. **EF 是「死」的排程變數**：有計、有存，但 `nextInterval` 完全不用 EF。間隔只由 repetition + q≥3 決定。
2. **最大間隔 30 天**：沒有長期增長；畢業卡永遠 30 天。
3. **Score 是第一次提交**：Power Up 改啱不影響 score、鑽石、掉落、EXP 分級。
4. **答錯即時寫卡**：Quiz submit 已把卡 reset；Power Up 只是第二次覆寫。中途 Quit 會留下懲罰狀態。
5. **Hint 對 SRS 免費**：用 Hint 後答對，卡片照樣升級；只有 EXP 分級最高 50%。
6. **畢業卡 vs 學習卡 的答錯恢復不對稱**：
   - rep=5 答錯 → rep=4 → 改啱 → rep=5（30 天，完全恢復）。
   - rep=4 答錯 → rep=1 → 改啱 → rep=2（3 天，大幅降級）。
7. **Typo / premature 不扣 EF，但照樣 reset repetition**：因為 `q<3`。
8. **`listNew()` 的「new」包含答錯過的 rep=0 卡**，不是「從未答過」。
9. **`buildSession` 先按 overdue 優先揀 10 題，之後再洗牌**：畫面順序不代表最舊優先。
10. **記憶光芒用 `interval_days` 顯示「幾日前」**，不是實際 elapsed；逾期很久的卡會顯示原本間隔。
11. **Power Up 用 exact match（dist=0）清除**，不是 `q>=3`；所以 typo 一定要改到完全正確。
12. **`user_history` 無 unique constraint**：`pushState()` 重複跑可能產生重複 row；`mergeHistory` 靠 `ts+card_id` 去重。
13. **`interval_days numeric(6,2)`**：目前 1–30 天，不需要小數；但 schema 不是為分鐘級 interval 設計。
14. **`_isCorrect` 是未被呼叫的 dead code**，而且它會 collapse 空格、`computeQ` 不會；submit 用後者。

---

## 15. Formula Appendix

```text
expectedTime(target) = 3500 + 1200 × len(target)        // ms

premature = dist >= 1
         && len(input)/len(target) < 0.5
         && target.startsWith(input)

q = 5 if dist=0 && response <= 0.5 × expected
    4 if dist=0 && response <= 1.5 × expected
    3 if dist=0 && response > 1.5 × expected
    2 if dist=1
    1 if premature or dist>=2

correct = q >= 3

EF' = min(3.0, EF + 0.10)        if perfect_fast
    = EF                         if good_normal / soft_fail_typo / premature_submit
    = max(1.3, EF - 0.14)        if hard_slow
    = max(1.3, EF - 0.20)        if hard_fail

nextRep(rep, q) =
  min(5, rep+1)   if q>=3
  0               if q<3 && rep=0
  4               if q<3 && rep=5
  1               if q<3 && 1<=rep<=4

nextInterval(newRep, q) =
  1               if q<3
  1               if q>=3 && newRep=1
  3               if q>=3 && newRep=2
  7               if q>=3 && newRep=3
  15              if q>=3 && newRep=4
  30              if q>=3 && newRep=5

next_review_at = now + nextInterval × 86400000
is_mastered = nextRep >= 5

s = round(score / total × 10)
expGain = max(10, round(levelSpan × pct(s, usedHint)))
memoryBonus = round((expGain / total) × 0.5 × memoryCorrect)
exp = expGain + memoryBonus

diamonds = 3 if score = total
         = 2 if score >= total - 2
         = 1 if score >= total - 3
         = 0 otherwise
```

---

## 16. Source Map

| 主題 | 檔案 | 行 |
|---|---|---|
| 常量 | `js/sm2.js` | L23-L27 |
| Levenshtein | `js/sm2.js` | L30-L52 |
| 前綴／時間期望 | `js/sm2.js` | L55-L63 |
| computeQ | `js/sm2.js` | L68-L94 |
| computeBestQ | `js/sm2.js` | L98-L109 |
| computeEF | `js/sm2.js` | L112-L120 |
| nextInterval | `js/sm2.js` | L123-L131 |
| nextRepetition | `js/sm2.js` | L134-L140 |
| updateCard | `js/sm2.js` | L143-L159 |
| 卡片／history 儲存 | `js/sm2.js` | L162-L273 |
| buildSession | `js/sm2.js` | L279-L321 |
| Quiz submit | `js/quiz.js` | L284-L346 |
| Quiz hint / skip | `js/quiz.js` | L348-L406 |
| Quiz finish | `js/quiz.js` | L465-L481 |
| 記憶光芒 | `js/quiz.js` | L156-L182 |
| Power Up submit | `js/powerup.js` | L123-L218 |
| Power Up EXP | `js/powerup.js` | L221-L247 |
| Power Up complete | `js/powerup.js` | L251-L302 |
| onQuizFinished | `js/app.js` | L969-L989 |
| onSetComplete | `js/app.js` | L1051-L1172 |
| Sync queue / flush | `js/sync.js` | L61-L135 |
| Sync pull cards | `js/sync.js` | L250-L269 |
| Schema cards | `supabase/supabase-schema.sql` | L43-L56 |
| Schema history | `supabase/supabase-schema.sql` | L59-L69 |
| GAME_CONFIG | `js/data.js` | L7-L21 |
| getAllQuestions | `js/data.js` | L338-L350 |
| drawMixedSet | `js/data.js` | L550-L553 |
