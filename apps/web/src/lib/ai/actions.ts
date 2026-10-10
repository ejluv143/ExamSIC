"use server";

import { revalidatePath } from "next/cache";
import { Result, Schema } from "effect";
import {
  AiFeedbackStyle,
  AiGenerateRequest,
  AiKeyScope,
  AiProvider,
  aiLimits,
  type AiGradeSuggestion,
  type AiKeyInfo,
  type AiOption,
  type Question,
} from "@examora/contract";
import {
  generateQuestions,
  getAiStatus,
  removeAiKey,
  setAiKey,
  suggestGrade,
} from "@/lib/data/ai";
import { parseForm } from "@/lib/validate";
import type { Outcome } from "@/lib/data/api";

// Both settings pages list the saved keys.
function refresh() {
  revalidatePath("/admin/ai");
  revalidatePath("/teacher/settings/ai");
}

// Scope and provider come from the browser: check them before they reach the API.
const keyRef = Schema.Struct({ scope: AiKeyScope, provider: AiProvider });
const badRequest = "Check the form and try again.";

// The providers the signed-in teacher can use now.
export async function aiStatusAction(): Promise<readonly AiOption[]> {
  return getAiStatus();
}

// Saves a key (`apiKey` blank: only the model changes). The key is never sent back.
export async function saveAiKeyAction(
  scope: AiKeyScope,
  provider: AiProvider,
  model: string,
  apiKey: string,
): Promise<Outcome<AiKeyInfo>> {
  const ref = parseForm(keyRef, { scope, provider });
  if (Result.isFailure(ref)) return { error: badRequest };
  const key = apiKey.trim();
  if (key && (key.length < 8 || key.length > aiLimits.maxApiKey)) return { error: "Paste the full API key." };
  if (model.trim().length > aiLimits.maxModel) {
    return { error: `Use a model name of at most ${aiLimits.maxModel} characters.` };
  }
  const result = await setAiKey(ref.success.scope, ref.success.provider, model.trim(), key || undefined);
  if ("ok" in result) refresh();
  return result;
}

export async function removeAiKeyAction(scope: AiKeyScope, provider: AiProvider): Promise<Outcome<void>> {
  const ref = parseForm(keyRef, { scope, provider });
  if (Result.isFailure(ref)) return { error: badRequest };
  const result = await removeAiKey(ref.success.scope, ref.success.provider);
  if ("ok" in result) refresh();
  return result;
}

// Drafts questions; nothing is saved until the teacher saves the quiz.
export async function generateQuestionsAction(
  input: AiGenerateRequest,
): Promise<Outcome<readonly Question[]>> {
  const request = parseForm(AiGenerateRequest, input);
  if (Result.isFailure(request)) return { error: request.failure };
  const result = await generateQuestions(request.success);
  return "ok" in result ? { ok: result.ok.questions } : result;
}

// Suggests a score for one essay answer; the teacher applies and saves it.
export async function suggestGradeAction(
  attemptId: string,
  questionId: string,
  provider: AiProvider,
  feedbackStyle: AiFeedbackStyle,
): Promise<Outcome<AiGradeSuggestion>> {
  const ref = parseForm(Schema.Struct({ provider: AiProvider, feedbackStyle: AiFeedbackStyle }), { provider, feedbackStyle });
  if (Result.isFailure(ref)) return { error: badRequest };
  return suggestGrade(attemptId, questionId, ref.success.provider, ref.success.feedbackStyle);
}
