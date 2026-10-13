import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { Headers } from "effect/http";
import { harness, stub } from "../../testing/config.ts";
import { BetterAuth, type AuthApi } from "../auth/BetterAuth.ts";
import { AdminRepo } from "./Repo.ts";
import { AdminService } from "./Service.ts";

// A roster where s1 is free, s2 belongs to "other" and nothing else exists. `links` records link() calls and
// `apiCalls` the Better Auth admin calls that went through.
const setup = () => {
  const owners: Record<string, string | null> = { s1: null, s2: "other" };
  const links: Array<[string, string | null]> = [];
  const apiCalls: string[] = [];
  const repo = Layer.succeed(
    AdminRepo,
    stub<AdminRepo["Service"]>("AdminRepo", {
      rosterOwner: (id) => Effect.succeed(id in owners ? { userId: owners[id]! } : null),
      link: (userId, studentId) => Effect.sync(() => (links.push([userId, studentId]), true)),
    }),
  );
  const api = {
    createUser: async () => (apiCalls.push("createUser"), { user: { id: "new-user" } }),
    adminUpdateUser: async () => void apiCalls.push("adminUpdateUser"),
  } as unknown as AuthApi;
  const auth = Layer.succeed(
    BetterAuth,
    stub<BetterAuth["Service"]>("BetterAuth", { call: (run) => Effect.promise(() => run(api)) }),
  );
  return { ...harness(AdminService.layer.pipe(Layer.provide([repo, auth]))), links, apiCalls };
};

const student = (studentId: string) => ({ role: "student" as const, studentId });
const headers = Headers.empty;

describe("AdminService", () => {
  test("an admin can't take their own admin role away, and Better Auth is not called", async () => {
    const { fail, apiCalls } = setup();
    const err = await fail(
      Effect.gen(function* () {
        const admin = yield* AdminService;
        return yield* admin.updateUser("me", { userId: "me", name: "Me", profile: student("s1") }, headers);
      }),
    );
    expect(err._tag).toBe("Forbidden");
    expect(apiCalls).toEqual([]);
  });

  test("a roster entry that already has another account is refused before the account is created", async () => {
    const { fail, apiCalls } = setup();
    const err = await fail(
      Effect.gen(function* () {
        const admin = yield* AdminService;
        return yield* admin.createUser({ name: "A", email: "a@x.ph", password: "p", profile: student("s2") }, headers);
      }),
    );
    expect(err._tag).toBe("Conflict");
    expect(apiCalls).toEqual([]);
  });

  test("a roster entry that doesn't exist is a Conflict", async () => {
    const { fail } = setup();
    const err = await fail(
      Effect.gen(function* () {
        const admin = yield* AdminService;
        return yield* admin.createUser({ name: "A", email: "a@x.ph", password: "p", profile: student("gone") }, headers);
      }),
    );
    expect(err._tag).toBe("Conflict");
  });

  test("creating a student account links it to the free roster entry", async () => {
    const { run, links, apiCalls } = setup();
    await run(
      Effect.gen(function* () {
        const admin = yield* AdminService;
        yield* admin.createUser({ name: "A", email: " a@x.ph ", password: "p", profile: student("s1") }, headers);
      }),
    );
    expect(apiCalls).toEqual(["createUser"]);
    expect(links).toEqual([["new-user", "s1"]]);
  });

  test("an account may keep the roster entry it already owns when it is updated", async () => {
    const { run, links } = setup();
    await run(
      Effect.gen(function* () {
        const admin = yield* AdminService;
        yield* admin.updateUser("admin", { userId: "other", name: "O", profile: student("s2") }, headers);
      }),
    );
    expect(links).toEqual([["other", "s2"]]);
  });
});
