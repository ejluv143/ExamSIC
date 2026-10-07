@frontend/AGENTS.md

# Repository layout

- pnpm monorepo split into `frontend/` and `backend/`.
- `frontend/` is the Next.js + Tailwind web app; run its commands from `frontend/` or via `npm run dev` at the root.
- `backend/runner/` runs students' code for code questions: a small Node service (`npm run dev:runner`) that starts one throwaway Docker container per submission from the `examora-sandbox` image (`npm run runner:sandbox` builds it). The web app calls it from `src/lib/data/code-runner.ts` with `RUNNER_URL`/`RUNNER_SECRET`; without them, code answers wait for the teacher.
- `backend/api/` (NestJS + PostgreSQL + Redis + Socket.IO) is planned, not built yet. Until then the web app reads mock data through `frontend/src/lib/data/`, so swapping in real API calls only touches that folder.
