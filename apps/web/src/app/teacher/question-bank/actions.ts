"use server";

import { revalidatePath } from "next/cache";
import { Result, Schema } from "effect";
import { maxBankAdd, Question } from "@examora/contract";
import { addToBank } from "@/lib/data/teacher";
import { parseForm } from "@/lib/validate";
import type { Outcome } from "@/lib/data/api";

// Adds the picked questions to the teacher's own bank. They come from the browser: checked before the API.
export async function addToBankAction(questions: readonly Question[]): Promise<Outcome<{ count: number }>> {
  const parsed = parseForm(Schema.Array(Question).check(Schema.isMinLength(1), Schema.isMaxLength(maxBankAdd)), questions);
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  const result = await addToBank(parsed.success);
  if ("ok" in result) revalidatePath("/teacher/question-bank");
  return result;
}
