import { describe, expect, test } from "bun:test";
import type { SessionUser } from "@examinus/domain/user";
import { Effect, Layer } from "effect";
import { limits } from "../../platform/RateLimiter.ts";
import { harness } from "../../testing/config.ts";
import { fakeRateLimiter } from "../../testing/rateLimiter.ts";
import { EnrollmentService } from "./Enrollment.ts";
import { classItem, fakeClassRepo, studentItem, type ClassWorld } from "./fixtures.ts";
import { ClassService } from "./Service.ts";

const setup = (world: ClassWorld = {}) => {
  const fake = fakeClassRepo(world);
  const limiter = fakeRateLimiter();
  const classes = ClassService.layer.pipe(Layer.provide(fake.layer));
  const layer = EnrollmentService.layer.pipe(Layer.provide([fake.layer, classes, limiter.layer]));
  return { ...harness(layer), ...fake, limiter };
};

const ann: SessionUser = { id: "u1", role: "student", name: "Cruz, Ann B.", email: "ann@x.ph" };
const teacher: SessionUser = { id: "t1", role: "teacher", name: "T", email: "t@x.ph", department: null, plan: "free" };
const classes = [classItem({ id: "c1", joinCode: "ABCDEFG" }), classItem({ id: "c2", joinCode: "HJKMNPQ" })];
const newStudent = { sex: "F" as const, studentNumber: " 2024-777 " };

describe("EnrollmentService", () => {
  test("only students can join, leave or list classes", async () => {
    const { fail } = setup({ classes });
    const joining = await fail(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(teacher, { code: "ABCDEFG", ...newStudent });
      }),
    );
    expect(joining._tag).toBe("Forbidden");
    const listing = await fail(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).mine(teacher);
      }),
    );
    expect(listing._tag).toBe("Forbidden");
  });

  test("a code is matched however it is typed, the first class creates the roster entry and the open sessions are joined", async () => {
    const { run, students, members, sessionChanges } = setup({ classes });
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(ann, { code: " abc-defg ", ...newStudent });
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
        return yield* (yield* EnrollmentService).join(ann, { code: "ABCDEFG", sex: "F", studentNumber: "  " });
      }),
    );
    const noSex = await fail(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).join(ann, { code: "ABCDEFG", sex: null, studentNumber: "1" });
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
        return yield* (yield* EnrollmentService).join(ann, { code, ...newStudent });
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
        return yield* (yield* EnrollmentService).join(ann, { code: "ABCDEFG", ...input });
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
        return yield* (yield* EnrollmentService).mine(ann);
      }),
    );
    expect(mine.student?.userId).toBe("u1");
    expect(mine.classes.map((c) => c.row.id)).toEqual(["c1"]);
    expect(verified.sessionChanges).toEqual(["join c1 u1"]);

    const unverified = setup({ ...world, emails: { u1: { email: "ann@x.ph", verified: false } } });
    const none = await unverified.run(
      Effect.gen(function* () {
        return yield* (yield* EnrollmentService).mine(ann);
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
        yield* (yield* EnrollmentService).leave(ann, classId);
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
        return yield* (yield* EnrollmentService).leave(ann, "c1");
      }),
    );
    expect(err._tag).toBe("NotFound");
  });
});
