import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { Headers } from "effect/http";
import { harness, stub } from "../../testing/config.ts";
import { BetterAuth, type AuthApi } from "../auth/BetterAuth.ts";
import { AdminRepo } from "./Repo.ts";
import { AdminService } from "./Service.ts";

// `apiCalls` records the Better Auth admin calls that went through, with their bodies.
const setup = () => {
  const apiCalls: Array<[string, unknown]> = [];
  const api = {
    createUser: async ({ body }: { body: unknown }) => (apiCalls.push(["createUser", body]), { user: { id: "new-user" } }),
    adminUpdateUser: async ({ body }: { body: unknown }) => void apiCalls.push(["adminUpdateUser", body]),
  } as unknown as AuthApi;
  const auth = Layer.succeed(
    BetterAuth,
    stub<BetterAuth["Service"]>("BetterAuth", { call: (run) => Effect.promise(() => run(api)) }),
  );
  const repo = Layer.succeed(AdminRepo, stub<AdminRepo["Service"]>("AdminRepo", {}));
  return { ...harness(AdminService.layer.pipe(Layer.provide([repo, auth]))), apiCalls };
};

const admin = { role: "admin" as const, department: null };
const user = { role: "user" as const, department: "CS" };
const headers = Headers.empty;

describe("AdminService", () => {
  test("an admin can't take their own admin role away, and Better Auth is not called", async () => {
    const { fail, apiCalls } = setup();
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* AdminService).updateUser("me", { userId: "me", name: "Me", profile: user }, headers);
      }),
    );
    expect(err._tag).toBe("Forbidden");
    expect(apiCalls).toEqual([]);
  });

  test("an admin may update their own account while staying an admin", async () => {
    const { run, apiCalls } = setup();
    await run(
      Effect.gen(function* () {
        yield* (yield* AdminService).updateUser("me", { userId: "me", name: "Me", profile: admin }, headers);
      }),
    );
    expect(apiCalls).toEqual([["adminUpdateUser", { userId: "me", data: { name: "Me", role: "admin", department: null } }]]);
  });

  test("another account's role and department are updated through Better Auth", async () => {
    const { run, apiCalls } = setup();
    await run(
      Effect.gen(function* () {
        yield* (yield* AdminService).updateUser("admin", { userId: "other", name: "O", profile: user }, headers);
      }),
    );
    expect(apiCalls).toEqual([["adminUpdateUser", { userId: "other", data: { name: "O", role: "user", department: "CS" } }]]);
  });

  test("creating an account passes the trimmed email, role and department", async () => {
    const { run, apiCalls } = setup();
    await run(
      Effect.gen(function* () {
        yield* (yield* AdminService).createUser({ name: "A", email: " a@x.ph ", password: "p", profile: user }, headers);
      }),
    );
    expect(apiCalls).toEqual([
      ["createUser", { name: "A", email: "a@x.ph", password: "p", role: "user", data: { department: "CS" } }],
    ]);
  });
});
