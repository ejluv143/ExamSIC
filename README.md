# Examora (working name)

Quizzes and exams for colleges and universities: live quizzes like Wayground, plus timed, scheduled exams with essay grading.

## Decisions so far
- Audience: colleges and universities.
- Scale: up to 500 players in one live quiz, or 500 students taking one exam at the same time.
- Stack: Next.js + Tailwind (`apps/web/`); Effect 4 + PostgreSQL (Drizzle) API (`apps/rpc/`), called over typed Effect RPC defined in `packages/contract/`; code runner on Docker (`apps/runner/`). Redis and Socket.IO for live quizzes come later.
- Auth: [Better Auth](https://better-auth.com) in `apps/rpc/` (email/password, optional Google), stored in PostgreSQL through Drizzle. The web app signs in through RPC and sets the session cookies the API returns; it forwards `/api/auth/*` (the Google callback) to the API.
- Roles: admin, teacher and student, each with its own area (`/admin`, `/teacher`, `/student`). Permissions per role live in `packages/contract/src/permissions.ts`; the API checks them in its RPC handlers, Better Auth's admin plugin enforces account management, and the web app checks them with `requirePermission` for pages and mock data.
- Hosting: web on Vercel; the API needs a host that keeps WebSocket connections open (Fly.io / Railway / Render).

## Run the app
The API needs PostgreSQL and the variables in `apps/rpc/.env.example` (copy it to `apps/rpc/.env`); the web app needs `apps/web/.env.example` (copy it to `apps/web/.env.local`).
```bash
pnpm install
pnpm db:migrate     # apply migrations
pnpm db:seed        # test accounts admin@, teacher@, student@sic.edu.ph (password 12341234) plus demo accounts (examora-demo)
pnpm dev:rpc        # http://127.0.0.1:3001 (RPC at /rpc)
pnpm dev:web        # http://localhost:3000
```

Or with [devenv](https://devenv.sh), which provides Node 22, the pinned pnpm and PostgreSQL 17:
```bash
devenv shell        # then run the commands above; every variable except the Google pair is set
devenv up           # or start Postgres, migrate, seed, and start the API and the web app in one step
```

Postgres listens on `127.0.0.1:5434` with an `examora` database: `postgresql://127.0.0.1:5434/examora`.

devenv generates `BETTER_AUTH_SECRET` once per machine and stores it in `.devenv/state/auth-secret` (gitignored); delete that file to rotate it, which signs everyone out. There is no self sign-up: admins create, edit, suspend and remove accounts at `/admin`. "Continue with Google" appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, and works only for an existing account with the same email.

Accounts and sessions live in Postgres behind the API. Everything else still runs on demo data in `apps/web/src/lib/data/mock.ts`; saving in the editor and the grader updates the page only, until those move to the API.

## Run the code runner (optional)
Code and SQL questions: SQL is graded inside the web app; Python, Java, C, C++ and JavaScript answers are run by `apps/runner/`, which needs Docker.
```bash
npm run runner:sandbox   # once: builds the examora-sandbox image
cp apps/runner/.env.example apps/runner/.env   # set RUNNER_SECRET
npm run dev:runner       # http://127.0.0.1:4100
```
Set the same `RUNNER_SECRET` and `RUNNER_URL=http://127.0.0.1:4100` in `apps/web/.env.local`. Without the runner, code answers wait for the teacher to grade them.

## API
- `packages/contract`: RPC groups, schemas and errors shared by the web app and the API. Add a procedure here first.
- `apps/rpc/src`: Effect services (`Database`, `BetterAuth`), the auth middleware (`Session.ts`), RPC handlers (`handlers/`) and the server (`main.ts`). It runs on Node's built-in TypeScript support; no build step.
- `apps/web/src/lib/api/client.ts`: the RPC client. Server code calls `callApi((api) => api["admin.listUsers"](), forwardedHeaders(...))`.

## Database
Schema: `apps/rpc/src/database/schemas/`. Migrations: `apps/rpc/src/database/migrations/`.
```bash
pnpm db:generate --name <change>   # after editing the schema; commit the generated SQL
pnpm db:migrate                    # apply pending migrations to DATABASE_URL
```

## CI
`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: lint, typecheck, migration checks against a fresh PostgreSQL 17 (migrations apply, and the schema has no ungenerated changes), seed, an API start-up check, and the web build.

To migrate production on every push to `main`, add a `production` environment with a `DATABASE_URL` secret and set the repository variable `MIGRATE_ON_DEPLOY` to `true`.
