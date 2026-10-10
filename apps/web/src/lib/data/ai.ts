// Data access for AI help: the providers a teacher can use, saved keys (never the keys themselves), question
// drafts and suggested scores. The API picks the key (the teacher's own wins over the school's) and checks again.
import "server-only";
import type { AiFeedbackStyle, AiGenerateRequest, AiKeyScope, AiProvider } from "@examora/contract";
import { requirePermission } from "../auth/dal";
import { read, write } from "./api";

// School keys belong to admins; a teacher's own keys to the teacher.
const keyPermission = (scope: AiKeyScope): { ai: ["configure"] | ["use"] } =>
  scope === "school" ? { ai: ["configure"] } : { ai: ["use"] };

// The providers the signed-in teacher can use now; empty when no key is saved for them or the school.
export async function getAiStatus() {
  await requirePermission({ ai: ["use"] });
  return read((api) => api["ai.status"]());
}

export async function getAiKeys(scope: AiKeyScope) {
  await requirePermission(keyPermission(scope));
  return read((api) => api["ai.keys"]({ scope }));
}

// Saves a key, or only changes the model when `apiKey` is missing.
export async function setAiKey(scope: AiKeyScope, provider: AiProvider, model: string, apiKey?: string) {
  await requirePermission(keyPermission(scope));
  return write((api) => api["ai.setKey"]({ scope, provider, model, ...(apiKey ? { apiKey } : {}) }));
}

export async function removeAiKey(scope: AiKeyScope, provider: AiProvider) {
  await requirePermission(keyPermission(scope));
  return write((api) => api["ai.removeKey"]({ scope, provider }));
}

export async function generateQuestions(request: AiGenerateRequest) {
  await requirePermission({ ai: ["use"] });
  return write((api) => api["ai.generate"](request));
}

export async function suggestGrade(attemptId: string, questionId: string, provider: AiProvider, feedbackStyle: AiFeedbackStyle) {
  await requirePermission({ ai: ["use"] });
  return write((api) => api["ai.suggestGrade"]({ attemptId, questionId, provider, feedbackStyle }));
}
