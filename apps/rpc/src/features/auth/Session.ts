import { Forbidden, Unauthorized } from "@examinus/contract/errors";
import { AuthMiddleware, CurrentUser } from "@examinus/contract/middleware";
import { can, grantsOf, type Permissions } from "@examinus/domain/permissions";
import { isPlan, isPlatformRole } from "@examinus/domain/roles";
import { type ActiveOrganization, type SessionUser } from "@examinus/domain/user";
import { Effect, Layer, Option } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { AppConfig } from "../../platform/AppConfig.ts";
import { OrganizationRepo } from "../organization/Repo.ts";
import { BetterAuth, cookiesFrom } from "./BetterAuth.ts";

// RPC request headers as a Web `Headers`, the shape Better Auth expects.
export const webHeaders = (headers: EffectHeaders.Headers) => new Headers(headers as Record<string, string>);

// Better Auth's user record as the contract's `SessionUser`, with their organizations and the active one. A member
// of exactly one organization gets it as the active one without picking; one whose active organization no longer
// has them (removed, deleted) gets none. Both are written to the session, known by its token.
export const toSessionUser = Effect.fn("toSessionUser")(function* (
  user: {
    id: string;
    name: string;
    email: string;
    role?: string | null | undefined;
    department?: string | null | undefined;
    plan?: string | null | undefined;
    planExpiresAt?: Date | null | undefined;
  },
  session: { token: string; activeOrganizationId?: string | null | undefined },
) {
  const { id, name, email, role } = user;
  if (!isPlatformRole(role)) return yield* Effect.die(`User ${id} has an invalid role (${String(role)}).`);
  // The stored plan until its end date, then free.
  const current = !user.planExpiresAt || user.planExpiresAt > new Date();
  const plan = current && isPlan(user.plan) ? user.plan : "free";
  const orgs = yield* OrganizationRepo;
  const memberships = role === "guest" ? [] : yield* orgs.membershipsOf(id);
  const stored = session.activeOrganizationId ?? null;
  const active = (stored && memberships.find((m) => m.id === stored)) || (memberships.length === 1 ? memberships[0]! : null);
  if ((active?.id ?? null) !== stored) yield* orgs.setActive(session.token, active?.id ?? null);
  let organization: ActiveOrganization | null = null;
  if (active) {
    const { customRoles } = (yield* AppConfig).organizations;
    const custom = customRoles
      ? Object.fromEntries((yield* orgs.customRoles(active.id)).map((r) => [r.role, JSON.parse(r.permission) as Record<string, string[]>]))
      : {};
    organization = { ...active, permissions: grantsOf(active.roles, custom) };
  }
  return { id, role, name, email, department: user.department ?? null, plan, organization, memberships } satisfies SessionUser;
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

// Provides `CurrentUser` to handlers behind `AuthMiddleware`.
export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    const orgs = yield* OrganizationRepo;
    const config = yield* AppConfig;
    return AuthMiddleware.of((effect, { headers }) =>
      readSession(headers).pipe(
        Effect.provideService(BetterAuth, auth),
        Effect.provideService(OrganizationRepo, orgs),
        Effect.provideService(AppConfig, config),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new Unauthorized()),
            onSome: ({ user }) => Effect.provideService(effect, CurrentUser, user),
          }),
        ),
      ),
    );
  }),
);

// Fails with `Forbidden` unless the signed-in user may do all of this: platform admins and guests by their platform
// role, everyone else by their roles in the active organization (none active: nothing is allowed).
export const requirePermission = Effect.fn("requirePermission")(function* (permissions: Permissions) {
  const user = yield* CurrentUser;
  if (!can(user, permissions)) {
    return yield* new Forbidden({
      message: user.role === "user" && !user.organization ? "Pick an organization first." : "Your role doesn't allow this.",
    });
  }
  return user;
});

// Who a service works for: the user, in the organization the request runs in. Every ownership check filters by
// both, so `NotFound` keeps meaning "not yours (here)".
export type Actor = { readonly id: string; readonly organizationId: string };

// `requirePermission`, and the active organization the request works in, as `actor` for the services. Platform
// admins and guests have none, so handlers for organization content use this.
export const requireOrgPermission = Effect.fn("requireOrgPermission")(function* (permissions: Permissions) {
  const user = yield* requirePermission(permissions);
  if (!user.organization) return yield* new Forbidden({ message: "Pick an organization first." });
  const actor: Actor = { id: user.id, organizationId: user.organization.id };
  return { ...user, organization: user.organization, actor };
});
