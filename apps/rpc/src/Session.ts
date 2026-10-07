import {
  AuthMiddleware,
  CurrentUser,
  Forbidden,
  Unauthorized,
  can,
  type Permissions,
  type SessionUser,
} from "@examora/contract";
import { Effect, Layer, Option } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { BetterAuth, cookiesFrom } from "./BetterAuth.ts";

// RPC request headers as a Web `Headers`, the shape Better Auth expects.
export const webHeaders = (headers: EffectHeaders.Headers) => new Headers(headers as Record<string, string>);

// Better Auth's user record as the contract's `SessionUser`. The users_role_profile_check constraint
// guarantees the profile fields; the checks narrow the type.
export const toSessionUser = Effect.fnUntraced(function* (user: {
  id: string;
  name: string;
  email: string;
  role?: string | null | undefined;
  department?: string | null | undefined;
  studentId?: string | null | undefined;
}) {
  const { id, name, email, role, department, studentId } = user;
  if (role === "admin") return { id, role, name, email } satisfies SessionUser;
  if (role === "teacher" && department) return { id, role, name, email, department } satisfies SessionUser;
  if (role === "student" && studentId) return { id, role, name, email, studentId } satisfies SessionUser;
  return yield* Effect.die(`User ${id} has an invalid role or profile (${String(role)}).`);
});

// The signed-in user for these request headers, plus any cookie Better Auth set while refreshing the session.
export const readSession = Effect.fn("readSession")(function* (headers: EffectHeaders.Headers) {
  const auth = yield* BetterAuth;
  const { headers: responseHeaders, response } = yield* auth
    .call((api) => api.getSession({ headers: webHeaders(headers), returnHeaders: true }))
    .pipe(Effect.orDie);
  if (!response) return Option.none();
  const user: SessionUser = yield* toSessionUser(response.user);
  return Option.some({ user, cookies: cookiesFrom(responseHeaders) });
});

// Provides `CurrentUser` to handlers behind `AuthMiddleware`.
export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    return AuthMiddleware.of((effect, { headers }) =>
      readSession(headers).pipe(
        Effect.provideService(BetterAuth, auth),
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

// Fails with `Forbidden` unless the signed-in user's role grants every listed permission.
export const requirePermission = Effect.fn("requirePermission")(function* (permissions: Permissions) {
  const user = yield* CurrentUser;
  if (!can(user.role, permissions)) return yield* new Forbidden({ message: "Your role doesn't allow this." });
  return user;
});
