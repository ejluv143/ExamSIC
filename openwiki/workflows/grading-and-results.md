---
type: workflow
title: Grading and results
description: What happens to an attempt from submit to a released result — automatic grading with the code runner and SQL grader, essays and unchecked code waiting for the teacher, session.grade with clamping and the post-release audit, AI suggestions, the results-release rules and when the answer key shows, the student's result and scores pages, class scores, the coach report, and the Excel exports.
tags: [grading, results, release, scoring, exports, analytics, coach]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-2d1c3b0258ee1f228b2c3a57
    resource: repo://apps/rpc/src/features/attempt/Repo.ts
  - id: openwiki-source-a05ef15a6577785cb02aa0f7
    resource: repo://apps/rpc/src/features/attempt/Results.ts
  - id: openwiki-source-268806dbc9bd1c40f9617d2c
    resource: repo://apps/rpc/src/features/attempt/Service.ts
  - id: openwiki-source-a1bd48a4d0298464f4ff55fb
    resource: repo://apps/rpc/src/features/session/Repo.ts
  - id: openwiki-source-ebdde1eab61dc6001d9e8a56
    resource: repo://apps/rpc/src/features/session/Reports.ts
  - id: openwiki-source-54300c5adac542f56caf322a
    resource: repo://apps/rpc/src/features/session/rules.ts
  - id: openwiki-source-6cef468e668627608a62be99
    resource: repo://apps/web/src/features/attendance/components/attendance-excel.tsx
  - id: openwiki-source-aa017ddc7a1501c9a682c2b4
    resource: repo://apps/web/src/features/session/data.ts
  - id: openwiki-source-2e7677f6440c603a308b41ef
    resource: repo://apps/web/src/features/session/workbooks.ts
  - id: openwiki-source-09efb152d0f0ff4f7bca36b2
    resource: repo://apps/web/src/lib/typing.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Grading and results

## On submit (`features/attempt/Service.ts#submit`)

Submitting (by the student, the timer, the teacher or the end of the session) grades every question of the attempt's paper once:

1. The final value per question: the submitted one, else the autosaved one (mastery attempts keep the per-try grades already stored).
2. Questions with a checker are run: code through `Runner.runTests`, SQL through `runSqlChecks` (see [Code runner and SQL grader](../integrations/code-runner-and-sql-grader.md)); results are stored in `code_results`.
3. `autoScore` per question (see [Quizzes and questions](../concepts/quizzes-and-questions.md)) — `null` for essays, drawings, and code/SQL nothing could check.
4. The attempt is `graded` when nothing is ungraded, else `needs_grading`. The update is conditional on the attempt still being `in_progress`, so concurrent submits grade once. The live hub tells the teacher.

## Teacher grading (`features/session/Reports.ts#grade`)

`session.grade { attemptId, questionId, manualScore, feedback, reason? }` (owner teacher, `result: grade`):

- the score is in **points**, clamped to `0 … question.points`; `null` clears it so the automatic fraction applies again;
- in **exam** sessions whose results are visible, changing a submitted answer's effective score requires a **reason** (`Conflict` otherwise) and is appended to `grade_changes` with old and new points and who changed it;
- after saving, a submitted attempt's status is recomputed: `graded` once nothing is ungraded, else `needs_grading`.

AI can draft the score and feedback for essays (`ai.suggestGrade`); applying a suggestion is an ordinary `session.grade`. See [AI assistance](../integrations/ai-assistance.md).

## Release and visibility (`features/session/rules.ts`)

`resultsVisible(session)` by `results_release`: `immediately`; `after_close` — once the session has ended; `manual` — after `session.releaseResults` (`result: release`). `answerKeyVisible` is stricter: the key (correct answers, explanations) shows only when results are visible, no attempt is in progress, and the session has ended or the student has used every attempt (including granted retakes), so a student can't see the key and retake for full marks.

## What students see (`features/attempt/Results.ts`)

- `attempt.result`: the latest attempt's summary and per-question breakdown only when visible; otherwise just the status. Untouched questions score 0; graded-later ones show as pending. Images in the revealed questions are signed for the student.
- `attempt.myScores`: one row per session; a score shows only when visible **and** fully graded, else `pending`.
- `attempt.coach`: the AI or rule-based coach report on a released result (see [AI assistance](../integrations/ai-assistance.md)). `packages/domain/analytics.ts` builds the per-topic analytics (`resultTelemetry`, `analyzeAttempt`, `weakestTopic`) the coach and the result page use.

## What teachers see

- The session page's results tab: per student (latest submitted attempt, `attempt-view.ts#latestSubmitted`) score, status, time and integrity level with sortable headers; question difficulty and topic mastery; the grading queue of ungraded answers; the anti-cheating report (see [Exam mode](../modes/exam-mode-and-integrity.md)).
- `session.classScores { classId }` (`Reports.ts`): for each of the teacher's sessions of a class, each roster student's latest submitted attempt score — `null` while anything is ungraded — **regardless of release**; it feeds the class record and the MCP `class_overview`.

## Exports

| Workbook | Built | Contents |
|---|---|---|
| Session results (`resultsWorkbook`) | web server (`write-excel-file/node`, `features/session/workbooks.ts`), route handler with `no-store` | every rostered student: status, score, integrity level, paper version, points per part and per question, from the latest submitted attempt |
| Integrity report (`reportWorkbook`) | web server | one student's events, incidents and answer history |
| Game standings (`gameWorkbook`) | web server | ranks, points, correct counts |
| Class record, attendance | browser (`record-editor.tsx`, `attendance-excel.tsx`) | see [Classes, attendance and the class record](../concepts/classes-attendance-and-class-record.md) |
