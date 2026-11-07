import { describe, expect, test } from "bun:test";
import { Effect, Layer, Option } from "effect";
import { Headers } from "effect/http";
import { AppConfig } from "../../platform/AppConfig.ts";
import { harness, stub, testConfig } from "../../testing/config.ts";
import { OrganizationRepo } from "../organization/Repo.ts";
import { BetterAuth, type AuthApi } from "./BetterAuth.ts";
import { SessionIdentity } from "./Identity.ts";
import { AuthRepo } from "./Repo.ts";

type Account = {
  id: string;
  name: string;
  email: string;
  role: string;
  personalRole: string;
  plan?: string;
  planExpiresAt?: Date | null;
};
type Membership = { id: string; name: string; slug: string; roles: string[] };

const ann: Account = { id: "u1", name: "Ann", email: "ann@x.ph", role: "user", personalRole: "teacher" };
const acme: Membership = { id: "org-a", name: "Acme", slug: "acme", roles: ["teacher"] };
const beta: Membership = { id: "org-b", name: "Beta", slug: "beta", roles: ["admin"] };

// Better Auth, the account tables and the organization tables as the identity sees them. `world.session` is the
// signed-in session (null: none), `world.stored` where sessions point, by token; `writes` records the repairs.
const setup = (options: { customRoles?: boolean } = {}) => {
  const world = {
    session: { user: ann as Account, token: "tok", activeOrganizationId: null as string | null } as {
      user: Account;
      token: string;
      activeOrganizationId: string | null;
    } | null,
    memberships: [] as Membership[],
    customRoles: [] as Array<{ role: string; permission: string }>,
    stored: new Map<string, string | null>(),
    accessTokens: new Map<string, string>(),
    tokenUsers: new Map<string, { user: Account; activeOrganizationId: string | null }>(),
    writes: [] as Array<[string, string | null]>,
    activated: [] as Array<string | null>,
  };
  const api = {
    getSession: async () => ({
      headers: new globalThis.Headers(),
      response: world.session && { user: world.session.user, session: { token: world.session.token, activeOrganizationId: world.session.activeOrganizationId } },
    }),
    setActiveOrganization: async ({ body }: { body: { organizationId: string | null } }) => {
      world.activated.push(body.organizationId);
      if (world.session) world.session.activeOrganizationId = body.organizationId;
    },
  };
  const auth = Layer.succeed(
    BetterAuth,
    stub<BetterAuth["Service"]>("BetterAuth", {
      call: (run) => Effect.promise(() => run(api as unknown as AuthApi)) as never,
      accessTokenUser: (token) => Effect.succeed(Option.fromNullishOr(world.accessTokens.get(token))),
    }),
  );
  const repo = Layer.succeed(
    AuthRepo,
    stub<AuthRepo["Service"]>("AuthRepo", {
      tokenUser: (id) => {
        const found = world.tokenUsers.get(id);
        return Effect.succeed(found ? { ...found, user: { department: null, plan: "free", planExpiresAt: null, ...found.user } } : null);
      },
    }),
  );
  const orgs = Layer.succeed(
    OrganizationRepo,
    stub<OrganizationRepo["Service"]>("OrganizationRepo", {
      membershipsOf: () => Effect.succeed(world.memberships),
      activeOf: (token) => Effect.succeed(world.stored.get(token) ?? null),
      setActive: (token, id) => Effect.sync(() => void world.writes.push([token, id])),
      customRoles: () => Effect.succeed(world.customRoles as never),
    }),
  );
  const config = Layer.effect(
    AppConfig,
    Effect.map(Effect.service(AppConfig), (base) => AppConfig.of({ ...base, organizations: { customRoles: options.customRoles ?? false } })),
  ).pipe(Layer.provide(testConfig));
  const layer = SessionIdentity.layer.pipe(Layer.provide([auth, repo, orgs, config]));
  return { ...harness(layer), world };
};

const identity = Effect.service(SessionIdentity);
const headers = Headers.fromInput({ cookie: "session=abc" });
const sessionUser = (headers_: Headers.Headers = headers) =>
  Effect.flatMap(identity, (i) => i.session(headers_)).pipe(Effect.map((s) => (Option.isSome(s) ? s.value.user : null)));

describe("SessionIdentity.session: the active organization", () => {
  test("no session is no user", async () => {
    const { run, world } = setup();
    world.session = null;
    expect(await run(sessionUser())).toBeNull();
  });

  test("a session pointing at an organization the user belongs to works in it, with the roles' permissions", async () => {
    const { run, world } = setup();
    world.memberships = [acme, beta];
    world.session!.activeOrganizationId = "org-b";
    const user = await run(sessionUser());
    expect(user?.organization).toMatchObject({ id: "org-b", roles: ["admin"] });
    expect(user?.organization?.permissions).toHaveProperty("member");
    expect(user?.memberships.map((m) => m.id)).toEqual(["org-a", "org-b"]);
    expect(world.writes).toEqual([]);
  });

  test("an active organization that no longer has the user is dropped from the session: their personal space", async () => {
    const { run, world } = setup();
    world.memberships = [acme, beta];
    world.session!.activeOrganizationId = "org-gone";
    const user = await run(sessionUser());
    expect(user?.organization).toBeNull();
    expect(user?.memberships).toHaveLength(2);
    expect(world.writes).toEqual([["tok", null]]);
  });

  test("a session with none active stays in the personal space and nothing is written", async () => {
    const { run, world } = setup();
    world.memberships = [acme];
    const user = await run(sessionUser());
    expect(user?.organization).toBeNull();
    expect(world.writes).toEqual([]);
  });

  test("a guest has no organizations, whatever the session says", async () => {
    const { run, world } = setup();
    world.session = { user: { ...ann, role: "guest" }, token: "tok", activeOrganizationId: "org-a" };
    world.memberships = [acme];
    const user = await run(sessionUser());
    expect(user).toMatchObject({ role: "guest", organization: null, memberships: [] });
    expect(world.writes).toEqual([["tok", null]]);
  });

  test("custom roles' grants are read only when the server has them on", async () => {
    const custom = { role: "grader", permission: JSON.stringify({ quiz: ["read"] }) };
    const on = setup({ customRoles: true });
    on.world.memberships = [{ ...acme, roles: ["grader"] }];
    on.world.customRoles = [custom];
    on.world.session!.activeOrganizationId = "org-a";
    expect((await on.run(sessionUser()))?.organization?.permissions).toEqual({ quiz: ["read"] });
    const off = setup({ customRoles: false });
    off.world.memberships = [{ ...acme, roles: ["grader"] }];
    off.world.customRoles = [custom];
    off.world.session!.activeOrganizationId = "org-a";
    expect((await off.run(sessionUser()))?.organization?.permissions).toEqual({});
  });
});

describe("SessionIdentity.session: the account", () => {
  const withAccount = (account: Partial<Account>) => {
    const t = setup();
    t.world.session!.user = { ...ann, ...account };
    return t;
  };

  test("an expired plan counts as free, a current one is kept, none is free", async () => {
    const expired = await withAccount({ plan: "pro", planExpiresAt: new Date(Date.now() - 1000) }).run(sessionUser());
    const current = await withAccount({ plan: "pro", planExpiresAt: new Date(Date.now() + 60_000) }).run(sessionUser());
    const forever = await withAccount({ plan: "pro", planExpiresAt: null }).run(sessionUser());
    const none = await withAccount({}).run(sessionUser());
    expect(expired?.plan).toBe("free");
    expect(current?.plan).toBe("pro");
    expect(forever?.plan).toBe("pro");
    expect(none?.plan).toBe("free");
  });

  test("a user with an unknown role or personal role is a defect", async () => {
    for (const bad of [{ role: "wizard" }, { personalRole: "wizard" }]) {
      const { run } = withAccount(bad);
      await expect(run(sessionUser())).rejects.toThrow(/invalid/);
    }
  });
});

describe("SessionIdentity.authenticate", () => {
  test("a cookie or a native app's bearer token is read as a session", async () => {
    const { run, world } = setup();
    world.memberships = [acme];
    world.session!.activeOrganizationId = "org-a";
    const read = (h: Headers.Headers) => run(Effect.flatMap(identity, (i) => i.authenticate(h)));
    expect(Option.getOrNull(await read(headers))?.organization?.id).toBe("org-a");
    expect(Option.getOrNull(await read(Headers.fromInput({ authorization: "Bearer abc.signature" })))?.id).toBe("u1");
    world.session = null;
    expect(Option.isNone(await read(headers))).toBe(true);
  });

  test("an MCP access token (three dot-separated parts) is the user it was issued to, never touching a session", async () => {
    const { run, world } = setup();
    world.session = null;
    world.accessTokens.set("a.b.c", "u1");
    world.tokenUsers.set("u1", { user: ann, activeOrganizationId: "org-b" });
    world.memberships = [acme, beta];
    const read = (token: string) =>
      run(Effect.flatMap(identity, (i) => i.authenticate(Headers.fromInput({ authorization: `Bearer ${token}` }))));
    const user = Option.getOrNull(await read("a.b.c"));
    expect(user).toMatchObject({ id: "u1" });
    expect(user?.organization?.id).toBe("org-b");
    expect(Option.isNone(await read("x.y.z"))).toBe(true);
    expect(world.writes).toEqual([]);
  });

  test("a token user who is gone, or whose organization is gone, gets no user or the personal space", async () => {
    const { run, world } = setup();
    world.session = null;
    world.accessTokens.set("a.b.c", "u1");
    const read = () => run(Effect.flatMap(identity, (i) => i.authenticate(Headers.fromInput({ authorization: "Bearer a.b.c" }))));
    expect(Option.isNone(await read())).toBe(true);
    world.tokenUsers.set("u1", { user: ann, activeOrganizationId: "org-gone" });
    world.memberships = [acme, beta];
    expect(Option.getOrNull(await read())?.organization).toBeNull();
  });

  test("an MCP token user in exactly one organization works in it, even with none picked", async () => {
    const { run, world } = setup();
    world.session = null;
    world.accessTokens.set("a.b.c", "u1");
    world.tokenUsers.set("u1", { user: ann, activeOrganizationId: null });
    world.memberships = [acme];
    const user = Option.getOrNull(await run(Effect.flatMap(identity, (i) => i.authenticate(Headers.fromInput({ authorization: "Bearer a.b.c" })))));
    expect(user?.organization?.id).toBe("org-a");
    expect(world.writes).toEqual([]);
  });
});

describe("SessionIdentity.opened and activate", () => {
  test("a session just made starts where its token already points, and a stale one is repaired", async () => {
    const { run, world } = setup();
    world.memberships = [acme, beta];
    world.stored.set("t1", "org-a");
    world.stored.set("t2", "org-gone");
    const opened = (token: string) => run(Effect.flatMap(identity, (i) => i.opened(ann, token)));
    expect((await opened("t1")).organization?.id).toBe("org-a");
    expect(world.writes).toEqual([]);
    expect((await opened("t2")).organization).toBeNull();
    expect(world.writes).toEqual([["t2", null]]);
  });

  test("a user in exactly one organization is not auto-selected on a session: the sign-in hook does that, not the read", async () => {
    const { run, world } = setup();
    world.memberships = [acme];
    expect((await run(sessionUser()))?.organization).toBeNull();
  });

  test("activating asks Better Auth to switch, then returns the user as the session now sees them", async () => {
    const { run, world } = setup();
    world.memberships = [acme, beta];
    const user = await run(Effect.flatMap(identity, (i) => i.activate("org-b", headers)));
    expect(world.activated).toEqual(["org-b"]);
    expect(user.organization?.id).toBe("org-b");
    const back = await run(Effect.flatMap(identity, (i) => i.activate(null, headers)));
    expect(back.organization).toBeNull();
  });

  test("the session vanishing while switching is a defect", async () => {
    const { run, world } = setup();
    world.session = null;
    await expect(run(Effect.flatMap(identity, (i) => i.current(headers)))).rejects.toThrow(/disappeared/);
  });
});
