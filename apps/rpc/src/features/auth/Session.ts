import { Forbidden, Unauthorized } from "@examinus/contract/errors";
import { AuthMiddleware, CurrentUser } from "@examinus/contract/middleware";
import { can, type Permissions } from "@examinus/domain/permissions";
import { Effect, Layer, Option } from "effect";
import { SessionIdentity } from "./Identity.ts";

// Provides `CurrentUser` to handlers behind `AuthMiddleware`.
export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const identity = yield* SessionIdentity;
    return AuthMiddleware.of((effect, { headers }) =>
      identity.authenticate(headers).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new Unauthorized()),
            onSome: (user) => Effect.provideService(effect, CurrentUser, user),
          }),
        ),
      ),
    );
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
