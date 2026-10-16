import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { maxAssetBytes } from "@examinus/domain/asset";
import type { SessionUser } from "@examinus/domain/user";
import { Effect, Layer } from "effect";
import type { AssetItem, QuizSessionItem } from "../../database/schemas/index.ts";
import { Storage, StorageNotConfigured } from "../../platform/Storage.ts";
import { harness, stub } from "../../testing/config.ts";
import { assetRow as baseAssetRow, sessionRow } from "../../testing/rows.ts";
import { AssetRepo, type NewAssetRow } from "./Repo.ts";
import { Assets } from "./Service.ts";

// The shared row helper doesn't know organizations; these assets are in org-1 unless a test says otherwise.
const assetRow = (over: Partial<AssetItem> = {}) => baseAssetRow({ organizationId: "org-1", ...over });

const assetId = (n: number) => `asset-00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const organization = (roles: string[], id = "org-1") => ({ id, name: "School", slug: "school", roles, permissions: {} });
const base = { department: null, plan: "free", memberships: [] } as const;
const teacher: SessionUser = { ...base, id: "teacher-1", name: "T", email: "t@x.ph", role: "user", organization: organization(["teacher"]) };
const otherTeacher: SessionUser = { ...teacher, id: "teacher-2" };
const student: SessionUser = { ...base, id: "student-1", name: "S", email: "s@x.ph", role: "user", organization: organization(["student"]) };
const admin: SessionUser = { ...base, id: "admin-1", name: "A", email: "a@x.ph", role: "admin", organization: null };
const guest: SessionUser = { ...base, id: "guest-1", name: "G", email: "g@x.ph", role: "guest", organization: null };
const noOrganization: SessionUser = { ...base, id: "user-1", name: "N", email: "n@x.ph", role: "user", organization: null };

// A PNG header (signature, IHDR chunk) that says it is `width` x `height`.
const png = (width: number, height: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b.set(Buffer.from("IHDR"), 12);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
};

type Options = {
  rows?: AssetItem[];
  // What the repo says teacher-1's quizzes and bank contain, and what the student's sessions' quizzes contain.
  teacherText?: { question: string; answer: string };
  quizText?: string;
  rosterSessions?: QuizSessionItem[];
  files?: Record<string, Uint8Array>;
  configured?: boolean;
  removeFails?: boolean;
  used?: string[];
  // The organization of the guest's roster entry.
  guestOrganization?: string;
};

const setup = (options: Options = {}) => {
  const rows = new Map((options.rows ?? []).map((r) => [r.id, r]));
  const inserted: NewAssetRow[] = [];
  const ready: Array<[string, { sizeBytes: number; width: number; height: number; sha256: string }]> = [];
  const removedRows: string[] = [];
  const removedFiles: string[] = [];
  const lookups: string[] = [];
  const readyFor: Array<string | null> = [];
  const repo = Layer.succeed(
    AssetRepo,
    stub<AssetRepo["Service"]>("AssetRepo", {
      ready: (ids, organizationId) =>
        Effect.sync(() => {
          readyFor.push(organizationId);
          return ids
            .flatMap((id) => rows.get(id) ?? [])
            .filter((r) => r.status === "ready" && (organizationId === null || r.organizationId === organizationId));
        }),
      guestOrganization: () => Effect.succeed(options.guestOrganization ?? null),
      teacherText: () => Effect.sync(() => (lookups.push("teacherText"), options.teacherText ?? { question: "", answer: "" })),
      rosterSessions: () => Effect.sync(() => (lookups.push("rosterSessions"), options.rosterSessions ?? [])),
      quizText: (quizIds) => Effect.sync(() => (lookups.push(`quizText:${quizIds.join(",")}`), options.quizText ?? "")),
      paperAssets: (_studentId, ids) => Effect.succeed(ids.flatMap((id) => rows.get(id) ?? [])),
      insert: (row) => Effect.sync(() => void inserted.push(row)),
      findOwned: (id, owner) => {
        const row = rows.get(id);
        const mine = row?.ownerId === owner.id && (owner.organizationId === null || row.organizationId === owner.organizationId);
        return Effect.succeed(mine ? row! : null);
      },
      markReady: (id, file) => Effect.sync(() => void ready.push([id, file])),
      remove: (ids) => Effect.sync(() => void removedRows.push(...ids)),
      createdBefore: () => Effect.succeed([...rows.values()]),
      usedIds: Effect.succeed(new Set(options.used ?? [])),
    }),
  );
  const storage = Layer.succeed(
    Storage,
    stub<Storage["Service"]>("Storage", {
      configured: options.configured ?? true,
      presignUpload: (key) => Effect.succeed({ url: "http://bucket", fields: { key } }),
      signedUrls: (keys) => Effect.succeed(new Map(keys.map((k) => [k, `http://bucket/${k}?sig`]))),
      read: (key) => Effect.succeed(options.files?.[key] ?? null),
      remove: (keys) =>
        options.removeFails ? Effect.fail(new StorageNotConfigured()) : Effect.sync(() => void removedFiles.push(...keys)),
    }),
  );
  return {
    ...harness(Assets.layer.pipe(Layer.provide([repo, storage]))),
    inserted,
    ready,
    removedRows,
    removedFiles,
    lookups,
    readyFor,
  };
};

const assets = Effect.service(Assets);

describe("Assets.visible", () => {
  test("a user always sees their own image, without any lookup of other people's content", async () => {
    const { run, lookups } = setup({ rows: [assetRow({ ownerId: "teacher-1" })] });
    const seen = await run(Effect.flatMap(assets, (a) => a.visible(teacher, [assetId(1)])));
    expect(seen.map((a) => a.id)).toEqual([assetId(1)]);
    expect(lookups).toEqual([]);
  });

  test("a teacher sees a student's answer image only when it is in an answer of their sessions", async () => {
    const mine = assetRow({ id: assetId(2), ownerId: "student-1", purpose: "answer", s3Key: "k2" });
    const unrelated = assetRow({ id: assetId(3), ownerId: "student-9", purpose: "answer", s3Key: "k3" });
    const { run } = setup({ rows: [mine, unrelated], teacherText: { question: "", answer: `{"assetId":"${assetId(2)}"}` } });
    const seen = await run(Effect.flatMap(assets, (a) => a.visible(teacher, [assetId(2), assetId(3)])));
    expect(seen.map((a) => a.id)).toEqual([assetId(2)]);
  });

  test("an image counts by purpose: a question image mentioned only as an answer isn't visible", async () => {
    const image = assetRow({ id: assetId(2), ownerId: "teacher-2", purpose: "question", s3Key: "k2" });
    const { run } = setup({ rows: [image], teacherText: { question: "", answer: assetId(2) } });
    const seen = await run(Effect.flatMap(assets, (a) => a.visible(teacher, [assetId(2)])));
    expect(seen).toEqual([]);
  });

  test("a student sees question images of running or ended sessions on their roster, not of scheduled ones", async () => {
    const image = assetRow({ id: assetId(2), ownerId: "teacher-1", purpose: "question", s3Key: "k2" });
    const running = sessionRow({ id: "s-run", quizId: "quiz-run", status: "running" });
    const scheduled = sessionRow({ id: "s-sched", quizId: "quiz-sched", status: "scheduled" });
    const { run, lookups } = setup({
      rows: [image],
      rosterSessions: [running, scheduled],
      quizText: `![alt](asset:${assetId(2)})`,
    });
    const seen = await run(Effect.flatMap(assets, (a) => a.visible(student, [assetId(2)])));
    expect(seen.map((a) => a.id)).toEqual([assetId(2)]);
    // Only the running session's quiz was read.
    expect(lookups).toEqual(["rosterSessions", "quizText:quiz-run"]);
  });

  test("a student with only a scheduled session sees nothing and the quiz text isn't even read", async () => {
    const image = assetRow({ id: assetId(2), ownerId: "teacher-1", s3Key: "k2" });
    const scheduled = sessionRow({ quizId: "quiz-sched", status: "scheduled" });
    const { run, lookups } = setup({ rows: [image], rosterSessions: [scheduled], quizText: assetId(2) });
    const seen = await run(Effect.flatMap(assets, (a) => a.visible(student, [assetId(2)])));
    expect(seen).toEqual([]);
    expect(lookups).toEqual(["rosterSessions"]);
  });

  test("images are looked up in the user's organization; guests and platform admins have none", async () => {
    const { run, readyFor } = setup({ rows: [assetRow({ id: assetId(2), ownerId: "guest-1", organizationId: "org-1" })] });
    await run(Effect.flatMap(assets, (a) => a.visible(teacher, [assetId(2)])));
    await run(Effect.flatMap(assets, (a) => a.visible(student, [assetId(2)])));
    await run(Effect.flatMap(assets, (a) => a.visible(guest, [assetId(2)])));
    await run(Effect.flatMap(assets, (a) => a.visible(admin, [assetId(2)])));
    expect(readyFor).toEqual(["org-1", "org-1", null, null]);
  });

  test("another organization's image isn't visible, even when the teacher's text mentions it", async () => {
    const image = assetRow({ id: assetId(2), ownerId: "teacher-2", organizationId: "org-2", purpose: "question", s3Key: "k2" });
    const { run } = setup({ rows: [image], teacherText: { question: assetId(2), answer: "" } });
    expect(await run(Effect.flatMap(assets, (a) => a.visible(teacher, [assetId(2)])))).toEqual([]);
  });

  test("an admin sees only their own uploads", async () => {
    const image = assetRow({ id: assetId(2), ownerId: "teacher-1", s3Key: "k2" });
    const { run } = setup({ rows: [image], teacherText: { question: assetId(2), answer: assetId(2) } });
    expect(await run(Effect.flatMap(assets, (a) => a.visible(admin, [assetId(2)])))).toEqual([]);
  });

  test("ids that aren't asset ids are ignored and don't reach the repo", async () => {
    const { run, lookups } = setup();
    const seen = await run(Effect.flatMap(assets, (a) => a.visible(teacher, ["nope", "asset-1", `x${assetId(1)}`])));
    expect(seen).toEqual([]);
    expect(lookups).toEqual([]);
  });
});

describe("Assets.createUpload", () => {
  test("a teacher may upload question images but not answer images; a student the reverse", async () => {
    const { fail, run } = setup();
    const refusedTeacher = await fail(Effect.flatMap(assets, (a) => a.createUpload(teacher, "answer", "image/png", 10)));
    const refusedStudent = await fail(Effect.flatMap(assets, (a) => a.createUpload(student, "question", "image/png", 10)));
    const refusedAdmin = await fail(Effect.flatMap(assets, (a) => a.createUpload(admin, "question", "image/png", 10)));
    const refusedNoOrganization = await fail(Effect.flatMap(assets, (a) => a.createUpload(noOrganization, "answer", "image/png", 10)));
    expect([refusedTeacher._tag, refusedStudent._tag, refusedAdmin._tag, refusedNoOrganization._tag]).toEqual([
      "Forbidden",
      "Forbidden",
      "Forbidden",
      "Forbidden",
    ]);
    const ok = await run(Effect.flatMap(assets, (a) => a.createUpload(student, "answer", "image/png", 10)));
    expect(ok.assetId).toMatch(/^asset-/);
  });

  test("a guest's answer image is stored in the organization of their roster entry; without one it is Forbidden", async () => {
    const { run, inserted } = setup({ guestOrganization: "org-7" });
    await run(Effect.flatMap(assets, (a) => a.createUpload(guest, "answer", "image/png", 10)));
    expect(inserted[0]).toMatchObject({ ownerId: "guest-1", organizationId: "org-7", purpose: "answer" });
    const lonely = setup();
    const err = await lonely.fail(Effect.flatMap(assets, (a) => a.createUpload(guest, "answer", "image/png", 10)));
    expect(err._tag).toBe("Forbidden");
    expect(lonely.inserted).toEqual([]);
  });

  test.each([0, -1, maxAssetBytes + 1])("a size of %d bytes is refused and no asset row is made", async (size) => {
    const { fail, inserted } = setup();
    const err = await fail(Effect.flatMap(assets, (a) => a.createUpload(teacher, "question", "image/png", size)));
    expect(err._tag).toBe("Conflict");
    expect(inserted).toEqual([]);
  });

  test("the upload is stored under the owner's own key and the target is for that key", async () => {
    const { run, inserted } = setup();
    const target = await run(Effect.flatMap(assets, (a) => a.createUpload(teacher, "question", "image/webp", maxAssetBytes)));
    expect(inserted).toHaveLength(1);
    const [row] = inserted;
    expect(row).toMatchObject({ id: target.assetId, ownerId: "teacher-1", organizationId: "org-1", purpose: "question", mime: "image/webp" });
    expect(row?.s3Key).toBe(`question/teacher-1/${target.assetId}`);
    expect(target.fields).toEqual({ key: row?.s3Key! });
  });
});

describe("Assets.confirm", () => {
  const pending = assetRow({ id: assetId(5), ownerId: "teacher-1", status: "pending", sizeBytes: null, width: null, height: null, sha256: null, s3Key: "k5" });

  test("someone else's upload is NotFound", async () => {
    const { fail } = setup({ rows: [pending] });
    const err = await fail(Effect.flatMap(assets, (a) => a.confirm(otherTeacher, assetId(5))));
    expect(err._tag).toBe("NotFound");
  });

  test("an upload of the same user in another organization is NotFound", async () => {
    const elsewhere = { ...pending, organizationId: "org-2" };
    const { fail } = setup({ rows: [elsewhere] });
    const err = await fail(Effect.flatMap(assets, (a) => a.confirm(teacher, assetId(5))));
    expect(err._tag).toBe("NotFound");
  });

  test("an upload that never reached storage is a Conflict and the row stays", async () => {
    const { fail, removedRows } = setup({ rows: [pending] });
    const err = await fail(Effect.flatMap(assets, (a) => a.confirm(teacher, assetId(5))));
    expect(err._tag).toBe("Conflict");
    expect(removedRows).toEqual([]);
  });

  test("a file that isn't an image is deleted from storage and the database", async () => {
    const { fail, removedRows, removedFiles, ready } = setup({ rows: [pending], files: { k5: new TextEncoder().encode("<script>alert(1)</script>") } });
    const err = await fail(Effect.flatMap(assets, (a) => a.confirm(teacher, assetId(5))));
    expect(err._tag).toBe("Conflict");
    expect(removedFiles).toEqual(["k5"]);
    expect(removedRows).toEqual([assetId(5)]);
    expect(ready).toEqual([]);
  });

  test("an image of another type than the one declared is deleted too", async () => {
    const claimedJpeg = { ...pending, mime: "image/jpeg" };
    const { fail, removedRows } = setup({ rows: [claimedJpeg], files: { k5: png(4, 4) } });
    const err = await fail(Effect.flatMap(assets, (a) => a.confirm(teacher, assetId(5))));
    expect(err._tag).toBe("Conflict");
    expect(removedRows).toEqual([assetId(5)]);
  });

  test("a genuine image is marked ready with the size, dimensions and hash read from the file", async () => {
    const bytes = png(640, 480);
    const { run, ready } = setup({ rows: [pending], files: { k5: bytes } });
    const confirmed = await run(Effect.flatMap(assets, (a) => a.confirm(teacher, assetId(5))));
    expect(confirmed).toEqual({ assetId: assetId(5), sizeBytes: bytes.length, width: 640, height: 480 });
    expect(ready).toEqual([
      [assetId(5), { sizeBytes: bytes.length, width: 640, height: 480, sha256: createHash("sha256").update(bytes).digest("hex") }],
    ]);
  });

  test("confirming twice answers from the row without reading the file again", async () => {
    const done = assetRow({ id: assetId(6), sizeBytes: 321, width: 7, height: 9 });
    const { run, ready } = setup({ rows: [done] });
    const confirmed = await run(Effect.flatMap(assets, (a) => a.confirm(teacher, assetId(6))));
    expect(confirmed).toEqual({ assetId: assetId(6), sizeBytes: 321, width: 7, height: 9 });
    expect(ready).toEqual([]);
  });
});

describe("Assets.paperUrls", () => {
  test("without storage there are no URLs and the repo isn't asked", async () => {
    const { run } = setup({ configured: false });
    expect(await run(Effect.flatMap(assets, (a) => a.paperUrls("student-1", [assetId(1)])))).toEqual({});
  });

  test("signs the question and answer images the repo allows for the paper", async () => {
    const { run } = setup({ rows: [assetRow({ id: assetId(1), s3Key: "k1" })] });
    const urls = await run(Effect.flatMap(assets, (a) => a.paperUrls("student-1", [assetId(1), assetId(1), "junk"])));
    expect(urls).toEqual({ [assetId(1)]: "http://bucket/k1?sig" });
  });
});

describe("Assets.cleanup", () => {
  const old = (n: number, over: Partial<AssetItem>) => assetRow({ id: assetId(n), s3Key: `k${n}`, ...over });

  test("deletes unconfirmed uploads and unused confirmed images, and keeps the ones in use", async () => {
    const { run, removedFiles, removedRows } = setup({
      rows: [old(1, { status: "pending" }), old(2, { status: "ready" }), old(3, { status: "ready" })],
      used: [assetId(3)],
    });
    const result = await run(Effect.flatMap(assets, (a) => a.cleanup()));
    expect(result).toEqual({ pending: 1, unused: 1 });
    expect(removedFiles).toEqual(["k1", "k2"]);
    expect(removedRows).toEqual([assetId(1), assetId(2)]);
  });

  test("without storage nothing is deleted", async () => {
    const { run, removedRows } = setup({ configured: false, rows: [old(1, { status: "pending" })] });
    expect(await run(Effect.flatMap(assets, (a) => a.cleanup()))).toEqual({ pending: 0, unused: 0 });
    expect(removedRows).toEqual([]);
  });

  test("when the files can't be deleted the rows stay, so the next run tries again", async () => {
    const { run, removedRows } = setup({ removeFails: true, rows: [old(1, { status: "pending" })] });
    expect(await run(Effect.flatMap(assets, (a) => a.cleanup()))).toEqual({ pending: 0, unused: 0 });
    expect(removedRows).toEqual([]);
  });
});
