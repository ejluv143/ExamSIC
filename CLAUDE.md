@apps/web/AGENTS.md

# Repository layout

- pnpm monorepo. `apps/web/` is the Next.js + Tailwind frontend; run its commands from `apps/web/` or via `pnpm dev:web` at the root.
- `apps/api/` (NestJS + MySQL + Redis + Socket.IO) is planned, not built yet. Until then the web app reads mock data through `apps/web/src/lib/data/`, so swapping in real API calls only touches that folder.
