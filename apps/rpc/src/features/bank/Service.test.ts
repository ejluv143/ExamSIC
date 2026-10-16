import { describe, expect, test } from "bun:test";
import type { Question } from "@examinus/domain/question";
import { Effect, Layer } from "effect";
import type { BankQuestionItem, NewBankQuestion, NewBankShare } from "../../database/schemas/index.ts";
import type { Actor } from "../auth/Session.ts";
import { harness, stub } from "../../testing/config.ts";
import { bankRow } from "../../testing/rows.ts";
import { BankRepo, type BankPatch, type BankRow } from "./Repo.ts";
import { BankService } from "./Service.ts";

const org = "org-1";
const t1: Actor = { id: "teacher-1", organizationId: org };
const t2: Actor = { id: "teacher-2", organizationId: org };

const trueFalse = (id: string, topic?: string): Question => ({
  id,
  prompt: `Question ${id}`,
  points: 1,
  gamePoints: "standard",
  partialCredit: true,
  type: "true_false",
  answer: true,
  ...(topic === undefined ? {} : { topic }),
});

const row = (id: string, ownerId: string | null, over: Partial<BankQuestionItem> = {}): BankQuestionItem => {
  const topic = over.topic ?? null;
  return bankRow({ id: `bank-${id}`, ownerId, organizationId: ownerId === null ? null : org, question: trueFalse(id, topic ?? undefined), ...over });
};

// A repo over these rows (teacher-1 owns a, b and c; teacher-2 owns x and y; the library has lib) and these teachers
// (by email). `written`, `renamed`, `removed`, `inserted` and `shared` record what reached the repo.
const setup = (options: { teachers?: Array<{ id: string; name: string; email: string }>; visibleToOne?: string[] } = {}) => {
  const rows: BankQuestionItem[] = [
    row("a", "teacher-1", { subject: "Math", topic: "Algebra" }),
    row("b", "teacher-1", { subject: "Math", topic: "Geometry" }),
    row("c", "teacher-1", { subject: "Science" }),
    row("x", "teacher-2", { subject: "Math", topic: "Algebra" }),
    row("y", "teacher-2"),
    row("lib", null, { subject: "Math" }),
  ];
  const teachers = options.teachers ?? [
    { id: "teacher-1", name: "One", email: "one@x.ph" },
    { id: "teacher-2", name: "Two", email: "two@x.ph" },
  ];
  const written: BankPatch[][] = [];
  const renamed: Array<{ kind: string; from: string; to: string; patches: readonly BankPatch[] }> = [];
  const removed: string[][] = [];
  const inserted: NewBankQuestion[] = [];
  const shared: NewBankShare[] = [];
  const unshared: string[] = [];
  const ownedBy = (actor: Actor, ids: readonly string[]) =>
    rows.filter((r) => r.ownerId === actor.id && r.organizationId === actor.organizationId && ids.includes(r.question.id));
  const repo = Layer.succeed(
    BankRepo,
    stub<BankRepo["Service"]>("BankRepo", {
      list: () => Effect.succeed(rows.map((item): BankRow => ({ item, ownerName: item.ownerId && `Teacher ${item.ownerId}` }))),
      visible: (_actor, ids) =>
        Effect.succeed(
          rows
            .filter((r) => ids.includes(r.question.id) && (r.ownerId === null || r.ownerId === "teacher-1" || (options.visibleToOne ?? []).includes(r.question.id)))
            .map((item): BankRow => ({ item, ownerName: null })),
        ),
      owned: (actor, ids) => Effect.succeed(ownedBy(actor, ids)),
      ownedWithTag: (actor, kind, name) =>
        Effect.succeed(rows.filter((r) => r.ownerId === actor.id && r.organizationId === actor.organizationId && r[kind] === name)),
      insert: (added) => Effect.sync(() => void inserted.push(...added)),
      update: (patches) => Effect.sync(() => void written.push([...patches])),
      rename: (_actor, kind, from, to, patches) => Effect.sync(() => void renamed.push({ kind, from, to, patches })),
      remove: (ids) => Effect.sync(() => void removed.push([...ids])),
      teachersByEmail: (_actor, emails) => Effect.succeed(teachers.filter((t) => emails.includes(t.email))),
      addShares: (added) => Effect.sync(() => (shared.push(...added), added.length)),
      findOwnedShare: (shareId, actor) =>
        Effect.succeed(
          shareId === "share-1" && actor.id === "teacher-1" && actor.organizationId === org
            ? ({ id: "share-1", ownerId: actor.id } as never)
            : null,
        ),
      removeShare: (id) => Effect.sync(() => void unshared.push(id)),
    }),
  );
  return { ...harness(BankService.layer.pipe(Layer.provide(repo))), written, renamed, removed, inserted, shared, unshared };
};

const service = Effect.service(BankService);

describe("BankService", () => {
  test("the list says whose each question is: mine, shared by someone, or the library's", async () => {
    const { run } = setup();
    const list = await run(Effect.flatMap(service, (s) => s.list(t1)));
    const by = (id: string) => list.find((b) => b.question.id === id)!;
    expect(by("a")).toMatchObject({ mine: true, sharedBy: null, owner: { id: "teacher-1" } });
    expect(by("x")).toMatchObject({ mine: false, owner: { id: "teacher-2" }, sharedBy: { id: "teacher-2" } });
    expect(by("lib")).toMatchObject({ mine: false, owner: null, sharedBy: null });
    expect(by("a").topic).toBe("Algebra");
  });

  test("writing to a question the caller doesn't own is NotFound and nothing is written", async () => {
    const { fail, written, removed, renamed } = setup();
    const attempts: Array<Effect.Effect<unknown, { _tag: string }, BankService>> = [
      Effect.flatMap(service, (s) => s.retag(t1, { questionIds: ["a", "x"], topic: "T" })),
      Effect.flatMap(service, (s) => s.remove(t1, ["a", "lib"])),
      Effect.flatMap(service, (s) => s.update(t1, trueFalse("x"), null, null)),
      Effect.flatMap(service, (s) => s.share(t1, { recipients: ["two@x.ph"], scope: "question", questionIds: ["x"] })),
    ];
    for (const attempt of attempts) expect((await fail(attempt))._tag).toBe("NotFound");
    expect(written).toEqual([]);
    expect(removed).toEqual([]);
    expect(renamed).toEqual([]);
  });

  test("retag sets the tags and keeps Question.topic in sync; a key left out is unchanged, null clears", async () => {
    const { run, written } = setup();
    await run(Effect.flatMap(service, (s) => s.retag(t1, { questionIds: ["a", "b"], subject: " Physics ", topic: "Motion" })));
    expect(written[0]!.map((p) => [p.id, p.subject, p.topic, p.question.topic])).toEqual([
      ["bank-a", "Physics", "Motion", "Motion"],
      ["bank-b", "Physics", "Motion", "Motion"],
    ]);
    await run(Effect.flatMap(service, (s) => s.retag(t1, { questionIds: ["a"], topic: null })));
    expect(written[1]![0]).toMatchObject({ subject: "Math", topic: null });
    expect("topic" in written[1]![0]!.question).toBe(false);
    // Only the subject given: the topic stays, in the column and in the question.
    await run(Effect.flatMap(service, (s) => s.retag(t1, { questionIds: ["b"], subject: "Physics" })));
    expect(written[2]![0]).toMatchObject({ subject: "Physics", topic: "Geometry" });
    expect(written[2]![0]!.question.topic).toBe("Geometry");
  });

  test("renaming a topic changes every question that has it, in the column and in the question; it merges into an existing name", async () => {
    const { run, renamed } = setup();
    const count = await run(Effect.flatMap(service, (s) => s.renameTag(t1, "topic", "Algebra", "Geometry")));
    expect(count).toBe(1);
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toMatchObject({ kind: "topic", from: "Algebra", to: "Geometry" });
    expect(renamed[0]!.patches.map((p) => [p.id, p.topic, p.question.topic])).toEqual([["bank-a", "Geometry", "Geometry"]]);
  });

  test("renaming a subject leaves the topics alone; naming a tag the caller has no question with is NotFound", async () => {
    const { run, fail, renamed } = setup();
    await run(Effect.flatMap(service, (s) => s.renameTag(t1, "subject", "Math", "Science")));
    expect(renamed[0]!.patches.map((p) => [p.id, p.subject, p.topic])).toEqual([
      ["bank-a", "Science", "Algebra"],
      ["bank-b", "Science", "Geometry"],
    ]);
    // "Algebra" exists, but only on teacher-2's question as far as the lookup for teacher-1 on "Nothing" goes.
    const err = await fail(Effect.flatMap(service, (s) => s.renameTag(t1, "subject", "Nothing", "Math")));
    expect(err._tag).toBe("NotFound");
  });

  test("an update keeps the question's id and its topic in sync with the column", async () => {
    const { run, written } = setup();
    const updated = await run(Effect.flatMap(service, (s) => s.update(t1, { ...trueFalse("a", " Sets "), prompt: "New" }, "Math", "math")));
    expect(written[0]![0]).toMatchObject({ id: "bank-a", subject: "Math", subjectArea: "math", topic: "Sets" });
    expect(updated.question).toMatchObject({ id: "a", prompt: "New", topic: "Sets" });
    expect(updated).toMatchObject({ topic: "Sets", mine: true });
  });

  test("sharing needs teacher accounts: unknown emails are named and nothing is shared", async () => {
    const { fail, shared } = setup();
    const err = await fail(
      Effect.flatMap(service, (s) => s.share(t1, { recipients: ["two@x.ph", " Nobody@x.ph "], scope: "subject", subject: "Math" })),
    );
    expect(err).toMatchObject({ _tag: "UnknownRecipients", emails: ["nobody@x.ph"] });
    expect(shared).toEqual([]);
  });

  test("a share's fields must fit its scope, can't target the caller, and a tag the caller has no questions in is NotFound", async () => {
    const { fail } = setup();
    const tags = (input: Parameters<BankService["Service"]["share"]>[1]) => Effect.flatMap(service, (s) => s.share(t1, input));
    expect((await fail(tags({ recipients: ["two@x.ph"], scope: "subject" })))._tag).toBe("Conflict");
    expect((await fail(tags({ recipients: ["two@x.ph"], scope: "subject", subject: "Math", topic: "Algebra" })))._tag).toBe("Conflict");
    expect((await fail(tags({ recipients: ["two@x.ph"], scope: "question", subject: "Math" })))._tag).toBe("Conflict");
    expect((await fail(tags({ recipients: ["one@x.ph"], scope: "subject", subject: "Math" })))._tag).toBe("Conflict");
    expect((await fail(tags({ recipients: ["two@x.ph"], scope: "topic", topic: "Nope" })))._tag).toBe("NotFound");
  });

  test("a share is written per recipient and scope with only its own field set", async () => {
    const { run, shared } = setup({ teachers: [{ id: "teacher-2", name: "Two", email: "two@x.ph" }, { id: "teacher-3", name: "Three", email: "three@x.ph" }] });
    const count = await run(
      Effect.flatMap(service, (s) => s.share(t1, { recipients: ["TWO@x.ph", "three@x.ph", "two@x.ph"], scope: "subject", subject: " Math " })),
    );
    expect(count).toBe(2);
    expect(shared).toEqual([
      { ownerId: "teacher-1", organizationId: org, recipientId: "teacher-2", scope: "subject", subject: "Math", topic: null },
      { ownerId: "teacher-1", organizationId: org, recipientId: "teacher-3", scope: "subject", subject: "Math", topic: null },
    ]);
    await run(Effect.flatMap(service, (s) => s.share(t1, { recipients: ["two@x.ph"], scope: "question", questionIds: ["a", "b"] })));
    expect(shared.slice(2)).toEqual([
      { ownerId: "teacher-1", organizationId: org, recipientId: "teacher-2", scope: "question", questionId: "bank-a" },
      { ownerId: "teacher-1", organizationId: org, recipientId: "teacher-2", scope: "question", questionId: "bank-b" },
    ]);
  });

  test("unsharing is only for the owner of the share", async () => {
    const { run, fail, unshared } = setup();
    expect((await fail(Effect.flatMap(service, (s) => s.unshare(t2, "share-1"))))._tag).toBe("NotFound");
    expect(unshared).toEqual([]);
    await run(Effect.flatMap(service, (s) => s.unshare(t1, "share-1")));
    expect(unshared).toEqual(["share-1"]);
  });

  test("copying visible questions makes new rows under the caller with new ids and the same tags", async () => {
    const { run, inserted } = setup({ visibleToOne: ["x"] });
    const ids = await run(Effect.flatMap(service, (s) => s.copy(t1, ["x", "lib"])));
    expect(ids).toHaveLength(2);
    expect(inserted.map((r) => [r.ownerId, r.organizationId, r.subject, r.topic, r.question!.topic])).toEqual([
      ["teacher-1", org, "Math", "Algebra", "Algebra"],
      ["teacher-1", org, "Math", null, undefined],
    ]);
    expect(inserted.map((r) => r.question!.id)).toEqual(ids);
    expect(ids.every((id) => id !== "x" && id !== "lib")).toBe(true);
    expect(inserted.every((r) => r.id!.startsWith("bank-") && r.id !== r.question!.id)).toBe(true);
  });

  test("copying a question the caller can't see is NotFound and copies nothing", async () => {
    const { fail, inserted } = setup();
    const err = await fail(Effect.flatMap(service, (s) => s.copy(t1, ["lib", "y"])));
    expect(err._tag).toBe("NotFound");
    expect(inserted).toEqual([]);
  });

  test("adding gives each question a fresh id and the topic is the override or its own", async () => {
    const { run, inserted } = setup();
    await run(Effect.flatMap(service, (s) => s.add(t1, { questions: [trueFalse("same", "Own")], subject: " Math " })));
    await run(Effect.flatMap(service, (s) => s.add(t1, { questions: [trueFalse("same", "Own")], topic: "Forced" })));
    expect(inserted[0]).toMatchObject({ ownerId: "teacher-1", organizationId: org, subject: "Math", topic: "Own" });
    expect(inserted[1]).toMatchObject({ subject: null, topic: "Forced" });
    expect(inserted[1]!.question!.topic).toBe("Forced");
    expect(inserted.every((r) => r.question!.id !== "same")).toBe(true);
  });

  test("deleting returns how many and removes the rows by id", async () => {
    const { run, removed } = setup();
    expect(await run(Effect.flatMap(service, (s) => s.remove(t1, ["a", "b", "a"])))).toBe(2);
    expect(removed).toEqual([["bank-a", "bank-b"]]);
  });
});
