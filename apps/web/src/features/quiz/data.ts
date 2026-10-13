import "server-only";
import type { QuizListItem } from "@examinus/contract/quiz";
import { assetIdsIn } from "@examinus/domain/asset";
import { requirePermission } from "@/lib/auth/dal";
import { assetUrls } from "@/features/assets/data";
import { toDraft, toEditorQuiz, type EditorQuiz } from "./quiz-editor";
import { read, readOrNull, write, type Outcome } from "@/lib/api/helpers";

// The teacher's quizzes with their sessions, newest session first.
export async function listQuizzes(): Promise<readonly QuizListItem[]> {
  await requirePermission({ assessment: ["read"] });
  return read((api) => api["quiz.list"]());
}

// A quiz in the shape the editor works on, or null when it doesn't exist.
export async function getEditorQuiz(quizId: string): Promise<EditorQuiz | null> {
  await requirePermission({ assessment: ["read"] });
  const detail = await readOrNull((api) => api["quiz.get"]({ quizId }));
  return detail && toEditorQuiz(detail);
}

export async function getQuiz(quizId: string) {
  await requirePermission({ assessment: ["read"] });
  return readOrNull((api) => api["quiz.get"]({ quizId }));
}

// Signed image URLs for whatever quiz content a teacher page shows: every asset id found in `content`.
export async function contentAssetUrls(content: unknown): Promise<Record<string, string>> {
  await requirePermission({ assessment: ["read"] });
  return assetUrls(assetIdsIn(JSON.stringify(content)));
}

// Saves a quiz from the editor; a new one gets its id here.
export async function saveQuiz(quiz: EditorQuiz): Promise<Outcome<{ quizId: string }>> {
  await requirePermission({ assessment: [quiz.id === "new" ? "create" : "update"] });
  return write((api) => api["quiz.save"]({ draft: toDraft(quiz) }));
}

export async function removeQuiz(quizId: string) {
  await requirePermission({ assessment: ["delete"] });
  return write((api) => api["quiz.remove"]({ quizId }));
}

export async function duplicateQuiz(quizId: string) {
  await requirePermission({ assessment: ["create"] });
  return write((api) => api["quiz.duplicate"]({ quizId }));
}
