---
type: architecture
title: RPC contract and domain packages
description: What packages/contract (RPC groups, request/response schemas, tagged errors, auth middleware) and packages/domain (pure rules — the question-kind registry, scoring, shuffling, integrity, game points, roles and permissions) own, their import conventions, and the checklist for adding an RPC.
tags: [contract, domain, rpc, effect, schemas, errors, permissions, question-kinds]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-bd5e519079b29fbf053b02e9
    resource: repo://apps/rpc/src/features/live/rules.ts
  - id: openwiki-source-84c0d1bb13d2eb23a283e86f
    resource: repo://packages/contract/package.json
  - id: openwiki-source-84ce420967c52ffdde51f55b
    resource: repo://packages/contract/src/admin.ts
  - id: openwiki-source-f822fda6860cac5fc6490d7a
    resource: repo://packages/contract/src/auth.ts
  - id: openwiki-source-ad35c511a88fb4b1b671f2a0
    resource: repo://packages/contract/src/errors.ts
  - id: openwiki-source-2ed98072144747257f2b359b
    resource: repo://packages/contract/src/game.ts
  - id: openwiki-source-0f6a5981261225c40c1dbcbb
    resource: repo://packages/contract/src/live.ts
  - id: openwiki-source-e0598566ce70f1db424dbc8a
    resource: repo://packages/contract/src/middleware.ts
  - id: openwiki-source-0ef6af6f4d3d7554b5ad7e3b
    resource: repo://packages/domain/package.json
  - id: openwiki-source-c01b9cd49e08b50efbf2440e
    resource: repo://packages/domain/src/join-key.ts
  - id: openwiki-source-14d4e62b06664be5f732668f
    resource: repo://packages/domain/src/kinds/base.ts
  - id: openwiki-source-b1d32f73878a27a60426d1e0
    resource: repo://packages/domain/src/kinds/code.ts
  - id: openwiki-source-c73e87b3edd011514d3be136
    resource: repo://packages/domain/src/kinds/index.ts
  - id: openwiki-source-c2087c5f7f57be0efe4f7456
    resource: repo://packages/domain/src/scoring.ts
  - id: openwiki-source-3574eb5fb4342b55d8d488ba
    resource: repo://packages/domain/src/shuffle.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# RPC contract and domain packages

Two workspace packages sit between every client (web app, API, MCP server) and carry no runtime of their own: Bun and the Vite bundler import their TypeScript sources directly.

| Package | Owns | Imports |
|---|---|---|
| `@examinus/domain` | Pure logic and the domain `Schema`s: question model and the **kind registry**, scoring, seeded shuffling, blanks, join keys, integrity and similarity analysis, game and relay rules, roles and permissions, attendance maths, client detection, AI draft decoding. No RPC, database or clock. | `effect` only |
| `@examinus/contract` | One `RpcGroup` per feature (`auth`, `admin`, `organization`, `class`, `enrollment`, `attendance`, `class-record`, `classroom`, `quiz`, `bank`, `session`, `attempt`, `live`, `asset`, `game`, `ai`, `avatar`), the request/response schemas that cross the wire, the shared tagged errors and the auth middleware declarations. | `@examinus/domain`, `effect` |

Both list every entry in `package.json#exports` — one per module or group, **no barrel** — so code imports `@examinus/domain/scoring` or `@examinus/contract/session`, and a new file needs an `exports` line.

## Errors and middleware

`errors.ts` declares `Schema.TaggedError`s: `Unauthorized` (no session), `Forbidden` (with a message), `TooManyRequests` (rate limits), `NotFound` and `Conflict`. By convention `NotFound` also answers for records the caller may not know exist (another teacher's quiz, another organization's class), so ids never leak. Feature groups add their own (`DeviceApprovalRequired`, `OpenElsewhere`, `PlayInGame`, `ComputersOnly`, `ClientOutdated` in `attempt.ts`; `QuizInUse` in `quiz.ts`; `ClassroomUnavailable`…). The web app branches on `_tag`, never on message text.

`middleware.ts` declares `CurrentUser` (the `SessionUser`: platform role, active organization with the permissions its membership roles grant, memberships) and `AuthMiddleware`, an `RpcMiddleware` that provides it and fails with `Unauthorized`. The API implements it in `features/auth/Session.ts`. Every group except `AuthRpcs` is wrapped with `.middleware(AuthMiddleware)`; `auth.*` serves sign-in, registration, `joinAsGuest` (a trimmed 1–40 character name plus a join key, returning the guest user, cookies and the game found) and `auth.session`, which also returns refreshed cookies.

`live.ts` is the exception to "everything over `/rpc`": `LiveTicketRpcs` (`live.ticket`, HTTP, cookie-authenticated) hands out a 60-second single-use ticket for a target (`teacher`, `student`, `lobby`, `game`), and `LiveRpcs` (`live.teacher`, `live.student`, `live.lobby`, `live.game`, all `stream: true`) is served over WebSocket behind `LiveAuthMiddleware`, which trusts the ticket header instead of cookies. See [Live sessions](../modes/live-sessions.md).

## `ApiRpcs`

`api.ts` merges the seventeen groups into the one group the API serves at `rpcPath` (`/rpc`), each group prefixed (`session.`, `attempt.`…). The web app's `callApi` and the MCP server's client are typed from it.

## The domain's question-kind registry

`kinds/index.ts` maps every `QuestionType` to a `QuestionKind` object (`kinds/<type>.ts`) and is typed on the union, so a type listed in `question.ts#questionTypes` without a kind is a compile error. A kind owns its teacher/body/student schemas and everything that differs by type: `toStudent` (strip the key, seeded shuffles), `autoScore` (a 0..1 fraction, or `null` when nothing can be checked), `answerText`/`answerKey`, `cleanAnswer`, review summaries, assets, and optional capabilities — `draft` (the raw JSON shape AI and MCP drafts use and its decoder), `gameTally`/`gameBuckets`/`gameProblem`/`gameUnscored` for games, `similarity`, a code or SQL checker. `scoring.ts`, `shuffle.ts`, `answer-text.ts`, `integrity.ts` and the API only call `kindOf(q)`; nothing switches on the type.

Other domain modules worth knowing:

- **`scoring.ts`**: automatic scores are fractions of a question's points; a teacher's `manualScore` in points wins over the automatic one; `attemptScore` sums a paper.
- **`shuffle.ts`**: the same attempt seed always gives the same paper (parts, questions, pools, choices), and answers are keyed by question id so order never affects scoring; `paperRandom` derives a per-question generator from seed and question id.
- **`join-key.ts`**: 7 characters from an alphabet without look-alikes (`0/O`, `1/I/L`); `normalizeJoinKey` ignores case, spaces and dashes.
- **`kinds/code.ts`**: `codeRunnerLimits` (30 tests, 64 KiB input, 256 KiB database, 20 000 characters of code, 512 KiB body) and `codeRunnerProblem`, which reproduces the runner's refusals so the API and the question editor apply the same limits before sending.
- **`roles.ts` / `permissions.ts`**: platform roles `admin | user | guest`, organization roles with their statements, `can(principal, permissions)`; see [Authentication](../security/auth-and-permissions.md).
- **`client.ts`**: `clientOf(userAgent)` (`web` or `desktop` + version), semver comparison, `clientAllowed`.

## Adding an operation

1. Declare the `Rpc` (payload, success, error union) in the group's file in `packages/contract`; put any new pure rule in `packages/domain`.
2. Implement it in `apps/rpc/src/features/<feature>/Handlers.ts` (permission → service → repo).
3. Call it from `apps/web/src/features/<feature>/data.ts` through `callApi` (and expose it as an MCP tool if teachers need it there).

Domain tests (`bun test packages`) cover the pure rules; the API's service tests stub repositories.
