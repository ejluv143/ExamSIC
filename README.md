# Examora (working name)

Quizzes and exams for colleges and universities: live quizzes like Wayground, plus timed, scheduled exams with essay grading.

## Decisions so far
- Audience: colleges and universities.
- Scale: up to 500 players in one live quiz, or 500 students taking one exam at the same time.
- Stack: Next.js + Tailwind (`apps/web`); NestJS + PostgreSQL (Drizzle) + Redis + Socket.IO (`apps/api`, not built yet).
- Hosting: web on Vercel; the API needs a host that keeps WebSocket connections open (Fly.io / Railway / Render).

## Run the web app
```bash
pnpm install
pnpm dev:web        # http://localhost:3000/teacher
```

Or with [devenv](https://devenv.sh), which provides Node 22, the pinned pnpm and PostgreSQL 17:
```bash
devenv shell        # then run the commands above; DATABASE_URL is set
devenv up           # or start Postgres and the web app in one step
```

Postgres listens on `127.0.0.1:5434` with an `examora` database: `postgresql://127.0.0.1:5434/examora`.

devenv also sets `SESSION_SECRET`, so `apps/web/.env.local` is not needed. The secret is generated once per machine and stored in `.devenv/state/session-secret` (gitignored); delete that file to rotate it, which signs everyone out.

The teacher module runs on demo data in `apps/web/src/lib/data/mock.ts`. Saving in the editor and the grader updates the page only, until the API exists.
