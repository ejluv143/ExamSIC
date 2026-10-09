import {
  AuthMiddleware,
  CurrentUser,
  Forbidden,
  Unauthorized,
  can,
  isPlan,
  type Permissions,
  type SessionUser,
} from "@examora/contract";
import { Effect, Layer, Option } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { BetterAuth, cookiesFrom } from "./BetterAuth.ts";

// RPC request headers as a Web `Headers`, the shape Better Auth expects.
export const webHeaders = (headers: EffectHeaders.Headers) => new Headers(headers as Record<string, string>);

// Better Auth's user record as the contract's `SessionUser`; the checks narrow the type.
export const toSessionUser = Effect.fnUntraced(function* (user: {
  id: string;
  name: string;
  email: string;
  role?: string | null | undefined;
  department?: string | null | undefined;
  studentId?: string | null | undefined;
  plan?: string | null | undefined;
  planExpiresAt?: Date | null | undefined;
}) {
  const { id, name, email, role, department, studentId } = user;
  // The stored plan until its end date, then free.
  const current = !user.planExpiresAt || user.planExpiresAt > new Date();
  const plan = current && isPlan(user.plan) ? user.plan : "free";
  if (role === "admin") return { id, role, name, email } satisfies SessionUser;
  if (role === "teacher") return { id, role, name, email, department: department ?? null, plan } satisfies SessionUser;
  if (role === "student") return { id, role, name, email, studentId: studentId ?? null } satisfies SessionUser;
  if (role === "guest") return { id, role, name, email } satisfies SessionUser;
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
