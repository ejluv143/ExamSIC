@apps/web/AGENTS.md

# Repository layout

- pnpm monorepo. `apps/web/` is the Next.js + Tailwind frontend; run its commands from `apps/web/` or via `pnpm dev:web` at the root.
- `apps/api/` (NestJS + PostgreSQL + Redis + Socket.IO) is planned, not built yet. Until then the web app reads mock data through `apps/web/src/lib/data/`, so swapping in real API calls only touches that folder.
- Auth is Better Auth inside `apps/web` (`src/lib/auth/`), stored in PostgreSQL via Drizzle (`src/database/`: schemas, migrations, seed). Schema changes need `pnpm db:generate --name <change>` and the generated SQL committed; CI fails otherwise.
- Roles are admin, teacher and student. New data functions and pages that do something role-specific call `requirePermission({ resource: ["action"] })` from `src/lib/auth/dal.ts`; add the resource and action to `src/lib/auth/permissions.ts` and grant it to the right roles.
