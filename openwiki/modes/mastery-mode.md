---
type: concept
title: Mastery mode
description: Self-paced practice sessions where each answer is graded at once and missed questions return later in a per-attempt queue until mastered or out of tries; covers the queue rules, settings, feedback and explanations, and the masteryState/masteryAnswer RPCs.
tags: [mastery, practice, queue, modes]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T17:47:22.617Z
sources:
  - id: openwiki-source-224e2f79ce2d864ccf06441f
    resource: repo://apps/rpc/src/handlers/AttemptHandlers.ts
  - id: openwiki-source-f89933e9b0881c58cae23486
    resource: repo://apps/rpc/src/modes/mastery.ts
  - id: openwiki-source-ac2a337476c66053f6123dc8
    resource: repo://apps/rpc/src/Quizzes.ts
  - id: openwiki-source-5bd71511bfe65387ac382d29
    resource: repo://packages/contract/src/mastery.ts
  - id: openwiki-source-a0de340f45b3d9775ad2a2df
    resource: repo://packages/contract/src/quiz.ts
generated: { by: "omp", at: "2026-10-09T17:47:22.617Z" }
---

# Mastery mode

A session with `mode = "mastery"` is self-paced practice. Students see one question at a time and get immediate right/wrong feedback; missed questions come back until answered correctly or the tries run out. Engine: `apps/rpc/src/modes/mastery.ts` (`makeMastery`, `advanceQueue`); schemas: `packages/contract/src/mastery.ts`; UI: `apps/web/src/components/mastery-player.tsx`.

## Settings

`quiz_sessions.mastery` (`MasterySettings`, only for mastery sessions):

| Field | Default | Meaning |
|---|---|---|
| `retryLimit` | 3 (max `masteryMaxRetries` = 10) | Tries per question; the first answer counts. |
| `targetPercent` | null | Optional goal shown to the student. |
| `showCorrectAnswer` | true | Reveal the question with its answers after the last wrong try. |

Default integrity for mastery only blocks copying (see [Exam mode](./exam-mode-and-integrity.md)). Each question may carry a markdown `explanation` (also shown with results).

## The queue

Stored on the attempt as `attempts.mastery_queue` (question ids, head = current question), so a reload or another browser resumes exactly. It is created on first read from the attempt's seeded paper order (`attemptPaper`, so pools and shuffling apply).

`advanceQueue(queue, { score }, tries, retryLimit)` after a try on the head:

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
  T[Try graded] --> M{score null<br/>or score ≥ 1?}
  M -- yes --> L[Leave queue<br/>mastered, or waits for teacher]
  M -- no --> R{tries ≥ retryLimit?}
  R -- yes --> F[Leave queue: final, unmastered]
  R -- no --> Q[Reinsert after masteryRequeueGap = 3 others,<br/>or at the end if fewer remain]
```

A **partially correct** answer (0 < score < 1) counts as a miss and comes back. Questions that can't be auto-graded (essay, drawing, code without the runner) are accepted once (`score` null) and wait for the teacher.

## RPCs

Both go through the normal attempt guards (`requireOpen`/`requireWritable`, device and network `guard`) in `AttemptHandlers.ts`, and refuse non-mastery sessions with `Conflict`.

- **`attempt.masteryState`** → `MasteryState`: counts (`total`, `mastered`, `missed`, `pending`, `remaining`), settings, the current `StudentQuestion` (with SQL sample result and signed image URLs), tries used, and `finished`. If the queue is empty the attempt is submitted on read.
- **`attempt.masteryAnswer`** `{ questionId, value, timeSpentMs }` → `{ feedback, state }`:
  1. The question must be the queue head, and the cleaned answer non-empty (`Conflict` otherwise).
  2. Code goes to the runner, SQL to the SQL grader; `autoScore` gives the fraction.
  3. In one transaction the attempt row is locked `FOR UPDATE` and the head re-checked, so a double click or two browsers can't consume the same try. The answer row's `tries` increments, `tries_log` appends `{ value, score, at }`, `code_results` is upserted, and the new queue saved.
  4. Feedback includes tries left, whether the question `returns`, whether it was `final`, the explanation (after a correct answer, or with the reveal), and the full question with answers only if final **and** `showCorrectAnswer`.
  5. The state is re-read after the write; the last answer submits the attempt.

Other attempt RPCs behave differently in mastery: `attempt.paper` sends no questions, `attempt.saveAnswer` is refused, `goTo` and `setMarked` don't apply. On submit, `Quizzes.submit` keeps each mastery answer's stored grade instead of re-grading.

## Results

`attempt.result` adds `{ tries, mastered }` per question for mastery sessions. The live view's `LiveStudent.mastered` counts correct answers so far. Scores use the normal fraction × points rules — a question finally answered correctly earns its full automatic score regardless of earlier misses (the stored `auto_score` is the latest try's). See [Grading](../workflows/grading-and-results.md).
