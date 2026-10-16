// Who may see which image, signed URLs for them, uploads, and the daily cleanup of images nothing refers to.
import { createHash } from "node:crypto";
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { assetIdsIn, maxAssetBytes, type AssetMime } from "@examinus/domain/asset";
import { roleOf } from "@examinus/domain/roles";
import { type SessionUser } from "@examinus/domain/user";
import { Context, Effect, Layer } from "effect";
import { newId } from "../../platform/ids.ts";
import type { AssetItem } from "../../database/schemas/index.ts";
import { assetUploads, count, outcomeOf } from "../../platform/Metrics.ts";
import { imageInfo } from "../../platform/images.ts";
import { Storage, type StorageNotConfigured } from "../../platform/Storage.ts";
import type { Actor } from "../auth/Session.ts";
import { sessionStatus } from "../session/rules.ts";
import { AssetRepo } from "./Repo.ts";

const dayMs = 24 * 60 * 60 * 1000;

export type Confirmed = { assetId: string; sizeBytes: number; width: number; height: number };

export class Assets extends Context.Service<
  Assets,
  {
    // The assets among `ids` that the user may see.
    readonly visible: (user: SessionUser, ids: readonly string[]) => Effect.Effect<AssetItem[]>;
    // Signed GET URLs by asset id.
    readonly sign: (rows: readonly AssetItem[]) => Effect.Effect<Record<string, string>, StorageNotConfigured>;
    // For a student's paper and result: the question images among `ids`, and the student's own answer images.
    // Empty when storage isn't set up.
    readonly paperUrls: (studentId: string, ids: readonly string[]) => Effect.Effect<Record<string, string>>;
    // Starts an upload: the user's role decides which kind of image it may be. The caller PUTs the file to the target.
    readonly createUpload: (
      user: SessionUser,
      purpose: AssetItem["purpose"],
      mime: AssetMime,
      size: number,
    ) => Effect.Effect<{ assetId: string; url: string; fields: Record<string, string> }, Forbidden | Conflict | StorageNotConfigured>;
    // Checks the uploaded file is the image it claimed to be and marks the asset ready.
    readonly confirm: (user: SessionUser, assetId: string) => Effect.Effect<Confirmed, NotFound | Conflict | StorageNotConfigured>;
    // Deletes uploads that were never confirmed, and confirmed images no question, answer or bank entry refers to,
    // once they are older than `maxAgeMs` (a day: an image the editor just uploaded isn't saved in a quiz yet).
    readonly cleanup: (maxAgeMs?: number) => Effect.Effect<{ pending: number; unused: number }>;
  }
>()("examinus/api/Assets") {
  static readonly layer = Layer.effect(
    Assets,
    Effect.gen(function* () {
      const repo = yield* AssetRepo;
      const storage = yield* Storage;

      const sign = (rows: readonly AssetItem[]) =>
        storage.signedUrls(rows.map((r) => r.s3Key)).pipe(
          Effect.map((urls) => Object.fromEntries(rows.map((r) => [r.id, urls.get(r.s3Key)!]))),
        );

      const visible = Effect.fn("Assets.visible")(function* (user: SessionUser, ids: readonly string[]) {
        const wanted = [...new Set(ids)].filter((id) => assetIdsIn(id)[0] === id).slice(0, 300);
        if (wanted.length === 0) return [];
        const role = roleOf(user);
        // Guests and platform admins have no organization: they see their own images and, as players, their sessions'.
        const found = yield* repo.ready(wanted, user.organization?.id ?? null);
        const others = found.filter((a) => a.ownerId !== user.id);
        const allowed = new Set(found.filter((a) => a.ownerId === user.id).map((a) => a.id));
        if (others.length > 0) {
          const text = yield* Effect.gen(function* () {
            if (role === "teacher") {
              // Images in the teacher's quizzes and the question bank, and students' images in their sessions.
              const actor: Actor = { id: user.id, organizationId: user.organization!.id };
              return yield* repo.teacherText(actor);
            }
            if (role === "student" || role === "guest") {
              // Only the images of sessions that are open or over, on the student's own roster.
              const sessions = yield* repo.rosterSessions(user.id);
              const now = Date.now();
              const open = sessions.filter((s) => ["running", "ended"].includes(sessionStatus(s, now))).map((s) => s.quizId);
              return { question: open.length ? yield* repo.quizText(open) : "", answer: "" };
            }
            return { question: "", answer: "" };
          });
          const questionIds = new Set(assetIdsIn(text.question));
          const answerIds = new Set(assetIdsIn(text.answer));
          for (const a of others) if ((a.purpose === "question" ? questionIds : answerIds).has(a.id)) allowed.add(a.id);
        }
        return found.filter((a) => allowed.has(a.id));
      });

      const paperUrls = Effect.fn("Assets.paperUrls")(function* (studentId: string, ids: readonly string[]) {
        const wanted = [...new Set(ids)].filter((id) => assetIdsIn(id)[0] === id);
        if (wanted.length === 0 || !storage.configured) return {};
        const rows = yield* repo.paperAssets(studentId, wanted);
        return yield* sign(rows).pipe(Effect.catch(() => Effect.succeed({} as Record<string, string>)));
      });

      const createUpload = Effect.fn("Assets.createUpload")(function* (
        user: SessionUser,
        purpose: AssetItem["purpose"],
        mime: AssetMime,
        size: number,
      ) {
        // Teachers upload question images and students (and guests) their answers, nothing else.
        const role = roleOf(user);
        const allowed = role === "teacher" ? "question" : role === "student" || role === "guest" ? "answer" : null;
        if (purpose !== allowed) return yield* new Forbidden({ message: "Your role can't upload that kind of image." });
        // A guest has no organization of their own: the one of their roster entry.
        const organizationId = user.organization?.id ?? (role === "guest" ? yield* repo.guestOrganization(user.id) : null);
        if (!organizationId) return yield* new Forbidden({ message: "Your role can't upload that kind of image." });
        if (size < 1 || size > maxAssetBytes) return yield* new Conflict({ message: "Images can be up to 5 MB." });
        const id = newId("asset");
        const key = `${purpose}/${user.id}/${id}`;
        const target = yield* storage.presignUpload(key, mime);
        yield* repo.insert({ id, ownerId: user.id, organizationId, purpose, s3Key: key, mime });
        return { assetId: id, ...target };
      });

      const confirm = Effect.fn("Assets.confirm")(function* (user: SessionUser, assetId: string) {
        const row = yield* repo.findOwned(assetId, { id: user.id, organizationId: user.organization?.id ?? null });
        if (!row) return yield* new NotFound({ message: "That upload doesn't exist." });
        if (row.status === "ready" && row.sizeBytes !== null && row.width !== null && row.height !== null)
          return { assetId, sizeBytes: row.sizeBytes, width: row.width, height: row.height };
        // Counts how each real confirmation ended (ok, or why it was refused), by what the image is for.
        return yield* Effect.gen(function* () {
          const bytes = yield* storage.read(row.s3Key);
          if (!bytes) return yield* new Conflict({ message: "The file wasn't uploaded." });
          const info = imageInfo(bytes);
          if (!info || info.mime !== row.mime) {
            // Not what it claimed to be: nothing keeps it.
            yield* storage.remove([row.s3Key]);
            yield* repo.remove([assetId]);
            return yield* new Conflict({ message: "That file isn't a valid PNG, JPEG, WebP or GIF image." });
          }
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          yield* repo.markReady(assetId, { sizeBytes: bytes.length, width: info.width, height: info.height, sha256 });
          return { assetId, sizeBytes: bytes.length, width: info.width, height: info.height };
        }).pipe(Effect.onExit((exit) => count(assetUploads, { purpose: row.purpose, outcome: outcomeOf(exit) })));
      });

      const cleanup = Effect.fn("Assets.cleanup")(function* (maxAgeMs: number = dayMs) {
        if (!storage.configured) return { pending: 0, unused: 0 };
        const cutoff = new Date(Date.now() - maxAgeMs);
        const old = yield* repo.createdBefore(cutoff);
        const used = yield* repo.usedIds;
        const pending = old.filter((a) => a.status === "pending");
        const unused = old.filter((a) => a.status === "ready" && !used.has(a.id));
        const doomed = [...pending, ...unused];
        if (doomed.length === 0) return { pending: 0, unused: 0 };
        // The files go first: a failure leaves the rows, and tomorrow's run tries again.
        const removed = yield* storage.remove(doomed.map((a) => a.s3Key)).pipe(
          Effect.as(true),
          Effect.catchDefect((cause) => Effect.logWarning("Asset cleanup couldn't delete files", cause).pipe(Effect.as(false))),
          Effect.catch(() => Effect.succeed(false)),
        );
        if (!removed) return { pending: 0, unused: 0 };
        yield* repo.remove(doomed.map((a) => a.id));
        return { pending: pending.length, unused: unused.length };
      });

      return Assets.of({ visible, sign, paperUrls, createUpload, confirm, cleanup });
    }),
  );
}
