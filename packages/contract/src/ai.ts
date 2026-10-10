// AI help for teachers: drafting questions and suggesting scores for essay answers. Each call goes to the
// provider the teacher picks (OpenAI, Claude or Gemini) with an API key: the teacher's own key for that provider
// when they saved one, otherwise the school's key (set by an admin). Keys are write-only: once saved, only their
// last four characters come back. Suggested scores are never shown to students; the teacher applies them.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Forbidden, NotFound, TooManyRequests } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { Points, Question } from "./question.ts";

export const aiProviders = ["openai", "anthropic", "gemini"] as const;
export const AiProvider = Schema.Literals(aiProviders);
export type AiProvider = typeof AiProvider.Type;

export const aiProviderLabels: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Claude (Anthropic)",
  gemini: "Google Gemini",
};

// The model used when a key is saved without one.
export const defaultAiModels: Record<AiProvider, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
};

// `school`: the admin's key, shared by every teacher. `own`: the signed-in teacher's key.
export const aiKeyScopes = ["school", "own"] as const;
export const AiKeyScope = Schema.Literals(aiKeyScopes);
export type AiKeyScope = typeof AiKeyScope.Type;

// A saved key, without the key itself.
export const AiKeyInfo = Schema.Struct({
  provider: AiProvider,
  scope: AiKeyScope,
  last4: Schema.String,
  model: Schema.String,
  updatedAt: Schema.String,
});
export type AiKeyInfo = typeof AiKeyInfo.Type;

// A provider the teacher can use now, and whose key it would use (their own wins over the school's).
export const AiOption = Schema.Struct({ provider: AiProvider, scope: AiKeyScope, model: Schema.String });
export type AiOption = typeof AiOption.Type;

// The question types AI drafts. `blank` is drafted as an identification question (one answer box).
export const aiQuestionTypes = ["multiple_choice", "true_false", "blank", "enumeration", "numeric", "essay"] as const;
export const AiQuestionType = Schema.Literals(aiQuestionTypes);
export type AiQuestionType = typeof AiQuestionType.Type;

export const aiDifficulties = ["easy", "medium", "hard"] as const;
export const AiDifficulty = Schema.Literals(aiDifficulties);
export type AiDifficulty = typeof AiDifficulty.Type;

export const aiLimits = { maxQuestions: 20, maxInstructions: 20_000, maxApiKey: 500, maxModel: 100 } as const;

// `instructions`: the topic, notes or source text to draw the questions from. `points`: each question's points;
// essays get a rubric whose rows add up to them.
export const AiGenerateRequest = Schema.Struct({
  provider: AiProvider,
  instructions: Schema.String.check(
    Schema.isMinLength(1, { message: "Describe what the questions should cover" }),
    Schema.isMaxLength(aiLimits.maxInstructions),
  ),
  count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: aiLimits.maxQuestions })),
  types: Schema.Array(AiQuestionType).check(Schema.isMinLength(1, { message: "Pick at least one question type" })),
  difficulty: AiDifficulty,
  points: Points.check(Schema.isGreaterThan(0)),
});
export type AiGenerateRequest = typeof AiGenerateRequest.Type;

// How suggested feedback is written: `standard` full sentences; `caveman` short, blunt fragments ("Point good.
// Example missing. Cite source.") for quick reading.
export const aiFeedbackStyles = ["standard", "caveman"] as const;
export const AiFeedbackStyle = Schema.Literals(aiFeedbackStyles);
export type AiFeedbackStyle = typeof AiFeedbackStyle.Type;

// A suggested score for one essay answer: `score` in points (0 to the question's points), feedback written to the
// student, and the rubric rows the answer meets.
export const AiGradeSuggestion = Schema.Struct({
  provider: AiProvider,
  model: Schema.String,
  score: Schema.Number,
  feedback: Schema.String,
  rubricRowIds: Schema.Array(Schema.String),
  createdAt: Schema.String,
});
export type AiGradeSuggestion = typeof AiGradeSuggestion.Type;

// No usable key for the provider, the provider refused the request, or its reply couldn't be used. `message` is
// written for people.
export class AiFailed extends Schema.TaggedError<AiFailed>()("AiFailed", { message: Schema.String }) {}

const KeyRef = { scope: AiKeyScope, provider: AiProvider };
const keyErrors = Schema.Union([Forbidden, NotFound]);
const callErrors = Schema.Union([Forbidden, NotFound, TooManyRequests, AiFailed]);

export class AiRpcs extends RpcGroup.make(
  // The providers the teacher can use now; empty when no key is saved for them or the school.
  Rpc.make("status", { success: Schema.Array(AiOption), error: Forbidden }),
  // Saved keys of one scope: `school` for admins, `own` for teachers.
  Rpc.make("keys", { payload: { scope: AiKeyScope }, success: Schema.Array(AiKeyInfo), error: Forbidden }),
  // Saves a key, or changes the model of a saved one when `apiKey` is missing (NotFound if none is saved).
  // An empty `model` means the provider's default.
  Rpc.make("setKey", {
    payload: {
      ...KeyRef,
      apiKey: Schema.optionalKey(Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(aiLimits.maxApiKey))),
      model: Schema.String.check(Schema.isMaxLength(aiLimits.maxModel)),
    },
    success: AiKeyInfo,
    error: keyErrors,
  }),
  Rpc.make("removeKey", { payload: KeyRef, error: Forbidden }),
  // Drafts new questions for the quiz editor; nothing is saved until the teacher saves the quiz.
  Rpc.make("generate", {
    payload: AiGenerateRequest,
    success: Schema.Struct({ questions: Schema.Array(Question) }),
    error: callErrors,
  }),
  // Suggests a score for a submitted essay answer in one of the teacher's sessions, and keeps it with the answer
  // (AttemptDetail.aiSuggestions) until the answer changes. Nothing is graded until the teacher saves a score.
  Rpc.make("suggestGrade", {
    payload: {
      attemptId: Schema.String,
      questionId: Schema.String,
      provider: AiProvider,
      feedbackStyle: AiFeedbackStyle,
    },
    success: AiGradeSuggestion,
    error: callErrors,
  }),
)
  .prefix("ai.")
  .middleware(AuthMiddleware) {}
