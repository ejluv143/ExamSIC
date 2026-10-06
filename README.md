# Examora (working name)

Quizzes and exams for colleges and universities: live quizzes like Wayground, plus timed, scheduled exams with essay grading.

## Decisions so far
- Audience: colleges and universities.
- Scale: up to 500 players in one live quiz, or 500 students taking one exam at the same time.
- Stack: Next.js + Tailwind (`apps/web`); NestJS + MySQL (Drizzle) + Redis + Socket.IO (`apps/api`, not built yet).
- Hosting: web on Vercel; the API needs a host that keeps WebSocket connections open (Fly.io / Railway / Render).

## Run the web app
```bash
pnpm install
pnpm dev:web        # http://localhost:3000/teacher
```

Or with [devenv](https://devenv.sh), which provides Node 22 and the pinned pnpm:
```bash
devenv shell        # then run the commands above
devenv up           # or install and start the web app in one step
```

The teacher module runs on demo data in `apps/web/src/lib/data/mock.ts`. Saving in the editor and the grader updates the page only, until the API exists.
