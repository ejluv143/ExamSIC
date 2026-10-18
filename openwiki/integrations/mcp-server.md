---
type: integration
title: MCP server
description: apps/mcp, an MCP server over stdio that lets an AI client act as a signed-in teacher through the RPC API — how it signs in and re-authenticates, how tool inputs are validated, the tools for creating quizzes and questions, analysing a session's questions and answers, and reporting on classes and students, and how its numbers mirror the web pages.
tags: [mcp, ai-client, tools, stdio, teacher, analytics]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-06301d9289b606409c0710df
    resource: repo://apps/mcp/src/api.ts
  - id: openwiki-source-b6d4c5620858bbdb2b424d2a
    resource: repo://apps/mcp/src/drafts.ts
  - id: openwiki-source-6b0863a72707f0b16004ab3f
    resource: repo://apps/mcp/src/main.ts
  - id: openwiki-source-24c9e03a7bafdcc808d11958
    resource: repo://apps/mcp/src/session-data.ts
  - id: openwiki-source-530b6e9fb6fdd160261c9f45
    resource: repo://apps/mcp/src/tools/analysis.ts
  - id: openwiki-source-124f8b5d5e1506e2fd1c79ed
    resource: repo://apps/mcp/src/tools/creating.ts
  - id: openwiki-source-dd6579dcf5ca34531ac4973f
    resource: repo://apps/mcp/src/tools/students.ts
  - id: openwiki-source-743e1245730b3eead1b3b336
    resource: repo://apps/mcp/src/util.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# MCP server (`apps/mcp`)

`@examinus/mcp` is a small Bun program that speaks the Model Context Protocol over **stdio**, so Claude Code, Claude Desktop, Cursor and similar clients can drive Examinus as one teacher. It has no database access and no privileges of its own: every tool is a sequence of ordinary RPC calls (`packages/contract`) made with that teacher's session, so permissions and ownership rules are exactly the web app's.

## Running it

```bash
EXAMINUS_EMAIL=teacher@… EXAMINUS_PASSWORD=… bun apps/mcp/src/main.ts
# or: claude mcp add examinus -e EXAMINUS_EMAIL=… -e EXAMINUS_PASSWORD=… -- bun /abs/path/apps/mcp/src/main.ts
```

| Variable | Meaning |
|---|---|
| `EXAMINUS_API_URL` | The API (default `http://127.0.0.1:3001`). |
| `EXAMINUS_WEB_URL` | The web app's origin (default `http://localhost:3000`): Better Auth only accepts sign-ins from its own origin, so it is sent as `Origin`. |
| `EXAMINUS_EMAIL`, `EXAMINUS_PASSWORD` | The teacher. Missing values fail the first tool call with a clear message. |
| `EXAMINUS_ORGANIZATION_ID` | Optional: calls `org.setActive` after sign-in for teachers in several organizations. |

stdout carries the protocol; logs go to stderr.

## Session handling (`src/api.ts`)

One Effect `RpcClient` typed from `ApiRpcs` over HTTP, with `RpcClient.withHeaders({ cookie })`. The sign-in (`POST /api/auth/sign-in/email`) happens **lazily on the first tool call** and is shared between concurrent calls; when the API answers `Unauthorized` (an expired session), the server signs in again once and retries the call. Declared API errors (`NotFound`, `Conflict`, `QuizInUse`…) become an `ApiError` whose text is the tag and message, returned to the client as an `isError` result; transport failures name the API URL.

## Tools

| Area | Tool | What it does |
|---|---|---|
| Creating | `question_shapes` | For every question type, the raw draft JSON shape (`kindOf(type).draft.shape`) and a note; types without a draft shape are listed as not creatable here. |
| | `list_quizzes`, `get_quiz` | The teacher's quizzes; one quiz's parts and questions with their answer keys, compact. |
| | `create_quiz` | A new quiz (title, subject, area, description, parts), letterhead and paper settings copied from the teacher's latest quiz. |
| | `add_questions` | Decodes raw drafts with `draftQuestion` (the same `draft.decode` as AI drafts), appends them to a part and saves with `quiz.save`; rejected drafts come back with the reason and the shape hint; `QuizInUse` is surfaced plainly. |
| | `add_bank_questions` | The same drafts into the question bank (`bank.add`), optional tags joined into the topic. |
| Analysis | `list_sessions` | Sessions by quiz or class. |
| | `session_results` | Per student (latest submitted attempt): score, max, percent, status, time, integrity level; summary with mean, median, highest, lowest, status breakdown and 10 % bands; per-question percent of points, answered count and mean time; topic mastery. |
| | `question_analysis` | One question: percent fully correct, mean score, discrimination index (top vs bottom 27 % by total score), answer split (choice counts, or the most common wrong answers as text through the kind's `answerText`), timing and the answer key. |
| | `integrity_summary` | Each student's level and top signals, plus pair findings from `analyzeSession` (shared wrong answers, similar essays/code, timing, device, network). |
| Students | `class_overview` | The class's students, per-session mean/median from `session.classScores`, each student's average, and an at-risk list (average under 60 % or two or more missed sessions). |
| | `student_report` | One student's sessions with score/status/integrity, weakest topics across sessions, and the first-to-last trend. |

Game sessions are skipped in class and student reports; a session counts as missed only once it has ended without a submission.

## Why the numbers match the pages

`src/session-data.ts` reproduces the web's computations with the same domain functions: `latestSubmitted` (each student's latest submitted attempt), `attemptScore`/`questionScore` from `@examinus/domain/scoring`, `topicTags` and `median` from `analytics`, `analyzeSession` from `integrity`. What the session page shows under "Question difficulty" and "Topic mastery" is what `session_results` returns, minus the typing-replay analysis the anti-cheating page adds.

## Inputs

Tool input schemas are declared once per tool and are what the client sees in `tools/list`; invalid arguments are refused before any API call. Drafts are 1–50 per call.

## Limits worth knowing

- Creatable types are the six with draft shapes (multiple choice, true/false, identification, enumeration, numeric, essay); everything else must be made in the editor.
- The server never deletes anything; `quiz.remove` and `bank.delete` are deliberately not exposed.
- It is one teacher's view: another organization's data is `NotFound`, like everywhere else.
