// What a teacher does with the question bank: tag, edit, share and copy questions. Writes only ever reach the
// teacher's own questions; a question they don't own or can't see is NotFound, as if it didn't exist.
import { UnknownRecipients, type BankQuestion, type BankShare } from "@examinus/contract/bank";
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { normalizeTag, withTopic, type BankShareScope } from "@examinus/domain/bank";
import type { Question } from "@examinus/domain/question";
import type { SubjectArea } from "@examinus/domain/roles";
import { Context, Effect, Layer } from "effect";
import type { BankQuestionItem, NewBankQuestion, NewBankShare } from "../../database/schemas/index.ts";
import type { Actor } from "../auth/Session.ts";
import { newId } from "../../platform/ids.ts";
import { toBankQuestion, toBankShare } from "./mappers.ts";
import { BankRepo, type BankPatch } from "./Repo.ts";

export type AddInput = {
  questions: readonly Question[];
  subject?: string | null;
  subjectArea?: SubjectArea | null;
  topic?: string | null;
};

export type RetagInput = {
  questionIds: readonly string[];
  subject?: string | null;
  subjectArea?: SubjectArea | null;
  topic?: string | null;
};

export type ShareInput = {
  recipients: readonly string[];
  scope: BankShareScope;
  subject?: string;
  topic?: string;
  questionIds?: readonly string[];
};

const missing = new NotFound({ message: "One of those questions isn't in your question bank." });

const patchOf = (row: BankQuestionItem, change: Partial<Pick<BankPatch, "subject" | "subjectArea" | "topic">>): BankPatch => {
  const topic = change.topic === undefined ? row.topic : change.topic;
  return {
    id: row.id,
    question: withTopic(row.question, topic),
    subject: change.subject === undefined ? row.subject : change.subject,
    subjectArea: change.subjectArea === undefined ? row.subjectArea : change.subjectArea,
    topic,
  };
};

export class BankService extends Context.Service<
  BankService,
  {
    // The library, the user's own questions and those shared with them.
    readonly list: (actor: Actor) => Effect.Effect<BankQuestion[]>;
    // New questions in the user's bank, with fresh ids; the ids.
    readonly add: (actor: Actor, input: AddInput) => Effect.Effect<string[]>;
    // Replaces the body and tags of the user's question `question.id`; NotFound when it isn't theirs.
    readonly update: (
      actor: Actor,
      question: Question,
      subject: string | null,
      subjectArea: SubjectArea | null,
    ) => Effect.Effect<BankQuestion, NotFound>;
    readonly remove: (actor: Actor, questionIds: readonly string[]) => Effect.Effect<number, NotFound>;
    readonly retag: (actor: Actor, input: RetagInput) => Effect.Effect<number, NotFound>;
    readonly renameTag: (actor: Actor, kind: "subject" | "topic", from: string, to: string) => Effect.Effect<number, NotFound>;
    // The number of shares created.
    readonly share: (actor: Actor, input: ShareInput) => Effect.Effect<number, NotFound | Conflict | Forbidden | UnknownRecipients>;
    readonly shares: (actor: Actor) => Effect.Effect<{ shared: BankShare[]; withMe: BankShare[] }>;
    readonly unshare: (actor: Actor, shareId: string) => Effect.Effect<void, NotFound | Forbidden>;
    // Copies visible questions into the user's bank with new ids; the new ids, in the order asked.
    readonly copy: (actor: Actor, questionIds: readonly string[]) => Effect.Effect<string[], NotFound>;
  }
>()("examinus/api/BankService") {
  static readonly layer = Layer.effect(
    BankService,
    Effect.gen(function* () {
      const repo = yield* BankRepo;

      // The user's own questions with these question ids, in the order given; NotFound when any isn't theirs.
      const ownedAll = Effect.fn("BankService.ownedAll")(function* (actor: Actor, questionIds: readonly string[]) {
        const ids = [...new Set(questionIds)];
        const byId = new Map((yield* repo.owned(actor, ids)).map((r) => [r.question.id, r]));
        const rows = ids.map((id) => byId.get(id));
        if (rows.some((r) => r === undefined)) return yield* missing;
        return rows as BankQuestionItem[];
      });

      return BankService.of({
        list: Effect.fn("BankService.list")(function* (actor) {
          return (yield* repo.list(actor)).map((r) => toBankQuestion(r, actor.id));
        }),

        add: Effect.fn("BankService.add")(function* (actor, input) {
          // A fresh id each: a bank question's id is the one it gets in a quiz, so it mustn't repeat another's.
          const rows = input.questions.map((q): NewBankQuestion => {
            const topic = normalizeTag(input.topic === undefined ? q.topic : input.topic);
            return {
              id: newId("bank"),
              ownerId: actor.id,
              organizationId: actor.organizationId,
              question: withTopic({ ...q, id: newId("q") }, topic),
              subject: normalizeTag(input.subject),
              subjectArea: input.subjectArea ?? null,
              topic,
            };
          });
          yield* repo.insert(rows);
          return rows.map((r) => r.question!.id);
        }),

        update: Effect.fn("BankService.update")(function* (actor, question, subject, subjectArea) {
          const [row] = yield* repo.owned(actor, [question.id]);
          if (!row) return yield* missing;
          const patch: BankPatch = {
            id: row.id,
            question: withTopic(question, question.topic),
            subject: normalizeTag(subject),
            subjectArea,
            topic: normalizeTag(question.topic),
          };
          yield* repo.update([patch]);
          return toBankQuestion(
            { item: { ...row, question: patch.question, subject: patch.subject, subjectArea, topic: patch.topic }, ownerName: null },
            actor.id,
          );
        }),

        remove: Effect.fn("BankService.remove")(function* (actor, questionIds) {
          const rows = yield* ownedAll(actor, questionIds);
          yield* repo.remove(rows.map((r) => r.id));
          return rows.length;
        }),

        retag: Effect.fn("BankService.retag")(function* (actor, input) {
          const rows = yield* ownedAll(actor, input.questionIds);
          const change = {
            ...(input.subject !== undefined && { subject: normalizeTag(input.subject) }),
            ...(input.subjectArea !== undefined && { subjectArea: input.subjectArea }),
            ...(input.topic !== undefined && { topic: normalizeTag(input.topic) }),
          };
          yield* repo.update(rows.map((r) => patchOf(r, change)));
          return rows.length;
        }),

        renameTag: Effect.fn("BankService.renameTag")(function* (actor, kind, from, to) {
          const [oldName, newName] = [normalizeTag(from), normalizeTag(to)];
          if (oldName === null || newName === null) return yield* new NotFound({ message: "That name is empty." });
          const rows = yield* repo.ownedWithTag(actor, kind, oldName);
          if (rows.length === 0) return yield* new NotFound({ message: `You have no questions with the ${kind} "${oldName}".` });
          if (oldName !== newName) yield* repo.rename(actor, kind, oldName, newName, rows.map((r) => patchOf(r, { [kind]: newName })));
          return rows.length;
        }),

        share: Effect.fn("BankService.share")(function* (actor, input) {
          const organizationId = actor.organizationId;
          if (organizationId === null) return yield* new Forbidden({ message: "Sharing needs an organization." });
          const subject = normalizeTag(input.subject);
          const topic = normalizeTag(input.topic);
          const fits =
            (input.scope === "subject" && subject !== null && topic === null && input.questionIds === undefined) ||
            (input.scope === "topic" && topic !== null && subject === null && input.questionIds === undefined) ||
            (input.scope === "question" && input.questionIds !== undefined && subject === null && topic === null);
          if (!fits) return yield* new Conflict({ message: `A "${input.scope}" share needs only its ${input.scope === "question" ? "questionIds" : input.scope}.` });

          // What is shared: a tag the user has questions under, or questions they own.
          let questionRowIds: string[] = [];
          if (input.scope === "question") questionRowIds = (yield* ownedAll(actor, input.questionIds!)).map((r) => r.id);
          else {
            const kind = input.scope;
            const name = (kind === "subject" ? subject : topic)!;
            if ((yield* repo.ownedWithTag(actor, kind, name)).length === 0)
              return yield* new NotFound({ message: `You have no questions with the ${kind} "${name}".` });
          }

          const emails = [...new Set(input.recipients.map((e) => e.trim().toLowerCase()))];
          const found = yield* repo.teachersByEmail(organizationId, emails);
          const known = new Set(found.map((t) => t.email.toLowerCase()));
          const unknown = emails.filter((e) => !known.has(e));
          if (unknown.length > 0)
            return yield* new UnknownRecipients({ message: `No teacher account for: ${unknown.join(", ")}.`, emails: unknown });
          if (found.some((t) => t.id === actor.id)) return yield* new Conflict({ message: "You can't share with yourself." });

          const rows = found.flatMap((t): NewBankShare[] =>
            input.scope === "question"
              ? questionRowIds.map((questionId) => ({ ownerId: actor.id, organizationId, recipientId: t.id, scope: "question", questionId }))
              : [{ ownerId: actor.id, organizationId, recipientId: t.id, scope: input.scope, subject, topic }],
          );
          return yield* repo.addShares(rows);
        }),

        shares: Effect.fn("BankService.shares")(function* (actor) {
          // Shares exist only inside an organization.
          if (actor.organizationId === null) return { shared: [], withMe: [] };
          const { shared, withMe } = yield* repo.shares({ id: actor.id, organizationId: actor.organizationId });
          return { shared: shared.map(toBankShare), withMe: withMe.map(toBankShare) };
        }),

        unshare: Effect.fn("BankService.unshare")(function* (actor, shareId) {
          if (actor.organizationId === null) return yield* new Forbidden({ message: "Sharing needs an organization." });
          const owner = { id: actor.id, organizationId: actor.organizationId };
          const share = yield* repo.findOwnedShare(shareId, owner);
          if (!share) return yield* new NotFound({ message: "That share doesn't exist." });
          yield* repo.removeShare(share.id, owner);
        }),

        copy: Effect.fn("BankService.copy")(function* (actor, questionIds) {
          const ids = [...new Set(questionIds)];
          const found = new Map((yield* repo.visible(actor, ids)).map((r) => [r.item.question.id, r.item]));
          if (ids.some((id) => !found.has(id))) return yield* missing;
          const rows = ids.map((id): NewBankQuestion => {
            const source = found.get(id)!;
            return {
              id: newId("bank"),
              ownerId: actor.id,
              organizationId: actor.organizationId,
              question: withTopic({ ...source.question, id: newId("q") }, source.topic),
              subject: source.subject,
              subjectArea: source.subjectArea,
              topic: source.topic,
            };
          });
          yield* repo.insert(rows);
          return rows.map((r) => r.question!.id);
        }),
      });
    }),
  );
}
