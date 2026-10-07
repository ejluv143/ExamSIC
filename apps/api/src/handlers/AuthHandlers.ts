import {
  AccountSuspended,
  AuthRejected,
  AuthRpcs,
  InvalidCredentials,
  TooManyRequests,
  Unauthorized,
} from "@examora/contract";
import { Effect, Option } from "effect";
import { BetterAuth, cookiesFrom, type AuthApiError } from "../BetterAuth.ts";
import { readSession, toSessionUser, webHeaders } from "../Session.ts";

const signInFailure = (
  error: AuthApiError,
): Effect.Effect<never, InvalidCredentials | AccountSuspended | TooManyRequests> => {
  switch (error.status) {
    case "UNAUTHORIZED":
      return Effect.fail(new InvalidCredentials());
    // The admin plugin refuses banned users.
    case "FORBIDDEN":
      return Effect.fail(new AccountSuspended());
    case "TOO_MANY_REQUESTS":
      return Effect.fail(new TooManyRequests());
    default:
      return Effect.die(error);
  }
};

export const AuthHandlers = AuthRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    const withAuth = Effect.provideService(BetterAuth, auth);

    return AuthRpcs.of({
      "auth.config": () => Effect.succeed({ google: auth.googleEnabled }),

      "auth.signInEmail": ({ email, password }, { headers }) =>
        auth
          .call((api) => api.signInEmail({ body: { email, password }, headers: webHeaders(headers), returnHeaders: true }))
          .pipe(
            Effect.flatMap(({ headers: responseHeaders, response }) =>
              Effect.map(toSessionUser(response.user), (user) => ({ user, cookies: cookiesFrom(responseHeaders) })),
            ),
            Effect.catchTag("AuthApiError", signInFailure),
          ),

      "auth.signInGoogle": ({ callbackURL, errorCallbackURL }, { headers }) =>
        auth
          .call((api) =>
            api.signInSocial({
              body: { provider: "google", callbackURL, errorCallbackURL },
              headers: webHeaders(headers),
              returnHeaders: true,
            }),
          )
          .pipe(
            Effect.mapError((error) => new AuthRejected({ message: error.message })),
            Effect.flatMap(({ headers: responseHeaders, response }) =>
              response.url
                ? Effect.succeed({ url: response.url, cookies: cookiesFrom(responseHeaders) })
                : Effect.die("Better Auth returned no Google authorization URL."),
            ),
          ),

      "auth.session": (_, { headers }) =>
        readSession(headers).pipe(
          withAuth,
          Effect.flatMap(Option.match({ onNone: () => Effect.fail(new Unauthorized()), onSome: Effect.succeed })),
        ),

      "auth.signOut": (_, { headers }) =>
        auth.call((api) => api.signOut({ headers: webHeaders(headers), returnHeaders: true })).pipe(
          Effect.map(({ headers: responseHeaders }) => ({ cookies: cookiesFrom(responseHeaders) })),
          Effect.orDie,
        ),
    });
  }),
);
