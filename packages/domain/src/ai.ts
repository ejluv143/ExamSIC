// What the AI helpers know about providers, drafts and limits.
import { Schema } from "effect";

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

// The question types AI drafts. `blank` is drafted as an identification question (one answer box).
export const aiQuestionTypes = ["multiple_choice", "true_false", "blank", "enumeration", "numeric", "essay"] as const;
export const AiQuestionType = Schema.Literals(aiQuestionTypes);
export type AiQuestionType = typeof AiQuestionType.Type;

export const aiDifficulties = ["easy", "medium", "hard"] as const;
export const AiDifficulty = Schema.Literals(aiDifficulties);
export type AiDifficulty = typeof AiDifficulty.Type;

export const aiLimits = { maxQuestions: 20, maxInstructions: 20_000, maxApiKey: 500, maxModel: 100 } as const;

// How suggested feedback is written: `standard` full sentences; `caveman` short, blunt fragments ("Point good.
// Example missing. Cite source.") for quick reading.
export const aiFeedbackStyles = ["standard", "caveman"] as const;
export const AiFeedbackStyle = Schema.Literals(aiFeedbackStyles);
export type AiFeedbackStyle = typeof AiFeedbackStyle.Type;

