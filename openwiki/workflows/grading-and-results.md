---
type: workflow
title: Grading, results and exports
description: How attempts are scored — automatic grading on submit, code and SQL checks, manual grading and re-scoring by teachers, how fractions and points are stored, when students see results, exam grade-change logging, typing replay, and the Excel exports and reports built from the same data.
tags: [grading, scoring, results, exports, excel, reports]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T17:47:22.617Z
sources:
  - id: openwiki-source-224e2f79ce2d864ccf06441f
    resource: repo://apps/rpc/src/handlers/AttemptHandlers.ts
  - id: openwiki-source-0fe99b469d773c901e48900f
    resource: repo://apps/rpc/src/handlers/SessionHandlers.ts
  - id: openwiki-source-ac2a337476c66053f6123dc8
    resource: repo://apps/rpc/src/Quizzes.ts
  - id: openwiki-source-ef0652f2b08d8342ea20f58a
    resource: repo://apps/web/src/app/teacher/classes/%5BclassId%5D/attendance/attendance-excel.tsx
  - id: openwiki-source-4646039186bb78ee510b6d19
    resource: repo://apps/web/src/lib/data/reports.ts
  - id: openwiki-source-5a54879bb43f2ef0a53d83d7
    resource: repo://apps/web/src/lib/data/workbooks.ts
  - id: openwiki-source-09efb152d0f0ff4f7bca36b2
    resource: repo://apps/web/src/lib/typing.ts
generated: { by: "omp", at: "2026-10-09T17:47:22.617Z" }
---

# Grading, results and exports

## Score model

Shared pure code in `packages/contract/src/scoring.ts` (details in [Quizzes and questions](../concepts/quizzes-and-questions.md#points-and-scoring)):

- `answers.auto_score`: fraction 0..1 computed by `autoScore`, or null when a teacher or an unrun checker is needed.
- `answers.manual_score`: points set by a teacher; wins over the automatic score and is capped at the question's points.
- `questionScore` = manual, else `auto × points` (rounded to 2 decimals), else null (ungraded).
- `attemptScore` over the student's own seeded paper: total, max, `gradedMax`, `ungraded` count; missing answer rows score 0.

Because automatic scores are fractions, changing a question's points re-scales everyone's automatic score with no migration; manual scores stay in points.

## Automatic grading on submit

`Quizzes.submit` (shared by `attempt.submit`, the 30-second sweep, `session.forceSubmit`, `endSession` and games) — see [API server](../architecture/api-server.md#submitting-attempts-quizzessubmit):

1. Final value per question = submitted value if still changeable, else the last autosave; shapes and sizes cleaned (`cleanAnswer`), drawings limited to the student's own pictures.
2. Code → runner tests; SQL → `runSqlChecks` (sample + hidden data). `null` (no runner, broken question) leaves the question ungraded. See [Code runner and SQL grader](../integrations/code-runner-and-sql-grader.md).
3. Essays and drawings always wait for a teacher.
4. Attempt status: `needs_grading` if any question is ungraded, else `graded`. Answers, `code_results` and `typing_edits` are written in the same transaction that flips the status.

Mastery answers are graded when given and kept as-is ([Mastery mode](../modes/mastery-mode.md)); games store per-answer `auto_score` and are submitted at the end ([Game mode](../modes/game-mode.md)).

## Manual grading (`session.grade`)

Teacher pages: `/teacher/grading` (queue) and `/teacher/grading/<session>` (`grader.tsx`, `drawing-review.tsx`), calling `gradeAnswerAction` → `session.grade { attemptId, questionId, manualScore | null, feedback | null, reason? }`:

- Requires `submission: grade` and that the teacher owns the quiz; the question must belong to the quiz.
- Score is clamped to `[0, points]`; `null` clears the manual score (back to automatic). Empty feedback is stored as null.
- Works for any question type, which is how teachers re-score blank/enumeration near-misses and override code results.
- **Exam audit:** if the session is an exam, the attempt is submitted, and results are visible, any change in the question's effective score requires a `reason` (`Conflict` otherwise) and writes a `grade_changes` row (old/new score in points, who, when).
- After saving, a submitted attempt's status is recomputed (`graded` once nothing is ungraded).

Drawing answers can be marked up: teacher marks are stored as JSON in `answers.feedback` and shown on the student's result.

## When students see results

`resultsVisible(session)` (`Quizzes.ts`):

| `results_release` | Visible when |
|---|---|
| `immediately` | always (after submitting) |
| `after_close` | session status is `ended` |
| `manual` | teacher toggled `session.releaseResults` (`results_released = true`) |

`attempt.submit` returns the score only when visible. `attempt.result` returns the per-question breakdown (answer, points, feedback, mastery tries) only when visible; it always returns the `paperVersion`. `attempt.myScores` reports a score only when visible **and** fully graded, else `pending`. Exams default to manual release.

## Scores elsewhere

- **Class record:** `session.classScores` gives each roster student's latest submitted attempt score (null while anything is ungraded), regardless of release; the web app links these into the grade book ([Classes and class record](../concepts/classes-attendance-and-class-record.md)).
- **Student standing / scores pages** use `attempt.myScores` (release rules apply).
- **Live view** shows a provisional score from checkable answers only.

## Review aids

- **Typing replay** (`apps/web/src/lib/typing.ts`, `components/typing-replay.tsx`): `typing_edits` holds `[ms, from, to, insert]` edits for code, SQL, essay, blank and enumeration answers (≤ 20 000 edits). `replay` rebuilds the text; `analyzeTyping` flags `bulk_insert` (>30 chars at once), `robot_typing` (sustained inhuman speed) and `replay_mismatch` (replay ≠ final answer). Flags feed integrity levels.
- **Code and SQL results** (`code_results`) show per-test output and expected tables.
- **Integrity** pages and comparisons: see [Exam mode and anti-cheating](../modes/exam-mode-and-integrity.md).

## Exports and reports

Session, report and standings workbooks are built on the web server from API data (`lib/data/reports.ts`, `lib/data/workbooks.ts` with `write-excel-file/node`) and served by route handlers with `no-store`; class record, attendance and the question-import template are built in the browser with `write-excel-file/browser`:

| Export | Route | Contents |
|---|---|---|
| Session results | `.../sessions/<session>/export` | Every rostered student: status (Graded / Needs grading / In progress / Not submitted), score, max, percent, integrity level, paper version, submission time, then points per part (null if any question in it is ungraded) and per question in quiz order (null if not on that student's paper). Uses each student's latest submitted attempt. |
| Integrity report | `.../report/<attempt>/export` | Sheets Summary, Timeline, Events, Incidents, Answer history, Grade changes (from `session.examRecord`). Also printable / save-as-PDF page. |
| Game standings | `.../standings/export` | Rank, points, correct, answered, average time. |
| Class record, attendance | class pages | Grade book and monthly/semester attendance workbooks. |

`/teacher/reports` hosts the printable Summary Report on Class Academic Performance (P/F/FA/DR counts per class), and each class has a printable collegiate grade sheet.
