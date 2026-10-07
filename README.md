# Examora (working name)

Quizzes and exams for colleges and universities: live quizzes like Wayground, plus timed, scheduled exams with essay grading.

## Decisions so far
- Audience: colleges and universities.
- Scale: up to 500 players in one live quiz, or 500 students taking one exam at the same time.
- Stack: Next.js + Tailwind (`frontend/`); NestJS + PostgreSQL (Drizzle) + Redis + Socket.IO (`backend/api/`, not built yet); code runner on Docker (`backend/runner/`).
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

devenv also sets `SESSION_SECRET`, so `frontend/.env.local` only needs the code runner settings (below), if you use it. The secret is generated once per machine and stored in `.devenv/state/session-secret` (gitignored); delete that file to rotate it, which signs everyone out.

The teacher module runs on demo data in `frontend/src/lib/data/mock.ts`. Saving in the editor and the grader updates the page only, until the API exists.

## Run the code runner (optional)
Code and SQL questions: SQL is graded inside the web app; Python, Java, C, C++ and JavaScript answers are run by `backend/runner/`, which needs Docker.
```bash
npm run runner:sandbox   # once: builds the examora-sandbox image
cp backend/runner/.env.example backend/runner/.env   # set RUNNER_SECRET
npm run dev:runner       # http://127.0.0.1:4100
```
Set the same `RUNNER_SECRET` and `RUNNER_URL=http://127.0.0.1:4100` in `frontend/.env.local`. Without the runner, code answers wait for the teacher to grade them.
