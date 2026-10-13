// The question bank tables: questions with their subject and topic, and the shares between teachers.
import type { Question } from "@examinus/domain/question";
import type { SubjectArea } from "@examinus/domain/roles";
import { and, asc, desc, eq, exists, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Context, Effect, Layer } from "effect";
import { Database, type Db } from "../../platform/Database.ts";
import {
  bankQuestions,
  bankShares,
  users,
  type BankQuestionItem,
  type BankShareItem,
  type NewBankQuestion,
  type NewBankShare,
} from "../../database/schemas/index.ts";

// THE visibility rule of the bank, used by every read of bank questions (the list, copy, and the images a teacher may
// see): the shared demo library (no owner), the user's own questions, and what another teacher shared with them,
// by question, by subject or by topic. Subject and topic shares are matched against the questions as they are now.
// Write it against `bank_questions` (select from it unaliased).
export const bankVisibleTo = (userId: string): SQL =>
  or(
    isNull(bankQuestions.ownerId),
    eq(bankQuestions.ownerId, userId),
    exists(
      sql`(select 1 from ${bankShares}
        where ${bankShares.recipientId} = ${userId}
          and ${bankShares.ownerId} = ${bankQuestions.ownerId}
          and (
            (${bankShares.scope} = 'question' and ${bankShares.questionId} = ${bankQuestions.id})
            or (${bankShares.scope} = 'subject' and ${bankShares.subject} = ${bankQuestions.subject})
            or (${bankShares.scope} = 'topic' and ${bankShares.topic} = ${bankQuestions.topic})
          ))`,
    ),
  )!;

// A question's own id (the one inside `question`), which is how the API addresses bank questions.
const questionIdOf = sql<string>`${bankQuestions.question}->>'id'`;

export type BankRow = { item: BankQuestionItem; ownerName: string | null };

export type ShareRow = {
  share: BankShareItem;
  ownerName: string;
  recipientName: string;
  recipientEmail: string;
  // The shared question (scope "question").
  question: Question | null;
};

// A question's new body and tags, for the row `id`.
export type BankPatch = {
  id: string;
  question: Question;
  subject: string | null;
  subjectArea: SubjectArea | null;
  topic: string | null;
};

export type Recipient = { id: string; name: string; email: string };

const withOwner = (d: Db, where: SQL | undefined) =>
  d
    .select({ item: bankQuestions, ownerName: users.name })
    .from(bankQuestions)
    .leftJoin(users, eq(users.id, bankQuestions.ownerId))
    .where(where)
    .orderBy(asc(bankQuestions.createdAt), asc(bankQuestions.id));

export class BankRepo extends Context.Service<
  BankRepo,
  {
    // Every question the user may see (see `bankVisibleTo`), oldest first.
    readonly list: (userId: string) => Effect.Effect<BankRow[]>;
    // The visible questions among those with these question ids.
    readonly visible: (userId: string, questionIds: readonly string[]) => Effect.Effect<BankRow[]>;
    // The user's own questions among those with these question ids.
    readonly owned: (userId: string, questionIds: readonly string[]) => Effect.Effect<BankQuestionItem[]>;
    // The user's own questions with this subject or topic.
    readonly ownedWithTag: (userId: string, kind: "subject" | "topic", name: string) => Effect.Effect<BankQuestionItem[]>;
    readonly insert: (rows: readonly NewBankQuestion[]) => Effect.Effect<void>;
    // Writes new bodies and tags to the rows, together.
    readonly update: (patches: readonly BankPatch[]) => Effect.Effect<void>;
    // Like `update`, and moves the owner's subject (or topic) shares from `from` to `to` in the same transaction.
    readonly rename: (
      ownerId: string,
      kind: "subject" | "topic",
      from: string,
      to: string,
      patches: readonly BankPatch[],
    ) => Effect.Effect<void>;
    // Deletes the rows by id (their question shares go with them).
    readonly remove: (ids: readonly string[]) => Effect.Effect<void>;
    // The teacher accounts with these (lower-case) emails.
    readonly teachersByEmail: (emails: readonly string[]) => Effect.Effect<Recipient[]>;
    // Inserts shares, skipping the ones that already exist; the number created.
    readonly addShares: (rows: readonly NewBankShare[]) => Effect.Effect<number>;
    // What the user shares and what is shared with them, newest first.
    readonly shares: (userId: string) => Effect.Effect<{ shared: ShareRow[]; withMe: ShareRow[] }>;
    // The share, when the user made it.
    readonly findOwnedShare: (shareId: string, ownerId: string) => Effect.Effect<BankShareItem | null>;
    readonly removeShare: (shareId: string) => Effect.Effect<void>;
  }
>()("examinus/api/BankRepo") {
  static readonly layer = Layer.effect(
    BankRepo,
    Effect.gen(function* () {
      const db = yield* Database;

      const write = (tx: Db, patches: readonly BankPatch[]) =>
        Promise.all(
          patches.map((p) =>
            tx
              .update(bankQuestions)
              .set({ question: p.question, subject: p.subject, subjectArea: p.subjectArea, topic: p.topic })
              .where(eq(bankQuestions.id, p.id)),
          ),
        );

      return BankRepo.of({
        list: Effect.fn("BankRepo.list")(function* (userId) {
          return yield* db.query((d) => withOwner(d, bankVisibleTo(userId)));
        }),

        visible: Effect.fn("BankRepo.visible")(function* (userId, questionIds) {
          return yield* db.query((d) => withOwner(d, and(bankVisibleTo(userId), inArray(questionIdOf, [...questionIds]))));
        }),

        owned: Effect.fn("BankRepo.owned")(function* (userId, questionIds) {
          return yield* db.query((d) =>
            d
              .select()
              .from(bankQuestions)
              .where(and(eq(bankQuestions.ownerId, userId), inArray(questionIdOf, [...questionIds]))),
          );
        }),

        ownedWithTag: Effect.fn("BankRepo.ownedWithTag")(function* (userId, kind, name) {
          const column = kind === "subject" ? bankQuestions.subject : bankQuestions.topic;
          return yield* db.query((d) =>
            d
              .select()
              .from(bankQuestions)
              .where(and(eq(bankQuestions.ownerId, userId), eq(column, name)))
              .orderBy(asc(bankQuestions.createdAt), asc(bankQuestions.id)),
          );
        }),

        insert: Effect.fn("BankRepo.insert")(function* (rows) {
          yield* db.query((d) => d.insert(bankQuestions).values([...rows]));
        }),

        update: Effect.fn("BankRepo.update")(function* (patches) {
          yield* db.query((d) => d.transaction(async (tx) => void (await write(tx, patches))));
        }),

        rename: Effect.fn("BankRepo.rename")(function* (ownerId, kind, from, to, patches) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              await write(tx, patches);
              const column = kind === "subject" ? bankShares.subject : bankShares.topic;
              const columnName = kind === "subject" ? "subject" : "topic";
              const mine = and(eq(bankShares.ownerId, ownerId), eq(bankShares.scope, kind), eq(column, from));
              // A share already on `to` for the same recipient makes this one redundant (a merge).
              await tx.delete(bankShares).where(
                and(
                  mine,
                  exists(
                    sql`(select 1 from ${bankShares} as other
                      where other.owner_id = ${bankShares.ownerId}
                        and other.recipient_id = ${bankShares.recipientId}
                        and other.scope = ${bankShares.scope}
                        and other.${sql.raw(columnName)} = ${to})`,
                  ),
                ),
              );
              await tx.update(bankShares).set({ [kind]: to }).where(mine);
            }),
          );
        }),

        remove: Effect.fn("BankRepo.remove")(function* (ids) {
          yield* db.query((d) => d.delete(bankQuestions).where(inArray(bankQuestions.id, [...ids])));
        }),

        teachersByEmail: Effect.fn("BankRepo.teachersByEmail")(function* (emails) {
          return yield* db.query((d) =>
            d
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(and(eq(users.role, "teacher"), inArray(sql<string>`lower(${users.email})`, [...emails]))),
          );
        }),

        addShares: Effect.fn("BankRepo.addShares")(function* (rows) {
          const created = yield* db.query((d) =>
            d.insert(bankShares).values([...rows]).onConflictDoNothing().returning({ id: bankShares.id }),
          );
          return created.length;
        }),

        shares: Effect.fn("BankRepo.shares")(function* (userId) {
          const owner = alias(users, "share_owner");
          const recipient = alias(users, "share_recipient");
          const read = (where: SQL) =>
            db.query(async (d) => {
              const rows = await d
                .select({
                  share: bankShares,
                  ownerName: owner.name,
                  recipientName: recipient.name,
                  recipientEmail: recipient.email,
                  question: bankQuestions.question,
                })
                .from(bankShares)
                .innerJoin(owner, eq(owner.id, bankShares.ownerId))
                .innerJoin(recipient, eq(recipient.id, bankShares.recipientId))
                .leftJoin(bankQuestions, eq(bankQuestions.id, bankShares.questionId))
                .where(where)
                .orderBy(desc(bankShares.createdAt), desc(bankShares.id));
              return rows satisfies ShareRow[];
            });
          return {
            shared: yield* read(eq(bankShares.ownerId, userId)),
            withMe: yield* read(eq(bankShares.recipientId, userId)),
          };
        }),

        findOwnedShare: Effect.fn("BankRepo.findOwnedShare")(function* (shareId, ownerId) {
          const [row] = yield* db.query((d) =>
            d
              .select()
              .from(bankShares)
              .where(and(eq(bankShares.id, shareId), eq(bankShares.ownerId, ownerId))),
          );
          return row ?? null;
        }),

        removeShare: Effect.fn("BankRepo.removeShare")(function* (shareId) {
          yield* db.query((d) => d.delete(bankShares).where(eq(bankShares.id, shareId)));
        }),
      });
    }),
  );
}
