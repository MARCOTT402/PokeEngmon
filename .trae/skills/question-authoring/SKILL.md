---
name: question-authoring
description: Question-authoring rules for PokeEngmon. Read before adding or generating rows in questions.csv or picture_words.csv — covers CSV formats, keyword rules, image naming, TTS, and SRS key prefixes.
---

# PokeEngmon Question-Authoring Checklist

Read this file FIRST, before adding, generating, or editing rows in any question CSV under `Q_folder/` (currently `questions/questions.csv` for sentence questions and `picture_words/picture_words.csv` for word/image questions). Format mistakes here break import silently or produce wrong arrows/hints in-game.

## Rule 0 — All question files live under `Q_folder/`; one subfolder per question type

All question data and their images are consolidated under a single top-level folder so new question types can be added consistently:

```
Q_folder/
├── <type>/
│   ├── <type>.csv            ← question data for this type
│   └── <type>_images/        ← (optional) per-question images
```

Current types:
- `questions/` — sentence (fill-in-the-blank) questions → `questions.csv` + `questions_images/`
- `picture_words/` — word/image dictation questions → `picture_words.csv` + `picture_words_images/`

**Adding a new question type:**
1. Create `Q_folder/<newtype>/`
2. Put `<newtype>.csv` inside (plus `<newtype>_images/` if it needs images)
3. Wire it into `js/data.js`: add a `fetch("Q_folder/<newtype>/<newtype>.csv")` loader and a parser, mirroring `loadSiteQuestions()` / `loadPictureWords()`
4. If the CSV carries an `Image` column, store the **full repo-root-relative path** in each row, e.g. `Q_folder/picture_words/picture_words_images/cat.webp` — not just the filename.
5. Service Worker (`sw.js`): add `./Q_folder/<newtype>/<newtype>.csv` to the `ASSETS` array so the CSV works offline.

## Rule 1 — Sentence-question CSV has a fixed 8-column header

`questions.csv` must keep this exact header, one question per line, UTF-8, no blank lines:

```
編號,課題,題型,難度,句子,答案,關鍵詞,提示
```

- 編號 — 5 digits (e.g. `00001`), unique, maps to `Q_folder/questions/questions_images/00001.png`. May be left blank (blank = no image).
- 難度 — integer `1`–`5`; the quiz shows that many ★.
- 句子 — complete English sentence containing exactly one `___` (three underscores, not `____`/`__`/`……`). A hint word may follow the blank, e.g. `___(go)`.
- Any field containing a half-width comma must be wrapped in double quotes. Full-width `，` needs no quoting.

## Rule 2 — Answer column: `/` separates acceptable answers; blank = zero-article

- Multiple acceptable answers are separated by `/` (e.g. `were not / weren't`). `\|` also works.
- Zero-article questions (correct action = fill in nothing) leave the answer column COMPLETELY EMPTY — never write `X`, `-`, or `none`.
- Only zero-article rows may have an empty answer; every other row must have one.
- Answers must not contain commas — rewrite the answer instead.

## Rule 3 — Keywords: split by `/`, must exist verbatim in the sentence

- The 關鍵詞 column supports multiple keywords split by `/` — each gets its own arrow pointing to the blank.
- Matching is case-insensitive and ignores bracketed annotations like `(go)`.
- Every keyword MUST appear in the sentence text. Most common authoring mistake:
  - ❌ `did ... last summer` (not a contiguous string) → ✅ `did / last summer`
  - ❌ Using the answer (e.g. `went`) as a keyword when the sentence only shows `___`
- Prefer the first content word after the blank (it usually determines the answer), e.g. `This is ___ apple.` → `apple`.
- If no good keyword exists, leave the column empty — never stuff in words absent from the sentence.

## Rule 4 — 課題/題型/提示 are English-only; all game UI is English-only

- 課題 (topic), 題型 (question type), and 提示 (hint shown on wrong answer) must be in English.
- Keep the spelling of a 課題/題型 byte-for-byte consistent across rows (e.g. always `Past Tense`, never `Past tense`) — the app groups by exact string.
- Hints should be short, avoid grammar jargon, and lead with examples, e.g. `Past tense of go is went.`
- One CSV batch usually holds 1–5 課題, each with 2–6 題型.

## Rule 5 — Import auto-dedupes on sentence+answer

The CSV importer deduplicates on the (sentence, answer) combo. Re-importing a CSV that overlaps with existing rows is safe — duplicates are skipped, so don't hand-delete overlap before merging batches.

## Rule 6 — Sentence-question images: `Q_folder/questions/questions_images/` named by 編號

- Images for sentence questions live in `Q_folder/questions/questions_images/` and are named by the 5-digit question number: `Q_folder/questions/questions_images/00001.png`.
- Accepted extensions: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`.
- No image needed? The 編號 can stay filled — the app just skips missing files.

## Rule 7 — Image-question CSV: `picture_words.csv` column order

Word/image questions use a different CSV with this exact header:

```
Word,Level,Course,Type,Category,Image,Accept,Source
```

Do not reuse the sentence-question 8-column format here.

## Rule 8 — Word-question images: `Q_folder/picture_words/picture_words_images/` named by the word

Images for word questions live in `Q_folder/picture_words/picture_words_images/` and are named by the word itself (not a number). One image per word, reused wherever that word appears.

## Rule 9 — Word-image TTS: Azure Jenny, rate −10%, per-word cache

- TTS for word/image questions uses Azure voice `en-US-JennyNeural` at rate `-10%`.
- Audio is stored per-word under `Q_folder/picture_words/picture_words_audio/` named `<word>.mp3` (lowercase, spaces → `_`) and reused across questions — generate once per word, never per-question. The path is built by `wordAudioURL()` in `js/data.js`.

## Rule 10 — SRS keys for word/image questions use the `w:` prefix

Spaced-repetition keys for word/image questions are prefixed `w:` so they never collide with sentence-question keys. When authoring or debugging SRS data, keep this prefix intact.

## Rule 11 — Every question type must share the same answer feedback（答對／答錯回應）

Adding a new question type means it must feel identical to sentence questions when the player answers.

- All correct / wrong / almost feedback goes through **`Quiz._showFeedback(kind, text)`** in `js/quiz.js` — `kind` is `"correct" | "warn" | "wrong"`.
- It applies, in one place: input green/red state, correct/wrong SFX, `#quiz-feedback` text + colour, and (for word questions) the same text on `#quiz-word-status` plus the green/red state on `#quiz-word-card`.
- ❌ Never write a second feedback path (own DOM element, own text, own sound) for a new type — that is exactly how picture questions drifted from sentence questions.
- For a new type, extend `_showFeedback` with that type's own surface (like the `q.type === "word"` branch) instead of bypassing it.
- If a type has no sentence card, mirror the feedback onto its own question surface so the player sees the same reaction.

## Pre-import self-check (per row of questions.csv)

- [ ] Exactly 8 columns
- [ ] 編號 is 5 digits, unique (if filled)
- [ ] Sentence contains `___` (exactly three underscores)
- [ ] 難度 is an integer 1–5
- [ ] Answer filled — empty only for zero-article (no `X` marker)
- [ ] 課題, 題型, 提示 all in English
- [ ] Every keyword (split by `/`) appears verbatim in the sentence
- [ ] Fields with half-width commas are wrapped in double quotes
