import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { Effect, Layer } from "effect";
import { harness, stub } from "../../testing/config.ts";
import { classItem, fakeClassRepo, studentItem, type ClassWorld } from "../classes/fixtures.ts";
import { ClassService } from "../classes/Service.ts";
import { AttendanceRepo, type StoredMeeting } from "./Repo.ts";
import { AttendanceService } from "./Service.ts";

// "Today" is Wednesday 2026-09-16 in Manila, inside the semester, so the meeting dates don't depend on the real date.
beforeEach(() => setSystemTime(new Date("2026-09-16T04:00:00Z")));
afterEach(() => setSystemTime());

const stored = (date: string, records: StoredMeeting["records"], classId = "c1"): StoredMeeting => ({
  classId,
  date,
  records,
  takenAt: new Date("2026-08-12T03:00:00Z"),
  takenBy: "t1",
  createdAt: new Date(),
  updatedAt: new Date(),
});

const setup = (world: ClassWorld, meetings: StoredMeeting[] = []) => {
  const fake = fakeClassRepo(world);
  const saved: Array<{ classId: string; date: string; records: Record<string, string>; takenBy: string }> = [];
  const repo = Layer.succeed(
    AttendanceRepo,
    stub<AttendanceRepo["Service"]>("AttendanceRepo", {
      stored: (classIds) => Effect.sync(() => meetings.filter((m) => classIds.includes(m.classId))),
      save: ({ classId, date, records, takenBy }) => Effect.sync(() => void saved.push({ classId, date, records, takenBy })),
    }),
  );
  const classes = ClassService.layer.pipe(Layer.provide(fake.layer));
  return { ...harness(AttendanceService.layer.pipe(Layer.provide([repo, classes]))), saved };
};

const world: ClassWorld = {
  classes: [
    classItem({ id: "c1", teacherId: "t1", schedule: "MWF 9:00 AM" }),
    classItem({ id: "c2", teacherId: "t1", schedule: "TTh 1:00 PM", joinCode: "TTTTTTT" }),
    classItem({ id: "c3", teacherId: "t2", schedule: "MWF", joinCode: "UUUUUUU" }),
  ],
  students: [
    studentItem({ id: "s1", userId: "u1" }),
    studentItem({ id: "s2", userId: "u2", email: "bo@x.ph" }),
    studentItem({ id: "s9", userId: "u9", email: "out@x.ph" }),
  ],
  members: [
    ["c1", "s1"],
    ["c1", "s2"],
  ],
};

describe("AttendanceService", () => {
  test("meetings are the scheduled days up to today, newest first, plus a taken day that left the schedule", async () => {
    const { run } = setup(world, [stored("2026-08-11", { s1: "absent" })]);
    const meetings = await run(
      Effect.gen(function* () {
        return yield* (yield* AttendanceService).meetings("t1", "c1");
      }),
    );
    const dates = meetings.map((m) => m.date);
    expect(dates.slice(0, 3)).toEqual(["2026-09-16", "2026-09-14", "2026-09-11"]);
    expect(dates.at(-1)).toBe("2026-08-10");
    expect(dates).toContain("2026-08-11");
    expect(dates).not.toContain("2026-09-18");
    expect(meetings.find((m) => m.date === "2026-08-11")).toMatchObject({ records: { s1: "absent" } });
    expect(meetings[0]?.takenAt).toBeNull();
  });

  test("another teacher's class has no meetings to read or save", async () => {
    const { fail, saved } = setup(world);
    const read = await fail(
      Effect.gen(function* () {
        return yield* (yield* AttendanceService).meetings("t1", "c3");
      }),
    );
    const save = await fail(
      Effect.gen(function* () {
        return yield* (yield* AttendanceService).save("t1", { classId: "c3", date: "2026-09-14", records: {} });
      }),
    );
    expect([read._tag, save._tag]).toEqual(["NotFound", "NotFound"]);
    expect(saved).toEqual([]);
  });

  test("attendance can't be taken for a day without a meeting yet, and nothing is written", async () => {
    const { fail, saved } = setup(world);
    const take = (date: string) =>
      Effect.gen(function* () {
        return yield* (yield* AttendanceService).save("t1", { classId: "c1", date, records: { s1: "absent" } });
      });
    // Tomorrow's meeting (a Friday), a Tuesday the class doesn't meet, and a Monday before the semester.
    for (const date of ["2026-09-18", "2026-09-15", "2026-08-03"]) expect((await fail(take(date)))._tag).toBe("Conflict");
    expect(saved).toEqual([]);
  });

  test("only exceptions of students on the roster are kept, and the teacher who took them is recorded", async () => {
    const { run, saved } = setup(world);
    const meeting = await run(
      Effect.gen(function* () {
        return yield* (yield* AttendanceService).save("t1", {
          classId: "c1",
          date: "2026-09-14",
          records: { s1: "late", s2: "present", s9: "absent", ghost: "excused" },
        });
      }),
    );
    expect(saved).toEqual([{ classId: "c1", date: "2026-09-14", records: { s1: "late" }, takenBy: "t1" }]);
    expect(meeting).toMatchObject({ id: "2026-09-14", classId: "c1", records: { s1: "late" } });
    expect(meeting.takenAt).not.toBeNull();
  });

  test("attendance can be corrected on a day already taken that has left the schedule", async () => {
    const { run, saved } = setup(world, [stored("2026-08-11", { s1: "absent" })]);
    await run(
      Effect.gen(function* () {
        yield* (yield* AttendanceService).save("t1", { classId: "c1", date: "2026-08-11", records: { s2: "excused" } });
      }),
    );
    expect(saved[0]).toMatchObject({ date: "2026-08-11", records: { s2: "excused" } });
  });

  test("today lists only the meetings that fall on today, from the teacher's own classes", async () => {
    const { run } = setup(world, [stored("2026-09-16", { s1: "late" })]);
    const today = await run(
      Effect.gen(function* () {
        return yield* (yield* AttendanceService).today("t1");
      }),
    );
    // c1 meets on Wednesdays; c2 (TTh) doesn't, and c3 is another teacher's.
    expect(today.map((m) => [m.classId, m.date])).toEqual([["c1", "2026-09-16"]]);
    expect(today[0]?.records).toEqual({ s1: "late" });
  });

  test("a student sees only their own marks, and a non-member is refused", async () => {
    const { run, fail } = setup(world, [stored("2026-09-14", { s1: "late", s2: "absent" }), stored("2026-09-11", { s2: "absent" })]);
    const mine = (userId: string) =>
      Effect.gen(function* () {
        return yield* (yield* AttendanceService).mine(userId, "c1");
      });
    const meetings = await run(mine("u1"));
    expect(meetings.find((m) => m.date === "2026-09-14")?.records).toEqual({ s1: "late" });
    expect(meetings.find((m) => m.date === "2026-09-11")?.records).toEqual({});
    expect((await fail(mine("u9")))._tag).toBe("NotFound");
    expect((await fail(mine("nobody")))._tag).toBe("NotFound");
  });
});
