// Data access for AI help: the providers teachers can use, the school's saved keys (never the keys themselves),
// question drafts and suggested scores. The API checks permissions again.
import "server-only";
import type { AiFeedbackStyle, AiGenerateRequest, AiProvider } from "@examora/contract";
import { requirePermission } from "../auth/dal";
import { read, write } from "./api";

// The providers the signed-in teacher can use now; empty when the school has no key.
export async function getAiStatus() {
  await requirePermission({ ai: ["use"] });
  return read((api) => api["ai.status"]());
}

export async function getAiKeys() {
  await requirePermission({ ai: ["configure"] });
  return read((api) => api["ai.keys"]());
}

// Saves a key, or only changes the model when `apiKey` is missing.
export async function setAiKey(provider: AiProvider, model: string, apiKey?: string) {
  await requirePermission({ ai: ["configure"] });
  return write((api) => api["ai.setKey"]({ provider, model, ...(apiKey ? { apiKey } : {}) }));
}

export async function removeAiKey(provider: AiProvider) {
  await requirePermission({ ai: ["configure"] });
  return write((api) => api["ai.removeKey"]({ provider }));
}

export async function generateQuestions(request: AiGenerateRequest) {
  await requirePermission({ ai: ["use"] });
  return write((api) => api["ai.generate"](request));
}

export async function suggestGrade(attemptId: string, questionId: string, provider: AiProvider, feedbackStyle: AiFeedbackStyle) {
  await requirePermission({ ai: ["use"] });
  return write((api) => api["ai.suggestGrade"]({ attemptId, questionId, provider, feedbackStyle }));
}
