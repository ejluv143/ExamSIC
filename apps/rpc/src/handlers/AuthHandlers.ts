import {
  AccountSuspended,
  AuthRejected,
  AuthRpcs,
  Conflict,
  InvalidCredentials,
  NotFound,
  passwordProblem,
  TooManyRequests,
  Unauthorized,
  type ResponseCookie,
  type SessionUser,
} from "@examora/contract";
import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";
import { BetterAuth, cookiesFrom, type AuthApiError } from "../BetterAuth.ts";
import { Database } from "../Database.ts";
import { newId } from "../database/schemas/_helpers.ts";
import { students, users } from "../database/schemas/index.ts";
import { Game } from "../modes/game.ts";
import { clientIp, limits, RateLimiter } from "../RateLimiter.ts";
import { readSession, toSessionUser, webHeaders } from "../Session.ts";

export const AuthHandlers = AuthRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    const limiter = yield* RateLimiter;
    const db = yield* Database;
    const game = yield* Game;
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

      // The key is checked before anything is created, so wrong keys make no accounts. The guest gets a roster
      // entry (`students`) named as typed, which is how teachers see players; then the game's roster, like
      // game.find. The web app sends the guest to the game with the cookies. A guest joining again (another game,
      // or the same one) keeps their account and takes the new name.
      "auth.joinAsGuest": Effect.fn("auth.joinAsGuest")(function* ({ name, code }, { headers }) {
        yield* limiter.hit(limits.guestJoin, clientIp(headers));
        const open = yield* game.lookup(code);
        if (!open.guestsAllowed) return yield* new NotFound({ message: "That key doesn't match a game that guests can join." });
        const existing = yield* readSession(headers).pipe(withAuth);
        if (Option.isSome(existing) && existing.value.user.role !== "guest")
          return yield* new Conflict({ message: "You're signed in. Students join from their dashboard; sign out to play as a guest." });
        let user: SessionUser;
        let cookies: ResponseCookie[] = [];
        if (Option.isSome(existing)) {
          user = { ...existing.value.user, name };
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              await tx.update(users).set({ name }).where(eq(users.id, user.id));
              await tx.update(students).set({ firstName: name }).where(eq(students.userId, user.id));
            }),
          );
        } else {
          const { headers: responseHeaders, response } = yield* auth
            .call((api) => api.signInAnonymous({ headers: webHeaders(headers), returnHeaders: true }))
            .pipe(Effect.orDie);
          if (!response) return yield* Effect.die("Better Auth returned no anonymous session.");
          const id = response.user.id;
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              await tx.update(users).set({ name }).where(eq(users.id, id));
              await tx.insert(students).values({ id: newId("s"), userId: id, firstName: name, lastName: "", email: response.user.email });
            }),
          );
          user = yield* toSessionUser({ ...response.user, role: "guest", name });
          cookies = cookiesFrom(responseHeaders);
        }
        const found = yield* game.find(user, code);
        return { user, cookies, found };
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
