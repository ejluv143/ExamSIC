// Data access for AI help: the providers teachers can use, the organization's saved keys (never the keys themselves),
// question drafts and suggested scores. The API checks permissions again.
import "server-only";
import type { AiGenerateRequest } from "@examinus/contract/ai";
import type { AiFeedbackStyle, AiProvider } from "@examinus/domain/ai";
import { can } from "@examinus/domain/permissions";
import { getCurrentUser, requirePermission } from "@/lib/auth/dal";
import { read, write } from "@/lib/api/helpers";

// The providers the signed-in teacher can use now; empty when the organization has no key. Personal-space teachers have
// no `ai:use` (AI is organization-only): they get none, because a redirect here would move them off the page that asked.
export async function getAiStatus() {
  if (!can(await getCurrentUser(), { ai: ["use"] })) return [];
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
