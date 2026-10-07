// Who may see which image, signed URLs for them, and the daily cleanup of images nothing refers to.
// Questions, choices and drawing answers refer to an asset by id inside markdown or jsonb, so "refers to" means
// the id appears in that text.
import { assetIdsIn, type SessionUser, type StorageUnavailable } from "@examora/contract";
import { and, eq, inArray, isNull, lt, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database, type Drizzle } from "./Database.ts";
import {
  answers,
  assets,
  attempts,
  bankQuestions,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  sessionStudents,
  type AssetItem,
} from "./database/schemas/index.ts";
import { sessionStatus } from "./Quizzes.ts";
import { Storage } from "./Storage.ts";

export const dayMs = 24 * 60 * 60 * 1000;

const mentionsAsset = (column: SQLWrapper) => sql`${column}::text like '%asset-%'`;

// All the text of some quizzes' content (prompts, question bodies, part instructions, descriptions).
async function quizText(d: Drizzle, quizFilter: SQL | undefined): Promise<string> {
  const question = await d
    .select({ text: sql<string>`${questions.prompt} || ' ' || ${questions.body}::text` })
    .from(questions)
    .innerJoin(quizParts, eq(questions.partId, quizParts.id))
    .innerJoin(quizzes, eq(quizParts.quizId, quizzes.id))
    .where(quizFilter);
  const parts = await d
    .select({ text: quizParts.instructions })
    .from(quizParts)
    .innerJoin(quizzes, eq(quizParts.quizId, quizzes.id))
    .where(quizFilter);
  const described = await d.select({ text: quizzes.description }).from(quizzes).where(quizFilter);
  return [...question, ...parts, ...described].map((r) => r.text).join("\n");
}

export class Assets extends Context.Service<
  Assets,
  {
    // The assets among `ids` that the user may see.
    readonly visible: (user: SessionUser, ids: readonly string[]) => Effect.Effect<AssetItem[]>;
    // Signed GET URLs by asset id.
    readonly sign: (rows: readonly AssetItem[]) => Effect.Effect<Record<string, string>, StorageUnavailable>;
    // For a student's paper and result: the question images among `ids`, and the student's own answer images.
    // Empty when storage isn't set up.
    readonly paperUrls: (studentId: string, ids: readonly string[]) => Effect.Effect<Record<string, string>>;
    // Deletes uploads that were never confirmed, and confirmed images no question, answer or bank entry refers to,
    // once they are older than `maxAgeMs` (a day: an image the editor just uploaded isn't saved in a quiz yet).
    readonly cleanup: (maxAgeMs?: number) => Effect.Effect<{ pending: number; unused: number }>;
  }
>()("examora/api/Assets") {
  static readonly layer = Layer.effect(
    Assets,
    Effect.gen(function* () {
      const db = yield* Database;
      const storage = yield* Storage;

      const sign = (rows: readonly AssetItem[]) =>
        storage.signedUrls(rows.map((r) => r.s3Key)).pipe(
          Effect.map((urls) => Object.fromEntries(rows.map((r) => [r.id, urls.get(r.s3Key)!]))),
        );

      const visible = Effect.fn("Assets.visible")(function* (user: SessionUser, ids: readonly string[]) {
        const wanted = [...new Set(ids)].filter((id) => assetIdsIn(id)[0] === id).slice(0, 300);
        if (wanted.length === 0) return [];
        const found = yield* db.query((d) =>
          d.select().from(assets).where(and(inArray(assets.id, wanted), eq(assets.status, "ready"))),
        );
        const others = found.filter((a) => a.ownerId !== user.id);
        const allowed = new Set(found.filter((a) => a.ownerId === user.id).map((a) => a.id));
        if (others.length > 0) {
          const text = yield* db.query(async (d) => {
            if (user.role === "teacher") {
              // Images in the teacher's quizzes and the question bank, and students' images in their sessions.
              const blobs = [
                await quizText(d, eq(quizzes.ownerId, user.id)),
                ...(
                  await d
                    .select({ text: sql<string>`${bankQuestions.question}::text` })
                    .from(bankQuestions)
                    .where(or(sql`${bankQuestions.ownerId} is null`, eq(bankQuestions.ownerId, user.id)))
                ).map((r) => r.text),
              ];
              const answered = await d
                .select({ text: sql<string>`${answers.value}::text` })
                .from(answers)
                .innerJoin(attempts, eq(answers.attemptId, attempts.id))
                .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
                .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
                .where(and(eq(quizzes.ownerId, user.id), mentionsAsset(answers.value)));
              return { question: blobs.join("\n"), answer: answered.map((r) => r.text).join("\n") };
            }
            if (user.role === "student") {
              // Only the images of sessions that are open or over, on the student's own roster.
              const sessions = await d
                .select({ session: quizSessions })
                .from(sessionStudents)
                .innerJoin(quizSessions, eq(sessionStudents.sessionId, quizSessions.id))
                .where(and(eq(sessionStudents.studentId, user.id), isNull(sessionStudents.removedAt)));
              const now = Date.now();
              const open = sessions
                .filter(({ session }) => ["running", "ended"].includes(sessionStatus(session, now)))
                .map(({ session }) => session.quizId);
              return { question: open.length ? await quizText(d, inArray(quizzes.id, open)) : "", answer: "" };
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
        const rows = yield* db.query((d) =>
          d
            .select()
            .from(assets)
            .where(
              and(
                inArray(assets.id, wanted),
                eq(assets.status, "ready"),
                or(eq(assets.purpose, "question"), eq(assets.ownerId, studentId)),
              ),
            ),
        );
        return yield* sign(rows).pipe(Effect.catch(() => Effect.succeed({} as Record<string, string>)));
      });

      const cleanup = Effect.fn("Assets.cleanup")(function* (maxAgeMs: number = dayMs) {
        if (!storage.configured) return { pending: 0, unused: 0 };
        const cutoff = new Date(Date.now() - maxAgeMs);
        const old = yield* db.query((d) => d.select().from(assets).where(lt(assets.createdAt, cutoff)));
        const used = yield* db.query(async (d) => {
          const text = [
            await quizText(d, undefined),
            ...(await d.select({ text: sql<string>`${bankQuestions.question}::text` }).from(bankQuestions)).map((r) => r.text),
            ...(
              await d.select({ text: sql<string>`${answers.value}::text` }).from(answers).where(mentionsAsset(answers.value))
            ).map((r) => r.text),
          ];
          return new Set(text.flatMap(assetIdsIn));
        });
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
        yield* db.query((d) =>
          d.delete(assets).where(inArray(assets.id, doomed.map((a) => a.id))),
        );
        return { pending: pending.length, unused: unused.length };
      });

      return Assets.of({ visible, sign, paperUrls, cleanup });
    }),
  );
}
