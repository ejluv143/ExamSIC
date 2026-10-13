// What the AI helpers know about providers, drafts and limits.
import { Schema } from "effect";
import { questionKinds } from "./kinds/index.ts";
import { Question, type QuestionType } from "./question.ts";

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

// The question types AI drafts: those whose kind has a `draft` (`./kinds/`). `blank` is drafted as an identification
// question (one answer box). `kinds.test.ts` checks this list against the registry.
export const aiQuestionTypes = ["multiple_choice", "true_false", "blank", "enumeration", "numeric", "essay"] as const;
export const AiQuestionType = Schema.Literals(aiQuestionTypes);
export type AiQuestionType = typeof AiQuestionType.Type;

// What the model returns for one question: a flat shape, whatever the type. The server builds the real question
// (the kind of the type does, `draft.decode`).
const text = Schema.optional(Schema.NullOr(Schema.String));
export const AiDraft = Schema.Struct({
  type: Schema.String,
  prompt: Schema.String,
  explanation: text,
  topic: text,
  choices: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({ text: Schema.String, correct: Schema.Boolean })))),
  answer: Schema.optional(Schema.NullOr(Schema.Union([Schema.Boolean, Schema.Number, Schema.String]))),
  acceptedAnswers: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  items: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  orderMatters: Schema.optional(Schema.NullOr(Schema.Boolean)),
  tolerance: Schema.optional(Schema.NullOr(Schema.Number)),
  unit: text,
  rubric: Schema.optional(
    Schema.NullOr(Schema.Array(Schema.Struct({ criterion: Schema.String, points: Schema.optional(Schema.NullOr(Schema.Number)) }))),
  ),
});
export type AiDraft = typeof AiDraft.Type;

export const aiDifficulties = ["easy", "medium", "hard"] as const;
export const AiDifficulty = Schema.Literals(aiDifficulties);
export type AiDifficulty = typeof AiDifficulty.Type;

export const aiLimits = { maxQuestions: 20, maxInstructions: 20_000, maxApiKey: 500, maxModel: 100 } as const;

// How suggested feedback is written: `standard` full sentences; `caveman` short, blunt fragments ("Point good.
// Example missing. Cite source.") for quick reading.
export const aiFeedbackStyles = ["standard", "caveman"] as const;
export const AiFeedbackStyle = Schema.Literals(aiFeedbackStyles);
export type AiFeedbackStyle = typeof AiFeedbackStyle.Type;


const clean = (s: string | null | undefined) => (s && s.trim() !== "" ? s.trim() : undefined);

const decodeQuestion = Schema.decodeUnknownOption(Question);

// One of the model's questions as a Question, or null when it doesn't hold up (a type no kind drafts, a draft the
// kind turns down, or one that isn't a valid question). `newId` makes the ids of the choices and rubric rows.
export function draftQuestion(raw: AiDraft, points: number, newId: () => string): Question | null {
  const prompt = raw.prompt.trim();
  if (prompt === "") return null;
  const kind = Object.hasOwn(questionKinds, raw.type) ? questionKinds[raw.type as QuestionType] : undefined;
  if (!kind?.draft) return null;
  const base = {
    id: newId(),
    prompt,
    points,
    gamePoints: "standard" as const,
    partialCredit: false,
    ...(clean(raw.topic) ? { topic: clean(raw.topic)! } : {}),
    ...(clean(raw.explanation) ? { explanation: clean(raw.explanation)! } : {}),
  };
  const question = kind.draft.decode(raw, { prompt, points, base, newId });
  if (question === null) return null;
  const decoded = decodeQuestion(question);
  return decoded._tag === "Some" ? decoded.value : null;
}
