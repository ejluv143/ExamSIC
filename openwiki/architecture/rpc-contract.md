---
type: architecture
title: RPC contract package
description: packages/contract (@examora/contract) defines every Effect RPC group, payload schema and tagged error shared by the web app and the API, plus pure domain logic such as scoring, seeded shuffling, join keys and code similarity.
tags: [contract, rpc, effect, schema, errors, shared-code]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T17:47:22.617Z
sources:
  - id: openwiki-source-84c0d1bb13d2eb23a283e86f
    resource: repo://packages/contract/package.json
  - id: openwiki-source-4c1bfe2032008befca44b5fa
    resource: repo://packages/contract/src/domain.ts
  - id: openwiki-source-ad35c511a88fb4b1b671f2a0
    resource: repo://packages/contract/src/errors.ts
  - id: openwiki-source-23480a6b4ef509e3a279c766
    resource: repo://packages/contract/src/join-key.ts
  - id: openwiki-source-0f6a5981261225c40c1dbcbb
    resource: repo://packages/contract/src/live.ts
  - id: openwiki-source-e0598566ce70f1db424dbc8a
    resource: repo://packages/contract/src/middleware.ts
  - id: openwiki-source-84ebeae3a634509757ef6ab3
    resource: repo://packages/contract/src/quiz-rpc.ts
  - id: openwiki-source-2d13bc43e85e877b1101e2ae
    resource: repo://packages/contract/src/rpc.ts
  - id: openwiki-source-cddfdde28283e197871947a1
    resource: repo://packages/contract/src/scoring.ts
  - id: openwiki-source-4b0c9b1740f95ba3fbc9cdcf
    resource: repo://packages/contract/src/shuffle.ts
generated: { by: "omp", at: "2026-10-09T17:47:22.617Z" }
---

# RPC contract package (`packages/contract`)

`@examora/contract` is the single source of truth for the API surface. Both `apps/rpc` (server, via `RpcServer` and `<Group>.toLayer`) and `apps/web` (client, via `RpcClient.make(ApiRpcs)`) import it, so a payload or error change is a type error on both sides at once.

It ships TypeScript source only: `package.json` `exports` point at `src/*.ts`, Bun runs it directly in the API, and `next.config.ts` lists it in `transpilePackages`. Dependencies are just `effect` and `better-auth` (for the permission access-control types).

## RPC groups

Each group is an Effect `RpcGroup.make(...)` with a name prefix; all but `auth.` add `.middleware(AuthMiddleware)`.

| Group (prefix) | File | Operations |
|---|---|---|
| `AuthRpcs` (`auth.`) | `rpc.ts` | `config`, `signInEmail`, `register`, `signInGoogle`, `signUpGoogle`, `session`, `signOut`. No middleware: these run before a session exists; responses carry `cookies` for the web app to set. |
| `AdminRpcs` (`admin.`) | `rpc.ts` | List/get/create/update users, set password, suspend, remove. |
| `ClassRpcs` (`class.`) | `rpc.ts` | A teacher's classes, join codes, roster. |
| `EnrollmentRpcs` (`enrollment.`) | `rpc.ts` | A student's classes: `mine`, `join`, `leave`. |
| `AttendanceRpcs` (`attendance.`) | `rpc.ts` | `meetings`, `today`, `save`, `mine`. |
| `ClassRecordRpcs` (`classRecord.`) | `class-record.ts` | `get`, `save`, `mine`. |
| `ClassroomRpcs` (`classroom.`) | `classroom.ts` | Google Classroom `status`, `connect`, `courses`, `import`, `sync`. |
| `QuizRpcs` (`quiz.`) | `quiz-rpc.ts` | `list`, `get`, `save`, `remove`, `duplicate`, `bank`. |
| `SessionRpcs` (`session.`) | `quiz-rpc.ts` | Create/update/start/end sessions, release results, attempts, grading, live controls (`pause`, `resume`, `addTime`, `warn`, `setLocked`, `forceSubmit`, `allowBackIn`, `grantRetake`), `examRecord`, `liveAttempt`. |
| `AttemptRpcs` (`attempt.`) | `quiz-rpc.ts` | Student side: `mine`, `paper`, `start`, `saveAnswer`, `runSampleTests`, `submit`, `recordEvents`, `heartbeat`, `goTo`, `setMarked`, `masteryState`, `masteryAnswer`, `result`, `myScores`. |
| `LiveTicketRpcs` (`live.`) | `live.ts` | `ticket`: trades a cookie session for a 60-second single-use WebSocket ticket. |
| `AssetRpcs` (`asset.`) | `asset.ts` | `createUpload`, `confirm`, `urls`. |
| `GameRpcs` (`game.`) | `game.ts` | `find`, `join`, `answer`, `next`, `openLobby`, `start`, `advance`, `end`, `kick`, `standings`, `gallery`. |

`ApiRpcs` (in `rpc.ts`) merges all of the above and is served over HTTP at `rpcPath = "/rpc"`.

`LiveRpcs` (`live.teacher`, `live.student`, `live.game`) is a separate group of **streaming** RPCs served over WebSocket at `liveRpcPath = "/rpc/live"`. It uses `LiveAuthMiddleware` (ticket based) instead of `AuthMiddleware`. See [Live sessions](../modes/live-sessions.md).

## Authentication middleware

`middleware.ts` declares:

- `CurrentUser`: a context service holding the `SessionUser`.
- `AuthMiddleware`: an `RpcMiddleware.Service` that `provides: CurrentUser` and fails with `Unauthorized`. The contract only declares it; `apps/rpc/src/Session.ts` implements it from the forwarded cookies.

`SessionUser` (`domain.ts`) is a union by role: admins carry only identity, teachers also `department` and `plan`, students `studentId` (a roster entry, null for self sign-ups).

## Errors

All errors are `Schema.TaggedError`s in `errors.ts`, so they travel over the wire and stay typed in the web app's `Result`:

| Error | Meaning |
|---|---|
| `Unauthorized` | No valid session. |
| `Forbidden` | Role lacks the permission, or the action isn't allowed on that target (wrong room password, IP outside allowlist). |
| `NotFound` | Missing **or not visible to this user**; handlers deliberately don't distinguish. |
| `Conflict` | State conflict (session not open, attempts used up, other device, …). |
| `InvalidCredentials`, `AccountSuspended`, `AuthRejected`, `TooManyRequests` | Sign-in and account management; messages are written for people. |
| `StorageUnavailable` | S3 isn't configured. |

Database failures are not part of the contract: the API turns them into defects (internal errors).

## Shared domain logic

Pure functions here run identically on the server (grading, enforcement) and in the browser (display, Run button):

| Module | What it owns |
|---|---|
| `question.ts`, `quiz.ts` | Question type schemas, quiz/part/settings schemas. See [Quizzes and questions](../concepts/quizzes-and-questions.md). |
| `scoring.ts` | `autoScore` (fraction 0..1), `questionScore`, `attemptScore`, partial credit and weights, `outputMatches` for code tests. |
| `shuffle.ts` | `mulberry32` seeded RNG and `orderForAttempt`: the same attempt seed always yields the same paper. `quizTotals`. |
| `blanks.ts`, `numbers.ts`, `placement.ts`, `drawing.ts`, `sql.ts` | Parsing and checking specific answer types (blank markup, numeric input, categorization/ordering/hotspot, drawing JSON, single-SELECT SQL). |
| `review.ts` | Navigation rules (`moveRefusal`) and review summaries. |
| `integrity.ts`, `exam.ts`, `similarity.ts` | Anti-cheat settings and events, locked exam settings, MOSS-style winnowing for code/SQL and phrase matching for essays. See [Exam mode](../modes/exam-mode-and-integrity.md). |
| `mastery.ts`, `game.ts`, `live.ts` | Mode-specific schemas and rules. |
| `join-key.ts` | 7-character keys from a 31-letter alphabet without look-alikes (no 0/O, 1/I/L); `normalizeJoinKey` ignores case, spaces and dashes; `formatJoinKey` shows `ABC-DEFG`. |
| `roles.ts`, `permissions.ts`, `plans.ts`, `password.ts` | Roles, RBAC statements, teacher plans, password rules. `roles.ts` stays import-free because the Drizzle schema imports it. See [Authentication](../security/auth-and-permissions.md). |
| `attendance.ts`, `class-record.ts`, `classes.ts`, `classroom.ts` | Class-side schemas and calculations. |

## Adding a backend operation

1. Add an `Rpc.make("name", { payload, success, error })` to the right group (or a new `RpcGroup` merged into `ApiRpcs`). Declare every expected failure as a tagged error in `error`.
2. Implement it in `apps/rpc/src/handlers/<Group>Handlers.ts`, checking `requirePermission` first. A new group's handler layer must be added to `RpcRoute` in `apps/rpc/src/main.ts`.
3. Call it from `apps/web/src/lib/data/*` with `callApi((api) => api["prefix.name"](payload), forwardedHeaders(...))`.

The web client caches its RPC runtime across hot reloads keyed by a signature of every procedure name and payload JSON schema, so a changed payload rebuilds the client instead of validating against a stale schema (`apps/web/src/lib/api/client.ts`).
