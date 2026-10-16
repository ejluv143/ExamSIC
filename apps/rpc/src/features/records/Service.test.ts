import { describe, expect, test } from "bun:test";
import type { ClassRecord } from "@examinus/contract/class-record";
import { Effect, Layer } from "effect";
import { harness, stub } from "../../testing/config.ts";
import { classItem, fakeClassRepo, studentItem, type ClassWorld } from "../classes/fixtures.ts";
import { ClassService } from "../classes/Service.ts";
import { RecordsRepo } from "./Repo.ts";
import { RecordsService } from "./Service.ts";
import type { Actor } from "../auth/Session.ts";

const actor = (id: string): Actor => ({ id, organizationId: "org1" });

const signatories = { dean: "Dean", vpaa: "VPAA", registrar: "Registrar" };

const record = (overrides: Partial<ClassRecord> = {}): ClassRecord => ({
  classId: "c1",
  terms: { midterm: [], final: [] },
  scores: {},
  absences: { midterm: {}, final: {} },
  dropped: [],
  signatories,
  ...overrides,
});

const setup = (world: ClassWorld, existing: ClassRecord | null = null, ownSessions: string[] = []) => {
  const fake = fakeClassRepo(world);
  const saved: Array<{ classId: string; record: Omit<ClassRecord, "classId">; updatedBy: string }> = [];
  const repo = Layer.succeed(
    RecordsRepo,
    stub<RecordsRepo["Service"]>("RecordsRepo", {
      find: () => Effect.succeed(existing),
      sessionIds: () => Effect.succeed(ownSessions),
      save: (classId, saving, updatedBy) => Effect.sync(() => void saved.push({ classId, record: saving, updatedBy })),
    }),
  );
  const classes = ClassService.layer.pipe(Layer.provide(fake.layer));
  return { ...harness(RecordsService.layer.pipe(Layer.provide([repo, classes]))), saved };
};

const world: ClassWorld = {
  classes: [classItem({ id: "c1", teacherId: "t1" }), classItem({ id: "c2", teacherId: "t2", joinCode: "ZZZZZZZ" })],
  students: [studentItem({ id: "s1", userId: "u1" }), studentItem({ id: "s2", userId: "u2", email: "bo@x.ph" })],
  members: [
    ["c1", "s1"],
    ["c1", "s2"],
  ],
};

const item = (overrides: Partial<ClassRecord["terms"]["midterm"][number]["items"][number]> = {}) => ({
  id: "i1",
  title: "Quiz 1",
  maxScore: 20,
  sessionId: null,
  ...overrides,
});

describe("RecordsService", () => {
  test("only the class's teacher can read or save its record", async () => {
    const { fail, saved } = setup(world, record({ classId: "c2" }));
    const get = await fail(
      Effect.gen(function* () {
        return yield* (yield* RecordsService).get(actor("t1"), "c2");
      }),
    );
    const save = await fail(
      Effect.gen(function* () {
        return yield* (yield* RecordsService).save(actor("t1"), record({ classId: "c2" }));
      }),
    );
    expect([get._tag, save._tag]).toEqual(["NotFound", "NotFound"]);
    expect(saved).toEqual([]);
  });

  test("a class with no saved record reads as null", async () => {
    const { run } = setup(world);
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* RecordsService).get(actor("t1"), "c1");
      }),
    );
    expect(result).toBeNull();
  });

  test("saving drops other classes' students and sessions, and returns exactly what was stored", async () => {
    const { run, saved } = setup(world, null, ["sess1"]);
    const input = record({
      terms: {
        midterm: [
          { id: "cat", name: "Quizzes", weight: 30, isExam: false, items: [item({ sessionId: "sess1" }), item({ id: "i2", sessionId: "other-teachers" })] },
        ],
        final: [],
      },
      scores: { i1: { s1: 18, s9: 20 } },
      absences: { midterm: { s2: 2, s9: 5 }, final: {} },
      dropped: ["s2", "s9", "s2"],
      unlinked: ["sess1", "sess-x"],
    });
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* RecordsService).save(actor("t1"), input);
      }),
    );
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ classId: "c1", updatedBy: "t1" });
    const { classId, ...stored } = result;
    expect(classId).toBe("c1");
    expect(stored).toEqual(saved[0]!.record);
    expect(result.terms.midterm[0]?.items.map((i) => i.sessionId)).toEqual(["sess1", null]);
    expect(result.scores).toEqual({ i1: { s1: 18 } });
    expect(result.absences).toEqual({ midterm: { s2: 2 }, final: {} });
    expect(result.dropped).toEqual(["s2"]);
    expect(result.unlinked).toEqual(["sess1"]);
  });

  test("a teacher can't overwrite the record of a class they don't own by naming it in the payload", async () => {
    const { fail } = setup(world);
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* RecordsService).save(actor("t2"), record({ classId: "c1" }));
      }),
    );
    expect(err._tag).toBe("NotFound");
  });

  test("a student's record has only their own scores, absences and drop mark", async () => {
    const full = record({
      terms: { midterm: [{ id: "cat", name: "Q", weight: 10, isExam: false, items: [item()] }], final: [] },
      scores: { i1: { s1: 15, s2: 9 } },
      absences: { midterm: { s1: 1, s2: 3 }, final: { s2: 1 } },
      dropped: ["s1", "s2"],
    });
    const { run } = setup(world, full);
    const mine = await run(
      Effect.gen(function* () {
        return yield* (yield* RecordsService).mine(actor("u1"), "c1");
      }),
    );
    expect(mine?.scores).toEqual({ i1: { s1: 15 } });
    expect(mine?.absences).toEqual({ midterm: { s1: 1 }, final: {} });
    expect(mine?.dropped).toEqual(["s1"]);
    // The categories and items are shared with the whole class.
    expect(mine?.terms.midterm[0]?.items).toHaveLength(1);
  });

  test("a student outside the class is refused, and one in a class without a record gets null", async () => {
    const { fail } = setup(world, record());
    const outsider = await fail(
      Effect.gen(function* () {
        return yield* (yield* RecordsService).mine(actor("u9"), "c1");
      }),
    );
    expect(outsider._tag).toBe("NotFound");
    const empty = setup(world);
    const result = await empty.run(
      Effect.gen(function* () {
        return yield* (yield* RecordsService).mine(actor("u1"), "c1");
      }),
    );
    expect(result).toBeNull();
  });
});

describe("cleanRecord limits (through save)", () => {
  const saveOf = async (input: ClassRecord) => {
    const { run } = setup(world);
    return run(
      Effect.gen(function* () {
        return yield* (yield* RecordsService).save(actor("t1"), input);
      }),
    );
  };

  test("weights and max scores out of range become 0, a blank category name becomes \"Category\", long text is cut", async () => {
    const cleaned = await saveOf(
      record({
        terms: {
          midterm: [
            {
              id: "x".repeat(100),
              name: "",
              weight: 150,
              isExam: true,
              items: [item({ title: "t".repeat(200), maxScore: -1 }), item({ id: "i2", maxScore: 1001 }), item({ id: "i3", maxScore: Number.NaN })],
            },
          ],
          final: [],
        },
        signatories: { dean: "d".repeat(200), vpaa: "", registrar: "" },
      }),
    );
    const [category] = cleaned.terms.midterm;
    expect(category).toMatchObject({ name: "Category", weight: 0, isExam: true });
    expect(category?.id).toHaveLength(40);
    expect(category?.items.map((i) => i.maxScore)).toEqual([0, 0, 0]);
    expect(category?.items[0]?.title).toHaveLength(80);
    expect(cleaned.signatories.dean).toHaveLength(80);
  });

  test("an out-of-range score is cleared to null, a null stays null, and absences are whole numbers within 200", async () => {
    const cleaned = await saveOf(
      record({
        scores: { i1: { s1: 5000, s2: null } },
        absences: { midterm: { s1: 2.7, s2: 201 }, final: { s1: -1 } },
      }),
    );
    expect(cleaned.scores).toEqual({ i1: { s1: null, s2: null } });
    expect(cleaned.absences).toEqual({ midterm: { s1: 2 }, final: {} });
  });

  test("at most 20 categories per term and 40 items per category are kept, and the attendance source survives", async () => {
    const category = (id: string, items: number) => ({
      id,
      name: id,
      weight: 1,
      isExam: false,
      items: Array.from({ length: items }, (_, n) => item({ id: `${id}-${n}`, ...(n === 0 && { source: "attendance" as const }) })),
    });
    const cleaned = await saveOf(
      record({
        terms: { midterm: Array.from({ length: 25 }, (_, n) => category(`c${n}`, n === 0 ? 50 : 1)), final: [] },
      }),
    );
    expect(cleaned.terms.midterm).toHaveLength(20);
    expect(cleaned.terms.midterm[0]?.items).toHaveLength(40);
    expect(cleaned.terms.midterm[0]?.items[0]?.source).toBe("attendance");
    expect(cleaned.terms.midterm[0]?.items[1]).not.toHaveProperty("source");
  });
});
