---
type: mode
title: Mastery mode
description: Self-paced practice where every answer is graded at once and a miss comes back later in a per-attempt queue until it is right or out of tries — the queue stored on the attempt, the requeue rule, feedback and reveal rules, target score, the mastery player, and how the mode bypasses the normal paper, autosave and submit.
tags: [mastery, practice, queue, feedback, self-paced]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-40d22ad72f9a8713622ec657
    resource: repo://apps/rpc/src/features/attempt/Saving.ts
  - id: openwiki-source-268806dbc9bd1c40f9617d2c
    resource: repo://apps/rpc/src/features/attempt/Service.ts
  - id: openwiki-source-6a51aa0bd83d4cdbd669470f
    resource: repo://apps/rpc/src/features/attempt/Taking.ts
  - id: openwiki-source-2862d967540eca977a1bc099
    resource: repo://apps/rpc/src/features/mastery/Repo.ts
  - id: openwiki-source-b2412cad44af0d4f43fa805c
    resource: repo://apps/rpc/src/features/mastery/rules.ts
  - id: openwiki-source-0bceb7bb6b6432fefcb3fe64
    resource: repo://apps/rpc/src/features/mastery/Service.ts
  - id: openwiki-source-2439abf41ad139c271196c88
    resource: repo://packages/domain/src/mastery.ts
  - id: openwiki-source-f825629ddf361d1c437c7461
    resource: repo://packages/domain/src/quiz.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Mastery mode

A session in `mastery` mode is practice: the student answers one question at a time, learns at once whether it was right, and misses return later in the queue until they are answered correctly or the retry limit is used up. There is no paper to page through and nothing to "submit" by hand; the attempt hands itself in when the queue is empty. Like every mode it starts from the lobby (see [Session lifecycle](../workflows/session-and-attempt-lifecycle.md)).

## Settings (`packages/domain/quiz.ts#MasterySettings`)

`retryLimit` (1–10, default 3), `targetPercent` (optional goal shown to the student), `showCorrectAnswer` (default on). Defaults apply when a session has no `mastery` settings (`rules.ts#settingsOf`). Mastery's integrity defaults block only copying (see [Exam mode](exam-mode-and-integrity.md)).

## The queue (`features/mastery`)

- **Stored on the attempt** (`attempts.mastery_queue`) and created on the first `attempt.masteryState` read from the attempt's seeded paper order, so reloads and other browsers resume at the same place.
- `MasteryState` tells the student the question to answer now (as a `StudentQuestion`), how many tries it has had, the remaining count, mastered/missed totals, the target and whether they are finished.
- **After a try** (`rules.ts#advanceQueue`): a fully correct answer or one nobody can auto-grade (`score === null`: essays, drawings, code without checker) leaves the queue; a miss on the last allowed try leaves as **final**; any other miss — including partial credit — is reinserted **after three other questions** (`masteryRequeueGap`) or at the end when fewer remain.
- `attempt.masteryAnswer` runs in a transaction that locks the attempt row (`FOR UPDATE`) and re-checks that the question is still the head of the queue, so a double click or two tabs can't take the same try twice; a stale question answers `Conflict` "That isn't the question you're on." Every try is appended to the answer's `tries_log` with its value, score and time, and the answer row keeps the latest value and score, so results and grading see the final state.
- Reading the state when the queue is empty submits the attempt through the normal `AttemptService.submit`, which for mastery keeps the stored per-try grades instead of re-grading.

## Feedback

`MasteryFeedback` after each try: correct / partly / wrong, the score fraction, tries used and left, whether the question returns, and:

- the **explanation** after a correct answer, or together with the reveal;
- the **revealed question** (`toRevealQuestion`: the answers, but not grading secrets such as hidden tests or accepted-answer lists beyond what the student should see) only after the **final** wrong try and only when `showCorrectAnswer` is on; image URLs for the revealed question are signed for the student.

## How the mode bypasses the normal flow

- `attempt.paper` sends no questions and no saved answers in a mastery session; the player (`features/mastery/components/mastery-player.tsx`) drives everything through `masteryState`/`masteryAnswer`.
- `attempt.saveAnswer` is refused ("Mastery answers are graded one at a time"); `goTo` and marking don't apply (no one-question-at-a-time paging).
- The result page shows the final per-question state and the target; the teacher's results, grading and class record treat the attempt like any other (see [Grading and results](../workflows/grading-and-results.md)).
