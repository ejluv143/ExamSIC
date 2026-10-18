---
type: concept
title: Quizzes and questions
description: The quiz model (parts, pools, shuffling, totals), the thirteen question types and the QuestionKind registry that owns their schemas, student view, scoring and drafts, how quizzes are edited and saved, the lock once students have taken a quiz, the question bank, and the ways questions get in (editor, Excel, AI, bank, MCP).
tags: [quiz, questions, question-kinds, scoring, shuffle, bank, editor]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-2bd4fc7f0f44223cc37c6edc
    resource: repo://apps/rpc/src/features/bank/Service.ts
  - id: openwiki-source-5bacf395e7c40da3c9da1cad
    resource: repo://apps/rpc/src/features/quiz/Service.ts
  - id: openwiki-source-e317cbec3a42f3c3e888fbfb
    resource: repo://apps/web/src/components/question-kinds/code/editor-model.ts
  - id: openwiki-source-c291e9fcfd7373d0cacc69bc
    resource: repo://apps/web/src/features/quiz/components/add-question-menu.tsx
  - id: openwiki-source-4b3065970ade25faec86ca7e
    resource: repo://apps/web/src/features/quiz/question-import.ts
  - id: openwiki-source-7a2b38b8fd3990cc2eacf06d
    resource: repo://apps/web/src/lib/subjects.ts
  - id: openwiki-source-f4cbec8eaf70918ba3c92080
    resource: repo://packages/domain/src/bank.ts
  - id: openwiki-source-14d4e62b06664be5f732668f
    resource: repo://packages/domain/src/kinds/base.ts
  - id: openwiki-source-6a278df14c27ca3e0494e503
    resource: repo://packages/domain/src/question.ts
  - id: openwiki-source-d8b72841f8eea1d67a74808f
    resource: repo://packages/domain/src/quiz-lock.ts
  - id: openwiki-source-c2087c5f7f57be0efe4f7456
    resource: repo://packages/domain/src/scoring.ts
  - id: openwiki-source-3574eb5fb4342b55d8d488ba
    resource: repo://packages/domain/src/shuffle.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Quizzes and questions

A **quiz** is reusable content owned by a teacher in an organization: title, subject and subject area, settings (shuffle parts/questions/choices), a printed-paper header and layout, and ordered **parts** (title, instructions, optional shuffle and **pool size**) holding **questions**. A session runs a quiz; each attempt sees its own seeded paper.

## Question types and the kind registry

Thirteen types live in `packages/domain/src/question.ts#questionTypes`: multiple choice, true/false, blank (identification, fill in the blank, cloze), matching, enumeration, numeric, essay, drawing, code, SQL, categorization, ordering, hotspot. Each has three shapes:

- the **teacher question** (with its answer key and `points`, `partialCredit`, `gamePoints`, optional `topic` and `explanation`),
- the **body** stored in `questions.body` (jsonb, checked against the schema on read),
- the **student question** (`StudentQuestion`), made by `toStudentQuestion` — every answer removed — plus a `RevealQuestion` for results.

Everything that differs by type is in its `QuestionKind` (`packages/domain/src/kinds/<type>.ts`), registered in `kinds/index.ts` and typed on the union so a type without a kind doesn't compile. The kind owns `toStudent`, `autoScore`, `cleanAnswer` (shape and size limits), `answerText`/`answerKey`, review summaries, image references, shuffling of its own lists, and optional capabilities: `draft` (the raw JSON shape AI and the MCP server produce, and its decoder), game tallies and rules, similarity checks, a code or SQL checker. The web app's matching `QuestionUi` (`Editor`, `Input`, `Review`, `Print`) is described in [Web app](../architecture/web-app.md).

Identification answers can be typed on one line or into **one box per letter** (`answerBox: "boxes"`): students then receive only the word lengths of the first accepted answer.

## Scoring

`scoring.ts#autoScore` asks the kind for a 0..1 fraction; it is `null` when nothing can check the answer yet (essays, drawings, code or SQL without checker results). Multi-unit questions use `weightedFraction`: with partial credit off, any wrong unit gives 0; with it on, each unit earns its weight. A teacher's `manualScore` in points, capped at the question's points, wins over the automatic fraction, and `attemptScore` sums a paper with unanswered questions scoring zero. Grading on submit is in [Grading and results](../workflows/grading-and-results.md).

## The seeded paper

`shuffle.ts#orderForAttempt` turns an attempt's seed into its paper deterministically: shuffle parts (when on), draw `poolSize` questions from a pool part, shuffle questions, then let each kind shuffle its choices or columns. `paperRandom` gives each question its own generator from the seed and its id, so it doesn't depend on which other questions were drawn. `quizTotals` counts a pool as its draw size times the first question's points, which is why questions in a pool share points (the editor enforces it).

## Editing and saving

The web editor (`features/quiz/components/quiz-editor.tsx`) keeps a whole draft client-side. Questions are added from a two-column **Add question** menu grouped into Choose / Write / Make (filtered by the quiz's subject area through `lib/subjects.ts#questionTypesFor`, with a switch for all types), from the question bank, from an Excel/CSV import (`features/quiz/question-import.ts`: Wayground/Quizizz template columns plus optional Points and Topic, problems reported per row) or from AI drafts. Each question card has Edit / Preview tabs: the text is a plain box by default with the markdown editor as an opt-in, and Preview renders the student's view through the same input component as the exam page. The editor model per type (`views/editor-model.ts`) validates before save — for code, `codeRunnerProblem` refuses tests the runner would reject.

`quiz.save { draft }` (`features/quiz/Service.ts`) writes parts and questions in one transaction; client ids the quiz doesn't own are replaced. `quiz.duplicate` saves a copy titled "… (copy)" as a new quiz.

### The lock once students have taken it

Once a quiz has attempts, `save` compares `quiz-lock.ts#gradedShape` before and after: anything grades or paper order depend on (questions, answers, points, parts, shuffle settings) makes it fail with `QuizInUse`; wording of questions and part titles, instructions, quiz details and the printed paper can still change. The message tells teachers to duplicate the quiz and edit the copy.

## The question bank

`bank_questions` holds the shared demo library (no owner) and each teacher's own questions, tagged by subject and comma-separated topics (`bank.ts#normalizeTag`). `BankService` lists the library, the user's own questions and those **shared** with them (by subject, topic or single question, to named colleagues), and lets owners add, update, retag, rename tags, delete, share/unshare and copy shared questions into their own bank. Writes only ever reach the user's own rows. Questions go from the bank into a quiz through the editor's bank picker or the bank's "Add to quiz" dialog.

## Other ways in

- **AI drafts** into a quiz part or the bank: [AI assistance](../integrations/ai-assistance.md).
- **MCP server**: `add_questions` / `add_bank_questions` decode the same raw drafts: [MCP server](../integrations/mcp-server.md).
