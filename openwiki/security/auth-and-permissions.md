---
type: security
title: Authentication, organizations and permissions
description: How accounts and sessions work (Better Auth inside the API with email/password, Google and anonymous guests), platform roles versus organization memberships, how the active organization becomes the Actor every query is scoped by, the permission statements and where they are checked (API and web DAL), rate limits, the web's session watch and the login redirect rules.
tags: [auth, better-auth, organizations, permissions, rbac, rate-limits, security]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-0ef90351a780586dafb97459
    resource: repo://apps/rpc/src/features/admin/Service.ts
  - id: openwiki-source-189f12598980720f9eb0dde3
    resource: repo://apps/rpc/src/features/auth/BetterAuth.ts
  - id: openwiki-source-b3781da53227641b48bae769
    resource: repo://apps/rpc/src/features/auth/Handlers.ts
  - id: openwiki-source-519583888a17b249b4d2fb50
    resource: repo://apps/rpc/src/features/auth/Service.ts
  - id: openwiki-source-2f7031b9dc96acc52b4b1256
    resource: repo://apps/rpc/src/features/auth/Session.ts
  - id: openwiki-source-3b0cff6f473e94546e112b49
    resource: repo://apps/rpc/src/platform/RateLimiter.ts
  - id: openwiki-source-209509493d65701f536c9206
    resource: repo://apps/web/src/features/auth/actions.ts
  - id: openwiki-source-3040a255a135c728ed09badb
    resource: repo://apps/web/src/features/auth/components/session-watch.tsx
  - id: openwiki-source-a12105538dcb0232dfb18910
    resource: repo://apps/web/src/lib/api/client.ts
  - id: openwiki-source-ecddec64e9d82b46b4291ba7
    resource: repo://packages/domain/src/permissions.ts
  - id: openwiki-source-62cd969e8c5c6908cc66fba3
    resource: repo://packages/domain/src/plans.ts
  - id: openwiki-source-695019fb487bfb74ee76d558
    resource: repo://packages/domain/src/roles.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Authentication, organizations and permissions

## Better Auth inside the API (`features/auth/BetterAuth.ts`)

Better Auth runs in the API process on the same database, mounted at `/api/auth/*` (the web app rewrites that path to the API so cookies are first-party). Configuration:

- **Email and password** enabled with **sign-up disabled**: accounts are created by `auth.register` (password rules, IP and per-email limits, terms accepted, duplicate email → `Conflict`, then signed in), by teachers and admins, or through Google sign-up.
- **Google** with `disableImplicitSignUp` and account linking that trusts Google and allows different emails; see [Google sign-in and Classroom](../integrations/google-classroom.md).
- **Plugins**: `admin` (platform roles, `adminRoles: ["admin"]`, default role `user`), `anonymous` (guests from `/join`), `organization` (fixed roles `owner`, `admin`, `teacher`, `student`; creator becomes owner; `dynamicAccessControl` for custom roles when `ORG_CUSTOM_ROLES` is on).
- Profile fields (`department`, `plan`, `planExpiresAt`, `termsAcceptedAt`) are `input: false` — no client can set them. A `user.create.before` hook gives anonymous accounts the `guest` role and validates Google sign-up profiles.
- Better Auth answers with `Set-Cookie`; since the browser never calls the API, `cookiesFrom` parses them into `ResponseCookie` values returned over RPC, and the web app's `applyCookies` sets them on the browser.

## Who the caller is (`features/auth/Session.ts`)

`AuthMiddlewareLive` resolves the Better Auth session from the forwarded headers on every RPC and provides `CurrentUser` (a `SessionUser`), or fails with `Unauthorized`. `toSessionUser`:

- the effective **plan** is the stored plan until `plan_expires_at`, then `free`;
- the **active organization** is the session's stored one if the user is still a member, else the only membership if there is exactly one, else none — and the session is corrected when that differs. Guests have no memberships;
- the active organization carries `permissions` = the grants of the member's roles merged with the organization's custom roles (`grantsOf`).

Handlers then call `requirePermission(p)` (fails `Forbidden` unless `can(user, p)`) or `requireOrgPermission(p)`, which also requires an active organization ("Pick an organization first.") and returns an **`Actor` `{ id, organizationId }`**. Services take the Actor and every repository query filters by `organization_id` and, where relevant, owner — another organization's or teacher's row is simply `NotFound`.

## Roles and permissions (`packages/domain/permissions.ts`, `roles.ts`)

**Platform roles** (`users.role`): `admin` runs the platform — accounts and login sessions only, no teaching, exam access or impersonation; `user` is a real account whose abilities come from organization roles; `guest` is an anonymous player limited to their own attempts, pictures and avatar. **Organization roles** (`members.role`, several per member): `teacher` (classes, rosters, quizzes, bank, sessions, grading, results release, assets, AI use), `student` (enrollment, own attempts and standing), `admin` (teaching plus members, settings, AI keys), `owner` (admin plus deleting the organization), plus custom roles stored in `organization_roles`. `can(who, permissions)` judges admins and guests by their platform role and everyone else by the active organization's grants.

`roleOf` picks the app area: `admin`, `teacher` (owners/admins/teachers), `student` or `guest`; `homeFor` maps it to `/admin`, `/teacher`, `/student`, `/join`, and a user without an organization to `/organizations`.

**Organizations** (`features/organization/Service.ts`): create (creator is owner), set active, add members by email, change roles (checked against fixed and custom roles), remove members, invite codes with roles and expiry, join with a code, and manage custom roles. Each handler requires the matching statement (`organization: update|delete`, `member: create|update|delete`, …).

**Admin** (`features/admin/Service.ts`): calls Better Auth's admin API as the requesting admin — create/update users, set passwords, suspend, remove — and refuses an admin changing their own role.

## Rate limits (`platform/RateLimiter.ts`)

Sliding windows **in Dragonfly**, shared by every API instance and surviving restarts. Keys are accounts, users or the client IP (the first `x-forwarded-for` entry, which the web app sets).

| Limit | Max | Window | Key |
|---|---|---|---|
| `signInEmail` (wrong passwords only) | 10 | 15 min | account |
| `signInIp` (failed sign-ins) | 200 | 10 min | IP |
| `register` / `registerEmail` | 100 / 5 | 60 min | IP / email |
| `google` (OAuth starts) | 300 | 10 min | IP |
| `joinCode` (wrong class codes) | 10 | 10 min | student |
| `guestJoin` | 60 | 10 min | IP |
| `exitPassword` (wrong desktop exit passwords) | 10 | 10 min | user |
| `aiGenerate` / `aiGrade` / `aiCoach` | 30 / 400 / 20 | 60 min | user |
| `codeRun` | 6 | 1 min | student |

Sign-in failures map to `InvalidCredentials`, `AccountSuspended` or `TooManyRequests`.

## Web side

- `lib/auth/dal.ts` re-reads the session on each request and gates pages by role, organization and permission (see [Web app](../architecture/web-app.md)); `proxy.ts` does the same routing early.
- `features/auth/components/session-watch.tsx` signs users out after **30 minutes** without mouse, keyboard, touch or scroll **across tabs** (shared through `localStorage`), warns a minute before, skips exam-taking pages (they have their own timer), and checks every **2 minutes** whether the session ended elsewhere.
- The login action redirects to `next` only when it is inside the user's own area (`home` or `home/…`), so a crafted link can't send someone elsewhere.
- Plans: `/pricing` reads `packages/domain/plans.ts`, which is a draft; Free limits aren't enforced yet.
