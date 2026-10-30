---
name: post-fix-lesson-capture
description: After fixing a bug or completing a modification that revealed a reusable pitfall, automatically append the lesson to the project skills without being asked. Use whenever you finish debugging or fixing something in this repo. Do not use for generic knowledge the model already knows or for one-off typos.
---

# Post-Fix Lesson Capture

Whenever you finish fixing a bug, patching a regression, or completing a modification that exposed a **reusable pitfall** (a gotcha that would bite you again on the next similar change), append the lesson to the project skills — do not wait to be asked.

## Trigger

Run this after a fix lands and passes verification, when any of these are true:

- The bug was caused by a repo-specific assumption or ordering issue (e.g. a field derived before its data source loaded).
- A "should have been obvious from the docs" fact was actually undocumented.
- You had to read multiple files to learn a non-obvious constraint.
- The fix involved a workaround that future you would need to remember.

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
2. Check the target `SKILL.md` for an existing rule that already says it — if yes, do nothing.
3. If missing, append a new rule. Use the next sequential `Rule N` number.
4. Keep it executable: state the trigger condition, the mandatory action, and the failure mode if skipped.
5. No commit needed unless the user asks.

## Quality bar

- A future agent reading only the new rule should be able to avoid the bug without re-debugging.
- If the lesson spans more than one scope (e.g. both a data-loading race and a cloud sync quirk), split into two short rules rather than one long paragraph.
