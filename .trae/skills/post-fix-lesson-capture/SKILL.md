---
name: post-fix-lesson-capture
description: After the user corrects you, the same mistake recurs, or you hit an undocumented repo pitfall, add a short Rule to the right PokeEngmon topic skill (via the preop index) in the same turn. Ordinary bug fixes need no Rule. Also defines how skill files are structured.
---

# Post-Fix Lesson Capture

慳 token（2026-11-08 用戶要求）：**普通 bug 修完唔使加 Rule**。只有下面 Trigger 先寫，而且寫得短。每加一條，之後每次讀 skill 都要多付 token，所以寧缺勿濫。

## Trigger

Only when one of these is true:

- The user had to correct you, or the same class of mistake happened a **second time**.
- You hit a repo-specific pitfall that is undocumented and would very likely bite again on the next similar change (not just "took a while to find").

Do **not** capture:

- Generic language/tool knowledge (e.g. "PowerShell uses `;` not `&&`").
- One-off typos, rename-only refactors, or cosmetic tweaks.
- Anything already covered by an existing skill rule.

## Where to write

- PokeEngmon repo（2026-11-06 起按題目拆咗 skill）：
  1. 喺 `.trae/skills/pokeengmon-preop-checklist/SKILL.md` 嘅索引表揀題目 skill（workflow／supabase／auth／game-data／battle／quiz／ui-sheets／responsive）。
  2. `references/incidents.md` **唔使寫**（用戶要求先寫事故經過）。
  3. 題目 skill 嘅 `SKILL.md` 加同一個 `### Rule N — 標題` ＋ 要點 bullet（觸發條件、必做、唔做嘅後果）；規則本身變咗就改現有要點。
  4. preop checklist 加 `## Rule N — 標題` ＋ 一行 `→` 指向，同埋更新索引表嘅 Rule 欄。
  5. 冇合適題目：加入最接近嗰份；真係新範疇先開新 skill（跟下面「Skill 檔案結構規範」），再加入索引表。
- N = preop checklist 入面最大號 + 1（編號全 repo 唯一）。
- Keep each rule to a few lines in `SKILL.md`. Full code blocks only go into `references/incidents.md` unless they are the exact guard future edits must copy.

## Process

1. After the fix and its verification pass, identify the **one reusable lesson** (the single thing that, if known earlier, would have prevented the bug).
2. Check the topic skill's `SKILL.md` (and the preop index) for an existing rule that already says it — if yes, do nothing (and cite it).
3. If missing, add the new rule to the topic `SKILL.md` (2–4 bullets) and one heading line in the preop index. Use the next sequential `Rule N` number.
4. Keep it executable: state the trigger condition, the mandatory action, and the failure mode if skipped.
5. When you did add one, mention `Skill: Rule N added` at the end. No Rule added → no `Skill:` line needed.
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
