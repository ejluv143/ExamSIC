---
type: architecture
title: System architecture overview
description: How Examinus (code name examora) is split into a Next.js web app, an Effect RPC API on Bun, a Docker code runner and a shared contract package, and how a browser request travels to PostgreSQL, S3 and the runner.
tags: [architecture, overview, monorepo, rpc, websocket]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T18:11:05.062Z
sources:
  - id: openwiki-source-e9c107c75b992a0b5c9fffa3
    resource: repo://apps/rpc/src/Runner.ts
  - id: openwiki-source-999f60ece775e48a66373ded
    resource: repo://apps/web/next.config.ts
  - id: openwiki-source-a12105538dcb0232dfb18910
    resource: repo://apps/web/src/lib/api/client.ts
  - id: openwiki-source-5b8c5d7c7fc2d9f00d288e35
    resource: repo://apps/web/src/lib/data/live.ts
  - id: openwiki-source-c73ec157bef17d593c873347
    resource: repo://apps/web/src/proxy.ts
  - id: openwiki-source-4c1bfe2032008befca44b5fa
    resource: repo://packages/contract/src/domain.ts
  - id: openwiki-source-d573f184736c5d1593555ca9
    resource: repo://packages/contract/src/roles.ts
  - id: openwiki-source-2d13bc43e85e877b1101e2ae
    resource: repo://packages/contract/src/rpc.ts
generated: { by: "omp", at: "2026-10-09T18:11:05.062Z" }
---

# System architecture overview

Examinus is a quiz and exam platform for colleges: reusable quizzes, timed sessions in several modes (quiz, exam, mastery, game), live monitoring, grading, classes, attendance and class records. Accounts are admins, teachers and students, plus **guests**: anonymous players who join a game that allows guests with just a name. The code, packages (`@examora/*`), database, cookies and the sandbox image keep the older name **examora** on purpose.

## Components

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart LR
  Browser -->|pages, server actions| Web["apps/web<br/>Next.js on Vercel"]
  Web -->|"typed RPC (HTTP JSON) /rpc<br/>forwards cookie, UA, x-forwarded-for"| API["apps/rpc<br/>Effect 4 on Bun"]
  Web -->|"rewrite /api/auth/*"| API
  Browser -->|"WebSocket /rpc/live<br/>single-use ticket"| API
  Browser -->|presigned POST / signed GET| S3[(S3-compatible bucket)]
  API --> PG[(PostgreSQL via Drizzle)]
  API -->|"POST /run, Bearer RUNNER_SECRET"| Runner["apps/runner<br/>Node + Docker sandbox"]
  API -->|presign, head, delete| S3
  Contract["packages/contract<br/>RPC groups, schemas, errors,<br/>scoring, shuffle"] -.imported by.-> Web
  Contract -.imported by.-> API
```

| Part | Role | Page |
|---|---|---|
| `apps/web` | Next.js + Tailwind UI for `/admin`, `/teacher`, `/student`, the guest areas `/join` and `/play`, and marketing pages. Server components and server actions call the API; the browser never calls `/rpc` itself. | [Web app](./web-app.md) |
| `apps/rpc` | The only owner of PostgreSQL, Better Auth, S3 credentials and runner credentials. Serves `/rpc`, `/rpc/live`, `/api/auth/*`, `/health`; runs background jobs. | [API server](./api-server.md) |
| `packages/contract` | Effect `RpcGroup`s, schemas, tagged errors, roles/permissions, and pure domain logic (scoring, seeded shuffle, join keys) used by both sides. | [RPC contract](./rpc-contract.md) |
| `apps/runner` | Grades code answers by starting one throwaway Docker container per submission. Optional. | [Code runner](../integrations/code-runner-and-sql-grader.md) |
| PostgreSQL | All persistent state: accounts, classes, quizzes, sessions, attempts, answers, integrity data. | [Database schema](../data/database-schema.md) |
| S3 bucket | Question images and student drawings/photos; private, accessed via presigned URLs. | [Asset storage](../integrations/asset-storage.md) |

## Request flow (server-rendered page or server action)

1. The browser requests a page under `/admin`, `/teacher`, `/student`, `/login` or `/register`. `apps/web/src/proxy.ts` calls `auth.session` on the API with the forwarded headers, redirects anonymous users to `/login?next=…`, sends users of another role to their own home, and copies any refreshed Better Auth session cookie onto the response. This is routing only; every data call is authorised again.
2. Server code in `apps/web/src/lib/data/*` calls `callApi((api) => api["group.name"](payload), forwardedHeaders(headers))` from `lib/api/client.ts`. Only `cookie`, `user-agent`, `x-forwarded-for` and the `sec-ch-ua-*` hints are forwarded, so the API sees the browser's session, IP and device.
3. The API decodes the request against the contract schema, `AuthMiddleware` resolves the Better Auth session, and the handler checks `requirePermission` before touching Drizzle.
4. Declared errors (`Forbidden`, `NotFound`, `Conflict`, …) come back as the failure side of a `Result`; transport failures and defects throw in the web app.

Sign-in also goes through RPC (`auth.signInEmail`, `auth.register`), returning cookies that the web app sets with `applyCookies`. Only the Google OAuth callback is browser-driven: `next.config.ts` rewrites `/api/auth/*` to the API, whose `BETTER_AUTH_URL` is the web app's origin. See [Authentication](../security/auth-and-permissions.md).

## Live updates

Browsers cannot send the web app's login cookie to the API's host, so live views never authenticate with cookies. The web server asks the API for a short-lived signed ticket (`live.ticket`) and gives the browser the WebSocket URL, derived from `PUBLIC_API_URL` (or `API_URL`) at request time. The browser opens `ws(s)://<api>/rpc/live` and streams teacher, student or game views. Live state is reconstructed from PostgreSQL; only in-flight changes live in memory (`LiveHub`, game rooms). See [Live sessions](../modes/live-sessions.md).

## Grading paths

Scoring is shared pure code in the contract (`scoring.ts`). On submit the API grades objective questions itself, sends code to the runner (null when unconfigured, unreachable, refused, or over the runner's limits, which the API checks before sending → teacher grades it), and runs SQL with sql.js in a separate, killable process. See [Grading](../workflows/grading-and-results.md).

## Deployment and scaling assumptions

- Web on Vercel; API on a host that keeps WebSockets open (the Dockerfile targets Cloud Run-style `$PORT`).
- The API binds loopback by default because only the web app should call it.
- Rate-limit counters, live fan-out and game rooms are per process, so **one API instance** is assumed; the README names Redis as the step for more than one.
- See [Development and CI](../operations/development-and-ci.md) for environment variables.

## Repository notes

- `CLAUDE.md` mentions `apps/web/src/lib/data/code-runner.ts` and `RUNNER_URL` for the web app, and `apps/web/.env.example` still lists `RUNNER_URL`/`RUNNER_SECRET`; the current web source has no such file or variable use. Code is run by the API's `Runner` service.
- `docs/quiz-system-plan.md` is a design document for the quiz system; the README's feature list describes what is implemented.
