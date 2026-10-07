@apps/web/AGENTS.md

# Repository layout

- pnpm monorepo. `apps/web/` is the Next.js + Tailwind frontend; run its commands from `apps/web/` or via `pnpm dev:web` at the root.
- `apps/api/` is the backend: Effect 4 (services, layers, `effect/rpc`) on Node, PostgreSQL via Drizzle, Better Auth. Follow `apps/api/node_modules/effect/AGENTS.md` for Effect style; Effect 4 APIs differ from v3. It runs `.ts` directly with Node's type stripping, so relative imports end in `.ts` and only erasable syntax is allowed.
- `packages/contract/` holds the RPC groups, schemas, errors, roles and permissions shared by both apps. New backend operations: add the `Rpc` there, implement it in `apps/api/src/handlers/`, call it from the web app through `apps/web/src/lib/api/client.ts` inside `apps/web/src/lib/data/`. Teacher and student data are still mock data in `apps/web/src/lib/data/`.
- Schema changes (`apps/api/src/database/schemas/`) need `pnpm db:generate --name <change>` and the generated SQL committed; CI fails otherwise.
- Roles are admin, teacher and student. Permissions live in `packages/contract/src/permissions.ts`; API handlers check them with `requirePermission` from `apps/api/src/Session.ts`, web pages and mock data with `requirePermission` from `apps/web/src/lib/auth/dal.ts`.
