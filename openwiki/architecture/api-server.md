---
type: architecture
title: API server (apps/rpc)
description: How the Effect 4 API on Bun is composed from services and layers, which HTTP routes it serves (/rpc, /rpc/live, /api/auth/*, /health), the background jobs it runs, and the conventions handlers follow.
tags: [api, effect, bun, rpc, architecture, background-jobs]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T17:47:22.617Z
sources:
  - id: openwiki-source-d544df3478a6f5696a1a3ac5
    resource: repo://apps/rpc/Dockerfile
  - id: openwiki-source-67f8a4410d8f75d8515c9644
    resource: repo://apps/rpc/src/Database.ts
  - id: openwiki-source-c7b736b192777d9870ef29fe
    resource: repo://apps/rpc/src/handlers/QuizHandlers.ts
  - id: openwiki-source-222d515d7559e58a0baa4bf6
    resource: repo://apps/rpc/src/main.ts
  - id: openwiki-source-9c18734314d7a34e58c58d06
    resource: repo://apps/rpc/src/network.ts
  - id: openwiki-source-ac2a337476c66053f6123dc8
    resource: repo://apps/rpc/src/Quizzes.ts
  - id: openwiki-source-a539b20265ab43ee251f8d67
    resource: repo://apps/rpc/src/RpcCallLog.ts
generated: { by: "omp", at: "2026-10-09T17:47:22.617Z" }
---

# API server (`apps/rpc`)

`apps/rpc` is the only process that talks to PostgreSQL, Better Auth, S3 and the code runner. The web app reaches it over typed Effect RPC (see [RPC contract](./rpc-contract.md)); browsers reach it directly only for the live WebSocket and, through the web app's forward, Better Auth's OAuth callback.

## Runtime and build

- Bun runs the TypeScript sources directly: `bun --watch src/main.ts` (`npm run dev:rpc`) and `bun src/main.ts` (`start`). There is no build step.
- `tsconfig.base.json` sets `erasableSyntaxOnly`, `verbatimModuleSyntax` and `allowImportingTsExtensions`, so relative imports end in `.ts` and only type-strippable syntax is allowed (no enums, parameter properties or namespaces). `tsc --noEmit` is the type check.
- `drizzle-kit` (generate, check, migrate) still runs under Node; seeding (`db:seed`) and `plan:set` run under Bun. See [Database schema](../data/database-schema.md).
- The container (`apps/rpc/Dockerfile`, built from the repo root) installs production dependencies with npm in a Node stage, copies them plus `apps/rpc/src` and `packages/contract/src` into `oven/bun:1-slim`, and runs `bun src/main.ts` with `HOST=0.0.0.0 PORT=8080`. It does not run migrations.

## Composition (`src/main.ts`)

`main.ts` builds one layer graph and launches it with `BunRuntime.runMain`.

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
  Server["HttpRouter.serve + checkLiveOrigin<br/>BunHttpServer (HOST/PORT) + RpcCallLog tracer"] --> Routes
  Routes --> BetterAuthRoute["* /api/auth/*"]
  Routes --> Health["GET /health"]
  Routes --> RpcRoute["/rpc (HTTP, ApiRpcs)"]
  Routes --> LiveRoute["/rpc/live (WebSocket, LiveRpcs)"]
  Routes --> Jobs["QuizSweep 30s · GameTicker 500ms · AssetCleanup 1d"]
  Routes -.provided by.-> Game --> Quizzes --> LiveHub --> Runner --> Assets --> Storage --> BA["BetterAuth + RateLimiter"] --> Database
```

| Route | Purpose |
|---|---|
| `* /api/auth/*` | Better Auth's own handler (converted to/from a web `Request`), used for the browser-driven Google OAuth flow that the web app forwards. |
| `GET /health` | Plain `ok`; CI polls it before calling RPC. |
| `/rpc` (HTTP, JSON serialization) | `ApiRpcs`: every group from `AuthHandlers` to `ClassroomHandlers`, plus `AuthMiddlewareLive`. |
| `/rpc/live` (WebSocket) | `LiveRpcs`, authorised by `LiveAuthMiddlewareLive` with single-use tickets instead of cookies. See [Live sessions](../modes/live-sessions.md). |

The server binds `HOST` (default `127.0.0.1`) and `PORT` (default `3001`): only the web app is expected to call it, so it stays on loopback unless configured otherwise.

### Live origin check

`checkLiveOrigin` wraps every request. A request to `/rpc/live` that carries an `Origin` header is refused with 403 unless the origin is listed in `LIVE_ALLOWED_ORIGINS` (comma separated) or, when that is empty, equals the origin of `BETTER_AUTH_URL`. Requests without `Origin` (non-browsers) pass and still need a valid ticket.

## Services

Each service is an Effect 4 `Context.Service` tagged `examora/api/<Name>` with a static `layer`.

| Service | File | Responsibility |
|---|---|---|
| `Database` | `Database.ts` | Drizzle over Bun's built-in `SQL` client from `DATABASE_URL`; the pool is closed when the layer is released. `query(run)` turns query failures into **defects** (`Effect.orDie`), so RPC clients see an internal error rather than a typed one. |
| `BetterAuth` | `BetterAuth.ts` | Better Auth instance; see [Authentication](../security/auth-and-permissions.md). |
| `RateLimiter` | `RateLimiter.ts` | In-memory per-process counters. |
| `Storage`, `Assets` | `Storage.ts`, `Assets.ts` | S3 client and asset bookkeeping; see [Asset storage](../integrations/asset-storage.md). |
| `Runner` | `Runner.ts` | Calls `apps/runner` for code tests; see [Code runner](../integrations/code-runner-and-sql-grader.md). |
| `LiveHub` | `Live.ts` | In-memory fan-out of live changes. |
| `Quizzes` | `Quizzes.ts` | `submit`, `endSession`, `sweep` shared by handlers and the background job. |
| `Game` | `modes/game.ts` | Game rooms, `resume`, `tick`. See [Game mode](../modes/game-mode.md). |

`Quizzes.ts` also exports the pure helpers the quiz handlers share: row-to-contract converters (`toQuiz`, `toSession`, `toQuestion`), `sessionStatus` (status is derived from the clock on every read, because the stored status only catches up when the sweep runs), `attemptDeadline`, `questionProgress`, `cleanAnswer` (shape and size limits per question type), and `loadQuizDetail`/`attemptPaper` (the seeded paper an attempt saw).

## Background jobs

All three are `Layer.effectDiscard` effects forked into the server scope:

- **QuizSweep** (every 30 s, `Quizzes.sweep`): flips `scheduled` sessions to `running` once `opens_at` passes, ends sessions past `closes_at` (skipping paused ones, whose clock is stopped), notifies `LiveHub`, and auto-submits in-progress attempts past their deadline plus the 60 s `graceMs`. Failures are logged and swallowed so the schedule keeps running.
- **GameTicker** (every 500 ms): first `game.resume` reloads games that were running when the API stopped, then `game.tick` closes timed-out questions and sends standings.
- **AssetCleanup** (daily): `assets.cleanup()` removes unconfirmed or unreferenced uploads.

Because live, game and rate-limit state is per process, one API instance is assumed; the README notes Redis is the plan for more than one server.

## Submitting attempts (`Quizzes.submit`)

Submission is shared by the `attempt.submit` handler, `session.forceSubmit`, `endSession` and the sweep:

1. Load the attempt, session and quiz; an attempt that is no longer `in_progress` returns its existing score.
2. Rebuild the student's seeded paper and grade each question with up to 3 concurrent checks: code goes through `Runner.runTests`, SQL through `runSqlChecks` (a failure becomes "nothing could check it" → manual grading). In one-question-at-a-time sessions only the current, not-timed-out question may still change; mastery answers keep their stored grade.
3. Status becomes `needs_grading` when any question is ungraded, else `graded`.
4. In one transaction, an `UPDATE … WHERE status = 'in_progress'` flips the status; whoever flips it first wins, so double submits and the sweep racing a student are harmless. The winner upserts `answers`, `code_results` and `typing_edits`, appends `answer_history` for exam sessions when the final value differs from the last autosave, and inserts integrity events (`auto_submitted`, a `disconnected` gap, or `late_submit`).
5. `LiveHub.attemptChanged` pushes the result to watchers.

Details of the attempt flow live in [Session and attempt lifecycle](../workflows/session-and-attempt-lifecycle.md).

## Handler conventions

Handlers live in `src/handlers/<Group>Handlers.ts` and are built with `<Group>Rpcs.toLayer(Effect.gen(...))`, returning `<Group>Rpcs.of({ "prefix.name": Effect.fn("prefix.name")(function* (payload) { ... }) })`. Common shape, from `QuizHandlers.ts`:

- Authorise first with `requirePermission({ resource: [actions] })` from `Session.ts`, which yields the signed-in user or fails with `Forbidden`.
- Scope reads to ownership (e.g. `ownQuiz` filters by `owner_id`) and fail with the contract's `NotFound` otherwise, so other users' ids are indistinguishable from missing ones.
- Run multi-row writes in one `d.transaction`. `quiz.save` keeps part/question ids the quiz already owns and gives any other client-supplied id a fresh one, since client ids could collide with another quiz's rows.

Adding an operation: declare the `Rpc` in `packages/contract`, implement it in the matching handler file, and (for a new group) add the handler layer to `RpcRoute` in `main.ts`.

## Logging

`RpcCallLog.ts` replaces the tracer with one that logs a line when each `RpcServer.<rpc>` span ends: the RPC name, `ok` or the failure's `_tag` (`Forbidden`, `NotFound`, …), `defect` or `interrupted`, and `rpc.ms`. This covers HTTP and WebSocket groups without touching handlers.

## Network helpers (`network.ts`)

`clientIp` takes the first `x-forwarded-for` entry (stripping `::ffff:`), which the web app forwards. `ipAllowed` checks it against a session's IP allowlist with `node:net` `BlockList`: an empty list admits everyone, an unknown address is refused when a list exists. `invalidAllowlistEntry` validates teacher input (plain address or CIDR).
