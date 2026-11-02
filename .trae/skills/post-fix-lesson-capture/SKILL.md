---
name: post-fix-lesson-capture
description: HARD requirement — after ANY fix, correction, or second attempt at a problem, append the lesson to the project skill automatically, in the same turn, before reporting the fix as done. Includes process/workflow lessons, not just code gotchas.
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

- PokeEngmon repo → `.trae/skills/pokeengmon-preop-checklist/SKILL.md`
  - Add a new `Rule N` section at the end, or extend the closest existing rule.
  - Follow the existing rule shape: one-line title, short background, concrete "do this / do not do this" bullets, version/incident tag if relevant.
- Keep each rule to a few lines. Do not paste full code blocks unless they are the exact guard/snippet future edits must copy.

## Process

1. After the fix and its verification pass, identify the **one reusable lesson** (the single thing that, if known earlier, would have prevented the bug).
2. Check the target `SKILL.md` for an existing rule that already says it — if yes, do nothing (and cite it).
3. If missing, append a new rule. Use the next sequential `Rule N` number.
4. Keep it executable: state the trigger condition, the mandatory action, and the failure mode if skipped.
5. Write it **before** sending your "fixed" message, and end that message with `Skill: Rule N added` or `Skill: already covered by Rule N`.
6. If the user says "you didn't add a skill" / "that's not the lesson" — the capture you made was too narrow. Widen it: record the workflow failure (e.g. "I only capture after being asked") as its own rule, not just the technical detail.
7. No commit needed unless the user asks.

## Quality bar

- A future agent reading only the new rule should be able to avoid the bug without re-debugging.
- If the lesson spans more than one scope (e.g. both a data-loading race and a cloud sync quirk), split into two short rules rather than one long paragraph.
