// Signing in and up (password, Google, guest), the session, and the user's avatar.
import { AuthRejected } from "@examinus/contract/auth";
import { Conflict, NotFound, Unauthorized } from "@examinus/contract/errors";
import { type Avatar } from "@examinus/domain/avatar";
import { passwordProblem } from "@examinus/domain/password";
import { type RegistrationProfile, type ResponseCookie, type SessionUser } from "@examinus/domain/user";
import { Context, Effect, Layer, Option } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { AppConfig } from "../../platform/AppConfig.ts";
import { Database } from "../../platform/Database.ts";
import { clientIp, limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { Game } from "../game/Service.ts";
import { OrganizationRepo } from "../organization/Repo.ts";
import { avatarOf } from "./avatar.ts";
import { BetterAuth, cookiesFrom, createOwnOrganization } from "./BetterAuth.ts";
import { AuthRepo } from "./Repo.ts";
import { readSession, toSessionUser, webHeaders } from "./Session.ts";

const make = Effect.gen(function* () {
  const auth = yield* BetterAuth;
  const limiter = yield* RateLimiter;
  const repo = yield* AuthRepo;
  const game = yield* Game;
  const { drizzle } = yield* Database;
  const orgs = yield* OrganizationRepo;
  const config = yield* AppConfig;
  // What `toSessionUser` and `readSession` need besides the caller's arguments.
  const withAuth = <A, E>(effect: Effect.Effect<A, E, BetterAuth | OrganizationRepo | AppConfig>) =>
    effect.pipe(
      Effect.provideService(BetterAuth, auth),
      Effect.provideService(OrganizationRepo, orgs),
      Effect.provideService(AppConfig, config),
    );

  // Google's authorization URL, plus Better Auth's OAuth state cookie.
  const googleRedirect = (
    headers: EffectHeaders.Headers,
    body: { callbackURL: string; errorCallbackURL: string; requestSignUp?: boolean; additionalData?: Record<string, unknown> },
  ) =>
    limiter.hit(limits.google, clientIp(headers)).pipe(
      Effect.andThen(
        auth.call((api) =>
          api.signInSocial({ body: { provider: "google", ...body }, headers: webHeaders(headers), returnHeaders: true }),
        ),
      ),
      Effect.flatMap(({ headers: responseHeaders, response }) =>
        response.url
          ? Effect.succeed({ url: response.url, cookies: cookiesFrom(responseHeaders) })
          : Effect.die("Better Auth returned no Google authorization URL."),
      ),
    );

  // Signs in with email and password: the session user, and Better Auth's session cookies.
  const signInWith = (email: string, password: string, headers: EffectHeaders.Headers) =>
    auth
      .call((api) => api.signInEmail({ body: { email, password }, headers: webHeaders(headers), returnHeaders: true }))
      .pipe(
        Effect.flatMap(({ headers: responseHeaders, response }) =>
          toSessionUser(response.user, { token: response.token, activeOrganizationId: null }).pipe(
            withAuth,
            Effect.map((user) => ({
              user,
              cookies: cookiesFrom(responseHeaders),
            })),
          ),
        ),
      );

  // Only wrong passwords count toward the limits, so a class signing in at once from one campus IP is fine.
  const signInEmail = Effect.fn("AuthService.signInEmail")(function* (
    { email, password }: { email: string; password: string },
    headers: EffectHeaders.Headers,
  ) {
    const account = email.trim().toLowerCase();
    const ip = clientIp(headers);
    yield* limiter.check(limits.signInEmail, account);
    yield* limiter.check(limits.signInIp, ip);
    return yield* signInWith(email, password, headers).pipe(
      // Better Auth answers a wrong password with UNAUTHORIZED.
      Effect.tapError((error) =>
        error.status === "UNAUTHORIZED"
          ? Effect.andThen(limiter.count(limits.signInEmail, account), limiter.count(limits.signInIp, ip))
          : Effect.void,
      ),
    );
  });

  // Creates the account through the admin plugin on the server (no admin session, so no admin rights are
  // used), gives a teacher an organization of their own, then signs in to it.
  const register = Effect.fn("AuthService.register")(function* (
    { name, email, password, profile }: { name: string; email: string; password: string; profile: RegistrationProfile },
    headers: EffectHeaders.Headers,
  ) {
    const weak = passwordProblem(password);
    if (weak) return yield* new AuthRejected({ message: `Your password needs: ${weak.toLowerCase()}.` });
    yield* limiter.hit(limits.register, clientIp(headers));
    yield* limiter.hit(limits.registerEmail, email.trim().toLowerCase());
    const { user } = yield* auth.call((api) =>
      api.createUser({
        body: {
          name: name.trim(),
          email: email.trim(),
          password,
          role: "user",
          data: { termsAcceptedAt: new Date() },
        },
      }),
    );
    if (profile.role === "teacher") yield* Effect.promise(() => createOwnOrganization(drizzle, { id: user.id, name: name.trim() }));
    return yield* signInWith(email.trim(), password, headers);
  });

  // The key is checked before anything is created, so wrong keys make no accounts. The guest has no
  // organization and no roster entry yet: game.find makes it in the game's organization. The web app sends the
  // guest to the game with the cookies. A guest joining again (another game, or the same one) keeps their
  // account and takes the new name.
  const joinAsGuest = Effect.fn("AuthService.joinAsGuest")(function* (
    { name, code }: { name: string; code: string },
    headers: EffectHeaders.Headers,
  ) {
    yield* limiter.hit(limits.guestJoin, clientIp(headers));
    const open = yield* game.lookup(code);
    if (!open.guestsAllowed) return yield* new NotFound({ message: "That key doesn't match a session that guests can join." });
    const existing = yield* readSession(headers).pipe(withAuth);
    if (Option.isSome(existing) && existing.value.user.role !== "guest")
      return yield* new Conflict({ message: "You're signed in. Students join from their dashboard; sign out to join as a guest." });
    let user: SessionUser;
    let cookies: ResponseCookie[] = [];
    if (Option.isSome(existing)) {
      user = { ...existing.value.user, name };
      yield* repo.renameGuest(user.id, name);
    } else {
      const { headers: responseHeaders, response } = yield* auth
        .call((api) => api.signInAnonymous({ headers: webHeaders(headers), returnHeaders: true }))
        .pipe(Effect.orDie);
      if (!response) return yield* Effect.die("Better Auth returned no anonymous session.");
      yield* repo.createGuest({ userId: response.user.id, name });
      user = yield* toSessionUser({ ...response.user, role: "guest", name }, { token: response.token, activeOrganizationId: null }).pipe(withAuth);
      cookies = cookiesFrom(responseHeaders);
    }
    const found = yield* game.find(user, code);
    return { user, cookies, found };
  });

  return {
    config: Effect.succeed({
      google: auth.googleEnabled,
      customRoles: config.organizations.customRoles,
      api: config.api,
      desktop: { minVersion: config.desktop.minVersion, releases: config.desktop.releasesRepo },
    }),
    signInEmail,
    register,
    signInGoogle: (input: { callbackURL: string; errorCallbackURL: string }, headers: EffectHeaders.Headers) =>
      googleRedirect(headers, input),
    // BetterAuth.ts gives the new user this profile.
    signUpGoogle: Effect.fn("AuthService.signUpGoogle")(function* (
      { profile, callbackURL, errorCallbackURL }: { profile: RegistrationProfile; callbackURL: string; errorCallbackURL: string },
      headers: EffectHeaders.Headers,
    ) {
      return yield* googleRedirect(headers, {
        callbackURL,
        errorCallbackURL,
        requestSignUp: true,
        additionalData: { examinusProfile: profile },
      });
    }),
    joinAsGuest,
    session: (headers: EffectHeaders.Headers) =>
      readSession(headers).pipe(
        withAuth,
        Effect.flatMap(Option.match({ onNone: () => Effect.fail(new Unauthorized()), onSome: Effect.succeed })),
      ),
    signOut: (headers: EffectHeaders.Headers) =>
      auth.call((api) => api.signOut({ headers: webHeaders(headers), returnHeaders: true })).pipe(
        Effect.map(({ headers: responseHeaders }) => ({ cookies: cookiesFrom(responseHeaders) })),
        Effect.orDie,
      ),

    // The signed-in user's avatar (the default one until they save their own).
    avatar: Effect.fn("AuthService.avatar")(function* (userId: string) {
      return avatarOf(userId, yield* repo.avatar(userId));
    }),
    // Saves the avatar and shows it to the game the user is in.
    saveAvatar: Effect.fn("AuthService.saveAvatar")(function* (userId: string, avatar: Avatar) {
      yield* repo.saveAvatar(userId, avatar);
      yield* game.avatarChanged(userId, avatar);
    }),
  };
});

export class AuthService extends Context.Service<AuthService, Effect.Success<typeof make>>()("examinus/api/AuthService") {
  static readonly layer = Layer.effect(AuthService, make);
}
