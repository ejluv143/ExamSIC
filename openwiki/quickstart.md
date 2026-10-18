---
type: guide
title: Quickstart
description: Entry point to the Examinus wiki — what the system is, how to run it locally, the repository layout after the feature-folder refactor, and which page to read for each kind of task.
tags: [quickstart, overview, onboarding, navigation]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-b3b990746920552205a2bc59
    resource: repo://apps/rpc/test/fixture/fixture.ts
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-812e1e10ab1c4dd5c1591dd1
    resource: repo://devenv.nix
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-695019fb487bfb74ee76d558
    resource: repo://packages/domain/src/roles.ts
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Quickstart

**Examinus** is a quiz and exam platform for colleges: reusable quizzes with thirteen question types, sessions in four modes (quiz, exam, mastery, game — every one starting from a lobby), live monitoring and anti-cheating, a desktop exam client, grading with optional AI help, classes, attendance and Excel-style class records, all inside multi-tenant organizations. The name is Examinus everywhere (packages `@examinus/*`, database, cookies, bucket, sandbox image); it was renamed from `examora`.

Roles: the platform roles `admin`, `user` and `guest` (anonymous players who join a game with a name at `/join`), and organization roles `owner`, `admin`, `teacher`, `student` plus custom roles. See [Authentication, organizations and permissions](./security/auth-and-permissions.md).

## Repository layout

| Path | What it is |
|---|---|
| `apps/web` | vinext (Vite) + React 19 + Tailwind web app: thin `app/` routes over `features/<feature>/{data.ts,actions.ts,components/}`; calls the API server-side only. |
| `apps/rpc` | Effect 4 API on Bun: `features/<feature>/{Repo,Service,Handlers,Jobs,rules,mappers}.ts` and `platform/*` (database, config, cache, live bus, storage, runner, rate limits, observability). Better Auth, Drizzle/PostgreSQL, Dragonfly, S3, live WebSocket. |
| `apps/runner` | Optional Node service that grades code in throwaway Docker containers. |
| `apps/desktop` | Examinus Desktop: Tauri 2 shell for exams (version checks, exit lock). |
| `apps/mcp` | MCP server over stdio that acts as a signed-in teacher. |
| `packages/domain` | Pure logic and domain schemas shared by web and API: question kinds, scoring, shuffling, roles, permissions, integrity, analytics. |
| `packages/contract` | RPC groups, request/response schemas and tagged errors. |
| `apps/rpc/src/database` | Drizzle schemas and migrations. |
| `apps/rpc/test` | Integration tests and the CI fixture (the only demo data). |

## Run it

```bash
devenv up              # Postgres 18 :5434, Dragonfly :6390, Garage S3 :3910, Grafana, API :3001, web :3000
npm run db:migrate     # after pulling new migrations (devenv doesn't migrate)
npm run test:fixture -w @examinus/rpc   # optional demo/test data
```

With the fixture loaded, sign in as `teacher@sic.edu.ph`, `student@sic.edu.ph` or `admin@sic.edu.ph` (password `12341234`). A fresh database is otherwise empty: register at `/register` and make the first platform admin in SQL. Without devenv, copy `apps/rpc/.env.example` and `apps/web/.env.example`, provide PostgreSQL 18 and Dragonfly/Redis, then `npm run dev:rpc` and `npm run dev:web`. Code grading needs `npm run runner:sandbox` and `npm run dev:runner`. Details: [Development and CI](./operations/development-and-ci.md).

## Where to go for a task

| Task | Read |
|---|---|
| Understand how the pieces fit / trace a request | [System architecture overview](./architecture/overview.md) |
| Add or change a backend operation | [RPC contract](./architecture/rpc-contract.md) → [API server](./architecture/api-server.md) → [Web app](./architecture/web-app.md) |
| Change a page, server action or data module | [Web app](./architecture/web-app.md) |
| Desktop exam client, exit password, version checks | [Desktop app](./architecture/desktop-app.md) |
| Sign-in, organizations, roles, permissions, rate limits | [Authentication, organizations and permissions](./security/auth-and-permissions.md) |
| Change the schema | [Database schema](./data/database-schema.md) (run `npm run db:generate -- --name <change>` and commit the SQL) |
| Add a question type, change scoring or shuffling, question bank | [Quizzes and questions](./concepts/quizzes-and-questions.md) |
| Session creation, lobby, attempts, autosave, navigation, deadlines | [Session and attempt lifecycle](./workflows/session-and-attempt-lifecycle.md) |
| Grading, result release, exports | [Grading and results](./workflows/grading-and-results.md) |
| Live view, pause/lock/add time, WebSocket | [Live sessions](./modes/live-sessions.md) |
| Kahoot/Wayground-style games, Team Relay, guest players | [Game mode](./modes/game-mode.md) |
| Self-paced practice | [Mastery mode](./modes/mastery-mode.md) |
| Anti-cheating, exam rules, allowed clients, integrity levels | [Exam mode and anti-cheating](./modes/exam-mode-and-integrity.md) |
| Code and SQL execution | [Code runner and SQL grader](./integrations/code-runner-and-sql-grader.md) |
| Images, drawings, S3 | [Asset storage](./integrations/asset-storage.md) |
| Google sign-in, Classroom import | [Google sign-in and Classroom import](./integrations/google-classroom.md) |
| AI drafts, grading suggestions, coach | [AI assistance](./integrations/ai-assistance.md) |
| Driving Examinus from an AI client | [MCP server](./integrations/mcp-server.md) |
| Classes, roll call, grade book | [Classes, attendance and the class record](./concepts/classes-attendance-and-class-record.md) |
| Environment variables, deployment, CI, observability | [Development and CI](./operations/development-and-ci.md) |

## Conventions worth knowing first

- **Contract first:** every API operation is an `Rpc` in `packages/contract`, implemented by a feature's `Handlers.ts` over its `Service` and `Repo` in `apps/rpc/src/features/<feature>/`, and called from the web feature's `data.ts` through `lib/api/client.ts`. (`CLAUDE.md` still names the old `apps/rpc/src/handlers/` folder.)
- **Authorise twice:** the web app gates pages (`lib/auth/dal.ts`), and every API handler checks `requirePermission`/`requireOrgPermission` plus ownership through the `Actor`. `NotFound` also means "not yours".
- **Bun runs TypeScript directly:** relative imports end in `.ts`; only erasable syntax is allowed.
- **Effect 4**, not v3: follow `apps/rpc/node_modules/effect/AGENTS.md`.
- **Shared state lives in Dragonfly:** rate limits, ticket replay, live channels and caches, so several API instances can run; game rooms are an in-memory cache rebuilt from Postgres.
- **Tests:** unit tests beside the code (`npm test`) and black-box integration tests against a running API on the fixture (`apps/rpc/test`), both in CI.
