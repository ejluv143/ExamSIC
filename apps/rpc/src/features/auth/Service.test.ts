import { clientIpHeader } from "@examinus/contract/api";
import { describe, expect, test } from "bun:test";
import { CurrentUser } from "@examinus/contract/middleware";
import { type Avatar } from "@examinus/domain/avatar";
import { grantsOf, type Permissions } from "@examinus/domain/permissions";
import type { SessionUser } from "@examinus/domain/user";
import { Effect, Layer } from "effect";
import { Headers } from "effect/http";
import { limits } from "../../platform/RateLimiter.ts";
import { failureOf, harness, stub, testConfig } from "../../testing/config.ts";
import { fakeRateLimiter } from "../../testing/rateLimiter.ts";
import { OrganizationRepo } from "../organization/Repo.ts";
import { Game } from "../game/Service.ts";
import { APIError } from "better-auth/api";
import { BetterAuth, internalAuthMessage, toAuthApiError, type AuthApi } from "./BetterAuth.ts";
import { AuthRepo } from "./Repo.ts";
import { AuthService } from "./Service.ts";
import { requirePermission, toSessionUser } from "./Session.ts";

type Account = { id: string; name: string; email: string; role: string; personalRole?: string; plan?: string; planExpiresAt?: Date };

// A fake Better Auth: "right" is the only password that works, the session is whatever `state.session` holds, and the
// calls that went through are recorded in `calls`.
const setup = (options: { guestsAllowed?: boolean } = {}) => {
  const calls: string[] = [];
  const state: { session: Account | null; createError: string | null; dbError: boolean } = {
    session: null,
    createError: null,
    dbError: false,
  };
  const created: unknown[] = [];
  const guests: Array<{ userId: string; name: string }> = [];
  const renamed: Array<[string, string]> = [];
  const saved: Array<[string, Avatar]> = [];
  const avatarChanges: Array<[string, Avatar]> = [];
  const found: string[] = [];
  const limiter = fakeRateLimiter();

  const withCookie = (response: unknown) => {
    const headers = new globalThis.Headers();
    headers.append("set-cookie", "session=abc; Path=/; HttpOnly");
    // The bearer plugin's header: the signed session token a native app sends back as `Authorization: Bearer`.
    headers.append("set-auth-token", "abc.signature");
    return { headers, response };
  };
  const apiError = (status: ConstructorParameters<typeof APIError>[0], message: string = String(status)) => new APIError(status, { message });
  const api = {
    signInEmail: async ({ body }: { body: { email: string; password: string } }) => {
      calls.push("signInEmail");
      if (body.password === "boom") throw apiError("INTERNAL_SERVER_ERROR");
      if (body.password !== "right" && body.password !== "Strong123") throw apiError("UNAUTHORIZED");
      return withCookie({ token: "tok", user: { id: "u1", name: "Ann", email: body.email, role: "user", personalRole: "teacher" } });
    },
    createUser: async (input: unknown) => {
      calls.push("createUser");
      created.push(input);
      if (state.createError) throw apiError("BAD_REQUEST", state.createError);
      if (state.dbError) throw new Error('duplicate key value violates unique constraint "user_email_unique" on INSERT INTO "user"');
      return { user: { id: "u2" } };
    },
    getSession: async () => withCookie(state.session && { user: state.session, session: { token: "tok", activeOrganizationId: null } }),
    signInAnonymous: async () => {
      calls.push("signInAnonymous");
      return withCookie({ token: "tok-g", user: { id: "g1", name: "Anonymous", email: "g1@anon.test", role: "student", personalRole: "teacher" } });
    },
    signInSocial: async ({ body }: { body: unknown }) => {
      calls.push("signInSocial");
      created.push(body);
      return withCookie({ url: "https://google.test/auth" });
    },
  };
  const auth = Layer.succeed(
    BetterAuth,
    stub<BetterAuth["Service"]>("BetterAuth", {
      googleEnabled: true,
      call: (run) =>
        Effect.tryPromise({ try: () => run(api as unknown as AuthApi), catch: (cause) => cause }).pipe(Effect.catch(toAuthApiError)),
    }),
  );
  const repo = Layer.succeed(
    AuthRepo,
    stub<AuthRepo["Service"]>("AuthRepo", {
      createGuest: (guest) => Effect.sync(() => void guests.push(guest)),
      renameGuest: (id, name) => Effect.sync(() => void renamed.push([id, name])),
      avatar: () => Effect.succeed(null),
      saveAvatar: (id, avatar) => Effect.sync(() => void saved.push([id, avatar])),
    }),
  );
  const orgs = Layer.succeed(
    OrganizationRepo,
    stub<OrganizationRepo["Service"]>("OrganizationRepo", {
      membershipsOf: () => Effect.succeed([]),
      activeOf: () => Effect.succeed(null),
      setActive: () => Effect.void,
      customRoles: () => Effect.succeed([]),
    }),
  );
  const game = Layer.succeed(
    Game,
    stub<Game["Service"]>("Game", {
      lookup: (code) =>
        code === "KEY123"
          ? Effect.succeed({ sessionId: "sess", title: "Quiz", guestsAllowed: options.guestsAllowed ?? true })
          : Effect.die("unknown code"),
      find: (user) =>
        Effect.sync(() => {
          found.push(user.id);
          return { sessionId: "sess", title: "Quiz", mode: "game" as const, pacing: "teacher" as const, status: "lobby" as const };
        }),
      avatarChanged: (id, avatar) => Effect.sync(() => void avatarChanges.push([id, avatar])),
    }),
  );
  const layer = AuthService.layer.pipe(Layer.provide([auth, repo, game, limiter.layer, orgs, testConfig]));
  return { ...harness(layer), calls, state, created, guests, renamed, saved, avatarChanges, found, limiter };
};

const headers = Headers.fromInput({ [clientIpHeader]: "10.0.0.1" });

describe("AuthService.signInEmail", () => {
  test("a wrong password counts toward the account and IP limits; a right one doesn't", async () => {
    const { run, fail, limiter } = setup();
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).signInEmail({ email: " Ann@X.ph ", password: "wrong" }, headers);
      }),
    );
    expect(err._tag).toBe("AuthApiError");
    expect(limiter.used(limits.signInEmail, "ann@x.ph")).toBe(1);
    expect(limiter.used(limits.signInIp, "10.0.0.1")).toBe(1);

    const ok = await run(
      Effect.gen(function* () {
        return yield* (yield* AuthService).signInEmail({ email: "ann@x.ph", password: "right" }, headers);
      }),
    );
    expect(ok.user).toMatchObject({ id: "u1", role: "user", name: "Ann", email: "ann@x.ph", organization: null, memberships: [] });
    expect(ok.cookies).toEqual([{ name: "session", value: "abc", path: "/", httpOnly: true }]);
    expect(ok.token).toBe("abc.signature");
    expect(limiter.used(limits.signInEmail, "ann@x.ph")).toBe(1);
  });

  test("other Better Auth failures are not counted as wrong passwords", async () => {
    const { fail, limiter } = setup();
    await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).signInEmail({ email: "ann@x.ph", password: "boom" }, headers);
      }),
    );
    expect(limiter.used(limits.signInEmail, "ann@x.ph")).toBe(0);
  });

  test("an account at its wrong-password limit is refused before Better Auth is asked", async () => {
    const { fail, calls, limiter } = setup();
    for (let i = 0; i < limits.signInEmail.max; i++) limiter.counts.set("sign-in-email:ann@x.ph", i + 1);
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).signInEmail({ email: "ANN@x.ph", password: "right" }, headers);
      }),
    );
    expect(err._tag).toBe("TooManyRequests");
    expect(calls).toEqual([]);
  });
});

describe("AuthService.register", () => {
  test("a weak password is rejected with the missing rule, before any limit or account", async () => {
    const { fail, calls, limiter } = setup();
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).register(
          { name: "A", email: "a@x.ph", password: "alllowercase1", profile: { role: "student" } },
          headers,
        );
      }),
    );
    expect(err).toMatchObject({ _tag: "AuthRejected", message: "Your password needs: an uppercase and a lowercase letter." });
    expect(calls).toEqual([]);
    expect(limiter.used(limits.register, "10.0.0.1")).toBe(0);
  });

  test("each attempt counts toward the IP and email limits", async () => {
    const { run, limiter } = setup();
    await run(
      Effect.gen(function* () {
        return yield* (yield* AuthService).register(
          { name: "Ann", email: " Ann@X.ph ", password: "Strong123", profile: { role: "student" } },
          headers,
        );
      }),
    );
    expect(limiter.used(limits.register, "10.0.0.1")).toBe(1);
    expect(limiter.used(limits.registerEmail, "ann@x.ph")).toBe(1);
  });

  test("an IP at its sign-up limit is refused before any account is created", async () => {
    const { fail, calls, limiter } = setup();
    limiter.counts.set("register:10.0.0.1", limits.register.max);
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).register(
          { name: "Ann", email: "ann@x.ph", password: "Strong123", profile: { role: "student" } },
          headers,
        );
      }),
    );
    expect(err).toMatchObject({ _tag: "TooManyRequests", message: limits.register.message });
    expect(calls).toEqual([]);
  });

  test("an email at its sign-up limit is refused before any account is created", async () => {
    const { fail, calls, limiter } = setup();
    limiter.counts.set("register-email:ann@x.ph", limits.registerEmail.max);
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).register(
          { name: "Ann", email: "ANN@x.ph", password: "Strong123", profile: { role: "student" } },
          headers,
        );
      }),
    );
    expect(err).toMatchObject({ _tag: "TooManyRequests", message: limits.registerEmail.message });
    expect(calls).toEqual([]);
  });

  test("creates a platform account with the trimmed name and terms time, then signs in with the trimmed email", async () => {
    const { run, calls, created } = setup();
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* AuthService).register(
          { name: " Ann ", email: "ann@x.ph ", password: "Strong123", profile: { role: "student" } },
          headers,
        );
      }),
    );
    expect(calls).toEqual(["createUser", "signInEmail"]);
    expect(created[0]).toMatchObject({ body: { name: "Ann", email: "ann@x.ph", role: "user" } });
    expect(created[0]).toMatchObject({ body: { data: { termsAcceptedAt: expect.any(Date) } } });
    expect(result.user.email).toBe("ann@x.ph");
  });

  test("the account stores the personal role of the profile and no organization is created", async () => {
    const teacher = setup();
    await teacher.run(
      Effect.gen(function* () {
        return yield* (yield* AuthService).register(
          { name: " Ann ", email: "ann@x.ph", password: "Strong123", profile: { role: "teacher" } },
          headers,
        );
      }),
    );
    expect(teacher.created[0]).toMatchObject({ body: { data: { personalRole: "teacher" } } });
    const student = setup();
    await student.run(
      Effect.gen(function* () {
        return yield* (yield* AuthService).register(
          { name: "Bo", email: "bo@x.ph", password: "Strong123", profile: { role: "student" } },
          headers,
        );
      }),
    );
    expect(student.created[0]).toMatchObject({ body: { data: { personalRole: "student" } } });
    expect(student.calls).toEqual(["createUser", "signInEmail"]);
  });

  test("Better Auth refusing the account stops before sign-in", async () => {
    const { fail, calls, state } = setup();
    state.createError = "User already exists";
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).register(
          { name: "Ann", email: "ann@x.ph", password: "Strong123", profile: { role: "student" } },
          headers,
        );
      }),
    );
    expect(err).toMatchObject({ _tag: "AuthApiError", message: "User already exists" });
    expect(calls).toEqual(["createUser"]);
  });

  test("a database failure comes back as a generic message, without the SQL", async () => {
    const { fail, state } = setup();
    state.dbError = true;
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).register(
          { name: "Ann", email: "ann@x.ph", password: "Strong123", profile: { role: "student" } },
          headers,
        );
      }),
    );
    expect(err).toMatchObject({ _tag: "AuthApiError", status: "INTERNAL", message: internalAuthMessage });
    expect(JSON.stringify(err)).not.toMatch(/constraint|INSERT|user_email_unique/);
  });
});

const student: Account = { id: "u1", name: "Ann", email: "ann@x.ph", role: "user", personalRole: "student" };
const guest: Account = { id: "g9", name: "Old", email: "g9@anon.test", role: "guest", personalRole: "teacher" };
const joinInput = { name: "Zed", code: "KEY123" };

describe("AuthService.joinAsGuest", () => {
  test("a game that doesn't allow guests is a NotFound and no account is made", async () => {
    const { fail, calls, guests } = setup({ guestsAllowed: false });
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).joinAsGuest(joinInput, headers);
      }),
    );
    expect(err._tag).toBe("NotFound");
    expect(calls).toEqual([]);
    expect(guests).toEqual([]);
  });

  test("a signed-in student is told to sign out (Conflict) and nothing is created", async () => {
    const { fail, state, calls, guests } = setup();
    state.session = student;
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).joinAsGuest(joinInput, headers);
      }),
    );
    expect(err._tag).toBe("Conflict");
    expect(calls).toEqual([]);
    expect(guests).toEqual([]);
  });

  test("a new guest gets an anonymous account named as typed, the cookies and the game; no roster entry yet", async () => {
    const { run, calls, guests, found } = setup();
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* AuthService).joinAsGuest(joinInput, headers);
      }),
    );
    expect(calls).toEqual(["signInAnonymous"]);
    expect(guests).toEqual([{ userId: "g1", name: "Zed" }]);
    expect(result.user).toMatchObject({ id: "g1", role: "guest", name: "Zed", email: "g1@anon.test", organization: null, memberships: [] });
    expect(result.cookies).toHaveLength(1);
    expect(found).toEqual(["g1"]);
  });

  test("a guest joining again keeps their account and takes the new name, with no new cookies", async () => {
    const { run, state, calls, guests, renamed } = setup();
    state.session = guest;
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* AuthService).joinAsGuest(joinInput, headers);
      }),
    );
    expect(calls).toEqual([]);
    expect(guests).toEqual([]);
    expect(renamed).toEqual([["g9", "Zed"]]);
    expect(result.user.name).toBe("Zed");
    expect(result.cookies).toEqual([]);
  });

  test("an IP at its guest limit is refused before the key is looked up", async () => {
    const { fail, limiter, calls } = setup();
    limiter.counts.set("guest-join:10.0.0.1", limits.guestJoin.max);
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AuthService).joinAsGuest(joinInput, headers);
      }),
    );
    expect(err._tag).toBe("TooManyRequests");
    expect(calls).toEqual([]);
  });
});

describe("AuthService session, Google and avatar", () => {
  test("no session is Unauthorized; a session returns the user and refreshed cookies", async () => {
    const { run, fail, state } = setup();
    const read = Effect.gen(function* () {
      return yield* (yield* AuthService).session(headers);
    });
    expect((await fail(read))._tag).toBe("Unauthorized");
    state.session = student;
    const found = await run(read);
    expect(found.user.id).toBe("u1");
    expect(found.cookies).toHaveLength(1);
  });

  test("signing up with Google asks for sign-up and carries the chosen profile", async () => {
    const { run, created } = setup();
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* AuthService).signUpGoogle(
          { profile: { role: "teacher" }, callbackURL: "/ok", errorCallbackURL: "/err" },
          headers,
        );
      }),
    );
    expect(result.url).toBe("https://google.test/auth");
    expect(created[0]).toMatchObject({
      provider: "google",
      requestSignUp: true,
      additionalData: { examinusProfile: { role: "teacher" } },
    });
  });

  test("an unsaved avatar is the default one, seeded from a hash and not the user id", async () => {
    const { run } = setup();
    const avatar = await run(
      Effect.gen(function* () {
        return yield* (yield* AuthService).avatar("u1");
      }),
    );
    expect(avatar.seed).toHaveLength(16);
    expect(avatar.seed).not.toContain("u1");
  });

  test("saving an avatar stores it and shows it to the game the user is in", async () => {
    const { run, saved, avatarChanges } = setup();
    const avatar: Avatar = { style: "bottts", seed: "abc", parts: {}, colors: {} };
    await run(
      Effect.gen(function* () {
        yield* (yield* AuthService).saveAvatar("u1", avatar);
      }),
    );
    expect(saved).toEqual([["u1", avatar]]);
    expect(avatarChanges).toEqual([["u1", avatar]]);
  });
});

describe("Session helpers", () => {
  const world = Layer.mergeAll(
    testConfig,
    Layer.succeed(
      OrganizationRepo,
      stub<OrganizationRepo["Service"]>("OrganizationRepo", {
        membershipsOf: () => Effect.succeed([]),
        setActive: () => Effect.void,
        customRoles: () => Effect.succeed([]),
      }),
    ),
  );
  const session = { token: "t", activeOrganizationId: null };
  const sessionUserOf = (user: Parameters<typeof toSessionUser>[0]) =>
    Effect.runPromise(toSessionUser(user, session).pipe(Effect.provide(world)));

  test("an expired plan counts as free, a current one is kept", async () => {
    const base = { id: "t", name: "T", email: "t@x.ph", role: "user", personalRole: "teacher", plan: "pro" };
    const expired = await sessionUserOf({ ...base, planExpiresAt: new Date(Date.now() - 1000) });
    const current = await sessionUserOf({ ...base, planExpiresAt: new Date(Date.now() + 60_000) });
    expect(expired).toMatchObject({ role: "user", plan: "free" });
    expect(current).toMatchObject({ role: "user", plan: "pro" });
  });

  test("a user with an unknown role is a defect", async () => {
    const exit = await Effect.runPromiseExit(
      toSessionUser({ id: "x", name: "X", email: "x@x.ph", role: "wizard", personalRole: "teacher" }, session).pipe(Effect.provide(world)),
    );
    expect(exit._tag).toBe("Failure");
  });

  test("requirePermission returns the user when the role allows it and fails Forbidden when not", async () => {
    const base = { name: "S", email: "s@x.ph", department: null, plan: "free" as const, memberships: [], personalRole: "student" as const };
    const studentUser: SessionUser = {
      ...base,
      id: "s",
      role: "user",
      organization: { id: "o", name: "O", slug: "o", roles: ["student"], permissions: grantsOf(["student"]) },
    };
    const guestUser: SessionUser = { ...base, id: "g", role: "guest", email: "g@x.ph", organization: null };
    const as = (user: SessionUser, permissions: Permissions) =>
      Effect.provideService(requirePermission(permissions), CurrentUser, user);
    expect(await Effect.runPromise(as(studentUser, { avatar: ["update"] }))).toEqual(studentUser);
    expect((await failureOf(as(studentUser, { class: ["create"] })))._tag).toBe("Forbidden");
    expect((await failureOf(as(guestUser, { enrollment: ["create"] })))._tag).toBe("Forbidden");
    // A user with no organization works in their personal space: teaching, but no members.
    const personalUser: SessionUser = { ...base, id: "p", role: "user", email: "p@x.ph", personalRole: "teacher", organization: null };
    expect(await Effect.runPromise(as(personalUser, { assessment: ["create"] }))).toEqual(personalUser);
    expect((await failureOf(as(personalUser, { member: ["create"] })))._tag).toBe("Forbidden");
  });
});
