---
type: operations
title: Local development, configuration, deployment and CI
description: How to run Examinus locally with devenv or by hand, every environment variable per app, the npm scripts, the API container and hosting assumptions, and what the GitHub Actions pipeline checks.
tags: [operations, development, devenv, ci, deployment, configuration]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T17:47:22.617Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-40c83e91bf43e47d4bf6da60
    resource: repo://apps/rpc/package.json
  - id: openwiki-source-e9c107c75b992a0b5c9fffa3
    resource: repo://apps/rpc/src/Runner.ts
  - id: openwiki-source-37186b9bfb98e1af333ad420
    resource: repo://apps/web/.env.example
  - id: openwiki-source-99de51df25f29bfc72caf823
    resource: repo://apps/web/package.json
  - id: openwiki-source-812e1e10ab1c4dd5c1591dd1
    resource: repo://devenv.nix
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-84c0d1bb13d2eb23a283e86f
    resource: repo://packages/contract/package.json
generated: { by: "omp", at: "2026-10-09T17:47:22.617Z" }
---

# Local development, configuration, deployment and CI

## Toolchain

- Node ≥ 22 with npm workspaces (`apps/*`, `packages/*`) for the web app, drizzle-kit and the runner.
- Bun ≥ 1.3 runs the API and its scripts (seed, plan).
- PostgreSQL 17. Optional: an S3-compatible bucket, Docker (code runner), a Google OAuth client.

## devenv (recommended)

`devenv.nix` provides Node 22, Bun, PostgreSQL 17 on `127.0.0.1:5434` (database `examora`) and Garage S3 on `127.0.0.1:3910`, and sets every variable except the Google pair.

- `devenv shell`: environment only; `BETTER_AUTH_SECRET` is generated once per machine into `.devenv/state/auth-secret` (delete it to rotate, which signs everyone out).
- `devenv up`: starts Postgres and Garage (creating the `examora` bucket, importing a fixed development key and setting permissive CORS via the AWS CLI), then the API process (`npm install && db:migrate && db:seed && dev:rpc`, ready when `/health` answers), then the web app on port 3000.
- The code runner is **not** started by devenv.

## Manual setup

```bash
npm install
cp apps/rpc/.env.example apps/rpc/.env        # fill BETTER_AUTH_SECRET etc.
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate && npm run db:seed
npm run dev:rpc     # http://127.0.0.1:3001 (RPC at /rpc)
npm run dev:web     # http://localhost:3000
# optional code runner
npm run runner:sandbox && cp apps/runner/.env.example apps/runner/.env && npm run dev:runner
```

Seeded logins: `admin@`, `teacher@`, `student@sic.edu.ph` with password `12341234`; demo students use `examora-demo`.

## Environment variables

### API (`apps/rpc/.env`, read by Bun automatically; drizzle-kit loads it explicitly)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres URL. |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 chars or the API dies at start; also signs live tickets. |
| `BETTER_AUTH_URL` | yes | The **web app's** origin (browsers only talk to the web app). Default allowed origin for the live WebSocket. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional, both or neither | Google sign-in and Classroom. |
| `RUNNER_URL`, `RUNNER_SECRET` | optional | Code grading; without them code answers wait for the teacher. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_ENDPOINT` | optional | Images and drawings; without them uploads fail with `StorageUnavailable`. |
| `PORT` / `HOST` | default `3001` / `127.0.0.1` | Keep on loopback unless the web app runs elsewhere. |
| `LIVE_ALLOWED_ORIGINS` | optional | Comma-separated browser origins for `/rpc/live`. |
| `CLASSROOM_API_URL`, `GOOGLE_TOKEN_URL` | optional | Override Google endpoints for tests. |

### Web (`apps/web/.env.local`)

| Variable | Notes |
|---|---|
| `API_URL` | Internal API URL; validated at startup; also the `/api/auth/*` rewrite target. |
| `PUBLIC_API_URL` | Optional API URL as browsers reach it (for `wss://`); read per request, no rebuild needed. |
| `RUNNER_URL`, `RUNNER_SECRET` | Listed in `.env.example` but unused by current web code; the API calls the runner. |

### Runner (`apps/runner/.env`, `node --env-file`)

`RUNNER_SECRET` (≥ 16 chars, same value as the API's), `PORT` (4100), `RUNNER_CONCURRENCY` (2), `RUNNER_IMAGE` (`examora-sandbox:1`).

## Root npm scripts

| Script | Does |
|---|---|
| `dev` / `dev:web`, `build` / `build:web`, `start` | Web app (`@examora/web`). |
| `dev:rpc` | `bun --watch src/main.ts`. |
| `lint` | Every workspace's `lint` (only the web app has ESLint). |
| `typecheck` | `tsc --noEmit` in rpc and contract; `next typegen && tsc --noEmit` in web. |
| `db:generate -- --name <x>`, `db:check`, `db:migrate` | drizzle-kit (Node). |
| `db:seed`, `plan:set <email> <plan> [date]` | Bun scripts. See [Database](../data/database-schema.md). |
| `dev:runner`, `runner:sandbox` | Code runner and its Docker image. |

There is no automated test suite in the repository; CI relies on lint, type checks, migration checks, seeding and a start-up smoke test.

## Deployment

- **Web:** Vercel. Per-IP rate limits trust `x-forwarded-for`, which Vercel sets; a self-hosted web app needs a proxy that overwrites it.
- **API:** a host that keeps WebSockets open (Fly.io, Railway, Render, Cloud Run). `docker build -f apps/rpc/Dockerfile .` from the repo root; the image runs Bun on the TS sources, listens on `0.0.0.0:$PORT` (8080), needs `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and does **not** migrate. A reverse proxy must pass `Upgrade` headers and allow long idle timeouts for `/rpc/live`.
- **Single instance:** rate limits, live buses, ticket replay protection, game rooms and sample-run limits are in memory; run one API process until they move to Redis.
- **Runner:** needs Docker access; keep it on a private network, reachable only from the API.

## CI (`.github/workflows/ci.yml`)

On pull requests and pushes to `main` (PR runs cancel superseded ones), job `check` with a Postgres 17 service and throwaway auth env:

1. `npm ci`, `npm run lint`, `npm run typecheck`.
2. `db:check`, then `db:generate -- --name ci-drift-check` and fail if `apps/rpc/src/database/migrations` changed (schema edited without a committed migration).
3. `db:migrate` on the fresh database, `db:seed`.
4. Start the API, poll `/health`, and POST a raw `auth.config` RPC to `/rpc`, expecting a `Success` response.
5. `npm run build:web`.

Job `migrate-production` (opt-in): on pushes to `main` after `check`, if repository variable `MIGRATE_ON_DEPLOY == 'true'`, runs `db:migrate` against the `production` environment's `DATABASE_URL` secret, serialised with `cancel-in-progress: false`.
