---
type: guide
title: Quickstart
description: Entry point to the Examinus (examora) wiki — what the system is, how to run it locally, the repository layout, and which page to read for each kind of task.
tags: [quickstart, overview, onboarding, navigation]
sources:
  - id: openwiki-source-f6a3e0bbdde0fa9128818045
    resource: repo://apps/rpc/src/database/seed.ts
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-812e1e10ab1c4dd5c1591dd1
    resource: repo://devenv.nix
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-d573f184736c5d1593555ca9
    resource: repo://packages/contract/src/roles.ts
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "omp", at: "2026-10-09T18:11:05.062Z" }
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T18:11:05.062Z
---

# Quickstart

**Examinus** (code name `examora`, kept in packages, database, cookies and the sandbox image) is a quiz and exam platform for colleges: reusable quizzes, sessions in four modes (quiz, exam, mastery, game), live monitoring and anti-cheating, grading, classes, attendance and Excel-style class records. Roles: admin, teacher, student, and guest (anonymous players who join a game with just a name at `/join`).

## Repository layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16 + Tailwind web app; all UI; calls the API server-side. |
| `apps/rpc` | Effect 4 API on Bun: Better Auth, Drizzle/PostgreSQL, S3, live WebSocket, background jobs. |
| `apps/runner` | Optional Node service that grades code in throwaway Docker containers. |
| `packages/contract` | Shared RPC groups, schemas, errors, permissions and pure domain logic (scoring, shuffling). |
| `apps/rpc/src/database` | Drizzle schemas, migrations, seed scripts. |
| `.github/workflows/ci.yml` | Lint, typecheck, migration drift, seed, API smoke test, web build. |

## Run it

```bash
devenv up            # Postgres 18, Garage S3, migrate + seed, API :3001, web :3000
# or by hand:
npm install
npm run db:migrate && npm run db:seed
npm run dev:rpc      # API at http://127.0.0.1:3001 (RPC at /rpc)
npm run dev:web      # http://localhost:3000
```

Log in as `teacher@sic.edu.ph`, `student@sic.edu.ph` or `admin@sic.edu.ph` (password `12341234`). Copy `apps/rpc/.env.example` and `apps/web/.env.example` first when not using devenv. Code grading needs `npm run runner:sandbox` and `npm run dev:runner`. Details: [Development and CI](./operations/development-and-ci.md).

## Where to go for a task

| Task | Read |
|---|---|
| Understand how the pieces fit / trace a request | [System architecture overview](./architecture/overview.md) |
| Add or change a backend operation | [RPC contract](./architecture/rpc-contract.md) → [API server](./architecture/api-server.md) → [Web app](./architecture/web-app.md) |
| Change a page, server action or data module | [Web app](./architecture/web-app.md) |
| Touch sign-in, roles, permissions, rate limits | [Authentication and permissions](./security/auth-and-permissions.md) |
| Change the schema or seed data | [Database schema](./data/database-schema.md) (run `npm run db:generate -- --name <change>` and commit the SQL) |
| Add a question type, change scoring or shuffling | [Quizzes and questions](./concepts/quizzes-and-questions.md) |
| Session creation, attempts, autosave, navigation, deadlines | [Session and attempt lifecycle](./workflows/session-and-attempt-lifecycle.md) |
| Grading, result release, exports | [Grading and results](./workflows/grading-and-results.md) |
| Live view, pause/lock/add time, WebSocket | [Live sessions](./modes/live-sessions.md) |
| Kahoot/Wayground-style games, teacher game controls, guest players | [Game mode](./modes/game-mode.md) |
| Self-paced practice | [Mastery mode](./modes/mastery-mode.md) |
| Anti-cheating, exam rules, integrity levels | [Exam mode and anti-cheating](./modes/exam-mode-and-integrity.md) |
| Code and SQL execution | [Code runner and SQL grader](./integrations/code-runner-and-sql-grader.md) |
| Images, drawings, S3 | [Asset storage](./integrations/asset-storage.md) |
| Google sign-in, Classroom import | [Google Classroom](./integrations/google-classroom.md) |
| Classes, roll call, grade book | [Classes, attendance and class record](./concepts/classes-attendance-and-class-record.md) |
| Environment variables, deployment, CI | [Development and CI](./operations/development-and-ci.md) |

## Conventions worth knowing first

- **Contract first:** every API operation is an `Rpc` in `packages/contract`, implemented in `apps/rpc/src/handlers/`, called from `apps/web/src/lib/data/` via `callApi`.
- **Authorise twice:** the web app checks roles (`lib/auth/dal.ts`), and every API handler checks `requirePermission` plus ownership. `NotFound` also means "not yours".
- **Bun runs TypeScript directly:** relative imports end in `.ts`; only erasable syntax is allowed.
- **Effect 4**, not v3: follow `apps/rpc/node_modules/effect/AGENTS.md`. **Next.js 16**: read `node_modules/next/dist/docs/` before framework-level changes.
- **One API instance:** live buses, game rooms, ticket replay sets and rate limits are in memory.
- **No automated test suite**; CI relies on types, migration checks and a smoke test.
- Some docs lag the code: `CLAUDE.md` says teacher/student data are mock (they are real) and mentions a web-side `code-runner.ts` (the API calls the runner); `README.md` says SQL grading uses a worker thread (it is a child process); `apps/rpc/.env.example` still says PostgreSQL 17.
- Any PostgreSQL 18 works, including hosted (Neon); see [Development and CI](./operations/development-and-ci.md).
