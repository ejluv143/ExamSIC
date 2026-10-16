import { describe, expect, test } from "bun:test";
import { parseMemberRoles } from "@examinus/domain/roles";
import type { SessionUser } from "@examinus/domain/user";
import { Effect, Layer } from "effect";
import { Headers } from "effect/http";
import { limits } from "../../platform/RateLimiter.ts";
import { harness, stub } from "../../testing/config.ts";
import { fakeRateLimiter } from "../../testing/rateLimiter.ts";
import { BetterAuth } from "../auth/BetterAuth.ts";
import type { Actor } from "../auth/Session.ts";
import { OrganizationRepo } from "../organization/Repo.ts";
import { EnrollmentService } from "./Enrollment.ts";
import { classItem, fakeClassRepo, studentItem, type ClassWorld } from "./fixtures.ts";
import { ClassService } from "./Service.ts";

// `memberRole` is what the fake organization repo says the member's roles are after `addMember`.
const setup = (world: ClassWorld = {}, memberRole = "student") => {
  const fake = fakeClassRepo(world);
  const limiter = fakeRateLimiter();
  const added: Array<{ organizationId: string; userId: string; roles: readonly string[] }> = [];
  const activated: string[] = [];
  const organizations = Layer.succeed(
    OrganizationRepo,
    stub<OrganizationRepo["Service"]>("OrganizationRepo", {
      addMember: (organizationId, userId, roles) =>
        Effect.sync(() => {
          added.push({ organizationId, userId, roles });
          return { id: "m1", organizationId, userId, role: memberRole, createdAt: new Date(0) };
        }),
    }),
  );
  const auth = Layer.succeed(
    BetterAuth,
    stub<BetterAuth["Service"]>("BetterAuth", {
      call: (run) =>
        Effect.promise(() =>
          run({
            setActiveOrganization: async ({ body }: { body: { organizationId: string } }) =>
              void activated.push(body.organizationId),
          } as never),
        ),
    }),
  );
  const classes = ClassService.layer.pipe(Layer.provide(fake.layer));
  const layer = EnrollmentService.layer.pipe(Layer.provide([fake.layer, classes, limiter.layer, organizations, auth]));
  return { ...harness(layer), ...fake, limiter, added, activated };
};

// A student who belongs to the class's organization and has it active.
const ann: SessionUser = {
  id: "u1",
  role: "user",
  name: "Cruz, Ann B.",
  email: "ann@x.ph",
  department: null,
  plan: "free",
  organization: {
    id: "org1",
    name: "School",
    slug: "school",
    roles: ["student"],
    permissions: { enrollment: ["create", "read", "delete"] },
  },
  memberships: [],
};
const annActor: Actor = { id: "u1", organizationId: "org1" };
const classes = [classItem({ id: "c1", joinCode: "ABCDEFG" }), classItem({ id: "c2", joinCode: "HJKMNPQ" })];
const newStudent = { sex: "F" as const, studentNumber: " 2024-777 " };

describe("EnrollmentService", () => {
  test("a member whose roles don't allow enrolling is refused", async () => {
    const { fail, members } = setup({ classes }, "custom");
    const joining = await fail(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(ann, { code: "ABCDEFG", ...newStudent }, Headers.empty);
      }),
    );
    expect(joining._tag).toBe("Forbidden");
    expect(members).toEqual([]);
  });

  test("the code's organization decides: the student becomes a member of it and it becomes their active one", async () => {
    const elsewhere = [classItem({ id: "c5", organizationId: "org2", joinCode: "ZZZZZZZ" })];
    const { run, students, members, added, activated } = setup({ classes: elsewhere });
    const fresh: SessionUser = { ...ann, organization: null };
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(fresh, { code: "ZZZZZZZ", ...newStudent }, Headers.empty);
      }),
    );
    expect(result).toEqual({ classId: "c5" });
    expect(added).toEqual([{ organizationId: "org2", userId: "u1", roles: ["student"] }]);
    expect(students[0]).toMatchObject({ organizationId: "org2", userId: "u1" });
    expect(members).toEqual([{ classId: "c5", studentId: students[0]?.id! }]);
    expect(activated).toEqual(["org2"]);
  });

  test("joining a class of the already active organization doesn't switch it", async () => {
    const { run, activated, added } = setup({ classes });
    await run(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(ann, { code: "ABCDEFG", ...newStudent }, Headers.empty);
      }),
    );
    expect(activated).toEqual([]);
    expect(parseMemberRoles(added[0]!.roles.join(","))).toEqual(["student"]);
  });

  test("a roster entry in another organization isn't the student's here", async () => {
    const other = studentItem({ id: "s8", organizationId: "org2", userId: "u1" });
    const { run } = setup({ classes, students: [other], members: [["c1", "s8"]] });
    const mine = await run(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).mine(annActor);
      }),
    );
    expect(mine).toEqual({ student: null, classes: [] });
  });

  test("a code is matched however it is typed, the first class creates the roster entry and the open sessions are joined", async () => {
    const { run, students, members, sessionChanges } = setup({ classes });
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(ann, { code: " abc-defg ", ...newStudent }, Headers.empty);
      }),
    );
    expect(result).toEqual({ classId: "c1" });
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({
      userId: "u1",
      studentNumber: "2024-777",
      sex: "F",
      lastName: "Cruz",
      firstName: "Ann B.",
      email: "ann@x.ph",
    });
    expect(members).toEqual([{ classId: "c1", studentId: students[0]?.id! }]);
    expect(sessionChanges).toEqual(["join c1 u1"]);
  });

  test("a first-time student must give a student number and sex, and nothing is created without them", async () => {
    const { fail, students, members } = setup({ classes });
    const noNumber = await fail(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(ann, { code: "ABCDEFG", sex: "F", studentNumber: "  " }, Headers.empty);
      }),
    );
    const noSex = await fail(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(ann, { code: "ABCDEFG", sex: null, studentNumber: "1" }, Headers.empty);
      }),
    );
    expect([noNumber._tag, noSex._tag]).toEqual(["Conflict", "Conflict"]);
    expect(students).toEqual([]);
    expect(members).toEqual([]);
  });

  test("wrong codes are NotFound and count toward the limit; at the limit even a right code is refused", async () => {
    const { fail, limiter, members } = setup({ classes });
    const attempt = (code: string) =>
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(ann, { code, ...newStudent }, Headers.empty);
      });
    for (let i = 0; i < limits.joinCode.max; i++) expect((await fail(attempt("WRONG99")))._tag).toBe("NotFound");
    expect(limiter.used(limits.joinCode, "u1")).toBe(limits.joinCode.max);
    expect((await fail(attempt("ABCDEFG")))._tag).toBe("TooManyRequests");
    expect(members).toEqual([]);
    // A right code on its own isn't counted.
    const other = setup({ classes });
    await other.run(attempt("ABCDEFG"));
    expect(other.limiter.used(limits.joinCode, "u1")).toBe(0);
  });

  test("a roster entry imported from Classroom needs its missing number and sex, then is filled in; joining twice adds one membership", async () => {
    const imported = studentItem({ id: "s9", userId: "u1", studentNumber: null, sex: null });
    const { run, fail, students, members } = setup({ classes, students: [imported] });
    const join = (input: { sex: "F" | "M" | null; studentNumber: string | null }) =>
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(ann, { code: "ABCDEFG", ...input }, Headers.empty);
      });
    expect((await fail(join({ sex: "F", studentNumber: null })))._tag).toBe("Conflict");
    expect((await fail(join({ sex: null, studentNumber: "55" })))._tag).toBe("Conflict");
    expect(students[0]).toMatchObject({ studentNumber: null, sex: null });
    await run(join({ sex: "F", studentNumber: "55" }));
    await run(join({ sex: "F", studentNumber: "55" }));
    expect(students[0]).toMatchObject({ studentNumber: "55", sex: "F" });
    expect(members).toEqual([{ classId: "c1", studentId: "s9" }]);
  });

  test("a Google-verified email claims the imported roster entry and its classes' open sessions; an unverified one doesn't", async () => {
    const imported = studentItem({ id: "s9", userId: null, email: "Ann@X.ph" });
    const world = { classes, students: [imported], members: [["c1", "s9"] as [string, string]] };
    const verified = setup({ ...world, emails: { u1: { email: "ann@x.ph", verified: true } } });
    const mine = await verified.run(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).mine(annActor);
      }),
    );
    expect(mine.student?.userId).toBe("u1");
    expect(mine.classes.map((c) => c.row.id)).toEqual(["c1"]);
    expect(verified.sessionChanges).toEqual(["join c1 u1"]);

    const unverified = setup({ ...world, emails: { u1: { email: "ann@x.ph", verified: false } } });
    const none = await unverified.run(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).mine(annActor);
      }),
    );
    expect(none).toEqual({ student: null, classes: [] });
    expect(unverified.students[0]?.userId).toBeNull();
  });

  test("leaving removes the membership and the student's unstarted sessions; leaving a class you're not in is NotFound", async () => {
    const own = studentItem({ id: "s1", userId: "u1" });
    const { run, fail, members, sessionChanges } = setup({ classes, students: [own], members: [["c1", "s1"]] });
    const leave = (classId: string) =>
      Effect.gen(function* () {
        yield* (yield* EnrollmentService).leave(annActor, classId);
      });
    expect((await fail(leave("c2")))._tag).toBe("NotFound");
    expect(sessionChanges).toEqual([]);
    await run(leave("c1"));
    expect(members).toEqual([]);
    expect(sessionChanges).toEqual(["leave c1 u1"]);
  });

  test("a student without a roster entry leaving is NotFound", async () => {
    const { fail } = setup({ classes });
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).leave(annActor, "c1");
      }),
    );
    expect(err._tag).toBe("NotFound");
  });
});
