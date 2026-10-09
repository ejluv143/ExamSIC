---
type: concept
title: Quizzes, parts and question types
description: The quiz content model — quizzes, parts and pools, the thirteen question types and their three schema shapes, subjects, points and partial credit, seeded shuffling, automatic scoring, the question bank and spreadsheet import.
tags: [quiz, questions, scoring, shuffle, question-bank, editor]
sources:
  - id: openwiki-source-6eee860fd504f2e3cebcb5f9
    resource: repo://apps/rpc/src/database/schemas/quiz.ts
  - id: openwiki-source-f6a3e0bbdde0fa9128818045
    resource: repo://apps/rpc/src/database/seed.ts
  - id: openwiki-source-c7b736b192777d9870ef29fe
    resource: repo://apps/rpc/src/handlers/QuizHandlers.ts
  - id: openwiki-source-41a35320e5293662f5588e03
    resource: repo://apps/web/src/lib/question-defaults.ts
  - id: openwiki-source-5a88b3084506a72790c5b315
    resource: repo://apps/web/src/lib/question-import.ts
  - id: openwiki-source-bf6543f63a08896ebc92aef6
    resource: repo://apps/web/src/lib/quiz-editor.ts
  - id: openwiki-source-7a2b38b8fd3990cc2eacf06d
    resource: repo://apps/web/src/lib/subjects.ts
  - id: openwiki-source-c7fd7054fd7b185e3e4575ac
    resource: repo://packages/contract/src/question.ts
  - id: openwiki-source-cddfdde28283e197871947a1
    resource: repo://packages/contract/src/scoring.ts
  - id: openwiki-source-4b0c9b1740f95ba3fbc9cdcf
    resource: repo://packages/contract/src/shuffle.ts
generated: { by: "omp", at: "2026-10-09T18:11:05.062Z" }
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T18:11:05.062Z
---

# Quizzes, parts and question types

A **quiz** is reusable content owned by a teacher. A **session** is one run of it (mode, schedule, rules) and an **attempt** is one student's go at a session — see [Session and attempt lifecycle](../workflows/session-and-attempt-lifecycle.md). A quiz with no session shows as Draft.

## Model

| Entity | Schema (`packages/contract`) | Table | Key fields |
|---|---|---|---|
| Quiz | `Quiz` (`quiz.ts`) | `quizzes` | `title`, markdown `description`, `subject` + `subjectArea`, printed-paper `header`/`paper`, `settings` (`shuffleQuestions`, `shuffleChoices`, `shuffleParts`). |
| Part | `QuizPart` | `quiz_parts` | `position`, `title`, markdown `instructions`, `shuffleQuestions`, `poolSize` (draw N per student; null = all). |
| Question | `Question` (`question.ts`) | `questions` | Base columns (`prompt`, `points`, `gamePoints`, `partialCredit`, `topic`) + type-specific `body` jsonb. |
| Bank question | — | `bank_questions` | Whole `Question` jsonb; `owner_id` null = shared with everyone. |

### Three shapes per question type

`question.ts` defines each type three ways, and a new type is added by writing all three and listing it in `questionTypes` and the unions:

1. **Teacher question** (`Question`): base fields + type fields including answers.
2. **Body** (`QuestionBody`): just the type fields, stored in `questions.body`. `QuizHandlers.questionRow` splits a question into columns + body; `Quizzes.toQuestion` merges them back.
3. **Student question** (`StudentQuestion`): built by `toStudentQuestion`, which copies fields **by name** so a field added to the teacher shape is never leaked to students by accident. Cloze dropdowns and word banks are shuffled with the paper's RNG, or sorted when choices aren't shuffled, so their order never gives the answer away.

### Question types

`multiple_choice`, `true_false`, `blank` (`fill` or `cloze`; blanks written inline as `{{answer|alt}}`, see `blanks.ts`), `matching`, `enumeration`, `numeric` (fractions, mixed numbers, percents parsed by `numbers.ts`; `tolerance`), `essay` (rubric rows), `code` (python, java, cpp, c, javascript, php; visible and hidden tests; optional PHP `database`), `sql` (`setupSql`, hidden `answerSql`, optional `hiddenDataSql`), `drawing` (canvas and/or up to three photos, rubric), `categorization`, `ordering`, `hotspot` (rect/ellipse regions in 0..1 coordinates, `maxClicks`, `tolerance`).

Placement-type answers (categorization, ordering, hotspot) and drawings are stored as JSON text in the ordinary answer value; `placement.ts` and `drawing.ts` hold the shared parsers and hit tests.

Images (prompts, choices, matching items, hotspot and drawing backgrounds) are asset ids with required alt text — see [Asset storage](../integrations/asset-storage.md).

### Subjects

`apps/web/src/lib/subjects.ts#questionTypesFor` decides which types the editor offers per subject area (`general`, `english`, `math`, `science`, `programming`); every subject gets multiple choice, blank, matching and enumeration. "Show all question types" in the editor lifts the limit; the API doesn't enforce it. Classes without a subject area get one from `guessSubjectArea` (course code/title keywords). The README's per-subject list is a summary and differs in details; the code is authoritative.

## Points and scoring

`scoring.ts` is shared by the API (grading on submit) and the web app (display):

- **Points** are whole or half numbers. A question's points are split over its **units** (blanks, pairs, listed items, categorization items, positions, regions, tests) equally or by `weights`.
- **`autoScore`** returns a fraction 0..1, or `null` when a teacher (essay, drawing) or an unrun checker (code/SQL without results) is needed. `weightedFraction` gives 1 when all units are right, 0 with `partialCredit` off and anything wrong, otherwise the weighted share.
- Enumeration without `orderMatters` credits each key item once, so repeating an answer doesn't score twice. Numeric allows `tolerance` + 1e-9. Hotspot without partial credit scores 0 if any marker lands outside every region.
- **`questionScore`**: a teacher's `manualScore` (points, capped at the question's points) wins over `autoScore × points`.
- **`attemptScore`**: questions without an answer row score 0; returns `score`, `max`, `gradedMax` (for provisional percentages) and `ungraded` count.

Storing automatic scores as fractions and manual scores as points means changing a question's points rescales everyone's automatic score. See [Grading](../workflows/grading-and-results.md).

## Seeded shuffling (`shuffle.ts`)

Each attempt has a numeric `seed`. `orderForAttempt(settings, parts, seed)` uses `mulberry32(seed)` to:

1. shuffle parts if `shuffleParts`;
2. draw `poolSize` questions per pool part;
3. shuffle questions if the quiz or the part says so;
4. shuffle multiple-choice choices and the matching right column if `shuffleChoices`.

`paperRandom(settings, seed, questionId)` derives a per-question generator (independent of which other questions were drawn) for cloze lists and categorization items. The same seed always yields the same paper, so reloads are stable and the teacher sees exactly what the student saw; answers are keyed by question id, so order never affects scoring.

`quizTotals` counts a pool as its draw size × the first question's points — every question in a pool must have the same points (the editor's `withPoolPoints` enforces this).

## Saving quizzes (API)

`QuizRpcs` (`quiz.list/get/save/remove/duplicate/bank`) in `QuizHandlers.ts`:

- All operations are owner-scoped; another teacher's quiz is `NotFound`.
- `quiz.save` takes a whole `QuizDraft` and rewrites quiz, parts and questions in one transaction. Ids the quiz already owns are kept; any other id (e.g. the editor's `new-…` local ids) gets a fresh one.
- `quiz.duplicate` saves a copy as a new quiz ("(copy)"), re-iding everything but reusing the same image assets.
- `quiz.bank` returns shared bank questions plus the teacher's own. The bank is only written by the seed script (`database/seed.ts` from `seed-data/question-bank.json`).

## Editor (web)

`apps/web/src/lib/quiz-editor.ts` converts between `QuizDetail` and the editor's `EditorQuiz` (`toEditorQuiz`, `toDraft`) and holds editing helpers (`withPoints` rescales rubrics, pool point rules, `moveQuestion`, `partHeading` "Part II – Matching", answer summaries for the Table view). A paper whose header has a grading period prints as an exam.

`lib/question-defaults.ts` creates new questions (`newQuestion`) and runs `validateQuestion` before a quiz can be saved. For code questions it also checks the tests against the runner's limits (`codeRunnerProblem` from the contract, leaving room for the longest code a student may send): more than 30 tests, an over-long input, over-long PHP tables, or inputs that add up past the request limit block the save, because the runner would refuse every answer and leave it for the teacher. See [Code runner](../integrations/code-runner-and-sql-grader.md).

`lib/question-import.ts#parseQuestionSheet` turns spreadsheet rows into questions using Wayground (Quizizz) import-template columns plus optional Points and Topic, returning per-row problems instead of failing the whole file.
