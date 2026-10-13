import { AccountSuspended, AuthRejected, AuthRpcs, InvalidCredentials } from "@examinus/contract/auth";
import { Conflict, TooManyRequests } from "@examinus/contract/errors";
import { AvatarRpcs } from "@examinus/contract/avatar";
import { Effect, Layer } from "effect";
import { limits } from "../../platform/RateLimiter.ts";
import type { AuthApiError } from "./BetterAuth.ts";
import { AuthService } from "./Service.ts";
import { requirePermission } from "./Session.ts";

// Better Auth's messages are written for people.
const rejected = (error: AuthApiError) => new AuthRejected({ message: error.message });

// The admin plugin refuses suspended users with FORBIDDEN.
const signInFailure = (error: AuthApiError): Effect.Effect<never, InvalidCredentials | AccountSuspended | TooManyRequests> => {
  switch (error.status) {
    case "UNAUTHORIZED":
      return Effect.fail(new InvalidCredentials());
    case "FORBIDDEN":
      return Effect.fail(new AccountSuspended());
    case "TOO_MANY_REQUESTS":
      return Effect.fail(new TooManyRequests({ message: limits.signInEmail.message }));
    default:
      return Effect.die(error);
  }
};

const registerFailure = (error: AuthApiError) =>
  Effect.fail(
    /already exists/i.test(error.message)
      ? new Conflict({ message: "An account with that email already exists. Sign in instead." })
      : rejected(error),
  );

export const AuthHandlers = AuthRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthService;

    return AuthRpcs.of({
      "auth.config": () => auth.config,
      "auth.signInEmail": (input, { headers }) =>
        auth.signInEmail(input, headers).pipe(Effect.catchTag("AuthApiError", signInFailure)),
      "auth.register": (input, { headers }) =>
        auth.register(input, headers).pipe(Effect.catchTag("AuthApiError", registerFailure)),
      "auth.signInGoogle": (input, { headers }) => auth.signInGoogle(input, headers).pipe(Effect.catchTag("AuthApiError", (e) => Effect.fail(rejected(e)))),
      "auth.signUpGoogle": (input, { headers }) => auth.signUpGoogle(input, headers).pipe(Effect.catchTag("AuthApiError", (e) => Effect.fail(rejected(e)))),
      "auth.joinAsGuest": (input, { headers }) => auth.joinAsGuest(input, headers),
      "auth.session": (_, { headers }) => auth.session(headers),
      "auth.signOut": (_, { headers }) => auth.signOut(headers),
    });
  }),
);

export const AvatarHandlers = AvatarRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthService;

    return AvatarRpcs.of({
      "avatar.mine": Effect.fn("avatar.mine")(function* () {
        const user = yield* requirePermission({ avatar: ["update"] });
        return yield* auth.avatar(user.id);
      }),
      "avatar.save": Effect.fn("avatar.save")(function* ({ avatar }) {
        const user = yield* requirePermission({ avatar: ["update"] });
        yield* auth.saveAvatar(user.id, avatar);
      }),
    });
  }),
);

export const Handlers = Layer.mergeAll(AuthHandlers, AvatarHandlers);
