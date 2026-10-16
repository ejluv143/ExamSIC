@apps/web/AGENTS.md

# Repository layout

- npm workspaces monorepo split into `apps/` (`web`, `rpc`, `runner`) and `packages/`.
- `apps/web/` is the Next.js + Tailwind web app; run its commands from `apps/web/` or via `npm run dev:web` at the root.
- `apps/rpc/` is the API: Effect 4 (services, layers, `effect/rpc`) on Bun (`@effect/platform-bun`), PostgreSQL via Drizzle, Better Auth. Follow `apps/rpc/node_modules/effect/AGENTS.md` for Effect style; Effect 4 APIs differ from v3. Bun runs the `.ts` sources directly; relative imports end in `.ts` and only erasable syntax is allowed (`tsc` enforces it). drizzle-kit still runs under Node.
- `apps/runner/` runs students' code for code questions: a small Node service (`npm run dev:runner`) that starts one throwaway Docker container per submission from the `examinus-sandbox` image (`npm run runner:sandbox` builds it). The API calls it from `apps/rpc/src/platform/Runner.ts` with `RUNNER_URL`/`RUNNER_SECRET`; without them, code answers wait for the teacher.
- `packages/contract/` holds the RPC groups, their request/response schemas and the tagged errors; `packages/domain/` holds the pure logic and domain Schemas (scoring, roles, permissions, question model) shared by the web app and the API. Both have one entry per module in `exports` (no barrel). New backend operations: add the `Rpc` there, implement it in `apps/rpc/src/handlers/`, call it from the web app through `apps/web/src/lib/api/client.ts` inside the feature's `data.ts` (`apps/web/src/features/<feature>/data.ts`).
- Schema changes (`apps/rpc/src/database/schemas/`) need `npm run db:generate -- --name <change>` and the generated SQL committed; CI fails otherwise.
- Multi-tenant: `users.role` is the platform role (`admin`, `user`, `guest`: anonymous players from `/join`, limited to their own game attempts). Teaching and learning roles are organization memberships (`members.role`, comma-separated: `owner`, `admin`, `teacher`, `student`, plus custom roles with `ORG_CUSTOM_ROLES`), and a request runs in the session's active organization (`SessionUser.organization`; `roleOf(user)` in `packages/domain/src/roles.ts` gives the area role). Root tables (`classes`, `quizzes`, `bank_questions`, `bank_shares`, `assets`, `ai_keys`, `students`) carry `organization_id`; every ownership helper takes an `Actor` (`{ id, organizationId }`, `apps/rpc/src/features/auth/Session.ts`) and filters by both, so another organization's record is `NotFound`. Permissions live in `packages/domain/src/permissions.ts`; API handlers check them with `requireOrgPermission` (organization content) or `requirePermission` (platform admins, guests) from `Session.ts`, web pages with `requirePermission` from `apps/web/src/lib/auth/dal.ts`. The `org.*` RPCs (`packages/contract/src/organization.ts`) manage organizations; invites are code-based (no email sender).

<!-- OPENWIKI:START -->

## OpenWiki

@AGENTS.md

<!-- OPENWIKI:END -->
