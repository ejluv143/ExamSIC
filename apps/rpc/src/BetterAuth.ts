import { ac, roles, type ResponseCookie } from "@examora/contract";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { admin } from "better-auth/plugins/admin";
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import * as schema from "./database/schemas/index.ts";
import { Database, type Drizzle } from "./Database.ts";

// A Better Auth API call failed. `status` is Better Auth's status name (e.g. "UNAUTHORIZED").
export class AuthApiError extends Schema.TaggedError<AuthApiError>()("AuthApiError", {
  status: Schema.String,
  message: Schema.String,
}) {}

function createAuth(options: {
  db: Drizzle;
  secret: string;
  baseURL: string;
  google: Option.Option<{ clientId: string; clientSecret: string }>;
}) {
  return betterAuth({
    secret: options.secret,
    // The web app's origin: browsers only talk to the web app, which forwards /api/auth/* here.
    baseURL: options.baseURL,
    database: drizzleAdapter(options.db, { provider: "pg", schema, usePlural: true }),
    // No self sign-up: admins create accounts (`pnpm db:seed` adds test and demo ones in development).
    emailAndPassword: { enabled: true, disableSignUp: true },
    socialProviders: Option.match(options.google, {
      onNone: () => ({}),
      onSome: (google) => ({ google: { ...google, disableSignUp: true } }),
    }),
    // Google sign-in attaches to the existing account with the same school email.
    account: { accountLinking: { trustedProviders: ["google"] } },
    user: {
      // `role` comes from the admin plugin.
      additionalFields: {
        department: { type: "string", required: false, input: false },
        studentId: { type: "string", required: false, input: false },
      },
    },
    plugins: [admin({ ac, roles, adminRoles: ["admin"], defaultRole: "student" })],
  });
}

type Auth = ReturnType<typeof createAuth>;
export type AuthApi = Auth["api"];

const config = Effect.gen(function* () {
  const secret = yield* Config.Redacted("BETTER_AUTH_SECRET");
  if (Redacted.value(secret).length < 32) {
    return yield* Effect.die("BETTER_AUTH_SECRET must be at least 32 characters; generate with: openssl rand -base64 32");
  }
  const baseURL = yield* Config.String("BETTER_AUTH_URL");
  const clientId = yield* Config.option(Config.NonEmptyString("GOOGLE_CLIENT_ID"));
  const clientSecret = yield* Config.option(Config.Redacted("GOOGLE_CLIENT_SECRET"));
  if (Option.isSome(clientId) !== Option.isSome(clientSecret)) {
    return yield* Effect.die("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither.");
  }
  const google = Option.all({ clientId, clientSecret: Option.map(clientSecret, Redacted.value) });
  return { secret: Redacted.value(secret), baseURL, google };
});

export class BetterAuth extends Context.Service<
  BetterAuth,
  {
    // Better Auth's own HTTP endpoints (OAuth callbacks).
    readonly handler: (request: Request) => Promise<Response>;
    readonly googleEnabled: boolean;
    // Runs a Better Auth API call, turning its errors into `AuthApiError`.
    readonly call: <A>(run: (api: AuthApi) => Promise<A>) => Effect.Effect<A, AuthApiError>;
  }
>()("examora/api/BetterAuth") {
  static readonly layer = Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const { drizzle } = yield* Database;
      const options = yield* config;
      const auth = createAuth({ db: drizzle, ...options });
      return BetterAuth.of({
        handler: auth.handler,
        googleEnabled: Option.isSome(options.google),
        call: (run) =>
          Effect.tryPromise({
            try: () => run(auth.api),
            catch: (cause) =>
              cause instanceof APIError
                ? new AuthApiError({ status: String(cause.status), message: cause.message })
                : new AuthApiError({ status: "INTERNAL", message: String(cause) }),
          }),
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
