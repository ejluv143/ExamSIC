// Who is making a request: the one place that turns Better Auth sessions and MCP access tokens into the contract's
// `SessionUser`, with their organizations, the active one and their plan.
import { grantsOf } from "@examinus/domain/permissions";
import { isPersonalRole, isPlan, isPlatformRole } from "@examinus/domain/roles";
import { type ActiveOrganization, type ResponseCookie, type SessionUser } from "@examinus/domain/user";
import { Context, Effect, Layer, Option } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { AppConfig } from "../../platform/AppConfig.ts";
import { OrganizationRepo } from "../organization/Repo.ts";
import { BetterAuth, cookiesFrom, webHeaders } from "./BetterAuth.ts";
import { AuthRepo } from "./Repo.ts";

// Better Auth's user record, as the sign-in flows and the stores hand it over.
type AccountRecord = {
  id: string;
  name: string;
  email: string;
  role?: string | null | undefined;
  personalRole?: string | null | undefined;
  department?: string | null | undefined;
  plan?: string | null | undefined;
  planExpiresAt?: Date | null | undefined;
};

export class SessionIdentity extends Context.Service<
  SessionIdentity,
  {
    // The signed-in user for these request headers, plus any cookie Better Auth set while refreshing the session.
    readonly session: (headers: EffectHeaders.Headers) => Effect.Effect<Option.Option<{ user: SessionUser; cookies: ResponseCookie[] }>>;
    // The user behind a request: an MCP access token (`Authorization: Bearer`, sent by apps/mcp) or a session, whether
    // a browser's cookie or a native app's bearer token.
    readonly authenticate: (headers: EffectHeaders.Headers) => Effect.Effect<Option.Option<SessionUser>>;
    // The user of a session that was just made (sign-in, anonymous sign-in), known by its token. The session may
    // already point at an organization (BetterAuth.ts's session hook).
    readonly opened: (account: AccountRecord, token: string) => Effect.Effect<SessionUser>;
    // The user as the session sees them now, for a request that was authenticated a moment ago (after the active
    // organization changed or was deleted).
    readonly current: (headers: EffectHeaders.Headers) => Effect.Effect<SessionUser>;
    // Makes the organization the session's active one (Better Auth checks the membership too; null: the personal
    // space), and returns the user as the session now sees them.
    readonly activate: (organizationId: string | null, headers: EffectHeaders.Headers) => Effect.Effect<SessionUser>;
  }
>()("examinus/api/SessionIdentity") {
  static readonly layer = Layer.effect(
    SessionIdentity,
    Effect.gen(function* () {
      const auth = yield* BetterAuth;
      const orgs = yield* OrganizationRepo;
      const repo = yield* AuthRepo;
      const config = yield* AppConfig;

      // Better Auth's user record as the contract's `SessionUser`, with their organizations and the active one. One
      // whose active organization no longer has them (removed, deleted) gets none: their personal space. Signing in
      // as a member of exactly one organization starts in it (BetterAuth.ts's session hook); the repair is written to
      // the session, known by its token. MCP access tokens have no session: nothing is written, and a member of
      // exactly one organization works in it.
      const toSessionUser = Effect.fn("SessionIdentity.toSessionUser")(function* (
        user: AccountRecord,
        session: { token: string | null; activeOrganizationId?: string | null | undefined },
      ) {
        const { id, name, email, role, personalRole } = user;
        if (!isPlatformRole(role)) return yield* Effect.die(`User ${id} has an invalid role (${String(role)}).`);
        if (!isPersonalRole(personalRole)) return yield* Effect.die(`User ${id} has an invalid personal role (${String(personalRole)}).`);
        // The stored plan until its end date, then free.
        const current = !user.planExpiresAt || user.planExpiresAt > new Date();
        const plan = current && isPlan(user.plan) ? user.plan : "free";
        const memberships = role === "guest" ? [] : yield* orgs.membershipsOf(id);
        const stored = session.activeOrganizationId ?? null;
        const active =
          (stored && memberships.find((m) => m.id === stored)) ||
          (session.token === null && memberships.length === 1 ? memberships[0]! : null);
        if (session.token !== null && (active?.id ?? null) !== stored) yield* orgs.setActive(session.token, active?.id ?? null);
        let organization: ActiveOrganization | null = null;
        if (active) {
          const custom = config.organizations.customRoles
            ? Object.fromEntries(
                (yield* orgs.customRoles(active.id)).map((r) => [r.role, JSON.parse(r.permission) as Record<string, string[]>]),
              )
            : {};
          organization = { ...active, permissions: grantsOf(active.roles, custom) };
        }
        return { id, role, personalRole, name, email, department: user.department ?? null, plan, organization, memberships } satisfies SessionUser;
      });

      const session = Effect.fn("SessionIdentity.session")(function* (headers: EffectHeaders.Headers) {
        const { headers: responseHeaders, response } = yield* auth
          .call((api) => api.getSession({ headers: webHeaders(headers), returnHeaders: true }))
          .pipe(Effect.orDie);
        if (!response) return Option.none();
        const user: SessionUser = yield* toSessionUser(response.user, response.session);
        return Option.some({ user, cookies: cookiesFrom(responseHeaders) });
      });

      // The user an MCP access token was issued to, working in the organization they last picked in the web app.
      const accessTokenUser = Effect.fn("SessionIdentity.accessTokenUser")(function* (token: string) {
        const userId = yield* auth.accessTokenUser(token);
        if (Option.isNone(userId)) return Option.none<SessionUser>();
        const found = yield* repo.tokenUser(userId.value);
        if (!found) return Option.none<SessionUser>();
        return Option.some(yield* toSessionUser(found.user, { token: null, activeOrganizationId: found.activeOrganizationId }));
      });

      const current = Effect.fn("SessionIdentity.current")(function* (headers: EffectHeaders.Headers) {
        const now = yield* session(headers);
        if (Option.isNone(now)) return yield* Effect.die("The session disappeared while changing organizations.");
        return now.value.user;
      });

      return SessionIdentity.of({
        session,
        current,
        // An MCP access token is a JWS (two dots). Any other bearer is a session token from a native app: Better
        // Auth's bearer plugin turns it into the session cookie, so `session` takes it like a browser's.
        authenticate: (headers) => {
          const bearer = /^Bearer (.+)$/.exec(headers["authorization"] ?? "")?.[1];
          return bearer !== undefined && bearer.split(".").length === 3
            ? accessTokenUser(bearer)
            : session(headers).pipe(Effect.map(Option.map((s) => s.user)));
        },
        opened: Effect.fn("SessionIdentity.opened")(function* (account, token) {
          const activeOrganizationId = yield* orgs.activeOf(token);
          return yield* toSessionUser(account, { token, activeOrganizationId });
        }),
        activate: Effect.fn("SessionIdentity.activate")(function* (organizationId, headers) {
          yield* auth
            .call((api) => api.setActiveOrganization({ headers: webHeaders(headers), body: { organizationId } }))
            .pipe(Effect.orDie);
          return yield* current(headers);
        }),
      });
    }),
  );
}
