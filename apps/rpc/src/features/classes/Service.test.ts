import { describe, expect, test } from "bun:test";
import type { ClassFields } from "@examinus/domain/classes";
import { Effect, Layer } from "effect";
import { harness } from "../../testing/config.ts";
import { classItem, fakeClassRepo, studentItem, type ClassWorld } from "./fixtures.ts";
import { ClassService } from "./Service.ts";
import type { Actor } from "../auth/Session.ts";

const actor = (id: string): Actor => ({ id, organizationId: "org1" });

const setup = (world: ClassWorld = {}) => {
  const fake = fakeClassRepo(world);
  return { ...harness(ClassService.layer.pipe(Layer.provide(fake.layer))), ...fake };
};

const world: ClassWorld = {
  classes: [
    classItem({ id: "c1", teacherId: "t1" }),
    classItem({ id: "c2", teacherId: "t1", joinCode: "QQQQQQQ", archivedAt: new Date("2026-02-01") }),
    classItem({ id: "c3", teacherId: "t2", joinCode: "WWWWWWW" }),
  ],
  students: [
    studentItem({ id: "s1", userId: "u1" }),
    studentItem({ id: "s2", userId: null, email: "bo@x.ph" }),
  ],
  members: [
    ["c1", "s1"],
    ["c1", "s2"],
    ["c3", "s1"],
  ],
};

const fields: ClassFields = {
  courseCode: "  CS 2  ",
  title: " Algorithms ",
  subjectArea: null,
  section: " B ",
  term: "",
  schedule: " MWF ",
  room: "R1 ",
  units: 3,
};

describe("ClassService", () => {
  test("a teacher sees only their own classes, without archived ones, each with its own roster", async () => {
    const { run } = setup(world);
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* ClassService).list(actor("t1"));
      }),
    );
    expect(result.map((c) => c.row.id)).toEqual(["c1"]);
    expect(result[0]?.studentIds).toEqual(["s1", "s2"]);
  });

  test("another teacher's or an archived class is NotFound for every change, and nothing is written", async () => {
    const { fail, classes } = setup(world);
    const before = JSON.stringify(classes);
    for (const classId of ["c3", "c2", "nope"]) {
      const attempts = [
        (s: ClassService["Service"]) => s.update(actor("t1"), classId, fields),
        (s: ClassService["Service"]) => s.archive(actor("t1"), classId),
        (s: ClassService["Service"]) => s.newJoinCode(actor("t1"), classId),
        (s: ClassService["Service"]) => s.removeStudent(actor("t1"), classId, "s1"),
        (s: ClassService["Service"]) => s.ownClass(actor("t1"), classId),
      ];
      for (const attempt of attempts) {
        const err = await fail(
          Effect.gen(function* () {
            return yield* attempt(yield* ClassService);
          }),
        );
        expect(err._tag).toBe("NotFound");
      }
    }
    expect(JSON.stringify(classes)).toBe(before);
  });

  test("a class in another organization is NotFound for the same teacher", async () => {
    const abroad = classItem({ id: "c9", teacherId: "t1", organizationId: "org2", joinCode: "XXXXXXX" });
    const { run, fail } = setup({ classes: [...(world.classes ?? []), abroad] });
    const inOther: Actor = { id: "t1", organizationId: "org2" };
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* ClassService).ownClass(actor("t1"), "c9");
      }),
    );
    expect(err._tag).toBe("NotFound");
    const listed = await run(
      Effect.gen(function* () {
        return (yield* (yield* ClassService).list(inOther)).map((c) => c.row.id);
      }),
    );
    expect(listed).toEqual(["c9"]);
  });

  test("get returns null instead of failing for a class that isn't the teacher's", async () => {
    const { run } = setup(world);
    const result = await run(
      Effect.gen(function* () {
        const classes = yield* ClassService;
        return [yield* classes.get(actor("t1"), "c3"), (yield* classes.get(actor("t1"), "c1"))?.row.id];
      }),
    );
    expect(result).toEqual([null, "c1"]);
  });

  test("create trims the form, gives the class a 7-character join code from the safe alphabet and returns its id", async () => {
    const { run, classes } = setup();
    const { id } = await run(
      Effect.gen(function* () {
        return yield* (yield* ClassService).create(actor("t1"), fields);
      }),
    );
    const row = classes.find((c) => c.id === id);
    expect(row).toMatchObject({ teacherId: "t1", organizationId: "org1", courseCode: "CS 2", title: "Algorithms", section: "B", schedule: "MWF", room: "R1" });
    expect(row?.joinCode).toMatch(/^[A-HJKMNP-Z2-9]{7}$/);
  });

  test("a new join code replaces the old one", async () => {
    const { run, classes } = setup(world);
    const { joinCode } = await run(
      Effect.gen(function* () {
        return yield* (yield* ClassService).newJoinCode(actor("t1"), "c1");
      }),
    );
    expect(joinCode).not.toBe("ABCDEFG");
    expect(classes.find((c) => c.id === "c1")?.joinCode).toBe(joinCode);
  });

  test("archiving stamps the class so it disappears from the teacher's list", async () => {
    const { run } = setup(world);
    const result = await run(
      Effect.gen(function* () {
        const classes = yield* ClassService;
        yield* classes.archive(actor("t1"), "c1");
        return yield* classes.list(actor("t1"));
      }),
    );
    expect(result).toEqual([]);
  });

  test("removing a student takes them off the class and off its unstarted sessions; a stranger is NotFound", async () => {
    const { run, fail, members, sessionChanges } = setup(world);
    await run(
      Effect.gen(function* () {
        yield* (yield* ClassService).removeStudent(actor("t1"), "c1", "s1");
      }),
    );
    expect(members.map((m) => `${m.classId}/${m.studentId}`)).toEqual(["c1/s2", "c3/s1"]);
    expect(sessionChanges).toEqual(["leave c1 u1"]);

    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* ClassService).removeStudent(actor("t1"), "c1", "s1");
      }),
    );
    expect(err._tag).toBe("NotFound");
    // A roster entry without an account (imported from Classroom) has no sessions to leave.
    await run(
      Effect.gen(function* () {
        yield* (yield* ClassService).removeStudent(actor("t1"), "c1", "s2");
      }),
    );
    expect(sessionChanges).toEqual(["leave c1 u1"]);
  });

  test("membership is null for a student outside the class and for an archived class", async () => {
    const { run } = setup(world);
    const result = await run(
      Effect.gen(function* () {
        const classes = yield* ClassService;
        return [
          (yield* classes.membership("u1", "c1"))?.studentId,
          yield* classes.membership("u1", "c2"),
          yield* classes.membership("nobody", "c1"),
        ];
      }),
    );
    expect(result).toEqual(["s1", null, null]);
  });
});
