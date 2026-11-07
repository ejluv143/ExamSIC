// The Organization scope against a real Postgres: what each kind of table lets a person reach in an organization and in
// the personal space, and the named exceptions.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { assets, bankQuestions, bankShares, classes, quizzes, students, type BankQuestionItem } from "../database/schemas/index.ts";
import { testPostgres } from "../testing/postgres.ts";
import { assetRow, bankRow, quizRow } from "../testing/rows.ts";
import { seedOrganizations, seedUsers } from "../testing/seed.ts";
import {
  assetsIn,
  bankReach,
  ownedAssets,
  ownedBankQuestions,
  ownedClasses,
  ownedQuizzes,
  ownedShares,
  quizzesPlayableBy,
  rosterBeside,
  rosterOf,
  sharesIn,
} from "./organization-scope.ts";

const pg = await testPostgres();
const { db } = pg;
afterAll(() => pg.close());
beforeEach(async () => {
  await pg.reset();
  await seedOrganizations(db, "org1", "org2");
  await seedUsers(db, "ann", "ben", "cy");
});

const ann = (organizationId: string | null) => ({ id: "ann", organizationId });

describe("owned rows", () => {
  test("a quiz is the owner's in one organization only, and the personal space is its own scope", async () => {
    await db.insert(quizzes).values([
      quizRow({ id: "ann-org1", ownerId: "ann", organizationId: "org1" }),
      quizRow({ id: "ann-org2", ownerId: "ann", organizationId: "org2" }),
      quizRow({ id: "ann-personal", ownerId: "ann", organizationId: null }),
      quizRow({ id: "ben-org1", ownerId: "ben", organizationId: "org1" }),
    ]);
    const idsFor = async (organizationId: string | null) =>
      (await db.select({ id: quizzes.id }).from(quizzes).where(ownedQuizzes(ann(organizationId))).orderBy(quizzes.id)).map((r) => r.id);

    expect(await idsFor("org1")).toEqual(["ann-org1"]);
    expect(await idsFor("org2")).toEqual(["ann-org2"]);
    expect(await idsFor(null)).toEqual(["ann-personal"]);
  });

  test("a class is its teacher's, not the organization's", async () => {
    const klass = (id: string, teacherId: string, organizationId: string | null) => ({
      id,
      teacherId,
      organizationId,
      courseCode: "C",
      title: id,
      joinCode: id,
    });
    await db.insert(classes).values([klass("mine", "ann", "org1"), klass("theirs", "ben", "org1"), klass("personal", "ann", null)]);
    const idsFor = async (organizationId: string | null) =>
      (await db.select({ id: classes.id }).from(classes).where(ownedClasses(ann(organizationId))).orderBy(classes.id)).map((r) => r.id);

    expect(await idsFor("org1")).toEqual(["mine"]);
    expect(await idsFor(null)).toEqual(["personal"]);
  });

  test("bank questions and shares follow the same rule", async () => {
    await db.insert(bankQuestions).values([
      bankRow({ id: "mine", ownerId: "ann", organizationId: "org1" }),
      bankRow({ id: "personal", ownerId: "ann", organizationId: null }),
      bankRow({ id: "ben", ownerId: "ben", organizationId: "org1" }),
    ]);
    await db.insert(bankShares).values([
      { ownerId: "ann", organizationId: "org1", recipientId: "ben", scope: "subject", subject: "Math" },
      { ownerId: "ben", organizationId: "org1", recipientId: "ann", scope: "subject", subject: "Math" },
    ]);

    const questions = await db.select({ id: bankQuestions.id }).from(bankQuestions).where(ownedBankQuestions(ann("org1")));
    expect(questions.map((r) => r.id)).toEqual(["mine"]);
    const shares = await db.select({ owner: bankShares.ownerId }).from(bankShares).where(ownedShares(ann("org1")));
    expect(shares).toEqual([{ owner: "ann" }]);
    expect(await db.select().from(bankShares).where(ownedShares(ann(null)))).toEqual([]);
    expect(await db.select().from(bankShares).where(sharesIn("org2"))).toEqual([]);
  });
});

describe("roster rows", () => {
  const entry = (id: string, organizationId: string | null, userId: string) => ({
    id,
    organizationId,
    userId,
    firstName: id,
    lastName: id,
    email: `${id}@test.dev`,
  });

  test("an organization's roster is its own; the personal space's has the entries with none", async () => {
    await db.insert(students).values([entry("in-org1", "org1", "ben"), entry("in-org2", "org2", "ben"), entry("personal", null, "ben")]);
    const idsOf = async (organizationId: string | null) =>
      (await db.select({ id: students.id }).from(students).where(rosterOf(organizationId))).map((r) => r.id);

    expect(await idsOf("org1")).toEqual(["in-org1"]);
    expect(await idsOf(null)).toEqual(["personal"]);
  });

  test("a student is beside a quiz of the same organization, and personal beside personal", async () => {
    await db.insert(students).values([entry("in-org1", "org1", "ben"), entry("in-org2", "org2", "cy"), entry("personal", null, "ann")]);
    await db.insert(quizzes).values([
      quizRow({ id: "quiz-org1", ownerId: "ann", organizationId: "org1" }),
      quizRow({ id: "quiz-personal", ownerId: "ann", organizationId: null }),
    ]);
    const pairs = await db
      .select({ student: students.id, quiz: quizzes.id })
      .from(students)
      .innerJoin(quizzes, rosterBeside(quizzes.organizationId))
      .orderBy(students.id);

    expect(pairs).toEqual([
      { student: "in-org1", quiz: "quiz-org1" },
      { student: "personal", quiz: "quiz-personal" },
    ]);
  });
});

describe("bank reach", () => {
  const question = (id: string, over: Partial<BankQuestionItem>) => bankRow({ id, organizationId: "org1", ...over });
  const reachedBy = async (organizationId: string | null) =>
    (await db.select({ id: bankQuestions.id }).from(bankQuestions).where(bankReach(ann(organizationId))).orderBy(bankQuestions.id)).map((r) => r.id);

  beforeEach(async () => {
    await db.insert(bankQuestions).values([
      question("demo", { ownerId: null, organizationId: null }),
      question("mine", { ownerId: "ann" }),
      question("mine-personal", { ownerId: "ann", organizationId: null }),
      question("ben-private", { ownerId: "ben", subject: "Art", topic: "Color" }),
      question("ben-by-question", { ownerId: "ben", subject: "Bio" }),
      question("ben-by-subject", { ownerId: "ben", subject: "Math" }),
      question("ben-by-topic", { ownerId: "ben", subject: "Chem", topic: "Acids" }),
      question("cy-other-org", { ownerId: "cy", organizationId: "org2", subject: "Math" }),
    ]);
    const share = { ownerId: "ben", organizationId: "org1", recipientId: "ann" } as const;
    await db.insert(bankShares).values([
      { ...share, scope: "question", questionId: "ben-by-question" },
      { ...share, scope: "subject", subject: "Math" },
      { ...share, scope: "topic", topic: "Acids" },
      // Shared with someone else: no use to ann.
      { ...share, recipientId: "cy", scope: "subject", subject: "Art" },
    ]);
  });

  test("an organization member sees the demo library, their own and what was shared with them", async () => {
    expect(await reachedBy("org1")).toEqual(["ben-by-question", "ben-by-subject", "ben-by-topic", "demo", "mine"]);
  });

  test("a share is matched against the questions as they are now", async () => {
    await db.update(bankQuestions).set({ subject: "Math" }).where(eq(bankQuestions.id, "ben-private"));
    expect(await reachedBy("org1")).toContain("ben-private");
  });

  test("the personal space sees the demo library and its own, and no shares", async () => {
    expect(await reachedBy(null)).toEqual(["demo", "mine-personal"]);
  });
});

describe("assets", () => {
  const asset = (id: string, ownerId: string, organizationId: string | null) =>
    assetRow({ id, ownerId, organizationId, s3Key: `key/${id}` });

  beforeEach(async () => {
    await db.insert(assets).values([
      asset("ann-org1", "ann", "org1"),
      asset("ann-org2", "ann", "org2"),
      asset("ann-none", "ann", null),
      asset("ben-org1", "ben", "org1"),
    ]);
  });

  const idsIn = async (organizationId: string | null) =>
    (await db.select({ id: assets.id }).from(assets).where(assetsIn(organizationId)).orderBy(assets.id)).map((r) => r.id);
  const ownedBy = async (organizationId: string | null) =>
    (await db.select({ id: assets.id }).from(assets).where(ownedAssets(ann(organizationId))).orderBy(assets.id)).map((r) => r.id);

  test("an organization reaches only its assets", async () => {
    expect(await idsIn("org1")).toEqual(["ann-org1", "ben-org1"]);
    expect(await ownedBy("org1")).toEqual(["ann-org1"]);
  });

  test("exception: without an organization, assets of every organization are reached", async () => {
    expect(await idsIn(null)).toEqual(["ann-none", "ann-org1", "ann-org2", "ben-org1"]);
    expect(await ownedBy(null)).toEqual(["ann-none", "ann-org1", "ann-org2"]);
  });
});

describe("quizzes a student plays", () => {
  test("exception: a player without an organization plays quizzes of any; the rest only their organization's", async () => {
    await db.insert(quizzes).values([
      quizRow({ id: "quiz-org1", ownerId: "ben", organizationId: "org1" }),
      quizRow({ id: "quiz-org2", ownerId: "ben", organizationId: "org2" }),
      quizRow({ id: "quiz-personal", ownerId: "ben", organizationId: null }),
    ]);
    const playable = async (organizationId: string | null) =>
      (await db.select({ id: quizzes.id }).from(quizzes).where(and(quizzesPlayableBy({ id: "cy", organizationId }))).orderBy(quizzes.id)).map(
        (r) => r.id,
      );

    expect(await playable("org1")).toEqual(["quiz-org1"]);
    expect(await playable(null)).toEqual(["quiz-org1", "quiz-org2", "quiz-personal"]);
  });
});
