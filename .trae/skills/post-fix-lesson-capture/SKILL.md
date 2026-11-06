---
name: post-fix-lesson-capture
description: HARD requirement — after ANY fix, correction, or second attempt at a problem, append the lesson to the right PokeEngmon topic skill (via the preop index) automatically, in the same turn, before reporting the fix as done. Includes process/workflow lessons, not just code gotchas. Also defines how skill files are structured.
---

# Post-Fix Lesson Capture

Whenever you finish fixing a bug, patching a regression, or completing a modification that exposed a **reusable pitfall** (a gotcha that would bite you again on the next similar change), append the lesson to the project skills — do not wait to be asked.

**This is part of "done", not an optional extra.** A fix is not complete until the skill file is updated (or you can name the existing rule that already covers it). Report the rule number in the same message as the fix.

## Trigger

Run this after a fix lands and passes verification, when any of these are true:

- The user had to correct you, or the same class of mistake happened a **second time** — this is the strongest signal; capture it immediately.
- The bug was caused by a repo-specific assumption or ordering issue (e.g. a field derived before its data source loaded).
- A "should have been obvious from the docs" fact was actually undocumented.
- You had to read multiple files to learn a non-obvious constraint.
- The fix involved a workaround that future you would need to remember.
- The lesson is **process/workflow** level (e.g. "verify migration syntax by counting block terminators before running", "test X before claiming done") — process lessons count, and are usually the most valuable.

Do **not** capture:

- Generic language/tool knowledge (e.g. "PowerShell uses `;` not `&&`").
- One-off typos, rename-only refactors, or cosmetic tweaks.
- Anything already covered by an existing skill rule.

## Where to write

- PokeEngmon repo（2026-11-06 起按題目拆咗 skill）：
  1. 喺 `.trae/skills/pokeengmon-preop-checklist/SKILL.md` 嘅索引表揀題目 skill（workflow／supabase／auth／game-data／battle／quiz／ui-sheets／responsive）。
  2. 題目 skill 嘅 `references/incidents.md` 尾加 `### Rule N — 標題` ＋ 事故經過（背景、原因、修法）。
  3. 題目 skill 嘅 `SKILL.md` 加同一個 `### Rule N — 標題` ＋ 要點 bullet（觸發條件、必做、唔做嘅後果）；規則本身變咗就改現有要點。
  4. preop checklist 加 `## Rule N — 標題` ＋ 一行 `→` 指向，同埋更新索引表嘅 Rule 欄。
  5. 冇合適題目：加入最接近嗰份；真係新範疇先開新 skill（跟下面「Skill 檔案結構規範」），再加入索引表。
- N = preop checklist 入面最大號 + 1（編號全 repo 唯一）。
- Keep each rule to a few lines in `SKILL.md`. Full code blocks only go into `references/incidents.md` unless they are the exact guard future edits must copy.

## Process

1. After the fix and its verification pass, identify the **one reusable lesson** (the single thing that, if known earlier, would have prevented the bug).
2. Check the topic skill's `SKILL.md` (and the preop index) for an existing rule that already says it — if yes, do nothing (and cite it).
3. If missing, add the new rule in all three places above. Use the next sequential `Rule N` number.
4. Keep it executable: state the trigger condition, the mandatory action, and the failure mode if skipped.
5. Write it **before** sending your "fixed" message, and end that message with `Skill: Rule N added` or `Skill: already covered by Rule N`.
6. If the user says "you didn't add a skill" / "that's not the lesson" — the capture you made was too narrow. Widen it: record the workflow failure (e.g. "I only capture after being asked") as its own rule, not just the technical detail.
7. No commit needed unless the user asks.

## Quality bar

- A future agent reading only the new rule should be able to avoid the bug without re-debugging.
- If the lesson spans more than one scope (e.g. both a data-loading race and a cloud sync quirk), split into two short rules rather than one long paragraph.

## Skill 檔案結構規範（2026-11-06 起，所有 `.trae/skills/*` 適用）

- **`SKILL.md` = 現行規則**：做法、清單、驗證方法；目標 ≤ 250 行。agent 觸發 skill 就會成份讀入，唔好塞歷史。
- **`references/*.md` = 細節同歷史**：事故原文（`references/incidents.md`）、長 code 範例、各引擎／平台細節。`SKILL.md` 要寫明幾時先去開邊份。
- **事故（Incident）寫入 references**；只有「規則本身變咗」先改 `SKILL.md` 正文。同一題目嘅規則唔好散喺幾份 skill——有一份「唯一來源」，其他地方只留一行指向。
- 搬內容一定**原文搬、唔刪**，搬完逐字比對；舊位置留標題＋指向（例如 preop `## Rule N — 標題` 唔可以刪，編號有人引用）。
- 範例：`pokeengmon-responsive/`（`SKILL.md` 230 行＋`references/incidents.md`）、`game-ui-ux/`（`references/layout-and-flow.md`）。
