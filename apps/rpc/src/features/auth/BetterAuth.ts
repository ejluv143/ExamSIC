import { ac, orgRoles, platformRoles } from "@examinus/domain/permissions";
import { RegistrationProfile, type ResponseCookie } from "@examinus/domain/user";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, getOAuthState } from "better-auth/api";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { admin } from "better-auth/plugins/admin";
import { anonymous } from "better-auth/plugins/anonymous";
import { organization } from "better-auth/plugins/organization";
import { eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { AppConfig } from "../../platform/AppConfig.ts";
import { Cache } from "../../platform/Cache.ts";
import { newId } from "../../platform/ids.ts";
import * as schema from "../../database/schemas/index.ts";
import { Database, type Drizzle } from "../../platform/Database.ts";

// A Better Auth API call failed. `status` is Better Auth's status name (e.g. "UNAUTHORIZED").
export class AuthApiError extends Schema.TaggedError<AuthApiError>()("AuthApiError", {
  status: Schema.String,
  message: Schema.String,
}) {}

export const internalAuthMessage = "Something went wrong. Please try again.";

// Better Auth's APIError messages are written for people. Anything else (a database or driver failure) can carry
// SQL, constraint names or connection details, so it is logged here and callers only get a generic message.
export const toAuthApiError = (cause: unknown): Effect.Effect<never, AuthApiError> =>
  cause instanceof APIError
    ? Effect.fail(new AuthApiError({ status: String(cause.status), message: cause.message }))
    : Effect.logError("Better Auth call failed", cause).pipe(
        Effect.andThen(Effect.fail(new AuthApiError({ status: "INTERNAL", message: internalAuthMessage }))),
      );

const decodeProfile = Schema.decodeUnknownOption(RegistrationProfile);

function createAuth(options: {
  db: Drizzle;
  cache: Cache["Service"];
  secret: string;
  baseURL: string;
  google: Option.Option<{ clientId: string; clientSecret: string }>;
  customRoles: boolean;
  // The web app's other origins (LIVE_ALLOWED_ORIGINS), e.g. its LAN address in development.
  trustedOrigins: readonly string[];
}) {
  return betterAuth({
    secret: options.secret,
    // The web app's origin: browsers only talk to the web app, which forwards /api/auth/* here.
    baseURL: options.baseURL,
    trustedOrigins: [...options.trustedOrigins],
    database: drizzleAdapter(options.db, { provider: "pg", schema, usePlural: true }),
    // Better Auth's own rate limits (on in production) count in Dragonfly, shared by every API instance.
    rateLimit: {
      customStorage: {
        consume: (key, rule) =>
          Effect.runPromise(
            options.cache
              .windowAdd(`auth-rate:${key}`, rule.window * 1000, rule.max)
              .pipe(Effect.map((allowed) => ({ allowed, retryAfter: allowed ? null : rule.window }))),
          ),
      },
    },
    // Accounts come from admins, auth.register (email and password) or a Google sign-up from /register.
    emailAndPassword: { enabled: true, disableSignUp: true },
    // Signing in with Google never creates an account; only auth.signUpGoogle (requestSignUp) does.
    socialProviders: Option.match(options.google, {
      onNone: () => ({}),
      onSome: (google) => ({ google: { ...google, disableImplicitSignUp: true } }),
    }),
    // Google sign-in attaches to the existing account with the same email. A signed-in teacher connecting Google
    // Classroom may link a Google account with a different email (a school account while signed in with a personal one).
    account: { accountLinking: { trustedProviders: ["google"], allowDifferentEmails: true } },
    databaseHooks: {
      user: {
        // Deleting a teacher deletes their quizzes. Answers restrict deleting their question, so the quizzes'
        // sessions (with their attempts and answers) go first.
        delete: {
          before: async (user) => {
            const { quizSessions, quizzes } = schema;
            const owned = options.db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.ownerId, user.id));
            await options.db.delete(quizSessions).where(inArray(quizSessions.quizId, owned));
          },
        },
        create: {
          before: async (user) => {
            // A guest from /join (auth.joinAsGuest): the anonymous plugin makes the account; it gets the guest role.
            if ("isAnonymous" in user && user.isAnonymous === true) return { data: { ...user, role: "guest" } };
            const state = await getOAuthState();
            if (!state) return;
            // A Google sign-up: the profile chosen on /register rides the OAuth state. It's client-supplied,
            // so it's checked here. auth.signUpGoogle only starts once they've agreed to the terms.
            const profile = decodeProfile(state.examinusProfile);
            if (Option.isNone(profile)) return false;
            return { data: { ...user, role: "user", termsAcceptedAt: new Date() } };
          },
          // A teacher signing up with Google gets an organization of their own, like auth.register gives one.
          after: async (user) => {
            const state = await getOAuthState();
            if (!state) return;
            const profile = decodeProfile(state.examinusProfile);
            if (Option.isSome(profile) && profile.value.role === "teacher") await createOwnOrganization(options.db, user);
          },
        },
      },
    },
    user: {
      // `role` comes from the admin plugin.
      additionalFields: {
        department: { type: "string", required: false, input: false },
        plan: { type: "string", required: false, input: false },
        planExpiresAt: { type: "date", required: false, input: false },
        termsAcceptedAt: { type: "date", required: false, input: false },
      },
    },
    plugins: [
      admin({ ac, roles: platformRoles, adminRoles: ["admin"], defaultRole: "user" }),
      // Memberships and the session's active organization. Members are managed by the org.* RPCs (code-based
      // invites: there is no email sender); the plugin's own endpoints are reached through /api/auth too.
      organization({
        ac,
        roles: orgRoles,
        creatorRole: "owner",
        allowUserToCreateOrganization: true,
        dynamicAccessControl: { enabled: options.customRoles },
      }),
      // Guests (auth.joinAsGuest). They never link a real account, so nothing is deleted on link.
      anonymous({ emailDomainName: "guest.examinus.invalid" }),
    ],
  });
}

// Makes an organization named after the user, with them as its owner and a teacher. Shared by the sign-up flows.
export async function createOwnOrganization(db: Drizzle, user: { id: string; name: string }) {
  const id = newId("org");
  await db.transaction(async (tx) => {
    await tx.insert(schema.organizations).values({ id, name: `${user.name.trim()}'s organization`, slug: id });
    await tx.insert(schema.members).values({ id: newId("mem"), organizationId: id, userId: user.id, role: "owner,teacher" });
  });
  return id;
}

type Auth = ReturnType<typeof createAuth>;
export type AuthApi = Auth["api"];

const config = Effect.gen(function* () {
  const { auth, organizations, server } = yield* AppConfig;
  const secret = auth.secret;
  if (Redacted.value(secret).length < 32) {
    return yield* Effect.die("BETTER_AUTH_SECRET must be at least 32 characters; generate with: openssl rand -base64 32");
  }
  const baseURL = auth.url;
  const clientId = auth.googleClientId;
  const clientSecret = auth.googleClientSecret;
  if (Option.isSome(clientId) !== Option.isSome(clientSecret)) {
    return yield* Effect.die("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither.");
  }
  const google = Option.all({ clientId, clientSecret: Option.map(clientSecret, Redacted.value) });
  return {
    secret: Redacted.value(secret),
    baseURL,
    google,
    customRoles: organizations.customRoles,
    trustedOrigins: server.liveAllowedOrigins,
  };
});

export class BetterAuth extends Context.Service<
  BetterAuth,
  {
    // Better Auth's own HTTP endpoints (OAuth callbacks).
    readonly handler: (request: Request) => Promise<Response>;
    readonly googleEnabled: boolean;
    // The Google OAuth client, for refreshing Classroom access tokens.
    readonly google: Option.Option<{ clientId: string; clientSecret: string }>;
    // Runs a Better Auth API call, turning its errors into `AuthApiError`.
    readonly call: <A>(run: (api: AuthApi) => Promise<A>) => Effect.Effect<A, AuthApiError>;
  }
>()("examinus/api/BetterAuth") {
  static readonly layer = Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const { drizzle } = yield* Database;
      const cache = yield* Cache;
      const options = yield* config;
      const auth = createAuth({ db: drizzle, cache, ...options });
      return BetterAuth.of({
        handler: auth.handler,
        googleEnabled: Option.isSome(options.google),
        google: options.google,
        call: (run) => Effect.tryPromise({ try: () => run(auth.api), catch: (cause) => cause }).pipe(Effect.catch(toAuthApiError)),
      });
    }),
  );
}

// The cookies Better Auth set on a response, for the web app to set on the browser.
export function cookiesFrom(headers: Headers): ResponseCookie[] {
  return headers.getSetCookie().flatMap((line) =>
    [...parseSetCookieHeader(line)].map(([name, attributes]) => {
      const { maxAge, path, domain, secure, httpOnly, sameSite } = toCookieOptions(attributes);
      return {
        name,
        value: attributes.value,
        ...(maxAge !== undefined && { maxAge }),
        ...(path !== undefined && { path }),
        ...(domain !== undefined && { domain }),
        ...(secure !== undefined && { secure }),
        ...(httpOnly !== undefined && { httpOnly }),
        ...(sameSite !== undefined && { sameSite }),
      };
    }),
  );
}
