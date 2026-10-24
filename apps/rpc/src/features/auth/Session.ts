import { Forbidden, Unauthorized } from "@examinus/contract/errors";
import { AuthMiddleware, CurrentUser } from "@examinus/contract/middleware";
import { can, grantsOf, type Permissions } from "@examinus/domain/permissions";
import { isPersonalRole, isPlan, isPlatformRole } from "@examinus/domain/roles";
import { type ActiveOrganization, type SessionUser } from "@examinus/domain/user";
import { Effect, Layer, Option } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { AppConfig } from "../../platform/AppConfig.ts";
import { OrganizationRepo } from "../organization/Repo.ts";
import { BetterAuth, cookiesFrom } from "./BetterAuth.ts";
import { AuthRepo } from "./Repo.ts";

// RPC request headers as a Web `Headers`, the shape Better Auth expects.
export const webHeaders = (headers: EffectHeaders.Headers) => new Headers(headers as Record<string, string>);

// Better Auth's user record as the contract's `SessionUser`, with their organizations and the active one. One whose
// active organization no longer has them (removed, deleted) gets none: their personal space. (Signing in as a member
// of exactly one organization starts in it: BetterAuth.ts's session hook.) Both are written to the session, known
// by its token. MCP access tokens have no session: nothing is written, and a member of exactly one organization
// works in it.
export const toSessionUser = Effect.fn("toSessionUser")(function* (
  user: {
    id: string;
    name: string;
    email: string;
    role?: string | null | undefined;
    personalRole?: string | null | undefined;
    department?: string | null | undefined;
    plan?: string | null | undefined;
    planExpiresAt?: Date | null | undefined;
  },
  session: { token: string | null; activeOrganizationId?: string | null | undefined },
) {
  const { id, name, email, role, personalRole } = user;
  if (!isPlatformRole(role)) return yield* Effect.die(`User ${id} has an invalid role (${String(role)}).`);
  if (!isPersonalRole(personalRole)) return yield* Effect.die(`User ${id} has an invalid personal role (${String(personalRole)}).`);
  // The stored plan until its end date, then free.
  const current = !user.planExpiresAt || user.planExpiresAt > new Date();
  const plan = current && isPlan(user.plan) ? user.plan : "free";
  const orgs = yield* OrganizationRepo;
  const memberships = role === "guest" ? [] : yield* orgs.membershipsOf(id);
  const stored = session.activeOrganizationId ?? null;
  const active =
    (stored && memberships.find((m) => m.id === stored)) || (session.token === null && memberships.length === 1 ? memberships[0]! : null);
  if (session.token !== null && (active?.id ?? null) !== stored) yield* orgs.setActive(session.token, active?.id ?? null);
  let organization: ActiveOrganization | null = null;
  if (active) {
    const { customRoles } = (yield* AppConfig).organizations;
    const custom = customRoles
      ? Object.fromEntries((yield* orgs.customRoles(active.id)).map((r) => [r.role, JSON.parse(r.permission) as Record<string, string[]>]))
      : {};
    organization = { ...active, permissions: grantsOf(active.roles, custom) };
  }
  return { id, role, personalRole, name, email, department: user.department ?? null, plan, organization, memberships } satisfies SessionUser;
});

// The signed-in user for these request headers, plus any cookie Better Auth set while refreshing the session.
export const readSession = Effect.fn("readSession")(function* (headers: EffectHeaders.Headers) {
  const auth = yield* BetterAuth;
  const { headers: responseHeaders, response } = yield* auth
    .call((api) => api.getSession({ headers: webHeaders(headers), returnHeaders: true }))
    .pipe(Effect.orDie);
  if (!response) return Option.none();
  const user: SessionUser = yield* toSessionUser(response.user, response.session);
  return Option.some({ user, cookies: cookiesFrom(responseHeaders) });
});

// The user an MCP access token (`Authorization: Bearer`, sent by apps/mcp) was issued to, working in the organization
// they last picked in the web app.
const readAccessToken = Effect.fn("readAccessToken")(function* (token: string) {
  const userId = yield* (yield* BetterAuth).accessTokenUser(token);
  if (Option.isNone(userId)) return Option.none<SessionUser>();
  const found = yield* (yield* AuthRepo).tokenUser(userId.value);
  if (!found) return Option.none<SessionUser>();
  const user: SessionUser = yield* toSessionUser(found.user, { token: null, activeOrganizationId: found.activeOrganizationId });
  return Option.some(user);
});

// Provides `CurrentUser` to handlers behind `AuthMiddleware`.
export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    const orgs = yield* OrganizationRepo;
    const repo = yield* AuthRepo;
    const config = yield* AppConfig;
    return AuthMiddleware.of((effect, { headers }) => {
      const bearer = /^Bearer (.+)$/.exec(headers["authorization"] ?? "")?.[1];
      const user = bearer ? readAccessToken(bearer) : readSession(headers).pipe(Effect.map(Option.map((s) => s.user)));
      return user.pipe(
        Effect.provideService(BetterAuth, auth),
        Effect.provideService(OrganizationRepo, orgs),
        Effect.provideService(AuthRepo, repo),
        Effect.provideService(AppConfig, config),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new Unauthorized()),
            onSome: (user) => Effect.provideService(effect, CurrentUser, user),
          }),
        ),
      );
    });
  }),
);

// Fails with `Forbidden` unless the signed-in user may do all of this: platform admins and guests by their platform
// role, everyone else by their roles in the active organization, or their personal space when none is active.
export const requirePermission = Effect.fn("requirePermission")(function* (permissions: Permissions) {
  const user = yield* CurrentUser;
  if (!can(user, permissions)) {
    return yield* new Forbidden({
      message: user.role === "user" && !user.organization ? "That needs an organization: pick or make one first." : "Your role doesn't allow this.",
    });
  }
  return user;
});

// Who a service works for: the user, in the organization the request runs in (null: their personal space). Every
// ownership check filters by both, so `NotFound` keeps meaning "not yours (here)".
export type Actor = { readonly id: string; readonly organizationId: string | null };

// `requirePermission`, and the organization the request works in, as `actor` for the services. Handlers for
// teaching and learning content use this; platform admins and guests have no organization either.
export const requireActor = Effect.fn("requireActor")(function* (permissions: Permissions) {
  const user = yield* requirePermission(permissions);
  const actor: Actor = { id: user.id, organizationId: user.organization?.id ?? null };
  return { ...user, actor };
});

// `requirePermission` for what only an organization has (its members, invites, roles, AI keys): the active one, or
// `Forbidden` in the personal space.
export const requireOrganization = Effect.fn("requireOrganization")(function* (permissions: Permissions) {
  const user = yield* requirePermission(permissions);
  if (!user.organization) return yield* new Forbidden({ message: "That needs an organization: pick or make one first." });
  return { ...user, organization: user.organization };
});
