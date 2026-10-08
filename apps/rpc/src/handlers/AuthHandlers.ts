import {
  AccountSuspended,
  AuthRejected,
  AuthRpcs,
  Conflict,
  InvalidCredentials,
  passwordProblem,
  TooManyRequests,
  Unauthorized,
} from "@examora/contract";
import { Effect, Option } from "effect";
import { BetterAuth, cookiesFrom, type AuthApiError } from "../BetterAuth.ts";
import { clientIp, limits, RateLimiter } from "../RateLimiter.ts";
import { readSession, toSessionUser, webHeaders } from "../Session.ts";

export const AuthHandlers = AuthRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    const limiter = yield* RateLimiter;
    const withAuth = Effect.provideService(BetterAuth, auth);

    // Google's authorization URL, plus Better Auth's OAuth state cookie.
    const googleRedirect = (
      headers: Parameters<typeof webHeaders>[0],
      body: { callbackURL: string; errorCallbackURL: string; requestSignUp?: boolean; additionalData?: Record<string, unknown> },
    ) =>
      limiter.hit(limits.google, clientIp(headers)).pipe(
        Effect.andThen(
          auth.call((api) =>
            api.signInSocial({ body: { provider: "google", ...body }, headers: webHeaders(headers), returnHeaders: true }),
          ),
        ),
        Effect.mapError((error) =>
          error._tag === "TooManyRequests" ? error : new AuthRejected({ message: error.message }),
        ),
        Effect.flatMap(({ headers: responseHeaders, response }) =>
          response.url
            ? Effect.succeed({ url: response.url, cookies: cookiesFrom(responseHeaders) })
            : Effect.die("Better Auth returned no Google authorization URL."),
        ),
      );

    // The admin plugin refuses suspended users with FORBIDDEN.
    const signInFailure = (
      error: AuthApiError,
    ): Effect.Effect<never, InvalidCredentials | AccountSuspended | TooManyRequests> => {
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

    // Signs in with email and password: the session user, and Better Auth's session cookies.
    const signInEmail = (email: string, password: string, headers: Parameters<typeof webHeaders>[0]) =>
      auth
        .call((api) => api.signInEmail({ body: { email, password }, headers: webHeaders(headers), returnHeaders: true }))
        .pipe(
          Effect.flatMap(({ headers: responseHeaders, response }) =>
            Effect.map(toSessionUser(response.user), (user) => ({
              user,
              cookies: cookiesFrom(responseHeaders),
            })),
          ),
        );

    return AuthRpcs.of({
      "auth.config": () => Effect.succeed({ google: auth.googleEnabled }),

      // Only wrong passwords count toward the limits, so a class signing in at once from one campus IP is fine.
      "auth.signInEmail": Effect.fn("auth.signInEmail")(function* ({ email, password }, { headers }) {
        const account = email.trim().toLowerCase();
        const ip = clientIp(headers);
        yield* limiter.check(limits.signInEmail, account);
        yield* limiter.check(limits.signInIp, ip);
        return yield* signInEmail(email, password, headers).pipe(
          Effect.catchTag("AuthApiError", signInFailure),
          Effect.tapErrorTag("InvalidCredentials", () =>
            Effect.andThen(limiter.count(limits.signInEmail, account), limiter.count(limits.signInIp, ip)),
          ),
        );
      }),

      // Creates the account through the admin plugin on the server (no admin session, so no admin rights are
      // used), then signs in to it.
      "auth.register": Effect.fn("auth.register")(function* ({ name, email, password, profile }, { headers }) {
        const weak = passwordProblem(password);
        if (weak) return yield* new AuthRejected({ message: `Your password needs: ${weak.toLowerCase()}.` });
        yield* limiter.hit(limits.register, clientIp(headers));
        yield* auth
          .call((api) =>
            api.createUser({
              body: {
                name: name.trim(),
                email: email.trim(),
                password,
                role: profile.role,
                data: { termsAcceptedAt: new Date() },
              },
            }),
          )
          .pipe(
            Effect.mapError((error) =>
              /already exists/i.test(error.message)
                ? new Conflict({ message: "An account with that email already exists. Sign in instead." })
                : new AuthRejected({ message: error.message }),
            ),
          );
        return yield* signInEmail(email.trim(), password, headers).pipe(
          Effect.mapError((error) => new AuthRejected({ message: error.message })),
        );
      }),

      "auth.signInGoogle": ({ callbackURL, errorCallbackURL }, { headers }) =>
        googleRedirect(headers, { callbackURL, errorCallbackURL }),

      // BetterAuth.ts gives the new user this profile.
      "auth.signUpGoogle": Effect.fn("auth.signUpGoogle")(function* ({ profile, callbackURL, errorCallbackURL }, { headers }) {
        return yield* googleRedirect(headers, {
          callbackURL,
          errorCallbackURL,
          requestSignUp: true,
          additionalData: { examoraProfile: profile },
        });
      }),

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
