// The question bank (`bank.*`): the teacher's own questions, the shared demo library and what other teachers shared.
// Questions are addressed by `question.id` (the id a question gets in a quiz). Anything the caller doesn't own (for
// writes) or can't see (for reads) is NotFound. Times are ISO 8601 strings.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { bankShareScopes, maxTagLength } from "@examinus/domain/bank";
import { SubjectAreaSchema } from "@examinus/domain/classes";
import { Question } from "@examinus/domain/question";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

// A subject or topic name: not blank (the API trims it). Clearing a tag is `null`, never "".
export const BankTag = Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(maxTagLength));

export const BankPerson = Schema.Struct({ id: Schema.String, name: Schema.String });
export type BankPerson = typeof BankPerson.Type;

// One question as the signed-in teacher sees it.
export const BankQuestion = Schema.Struct({
  question: Question,
  subject: Schema.NullOr(Schema.String),
  subjectArea: Schema.NullOr(SubjectAreaSchema),
  // Always equal to `question.topic` (null when the question has none).
  topic: Schema.NullOr(Schema.String),
  // Who owns it; null for the shared demo library.
  owner: Schema.NullOr(BankPerson),
  // The caller owns it (and may edit, retag, delete and share it).
  mine: Schema.Boolean,
  // Set when another teacher shared it with the caller (read-only; copy it to change it); equals `owner` then.
  sharedBy: Schema.NullOr(BankPerson),
});
export type BankQuestion = typeof BankQuestion.Type;

export const BankShareScope = Schema.Literals(bankShareScopes);

// One share. `subject`, `topic` and `questionId` are set according to `scope` (a topic share has no subject).
export const BankShare = Schema.Struct({
  id: Schema.String,
  scope: BankShareScope,
  subject: Schema.NullOr(Schema.String),
  topic: Schema.NullOr(Schema.String),
  // `question.id` of the shared question (scope "question").
  questionId: Schema.NullOr(Schema.String),
  // The shared question's prompt, to show what it is (scope "question").
  prompt: Schema.NullOr(Schema.String),
  owner: BankPerson,
  recipient: Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
  createdAt: Schema.String,
});
export type BankShare = typeof BankShare.Type;

// `bank.share` named emails that aren't teacher accounts (nobody, or a student, admin or guest). Nothing was shared.
export class UnknownRecipients extends Schema.TaggedError<UnknownRecipients>()("UnknownRecipients", {
  message: Schema.String,
  emails: Schema.Array(Schema.String),
}) {}

// Questions one bank.add or bank.copy call may take, and one call that names existing questions may name.
export const maxBankAdd = 50;
export const maxBankSelection = 200;
// Teachers one bank.share call may name.
export const maxShareRecipients = 20;

const QuestionIds = (max: number) => Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(max));
const Count = Schema.Struct({ count: Schema.Int });

export class BankRpcs extends RpcGroup.make(
  // The shared demo library, the caller's own questions and those shared with them, oldest first.
  Rpc.make("list", { success: Schema.Array(BankQuestion), error: Forbidden }),
  // Adds questions to the caller's own bank, each with a fresh id (e.g. drafts from ai.generate the teacher
  // picked). `subject` and `subjectArea` default to none. `topic`: absent keeps each question's own topic; a value
  // (or null for none) is set on all of them. Returns the new questions' ids, in order.
  Rpc.make("add", {
    payload: {
      questions: Schema.Array(Question).check(Schema.isMinLength(1), Schema.isMaxLength(maxBankAdd)),
      subject: Schema.optionalKey(Schema.NullOr(BankTag)),
      subjectArea: Schema.optionalKey(Schema.NullOr(SubjectAreaSchema)),
      topic: Schema.optionalKey(Schema.NullOr(BankTag)),
    },
    success: Schema.Struct({ count: Schema.Int, questionIds: Schema.Array(Schema.String) }),
    error: Forbidden,
  }),
  // Replaces the body and tags of one of the caller's questions. `question.id` names it and stays; the topic is
  // `question.topic`. NotFound when it isn't the caller's.
  Rpc.make("update", {
    payload: {
      question: Question,
      subject: Schema.NullOr(BankTag),
      subjectArea: Schema.NullOr(SubjectAreaSchema),
    },
    success: BankQuestion,
    error: Schema.Union([Forbidden, NotFound]),
  }),
  // Deletes the caller's questions (and the shares of them). NotFound, and nothing deleted, when any isn't theirs.
  Rpc.make("delete", {
    payload: { questionIds: QuestionIds(maxBankSelection) },
    success: Count,
    error: Schema.Union([Forbidden, NotFound]),
  }),
  // Sets the subject, subject area and/or topic of the caller's questions. A key left out is unchanged; null clears
  // it. NotFound, and nothing changed, when any question isn't theirs.
  Rpc.make("retag", {
    payload: {
      questionIds: QuestionIds(maxBankSelection),
      subject: Schema.optionalKey(Schema.NullOr(BankTag)),
      subjectArea: Schema.optionalKey(Schema.NullOr(SubjectAreaSchema)),
      topic: Schema.optionalKey(Schema.NullOr(BankTag)),
    },
    success: Count,
    error: Schema.Union([Forbidden, NotFound]),
  }),
  // Renames a subject or a topic across all the caller's questions; a name that already exists merges into it.
  // The caller's subject and topic shares follow the new name. `count`: questions changed. NotFound when the
  // caller has no question with `from`.
  Rpc.make("renameTag", {
    payload: { kind: Schema.Literals(["subject", "topic"]), from: BankTag, to: BankTag },
    success: Count,
    error: Schema.Union([Forbidden, NotFound]),
  }),
  // Shares with other teachers, by email: scope "subject" needs `subject`, "topic" needs `topic` (any subject),
  // "question" needs `questionIds`; Conflict when a field doesn't fit the scope or a recipient is the caller.
  // Subject and topic shares are live: questions added later are shared too. NotFound when the caller has no
  // question with that subject or topic, or any named question isn't theirs. UnknownRecipients (nothing shared)
  // when an email isn't a teacher account. Sharing again is a no-op; `count` is the shares created.
  Rpc.make("share", {
    payload: {
      recipients: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(maxShareRecipients)),
      scope: BankShareScope,
      subject: Schema.optionalKey(BankTag),
      topic: Schema.optionalKey(BankTag),
      questionIds: Schema.optionalKey(QuestionIds(maxBankSelection)),
    },
    success: Count,
    error: Schema.Union([Forbidden, NotFound, Conflict, UnknownRecipients]),
  }),
  // What the caller shares (`shared`) and what others share with them (`withMe`), newest first.
  Rpc.make("shares", {
    success: Schema.Struct({ shared: Schema.Array(BankShare), withMe: Schema.Array(BankShare) }),
    error: Forbidden,
  }),
  // Removes a share the caller made; the recipient stops seeing those questions (quizzes they built keep theirs).
  Rpc.make("unshare", { payload: { shareId: Schema.String }, error: Schema.Union([Forbidden, NotFound]) }),
  // Copies questions the caller can see (library, shared or their own) into their bank with new ids, keeping
  // subject and topic. NotFound, and nothing copied, when any isn't visible. Returns the copies' ids in order.
  Rpc.make("copy", {
    payload: { questionIds: QuestionIds(maxBankAdd) },
    success: Schema.Struct({ count: Schema.Int, questionIds: Schema.Array(Schema.String) }),
    error: Schema.Union([Forbidden, NotFound]),
  }),
)
  .prefix("bank.")
  .middleware(AuthMiddleware) {}
