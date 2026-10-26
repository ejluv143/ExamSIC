import { expo } from "@better-auth/expo";
import { mcp } from "@better-auth/mcp";
import { clientIpHeader } from "@examinus/contract/api";
import { ac, orgRoles, platformRoles } from "@examinus/domain/permissions";
import { RegistrationProfile, type ResponseCookie } from "@examinus/domain/user";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { admin } from "better-auth/plugins/admin";
import { anonymous } from "better-auth/plugins/anonymous";
import { bearer } from "better-auth/plugins/bearer";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import { eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { AppConfig } from "../../platform/AppConfig.ts";
import { Cache } from "../../platform/Cache.ts";
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
  // The web app's other origins (LIVE_ALLOWED_ORIGINS), e.g. its LAN address in development, and the mobile app's scheme.
  trustedOrigins: readonly string[];
  // The MCP server's endpoint: the audience of the access tokens MCP clients get.
  mcpResource: string;
}) {
  return betterAuth({
    secret: options.secret,
    // The web app's origin: browsers only talk to the web app, which forwards /api/auth/* here.
    baseURL: options.baseURL,
    trustedOrigins: [...options.trustedOrigins],
    // The address the API's edge settled (platform/network.ts), for rate limits and session records.
    advanced: { ipAddress: { ipAddressHeaders: [clientIpHeader] } },
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
            // so it's checked here. auth.signUpGoogle only starts once they've agreed to the terms. Like
            // auth.register, it gives no organization: the account starts in its personal space.
            const profile = decodeProfile(state.examinusProfile);
            if (Option.isNone(profile)) return false;
            return { data: { ...user, role: "user", personalRole: profile.value.role, termsAcceptedAt: new Date() } };
          },
        },
      },
      session: {
        // Signing in as a member of exactly one organization starts in it; otherwise in the personal space, until
        // they pick one (org.setActive). Once signed in, no organization stays none: it's a choice too.
        create: {
          before: async (session) => {
            const rows = await options.db
              .select({ organizationId: schema.members.organizationId })
              .from(schema.members)
              .where(eq(schema.members.userId, session.userId))
              .limit(2);
            if (rows.length !== 1) return;
            return { data: { ...session, activeOrganizationId: rows[0]!.organizationId } };
          },
        },
      },
    },
    user: {
      // `role` comes from the admin plugin.
      additionalFields: {
        personalRole: { type: "string", required: false, input: false, defaultValue: "teacher" },
        department: { type: "string", required: false, input: false },
        plan: { type: "string", required: false, input: false },
        planExpiresAt: { type: "date", required: false, input: false },
        termsAcceptedAt: { type: "date", required: false, input: false },
      },
    },
    plugins: [
      // The native apps send the session token as `Authorization: Bearer` (sign-in hands it out as `set-auth-token`)
      // instead of keeping cookies; the plugin turns it into the session cookie before any call reads the session.
      bearer(),
      // The mobile app's Better Auth client: the authorization proxy for social sign-in and the app's scheme as origin.
      expo(),
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
      // Signs the access tokens below; the keys are published at /api/auth/jwks. `usePlural` adds an "s" to the
      // model name, so "jwk" finds the `jwks` table.
      jwt({ schema: { jwks: { modelName: "jwk" } } }),
      // The OAuth 2.1 authorization server MCP clients (Gemini, Claude) sign a teacher in through: discovery at
      // /api/auth/.well-known/oauth-authorization-server, self-registration at /api/auth/oauth2/register (MCP clients
      // register themselves), the web app's /login and /oauth/consent pages, and JWT access tokens bound to the MCP
      // server (apps/mcp), which forwards them to /rpc (Session.ts). Its endpoint types don't satisfy Better Auth's
      // plugin type under exactOptionalPropertyTypes (OpenAPI metadata with `items?: undefined`), and nothing calls
      // them through `auth.api`, so the cast leaves them out of the type.
      mcp({
        resource: options.mcpResource,
        loginPage: "/login",
        consentPage: "/oauth/consent",
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }) as unknown as { id: "oauth-provider" },
      // Dynamic registration defaults `application_type` to "web" (RFC 7591), which refuses http redirect URIs. MCP
      // clients that run on the user's machine (Gemini CLI, Claude Code) register `http://localhost:<port>/...`
      // without saying they are native apps, which only a native app can be (RFC 8252 §7.3), so they are marked so.
      {
        id: "mcp-loopback-clients",
        hooks: {
          before: [
            {
              matcher: (ctx) => ctx.path === "/oauth2/register",
              handler: createAuthMiddleware(async (ctx) => {
                const body: unknown = ctx.body;
                if (!body || typeof body !== "object" || "application_type" in body || !("redirect_uris" in body)) return;
                const uris = body.redirect_uris;
                const loopback = (uri: unknown) =>
                  typeof uri === "string" && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(uri);
                if (Array.isArray(uris) && uris.length > 0 && uris.every(loopback)) {
                  return { context: { body: { ...body, application_type: "native" } } };
                }
              }),
            },
          ],
        },
      },
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
export type AuthApi = Auth["api"];

const config = Effect.gen(function* () {
  const { auth, mobile, organizations, server } = yield* AppConfig;
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
    // The mobile app's scheme (`examinus://`) is a trusted origin for the Expo plugin's OAuth redirects.
    trustedOrigins: [...server.liveAllowedOrigins, mobile.scheme],
    mcpResource: auth.mcpResourceUrl,
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
    // The user an MCP access token (`Authorization: Bearer`) was issued to: its signature, issuer, audience (the
    // MCP server) and expiry are checked against our own signing keys. None for any other token.
    readonly accessTokenUser: (token: string) => Effect.Effect<Option.Option<string>>;
  }
>()("examinus/api/BetterAuth") {
  static readonly layer = Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const { drizzle } = yield* Database;
      const cache = yield* Cache;
      const options = yield* config;
      const auth = createAuth({ db: drizzle, cache, ...options });
      // Tokens name the auth endpoints' URL (BETTER_AUTH_URL + /api/auth) as their issuer.
      const { baseURL: issuer } = yield* Effect.promise(() => auth.$context);
      const jwksCacheKey = {};
      return BetterAuth.of({
        // The OAuth authorization endpoint is only ever opened by the browser: an MCP client sends the teacher there,
        // and /login sends them back. The web app forwards it with fetch, which marks it `sec-fetch-mode: cors`, and
        // Better Auth would then answer with JSON for its client library instead of redirecting.
        handler: (request) => {
          if (request.method !== "GET" || new URL(request.url).pathname !== "/api/auth/oauth2/authorize") return auth.handler(request);
          const headers = new Headers(request.headers);
          headers.delete("sec-fetch-mode");
          headers.set("accept", "text/html");
          return auth.handler(new Request(request, { headers }));
        },
        googleEnabled: Option.isSome(options.google),
        google: options.google,
        call: (run) => Effect.tryPromise({ try: () => run(auth.api), catch: (cause) => cause }).pipe(Effect.catch(toAuthApiError)),
        accessTokenUser: (token) =>
          Effect.tryPromise(() =>
            verifyJwsAccessToken(token, {
              jwksFetch: () => auth.api.getJwks(),
              jwksCacheKey,
              verifyOptions: { issuer, audience: options.mcpResource },
            }),
          ).pipe(
            Effect.map((claims) => Option.fromNullishOr(claims.sub)),
            Effect.catch(() => Effect.succeed(Option.none<string>())),
          ),
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
