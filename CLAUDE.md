@apps/web/AGENTS.md

# Repository layout

- pnpm monorepo split into `apps/` (`web`, `rpc`, `runner`) and `packages/`.
- `apps/web/` is the Next.js + Tailwind web app; run its commands from `apps/web/` or via `pnpm dev:web` at the root.
- `apps/rpc/` is the API: Effect 4 (services, layers, `effect/rpc`) on Bun (`@effect/platform-bun`), PostgreSQL via Drizzle, Better Auth. Follow `apps/rpc/node_modules/effect/AGENTS.md` for Effect style; Effect 4 APIs differ from v3. Bun runs the `.ts` sources directly; relative imports end in `.ts` and only erasable syntax is allowed (`tsc` enforces it). drizzle-kit still runs under Node.
- `apps/runner/` runs students' code for code questions: a small Node service (`pnpm dev:runner`) that starts one throwaway Docker container per submission from the `examora-sandbox` image (`pnpm runner:sandbox` builds it). The web app calls it from `src/lib/data/code-runner.ts` with `RUNNER_URL`/`RUNNER_SECRET`; without them, code answers wait for the teacher.
- `packages/contract/` holds the RPC groups, schemas, errors, roles and permissions shared by the web app and the API. New backend operations: add the `Rpc` there, implement it in `apps/rpc/src/handlers/`, call it from the web app through `apps/web/src/lib/api/client.ts` inside `apps/web/src/lib/data/`. Teacher and student data are still mock data in `apps/web/src/lib/data/`.
- Schema changes (`apps/rpc/src/database/schemas/`) need `pnpm db:generate --name <change>` and the generated SQL committed; CI fails otherwise.
- Roles are admin, teacher and student. Permissions live in `packages/contract/src/permissions.ts`; API handlers check them with `requirePermission` from `apps/rpc/src/Session.ts`, web pages and mock data with `requirePermission` from `apps/web/src/lib/auth/dal.ts`.
