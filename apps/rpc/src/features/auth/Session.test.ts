import { describe, expect, test } from "bun:test";
import { CurrentUser } from "@examinus/contract/middleware";
import { grantsOf, type Permissions } from "@examinus/domain/permissions";
import type { SessionUser } from "@examinus/domain/user";
import { Effect } from "effect";
import { failureOf } from "../../testing/config.ts";
import { requireOrganization, requirePermission } from "./Session.ts";

const base = { name: "S", email: "s@x.ph", department: null, plan: "free" as const, memberships: [], personalRole: "student" as const };
const studentUser: SessionUser = {
  ...base,
  id: "s",
  role: "user",
  organization: { id: "o", name: "O", slug: "o", roles: ["student"], permissions: grantsOf(["student"]) },
};
const guestUser: SessionUser = { ...base, id: "g", role: "guest", email: "g@x.ph", organization: null };
// A user with no organization works in their personal space: teaching, but no members.
const personalUser: SessionUser = { ...base, id: "p", role: "user", email: "p@x.ph", personalRole: "teacher", organization: null };

const as = <A, E>(user: SessionUser, effect: Effect.Effect<A, E, CurrentUser>) => Effect.provideService(effect, CurrentUser, user);

describe("requirePermission", () => {
  test("returns the user when the role allows it and fails Forbidden when not", async () => {
    const check = (user: SessionUser, permissions: Permissions) => as(user, requirePermission(permissions));
    expect(await Effect.runPromise(check(studentUser, { avatar: ["update"] }))).toEqual(studentUser);
    expect((await failureOf(check(studentUser, { class: ["create"] })))._tag).toBe("Forbidden");
    expect((await failureOf(check(guestUser, { enrollment: ["create"] })))._tag).toBe("Forbidden");
    expect(await Effect.runPromise(check(personalUser, { assessment: ["create"] }))).toEqual(personalUser);
    expect((await failureOf(check(personalUser, { member: ["create"] })))._tag).toBe("Forbidden");
  });
});

describe("requireOrganization", () => {
  test("is Forbidden in the personal space, whatever the permission", async () => {
    const err = await failureOf(as(personalUser, requireOrganization({ assessment: ["create"] })));
    expect(err).toMatchObject({ _tag: "Forbidden", message: "That needs an organization: pick or make one first." });
  });

  test("hands back the active organization of a member who may", async () => {
    const me = await Effect.runPromise(as(studentUser, requireOrganization({ avatar: ["update"] })));
    expect(me.organization.id).toBe("o");
  });
});
