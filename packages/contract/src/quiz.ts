// The teacher's quiz content (`quiz.*`): quizzes, parts and questions. Times are ISO 8601 strings.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { SubjectAreaSchema } from "@examinus/domain/classes";
import { Question } from "@examinus/domain/question";
import { PaperHeader, PaperSettings, Quiz, QuizPart, QuizSettings, Session } from "@examinus/domain/quiz";
import { Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { QuizId } from "./shared.ts";

// --- Quizzes ---

export const QuizPartWithQuestions = Schema.Struct({ ...QuizPart.fields, questions: Schema.Array(Question) });
export type QuizPartWithQuestions = typeof QuizPartWithQuestions.Type;

// A quiz with its parts and questions (teacher's view, answers included), parts and questions in order.
export const QuizDetail = Schema.Struct({ quiz: Quiz, parts: Schema.Array(QuizPartWithQuestions) });
export type QuizDetail = typeof QuizDetail.Type;

export const QuizListItem = Schema.Struct({
  quiz: Quiz,
  questionCount: Schema.Int,
  totalPoints: Schema.Number,
  // Newest first. A quiz with none shows as "Draft".
  sessions: Schema.Array(Session),
});
export type QuizListItem = typeof QuizListItem.Type;

// What the editor saves. New parts and questions carry any id (it only has to be unique within the draft):
// ids the quiz already has are updated in place, anything else is created with a fresh id, and parts or
// questions left out are deleted. Order in the arrays is the order in the quiz. Read the saved quiz back with
// `quiz.get` to learn the final ids.
export const QuizDraftPart = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  instructions: Schema.String,
  shuffleQuestions: Schema.Boolean,
  poolSize: Schema.NullOr(Schema.Int),
  questions: Schema.Array(Question),
});
export type QuizDraftPart = typeof QuizDraftPart.Type;

export const QuizDraft = Schema.Struct({
  // Absent: create a new quiz.
  id: Schema.optionalKey(Schema.String),
  title: Schema.String,
  description: Schema.String,
  subject: Schema.NullOr(Schema.String),
  subjectArea: Schema.NullOr(SubjectAreaSchema),
  header: PaperHeader,
  paper: PaperSettings,
  settings: QuizSettings,
  parts: Schema.Array(QuizDraftPart),
});
export type QuizDraft = typeof QuizDraft.Type;

export class QuizRpcs extends RpcGroup.make(
  Rpc.make("list", { success: Schema.Array(QuizListItem), error: Forbidden }),
  Rpc.make("get", { payload: QuizId, success: QuizDetail, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("save", {
    payload: { draft: QuizDraft },
    success: Schema.Struct({ quizId: Schema.String }),
    error: Schema.Union([Forbidden, NotFound]),
  }),
  Rpc.make("remove", { payload: QuizId, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("duplicate", {
    payload: QuizId,
    success: Schema.Struct({ quizId: Schema.String }),
    error: Schema.Union([Forbidden, NotFound]),
  }),
)
  .prefix("quiz.")
  .middleware(AuthMiddleware) {}
