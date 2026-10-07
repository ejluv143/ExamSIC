import {
  AccountPending,
  AccountSuspended,
  AuthRejected,
  AuthRpcs,
  Conflict,
  InvalidCredentials,
  pendingApprovalReason,
  TooManyRequests,
  Unauthorized,
} from "@examora/contract";
import { eq, sql } from "drizzle-orm";
import { Effect, Option } from "effect";
import { BetterAuth, cookiesFrom, type AuthApiError } from "../BetterAuth.ts";
import { Database } from "../Database.ts";
import { users } from "../database/schemas/index.ts";
import { readSession, toSessionUser, webHeaders } from "../Session.ts";

export const AuthHandlers = AuthRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    const db = yield* Database;
    const withAuth = Effect.provideService(BetterAuth, auth);

    // The admin plugin refuses banned users with FORBIDDEN; a self-registered account waiting for approval
    // is a ban with the pending reason, and gets its own message.
    const signInFailure = (
      email: string,
    ): ((error: AuthApiError) => Effect.Effect<never, InvalidCredentials | AccountSuspended | AccountPending | TooManyRequests>) =>
      (error) => {
        switch (error.status) {
          case "UNAUTHORIZED":
            return Effect.fail(new InvalidCredentials());
          case "FORBIDDEN":
            return Effect.gen(function* () {
              const [row] = yield* db
                .query((d) =>
                  d
                    .select({ banReason: users.banReason })
                    .from(users)
                    .where(eq(sql`lower(${users.email})`, email.trim().toLowerCase())),
                )
                .pipe(Effect.orDie);
              if (row?.banReason === pendingApprovalReason) return yield* new AccountPending();
              return yield* new AccountSuspended();
            });
          case "TOO_MANY_REQUESTS":
            return Effect.fail(new TooManyRequests());
          default:
            return Effect.die(error);
        }
      };

    return AuthRpcs.of({
      "auth.config": () => Effect.succeed({ google: auth.googleEnabled }),

      "auth.signInEmail": ({ email, password }, { headers }) =>
        auth
          .call((api) => api.signInEmail({ body: { email, password }, headers: webHeaders(headers), returnHeaders: true }))
          .pipe(
            Effect.flatMap(({ headers: responseHeaders, response }) =>
              Effect.map(toSessionUser(response.user), (user) => ({ user, cookies: cookiesFrom(responseHeaders) })),
            ),
            Effect.catchTag("AuthApiError", signInFailure(email)),
          ),

      // Creates the account through the admin plugin on the server (no admin session, so no admin rights are
      // used), already suspended as pending: it can't sign in until an admin approves it at /admin.
      "auth.register": Effect.fn("auth.register")(function* ({ name, email, password, profile }) {
        const studentId = profile.role === "student" ? profile.studentId.trim() : null;
        const department = profile.role === "teacher" ? profile.department.trim() : null;
        // Each roster entry belongs to at most one account (users.student_id is unique).
        if (studentId) {
          const [taken] = yield* db
            .query((d) => d.select({ id: users.id }).from(users).where(eq(users.studentId, studentId)))
            .pipe(Effect.orDie);
          if (taken) return yield* new Conflict({ message: "That student number already has an account." });
        }
        yield* auth
          .call((api) =>
            api.createUser({
              body: {
                name: name.trim(),
                email: email.trim(),
                password,
                role: profile.role,
                data: { department, studentId, banned: true, banReason: pendingApprovalReason },
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
      }),

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
