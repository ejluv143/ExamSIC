# Examora (working name)

Quizzes and exams for colleges and universities: live quizzes like Wayground, plus timed, scheduled exams with essay grading.

## Decisions so far
- Audience: colleges and universities.
- Scale: up to 500 players in one live quiz, or 500 students taking one exam at the same time.
- Stack: Next.js + Tailwind (`apps/web`); NestJS + PostgreSQL (Drizzle) + Redis + Socket.IO (`apps/api`, not built yet).
- Auth: [Better Auth](https://better-auth.com) in `apps/web` (email/password, optional Google), stored in PostgreSQL through Drizzle.
- Roles: admin, teacher and student, each with its own area (`/admin`, `/teacher`, `/student`). Permissions per role live in `apps/web/src/lib/auth/permissions.ts`; the data layer checks them with `requirePermission`, and Better Auth's admin plugin enforces account management.
- Hosting: web on Vercel; the API needs a host that keeps WebSocket connections open (Fly.io / Railway / Render).

## Run the web app
The app needs PostgreSQL and the variables in `apps/web/.env.example` (copy it to `apps/web/.env.local`).
```bash
pnpm install
pnpm db:migrate     # apply migrations
pnpm db:seed        # test accounts admin@, teacher@, student@sic.edu.ph (password 12341234) plus demo accounts (examora-demo)
pnpm dev:web        # http://localhost:3000
```

Or with [devenv](https://devenv.sh), which provides Node 22, the pinned pnpm and PostgreSQL 17:
```bash
devenv shell        # then run the commands above; DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL are set
devenv up           # or start Postgres, migrate, seed and start the web app in one step
```

Postgres listens on `127.0.0.1:5434` with an `examora` database: `postgresql://127.0.0.1:5434/examora`.

devenv generates `BETTER_AUTH_SECRET` once per machine and stores it in `.devenv/state/auth-secret` (gitignored); delete that file to rotate it, which signs everyone out. There is no self sign-up: admins create, edit, suspend and remove accounts at `/admin`. "Continue with Google" appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, and works only for an existing account with the same email.

Accounts and sessions live in Postgres. Everything else still runs on demo data in `apps/web/src/lib/data/mock.ts`; saving in the editor and the grader updates the page only, until the API exists.

## Database
Schema: `apps/web/src/database/schemas/`. Migrations: `apps/web/src/database/migrations/`.
```bash
pnpm db:generate --name <change>   # after editing the schema; commit the generated SQL
pnpm db:migrate                    # apply pending migrations to DATABASE_URL
```

## CI
`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: lint, typecheck, migration checks against a fresh PostgreSQL 17 (migrations apply, and the schema has no ungenerated changes), seed, and build.

To migrate production on every push to `main`, add a `production` environment with a `DATABASE_URL` secret and set the repository variable `MIGRATE_ON_DEPLOY` to `true`.
