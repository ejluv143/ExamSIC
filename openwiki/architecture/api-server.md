---
type: architecture
title: API server (apps/rpc)
description: How the Effect 4 API on Bun is composed from platform services and feature folders, which HTTP routes it serves (/rpc, /rpc/live, /api/auth/*, /health), the background jobs it runs, how database failures and submissions behave, and how it is packaged.
tags: [api, effect, bun, rpc, architecture, background-jobs, platform]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-d544df3478a6f5696a1a3ac5
    resource: repo://apps/rpc/Dockerfile
  - id: openwiki-source-c4959f892fd67e985b818fa0
    resource: repo://apps/rpc/src/features/assets/Jobs.ts
  - id: openwiki-source-aeb6d7154d4dbfcad1fda3ca
    resource: repo://apps/rpc/src/features/attempt/Handlers.ts
  - id: openwiki-source-2d1c3b0258ee1f228b2c3a57
    resource: repo://apps/rpc/src/features/attempt/Repo.ts
  - id: openwiki-source-268806dbc9bd1c40f9617d2c
    resource: repo://apps/rpc/src/features/attempt/Service.ts
  - id: openwiki-source-74f2b8604a18d7a37da76a19
    resource: repo://apps/rpc/src/features/game/Jobs.ts
  - id: openwiki-source-fa3f98f8a78505ea5a2fad5f
    resource: repo://apps/rpc/src/features/session/Handlers.ts
  - id: openwiki-source-4821b9146b7027c30faa85e8
    resource: repo://apps/rpc/src/features/session/index.ts
  - id: openwiki-source-2c03356d4c0a2e1317e24b7e
    resource: repo://apps/rpc/src/features/session/Jobs.ts
  - id: openwiki-source-a1bd48a4d0298464f4ff55fb
    resource: repo://apps/rpc/src/features/session/Repo.ts
  - id: openwiki-source-54300c5adac542f56caf322a
    resource: repo://apps/rpc/src/features/session/rules.ts
  - id: openwiki-source-395ace10e1691208e55b1903
    resource: repo://apps/rpc/src/features/session/Service.ts
  - id: openwiki-source-222d515d7559e58a0baa4bf6
    resource: repo://apps/rpc/src/main.ts
  - id: openwiki-source-c94ee1430b15c0528b559017
    resource: repo://apps/rpc/src/platform/AppConfig.ts
  - id: openwiki-source-879ed8810e400684978996a2
    resource: repo://apps/rpc/src/platform/Cache.ts
  - id: openwiki-source-185868eb121a2d152f25072d
    resource: repo://apps/rpc/src/platform/Database.ts
  - id: openwiki-source-70a6e0d464e9fdaaf671c625
    resource: repo://apps/rpc/src/platform/network.ts
  - id: openwiki-source-db8102ca2abd616516ed1da0
    resource: repo://apps/rpc/src/platform/Observability.ts
  - id: openwiki-source-3b0cff6f473e94546e112b49
    resource: repo://apps/rpc/src/platform/RateLimiter.ts
  - id: openwiki-source-3cd55fe98c9e8f72e9df592b
    resource: repo://apps/rpc/src/platform/RpcCallLog.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# API server (`apps/rpc`)

`apps/rpc` is the only process that talks to PostgreSQL, Dragonfly, Better Auth, S3 and the code runner. The web app, the desktop shell (through the web app) and the MCP server reach it over typed Effect RPC (see [RPC contract](./rpc-contract.md)); browsers reach it directly only for the live WebSocket and, through the web app's forward, Better Auth's OAuth callback.

## Runtime and build

- Bun runs the TypeScript sources directly: `bun --watch src/main.ts` (`npm run dev:rpc`) and `bun src/main.ts` (`start`). There is no build step; `tsc --noEmit` is the type check, and only erasable syntax is allowed (relative imports end in `.ts`).
- `drizzle-kit` (generate, check, migrate) runs under Node; see [Database schema](../data/database-schema.md).
- The container (`apps/rpc/Dockerfile`, built from the repo root) installs production dependencies with npm in a Node stage, copies them plus `apps/rpc/src`, `packages/contract/src` and `packages/domain/src` into `oven/bun:1-slim`, and runs `bun src/main.ts` as user `bun` with `HOST=0.0.0.0 PORT=8080`. It does not run migrations; CI migrates (see [Development and CI](../operations/development-and-ci.md)).

## Layout: platform and features

```text
apps/rpc/src/
  main.ts                 routes and the layer graph
  platform/               AppConfig, Database, Cache, LiveBus, RateLimiter, Storage, Runner, Observability, Metrics, network, sql-grader
  features/<feature>/     Repo.ts (database only) · Service.ts (rules) · Handlers.ts (permission → service) · Jobs.ts · rules.ts/mappers.ts (pure) · index.ts
  database/               Drizzle schemas, migrations, scripts
  testing/                stubs and worlds for the service tests
```

Each feature's `index.ts` exports three layers: `Repo` (its database access), `Services` (what other features may use) and `Live` (its RPC handlers plus background jobs). `main.ts` stacks them so a feature's services sit above the ones they use — `Services` is a chain of `Layer.provideMerge` from the top-level features down through session/mastery, game, attempt, exam, then live/ai/assets/bank/quiz, then all `Repos`, then `Platform` — and every layer is built once, so all features share one instance of each service. Services and handlers can't be one layer per feature because live's handlers stream game views while the game publishes through `LiveHub`.

## Composition (`src/main.ts`)

| Route | Purpose |
|---|---|
| `* /api/auth/*` | Better Auth's own handler (web `Request` in, `Response` out), used for the browser-driven OAuth flow that the web app forwards. |
| `GET /health` | Plain `ok`; CI and Cloud Run poll it before sending traffic. |
| `/rpc` (HTTP, JSON serialization) | `ApiRpcs`: every feature's `Live` layer, behind the auth middleware. |
| `/rpc/live` (WebSocket) | `LiveRpcs`, authorised by single-use tickets instead of cookies. See [Live sessions](../modes/live-sessions.md). |

The server binds `HOST` (default `127.0.0.1`) and `PORT` (default `3001`) from `AppConfig`; `Observability` provides the logger, the minimum log level and the per-RPC-call log line.

### Live origin check

`checkLiveOrigin` wraps every request. A request to `/rpc/live` that carries an `Origin` header is refused with 403 unless the origin is listed in `LIVE_ALLOWED_ORIGINS` (comma separated) or, when that is empty, equals the origin of `BETTER_AUTH_URL`. Requests without `Origin` (non-browsers) pass and still need a valid ticket.

## Configuration (`platform/AppConfig.ts`)

Every environment value is read once when the `AppConfig` layer is built, so a missing required value stops the API at startup; services take what they need from the service instead of reading the environment. Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Defaults: `REDIS_URL` `redis://127.0.0.1:6390`, `PORT` 3001, `HOST` 127.0.0.1, `DESKTOP_MIN_VERSION` `0.0.0` (must be a semantic version), `DESKTOP_RELEASES_REPO` `ejluv143/ExamSIC`. Optional groups: Google (`GOOGLE_CLIENT_ID`/`SECRET`), runner (`RUNNER_URL`/`SECRET`), S3 (`S3_*`), Classroom endpoint overrides, `ORG_CUSTOM_ROLES`, OpenTelemetry (`OTEL_*`), `LOG_LEVEL`/`LOG_FORMAT`. The API's own version comes from `apps/rpc/package.json` and must parse as semver.

## Platform services

Each is an Effect 4 `Context.Service` tagged `examinus/api/<Name>` with a static `layer`.

| Service | Responsibility |
|---|---|
| `Database` | Drizzle over Bun's built-in `SQL` client; the pool closes when the layer is released. `query(run)` turns any failure into a **defect** (`Effect.orDie`), so handlers have nothing to recover and RPC clients see an internal error. `queryUnique(run)` is the exception: a Postgres `23505` becomes a typed `UniqueViolation` carrying the constraint name, so repositories can turn an expected clash (a join code, a duplicate row) into a contract error; everything else stays a defect. Every query records a `db.query` client span and a duration sample, without the SQL text or parameters. |
| `Cache` | Dragonfly (Redis protocol) through Bun's client, keys prefixed `examinus:`: JSON values with TTL, `claim` (set-if-absent, used for single-use tickets and throttles), sliding `windowCount`/`windowAdd` (rate limits), and self-refreshing member sets (presence). Required; failures are defects like the database. |
| `LiveBus` | Publish/subscribe channels over Dragonfly with separate publisher and subscriber connections; nothing is stored, so only current subscribers see a message. |
| `RateLimiter` | Named limits (`limits.*`: wrong passwords, sign-ups, join codes, guest joins, code runs, AI calls, exit passwords…) counted in the cache's sliding windows, so every API instance shares counts and a restart doesn't reset them. `hit` counts and fails with `TooManyRequests` at the limit; `check` only looks. |
| `Storage` / `Runner` | S3 client and the code-runner client; see [Asset storage](../integrations/asset-storage.md) and [Code runner](../integrations/code-runner-and-sql-grader.md). |
| `Observability` | Console logger (pretty or JSON), the RPC call log tracer, and OTLP export of spans, metrics and logs when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. |

## Background jobs

Each is a `Layer.effectDiscard` that forks a repeating effect into the server scope, exported from its feature's `Jobs.ts` and merged into that feature's `Live` layer:

- **QuizSweep** (every 30 s, `SessionService.sweep`): `SessionRepo.advance` moves scheduled sessions whose `opens_at` has passed into their **lobby** and ends unpaused sessions past `closes_at`; each changed session is pushed to its live watchers; then every in-progress attempt past its deadline (or past the session's end plus its extra time) by more than the 60 s grace is auto-submitted with reason `time_up`. Failures are logged and swallowed so the schedule keeps running.
- **GameTicker** (every 500 ms): `Game.resume` first reloads games that were in their lobby or running when the API stopped, then `Game.tick` closes timed-out questions and republishes views.
- **AssetCleanup** (daily): `Assets.cleanup()` deletes uploads nothing uses; a failed run is logged and the next day's run tries again.

Rate limits, tickets and live channels live in Dragonfly, so they survive restarts and could be shared by several instances; game rooms are in-process (see [Game mode](../modes/game-mode.md)), which is why one API instance is still assumed.

## Submitting attempts (`AttemptService.submit`)

Submission is shared by `attempt.submit`, `session.forceSubmit`, `endSession`, the sweep, the last mastery answer and a finishing game:

1. An attempt that is no longer `in_progress` returns its existing result.
2. The student's seeded paper is rebuilt and each question graded (code through the runner, SQL through the grader; mastery answers keep their stored grade). Status becomes `needs_grading` when any question is left ungraded, else `graded`.
3. `AttemptRepo.submit` runs one transaction whose first statement is `UPDATE attempts … WHERE id = ? AND status = 'in_progress'`; if no row flips, someone else submitted first and nothing else is written. The winner upserts answers, code results and typing edits, appends `answer_history` in modes that keep it when the final value differs from the last autosave, and inserts the submission's integrity events.
4. `LiveHub.attemptChanged` pushes the result to watchers.

The attempt flow around it is in [Session and attempt lifecycle](../workflows/session-and-attempt-lifecycle.md).

## Handler conventions

`Handlers.ts` is thin: `<Group>Rpcs.toLayerHandler("prefix.name", Effect.gen(...))` yields the services it needs and returns `Effect.fn("prefix.name")(function* (payload, { headers }) { ... })`. Every handler authorises first — `requirePermission({ resource: [actions] })`, or `requireOrgPermission` for operations that need an active organization — from `features/auth/Session.ts`, then calls a service with the `Actor` (`{ id, organizationId }`). Repositories scope reads by owner and organization and fail with the contract's `NotFound`, so another organization's ids are indistinguishable from missing ones. Multi-row writes run in one `d.transaction`.

Adding an operation: declare the `Rpc` in `packages/contract`, add the handler in the feature's `Handlers.ts` (a new feature also needs `index.ts` layers wired into `main.ts`), and call it from the web app's `features/<feature>/data.ts`.

## Logging and tracing

`platform/RpcCallLog.ts` wraps the tracer so that, when each RPC span ends, one line is logged with the RPC name, `ok` or the failure's `_tag` (`Forbidden`, `NotFound`, …), `defect` or `interrupted`, and `rpc.ms`; root spans are sampled by `OTEL_TRACES_SAMPLER_ARG`. Metrics (`platform/Metrics.ts`) and span attributes carry no user, attempt or answer data.

## Network helpers (`platform/network.ts`)

`clientIp` takes the first `x-forwarded-for` entry (stripping the IPv4-in-IPv6 prefix), which the web app forwards. `ipAllowed` checks it against a session's allowlist with `node:net` `BlockList`: an empty list admits everyone, an unknown address is refused when a list exists.
