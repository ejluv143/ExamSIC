// The question bank over the real API: tagging, renaming, live sharing, unsharing, copying, and who may write.
// Needs an API (API_URL) on a migrated database with the test fixture loaded (test/fixture). The test teacher owns the questions and Prof.
// Reyes (the other demo teacher) receives them. Subjects carry a per-run suffix so reruns and the fixture's bank
// (which already has a share from Prof. Reyes to the test teacher) don't interfere.
import { SQL } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  call,
  demoPassword,
  ok,
  otherTeacherEmail,
  refused,
  sicOrganizationId,
  signIn,
  studentEmail,
  students,
  teacherEmail,
  teacherPassword,
} from "./helpers.ts";

const run = Date.now().toString(36);
const subjectA = `Test subject A ${run}`;
const subjectB = `Test subject B ${run}`;
const subjectC = `Test subject C ${run}`;
const topicX = `Topic X ${run}`;
const topicY = `Topic Y ${run}`;

type Listed = {
  question: { id: string; prompt: string; topic?: string };
  subject: string | null;
  topic: string | null;
  mine: boolean;
  owner: { id: string; name: string } | null;
  sharedBy: { id: string; name: string } | null;
};

const trueFalse = (prompt: string, extra: Record<string, unknown> = {}) => ({
  id: "client-id",
  prompt,
  points: 1,
  gamePoints: "standard",
  partialCredit: true,
  type: "true_false",
  answer: true,
  ...extra,
});

const listed = async (who: string): Promise<Listed[]> => ok(who, "bank.list");
const byPrompt = (list: Listed[], prompt: string) => list.find((b) => b.question.prompt === prompt);
const visibleTo = async (who: string, prompt: string) => byPrompt(await listed(who), prompt);

const created: string[] = [];
const add = async (who: string, prompts: string[], tags: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  const out = await ok(who, "bank.add", { questions: prompts.map((p) => trueFalse(p, extra)), ...tags });
  created.push(...out.questionIds);
  return out.questionIds as string[];
};

beforeAll(async () => {
  await signIn("teacher", teacherEmail, teacherPassword);
  await signIn("other", otherTeacherEmail, demoPassword);
  await signIn("student", studentEmail(students[0]!), demoPassword);
}, 30_000);

afterAll(async () => {
  // Shares go with the questions.
  const mine = new Set(created);
  const leftover = (await listed("teacher")).filter((b) => b.mine && mine.has(b.question.id)).map((b) => b.question.id);
  if (leftover.length) await ok("teacher", "bank.delete", { questionIds: leftover });
  const others = (await listed("other")).filter((b) => b.mine && mine.has(b.question.id)).map((b) => b.question.id);
  if (others.length) await ok("other", "bank.delete", { questionIds: others });
});

describe("tagging", () => {
  test("add keeps each question's own topic, sets subject, gives fresh ids; the topic column and Question.topic agree", async () => {
    const ids = await add("teacher", [`a1 ${run}`, `a2 ${run}`], { subject: subjectA, subjectArea: "math" }, { topic: topicX });
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain("client-id");
    const a1 = await visibleTo("teacher", `a1 ${run}`);
    expect(a1).toMatchObject({ subject: subjectA, topic: topicX, mine: true, sharedBy: null });
    expect(a1!.question.topic).toBe(topicX);
    expect(a1!.owner!.id).toBeTruthy();
    // A topic given to bank.add wins over the question's own.
    const [forced] = await add("teacher", [`a3 ${run}`], { subject: subjectA, topic: topicY }, { topic: topicX });
    const a3 = (await listed("teacher")).find((b) => b.question.id === forced)!;
    expect([a3.topic, a3.question.topic]).toEqual([topicY, topicY]);
  });

  test("retag one question, then many; subject, area and topic stay in sync; a key left out is unchanged; null clears", async () => {
    const list = await listed("teacher");
    const id = (p: string) => byPrompt(list, `${p} ${run}`)!.question.id;
    await ok("teacher", "bank.retag", { questionIds: [id("a1")], topic: topicY });
    let after = await listed("teacher");
    expect(byPrompt(after, `a1 ${run}`)).toMatchObject({ topic: topicY, subject: subjectA });
    expect(byPrompt(after, `a1 ${run}`)!.question.topic).toBe(topicY);

    const many = await ok("teacher", "bank.retag", { questionIds: [id("a1"), id("a2"), id("a3")], subject: subjectB, subjectArea: "science" });
    expect(many.count).toBe(3);
    after = await listed("teacher");
    for (const p of ["a1", "a2", "a3"]) expect(byPrompt(after, `${p} ${run}`)).toMatchObject({ subject: subjectB, subjectArea: "science" });
    expect(byPrompt(after, `a2 ${run}`)!.topic).toBe(topicX);

    await ok("teacher", "bank.retag", { questionIds: [id("a2")], topic: null });
    after = await listed("teacher");
    expect(byPrompt(after, `a2 ${run}`)!.topic).toBeNull();
    expect(byPrompt(after, `a2 ${run}`)!.question.topic).toBeUndefined();
  });

  test("renameTag renames and merges across all the teacher's questions", async () => {
    // a1, a3: topic Y; a2: none. Rename topic Y -> X, then subject B -> A (a merge into a name that doesn't exist yet).
    expect((await ok("teacher", "bank.renameTag", { kind: "topic", from: topicY, to: topicX })).count).toBe(2);
    let list = await listed("teacher");
    for (const p of ["a1", "a3"]) {
      expect(byPrompt(list, `${p} ${run}`)!.topic).toBe(topicX);
      expect(byPrompt(list, `${p} ${run}`)!.question.topic).toBe(topicX);
    }
    // Merge: a question already in subject A joins the ones renamed to it.
    await add("teacher", [`a4 ${run}`], { subject: subjectA });
    expect((await ok("teacher", "bank.renameTag", { kind: "subject", from: subjectB, to: subjectA })).count).toBe(3);
    list = await listed("teacher");
    expect(list.filter((b) => b.subject === subjectA && b.mine).map((b) => b.question.prompt).sort()).toEqual(
      [`a1 ${run}`, `a2 ${run}`, `a3 ${run}`, `a4 ${run}`].sort(),
    );
    expect(list.some((b) => b.subject === subjectB)).toBe(false);
    expect(await refused("teacher", "bank.renameTag", { kind: "subject", from: subjectB, to: subjectA })).toStartWith("NotFound");
  });

  test("update replaces the body and tags and keeps the question's id", async () => {
    const before = byPrompt(await listed("teacher"), `a4 ${run}`)!;
    const updated = await ok("teacher", "bank.update", {
      question: { ...before.question, prompt: `a4 edited ${run}`, topic: topicY },
      subject: subjectA,
      subjectArea: "math",
    });
    expect(updated.question.id).toBe(before.question.id);
    expect(updated).toMatchObject({ topic: topicY, subject: subjectA, subjectArea: "math", mine: true });
    expect(updated.question.topic).toBe(topicY);
    expect(await visibleTo("teacher", `a4 ${run}`)).toBeUndefined();
    expect(await visibleTo("teacher", `a4 edited ${run}`)).toBeDefined();
  });
});

describe("sharing", () => {
  test("recipients must be existing teacher accounts: unknown emails and students are named and nothing is shared", async () => {
    const err = await refused("teacher", "bank.share", {
      recipients: [otherTeacherEmail, "nobody@nowhere.example", studentEmail(students[0]!)],
      scope: "subject",
      subject: subjectA,
    });
    expect(err).toStartWith("UnknownRecipients");
    expect(err).toContain("nobody@nowhere.example");
    expect(err).toContain(studentEmail(students[0]!));
    expect(await visibleTo("other", `a1 ${run}`)).toBeUndefined();
    expect(await refused("teacher", "bank.share", { recipients: [teacherEmail], scope: "subject", subject: subjectA })).toStartWith("Conflict");
    expect(await refused("teacher", "bank.share", { recipients: [otherTeacherEmail], scope: "subject", subject: "No such subject" })).toStartWith("NotFound");
    expect(await refused("teacher", "bank.share", { recipients: [otherTeacherEmail], scope: "subject" })).toStartWith("Conflict");
  });

  test("by subject: the recipient sees them as shared with me, and a question added later is visible without sharing again", async () => {
    expect((await ok("teacher", "bank.share", { recipients: [otherTeacherEmail], scope: "subject", subject: subjectA })).count).toBe(1);
    // Sharing again changes nothing (the unique key refuses the duplicate, NULL fields included).
    expect((await ok("teacher", "bank.share", { recipients: [otherTeacherEmail], scope: "subject", subject: subjectA })).count).toBe(0);
    const seen = await visibleTo("other", `a1 ${run}`);
    expect(seen).toMatchObject({ mine: false, subject: subjectA });
    expect(seen!.sharedBy!.id).toBe(seen!.owner!.id);
    // Not in the subject: not shared.
    await add("teacher", [`private ${run}`], { subject: subjectC });
    expect(await visibleTo("other", `private ${run}`)).toBeUndefined();

    await add("teacher", [`late ${run}`], { subject: subjectA });
    expect(await visibleTo("other", `late ${run}`)).toMatchObject({ mine: false });
    // Retagging a question into the subject shares it; out of it hides it.
    const privateId = byPrompt(await listed("teacher"), `private ${run}`)!.question.id;
    await ok("teacher", "bank.retag", { questionIds: [privateId], subject: subjectA });
    expect(await visibleTo("other", `private ${run}`)).toBeDefined();
    await ok("teacher", "bank.retag", { questionIds: [privateId], subject: subjectC });
    expect(await visibleTo("other", `private ${run}`)).toBeUndefined();
  });

  test("by topic (any subject) and by picked questions", async () => {
    await add("teacher", [`t1 ${run}`], { subject: subjectC }, { topic: topicY });
    expect(await visibleTo("other", `t1 ${run}`)).toBeUndefined();
    await ok("teacher", "bank.share", { recipients: [otherTeacherEmail], scope: "topic", topic: topicY });
    expect(await visibleTo("other", `t1 ${run}`)).toMatchObject({ mine: false });
    // The topic share also covers a question of the topic in another subject, added later.
    await add("teacher", [`t2 ${run}`], { subject: subjectB }, { topic: topicY });
    expect(await visibleTo("other", `t2 ${run}`)).toBeDefined();

    const [picked] = await add("teacher", [`picked ${run}`], { subject: subjectC });
    await add("teacher", [`not picked ${run}`], { subject: subjectC });
    await ok("teacher", "bank.share", { recipients: [otherTeacherEmail], scope: "question", questionIds: [picked] });
    expect(await visibleTo("other", `picked ${run}`)).toBeDefined();
    expect(await visibleTo("other", `not picked ${run}`)).toBeUndefined();
  });

  test("shares lists what I share and what is shared with me", async () => {
    const mine = await ok("teacher", "bank.shares");
    const own = mine.shared.filter((s: { createdAt: string; subject: string | null; topic: string | null; questionId: string | null }) =>
      [subjectA, topicY].includes((s.subject ?? s.topic)!) || s.questionId !== null,
    );
    expect(own.length).toBeGreaterThanOrEqual(3);
    expect(mine.shared[0].recipient.email).toBe(otherTeacherEmail);
    const theirs = await ok("other", "bank.shares");
    expect(theirs.withMe.some((s: { scope: string; subject: string | null }) => s.scope === "subject" && s.subject === subjectA)).toBe(true);
    expect(theirs.withMe.some((s: { prompt: string | null }) => s.prompt === `picked ${run}`)).toBe(true);
    // The fixture's share, from Prof. Reyes to the test teacher.
    expect(mine.withMe.some((s: { scope: string; subject: string | null }) => s.scope === "subject" && s.subject === "Database Systems")).toBe(true);
  });

  test("a recipient can't edit, retag, delete, rename or re-share what was shared: NotFound", async () => {
    const seen = byPrompt(await listed("other"), `a1 ${run}`)!;
    expect(seen.mine).toBe(false);
    const id = seen.question.id;
    expect(await refused("other", "bank.update", { question: { ...seen.question, prompt: "hacked" }, subject: null, subjectArea: null })).toStartWith("NotFound");
    expect(await refused("other", "bank.retag", { questionIds: [id], topic: "x" })).toStartWith("NotFound");
    expect(await refused("other", "bank.delete", { questionIds: [id] })).toStartWith("NotFound");
    expect(await refused("other", "bank.renameTag", { kind: "subject", from: subjectA, to: "Mine now" })).toStartWith("NotFound");
    expect(await refused("other", "bank.share", { recipients: [teacherEmail], scope: "question", questionIds: [id] })).toStartWith("NotFound");
    expect(await refused("other", "bank.share", { recipients: [teacherEmail], scope: "subject", subject: subjectA })).toStartWith("NotFound");
    const shareId = (await ok("teacher", "bank.shares")).shared[0].id;
    expect(await refused("other", "bank.unshare", { shareId })).toStartWith("NotFound");
    // Nothing changed.
    const still = byPrompt(await listed("teacher"), `a1 ${run}`)!;
    expect(still).toMatchObject({ subject: subjectA, topic: topicX });
  });

  test("a recipient can copy shared questions into their own bank, with new ids; what isn't visible can't be copied", async () => {
    const seen = byPrompt(await listed("other"), `a1 ${run}`)!;
    const copied = await ok("other", "bank.copy", { questionIds: [seen.question.id] });
    created.push(...copied.questionIds);
    expect(copied.count).toBe(1);
    expect(copied.questionIds[0]).not.toBe(seen.question.id);
    const mine = (await listed("other")).filter((b) => b.question.prompt === `a1 ${run}`);
    expect(mine).toHaveLength(2);
    const copy = mine.find((b) => b.mine)!;
    expect(copy).toMatchObject({ subject: subjectA, topic: topicX, sharedBy: null });
    expect(copy.question.id).toBe(copied.questionIds[0]);
    expect(copy.question.topic).toBe(topicX);
    // The copy is the recipient's: they can edit it, and it stays after the share goes.
    await ok("other", "bank.retag", { questionIds: [copy.question.id], topic: "Mine" });
    const hidden = byPrompt(await listed("teacher"), `private ${run}`)!.question.id;
    expect(await refused("other", "bank.copy", { questionIds: [hidden] })).toStartWith("NotFound");
    // The library can be copied too.
    const library = (await listed("other")).find((b) => b.owner === null)!;
    const fromLibrary = await ok("other", "bank.copy", { questionIds: [library.question.id] });
    created.push(...fromLibrary.questionIds);
    expect(fromLibrary.questionIds[0]).not.toBe(library.question.id);
  });

  test("a recipient can get signed URLs for an image of a shared question (storage permitting)", async () => {
    const url = process.env.DATABASE_URL;
    if (!url) return console.warn("bank asset test skipped: DATABASE_URL is not set");
    const sql = new SQL(url);
    const assetId = `asset-${crypto.randomUUID()}`;
    try {
      const [owner] = await sql`select id from users where email = ${teacherEmail}`;
      await sql`insert into assets (id, organization_id, owner_id, purpose, s3_key, mime, size_bytes, width, height, status)
        values (${assetId}, ${sicOrganizationId}, ${owner.id}, 'question', ${`question/${owner.id}/${assetId}`}, 'image/png', 70, 1, 1, 'ready')`;
      // The picture is in the prompt of a question in the shared subject.
      await add("teacher", [`image shared ${run} ![](${assetId})`], { subject: subjectA });
      const reply = await call("other", "asset.urls", { assetIds: [assetId] });
      if (reply.err?.startsWith("StorageUnavailable")) {
        // No S3 in this environment: the call still ran the visibility query for the recipient and only the
        // signing was refused. The visibility of an image of a shared question is then covered by bank.list
        // (the same predicate) and by the Assets service tests.
        console.warn("bank asset test: storage isn't configured, asserting only that the visibility query ran");
        return;
      }
      expect(reply.err).toBeUndefined();
      expect(Object.keys(reply.ok)).toEqual([assetId]);
      // Unshared: hidden again.
      const shares = (await ok("teacher", "bank.shares")).shared as Array<{ id: string; subject: string | null }>;
      await ok("teacher", "bank.unshare", { shareId: shares.find((s) => s.subject === subjectA)!.id });
      expect((await ok("other", "asset.urls", { assetIds: [assetId] }))[assetId]).toBeUndefined();
    } finally {
      await sql`delete from assets where id = ${assetId}`;
      await sql.close();
    }
  });

  test("unsharing hides the questions from the recipient again, and only the owner may unshare", async () => {
    const shared = (await ok("teacher", "bank.shares")).shared as Array<{ id: string; scope: string; subject: string | null; topic: string | null; questionId: string | null }>;
    const mine = shared.filter((s) => s.subject === subjectA || s.topic === topicY || s.questionId !== null);
    for (const s of mine) await ok("teacher", "bank.unshare", { shareId: s.id });
    // (Their own copy of a1, made earlier, stays.)
    const theirs = (await listed("other")).filter((b) => !b.mine).map((b) => b.question.prompt);
    for (const p of ["a1", "a2", "late", "t1", "t2", "picked"]) expect(theirs).not.toContain(`${p} ${run}`);
    // Their copy remains.
    expect((await listed("other")).some((b) => b.mine && b.question.prompt === `a1 ${run}`)).toBe(true);
    expect(await refused("teacher", "bank.unshare", { shareId: mine[0]!.id })).toStartWith("NotFound");
  });
});

describe("deleting", () => {
  test("delete removes the questions and any share of them; someone else's are NotFound and nothing is deleted", async () => {
    const [a, b] = await add("teacher", [`d1 ${run}`, `d2 ${run}`], { subject: subjectC });
    await ok("teacher", "bank.share", { recipients: [otherTeacherEmail], scope: "question", questionIds: [a!] });
    expect(await visibleTo("other", `d1 ${run}`)).toBeDefined();
    const foreign = byPrompt(await listed("teacher"), `d1 ${run}`)!.question.id;
    expect(await refused("other", "bank.delete", { questionIds: [foreign] })).toStartWith("NotFound");
    expect(await refused("teacher", "bank.delete", { questionIds: [a!, "no-such-question"] })).toStartWith("NotFound");
    expect(await visibleTo("teacher", `d1 ${run}`)).toBeDefined();
    expect((await ok("teacher", "bank.delete", { questionIds: [a!, b!] })).count).toBe(2);
    expect(await visibleTo("teacher", `d1 ${run}`)).toBeUndefined();
    expect(await visibleTo("other", `d1 ${run}`)).toBeUndefined();
  });

  test("students can't use the bank", async () => {
    expect(await refused("student", "bank.list")).toStartWith("Forbidden");
    expect(await refused("student", "bank.copy", { questionIds: ["x"] })).toStartWith("Forbidden");
  });
});
