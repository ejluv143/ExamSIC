---
type: operations
title: Development and CI
description: How to run Examinus locally (devenv with PostgreSQL 18, Dragonfly, Garage, Grafana, API and web; docker compose as the fallback), the environment variables per app, the workspace scripts, unit versus integration tests and the CI fixture, what CI checks, the desktop, API and OpenWiki workflows, deployment (Cloud Run, Vercel) and observability.
tags: [devenv, ci, github-actions, testing, deployment, observability, environment]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-5bc732f3864550fe80392fe6
    resource: repo://.github/workflows/desktop.yml
  - id: openwiki-source-6d4b4e707b8d60b6ccfa3425
    resource: repo://.github/workflows/openwiki-update.yml
  - id: openwiki-source-1e2b0cb5d15db238aea588fb
    resource: repo://.github/workflows/release-rpc.yml
  - id: openwiki-source-40c83e91bf43e47d4bf6da60
    resource: repo://apps/rpc/package.json
  - id: openwiki-source-db8102ca2abd616516ed1da0
    resource: repo://apps/rpc/src/platform/Observability.ts
  - id: openwiki-source-f255d37ab77fb1d3586eedb7
    resource: repo://apps/rpc/src/platform/Runner.ts
  - id: openwiki-source-b3b990746920552205a2bc59
    resource: repo://apps/rpc/test/fixture/fixture.ts
  - id: openwiki-source-b29234569c1e312bfa98b6ce
    resource: repo://apps/rpc/test/helpers.ts
  - id: openwiki-source-37186b9bfb98e1af333ad420
    resource: repo://apps/web/.env.example
  - id: openwiki-source-99de51df25f29bfc72caf823
    resource: repo://apps/web/package.json
  - id: openwiki-source-812e1e10ab1c4dd5c1591dd1
    resource: repo://devenv.nix
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Development and CI

## Local environment (`devenv.nix`)

`devenv up` starts, in order: **PostgreSQL 18** on `5434` (database `examinus`, created if missing), **Garage** (S3 on `3910`, bucket, a fixed development key and permissive CORS set with the AWS CLI on first start), **Dragonfly** on `6390` (Linux only — a prebuilt binary; on macOS run `docker compose up dragonfly` and export `REDIS_URL`), **Grafana** (`grafana/otel-lgtm` in Docker with the dashboards from `observability/grafana`), then the **API** (`npm install && npm run dev:rpc`, Bun `--watch` on `:3001`) and the **web app** (vite on `:3000`). The shell exports `DATABASE_URL` from `PGPORT` unless already set, `REDIS_URL`, the S3 variables, `BETTER_AUTH_URL=http://localhost:3000`, `LIVE_ALLOWED_ORIGINS` and `DEV_LAN_IP` (so phones on the LAN can reach the web app, API and bucket), and generates `BETTER_AUTH_SECRET` once per machine into `.devenv/state`. Migrations are **not** applied automatically: run `npm run db:migrate` after pulling new ones; demo data comes from `npm run test:fixture -w @examinus/rpc`.

`docker-compose.yml` is the alternative for the API container, Dragonfly and `otel-lgtm`.

## Environment variables

| App | Variables (`.env.example`) |
|---|---|
| `apps/rpc` | `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET` (≥ 32 chars), `BETTER_AUTH_URL` (the web app's origin), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (both or neither), `ORG_CUSTOM_ROLES`, `DESKTOP_MIN_VERSION`/`DESKTOP_RELEASES_REPO`, `RUNNER_URL`/`RUNNER_SECRET`, S3 (`S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, keys), `PORT`/`HOST`, `LIVE_ALLOWED_ORIGINS`, `OTEL_EXPORTER_OTLP_ENDPOINT`. Read through `platform/AppConfig.ts`; see [API server](../architecture/api-server.md). |
| `apps/web` | `API_URL` (build time for the `/api/auth/*` rewrite, and runtime). `RUNNER_URL`/`RUNNER_SECRET` are still listed in its `.env.example` although only the API calls the runner. |
| `apps/runner` | `RUNNER_SECRET`, `RUNNER_CONCURRENCY`, `PORT`. |
| `apps/mcp` | `EXAMINUS_API_URL`, `EXAMINUS_WEB_URL`, `EXAMINUS_EMAIL`, `EXAMINUS_PASSWORD`, `EXAMINUS_ORGANIZATION_ID`. |

## Scripts (root `package.json`)

`dev` / `dev:web` / `dev:rpc` / `dev:runner` / `dev:desktop`, `build:web` / `build:desktop`, `lint` and `typecheck` across workspaces (only the web workspace has an eslint script; `rpc` and the packages type-check with `tsc`, the web runs `vinext typegen` first), `db:generate -- --name <x>` / `db:check` / `db:migrate`, `plan:set`, `check:classroom`, `runner:sandbox`, and `test` = `bun test packages apps/rpc/src` (unit tests beside the code). Bun runs the `.ts` sources directly; relative imports end in `.ts`, only erasable syntax.

## Tests

- **Unit** (`npm test`): `*.test.ts` in `packages/*` and `apps/rpc/src` — domain rules, services with in-memory repos.
- **Integration** (`npm run test:integration -w @examinus/rpc`, `apps/rpc/test/*.test.ts`): black-box RPC calls against a running API over HTTP, using `test/helpers.ts` (`signIn`, `call`, `ok`, `callFrom(ip)`; sign-ins switch to the fixture organization `org-sic`). They need the **fixture** loaded: `test/fixture/fixture.ts` creates the test and demo accounts (hashed passwords), classes, roll calls, quizzes with submissions and the demo relay, idempotently.
- `check:classroom` (`src/checks/classroom-sync.ts`) runs the Classroom import against a stand-in for Google.

## CI (`.github/workflows/ci.yml`)

One `check` job on every push and pull request with PostgreSQL 18 and Dragonfly services: `npm ci`, lint, typecheck, `npm test`, `db:check`, the **migration drift check** (`db:generate` with a throwaway name must leave `migrations/` unchanged), `db:migrate` on the fresh database, the fixture, start the API and smoke `GET /health` plus an `auth.config` RPC, `check:classroom`, the integration tests (relay, sessions, attempts, game, quiz edits, bank, organizations; the API log is printed on failure), and `build:web`. A second job, `migrate-production`, runs `db:migrate` against the production `DATABASE_URL` on pushes to `main` when the repository variable `MIGRATE_ON_DEPLOY` is `true`.

Other workflows:

- **Desktop** (`desktop.yml`): `check` compiles the Tauri shell when it changes and verifies `package.json` and `Cargo.toml` versions agree; `release` on a `desktop-v*` tag builds installers for Windows, macOS and Linux with `tauri-action` (the web URL baked in from the `EXAMINUS_WEB_URL` variable) and publishes the GitHub release the shell's update check reads. See [Desktop app](../architecture/desktop-app.md).
- **Release API** (`release-rpc.yml`): a `rpc-v*` tag creates a GitHub release with generated notes; the API is deployed from source, the release is the record.
- **OpenWiki** (`openwiki-update.yml`): daily at 08:00 UTC or by hand, runs `openwiki code --update` on a full-history checkout and opens a pull request on `openwiki/update` with the regenerated pages; generated pages are not hand-edited.

## Deployment

- **API**: `apps/rpc/Dockerfile` (build from the repo root), listens on `0.0.0.0:$PORT` (default 8080), needs `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; it never runs migrations. The port opens before routes are ready, so hosts must wait for `GET /health` (on Cloud Run: an HTTP startup probe on `/health`). Any PostgreSQL 18 works, including Neon with `sslmode=require` (use the direct connection string for migrations). The host must keep WebSocket connections open.
- **Web**: Nitro picks the output from the environment — on Vercel (Root Directory `apps/web`) it writes `.vercel/output`; elsewhere `npm run build` then `npm start` serves `.output/server/index.mjs` on `$PORT`.

## Observability (`platform/Observability.ts`)

Structured logs always; with `OTEL_EXPORTER_OTLP_ENDPOINT` set, spans, metrics (`platform/Metrics.ts`: RPC latency, live connections, runner and AI calls, asset confirmations…) and logs are exported over OTLP protobuf every 15 s. `observability/grafana` provisions the data sources and dashboards (API, sessions, runner and AI) that `devenv`'s Grafana and docker compose's `otel-lgtm` load.
