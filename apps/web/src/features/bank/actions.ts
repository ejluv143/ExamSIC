"use server";

import { revalidatePath } from "next/cache";
import { Result, Schema } from "effect";
import {
  BankShareScope,
  BankTag,
  maxBankAdd,
  maxBankSelection,
  maxShareRecipients,
} from "@examinus/contract/bank";
import { SubjectAreaSchema } from "@examinus/domain/classes";
import { Question } from "@examinus/domain/question";
import type { SubjectArea } from "@examinus/domain/roles";
import type { Outcome } from "@/lib/api/helpers";
import { parseForm } from "@/lib/validate";
import { insertQuestions, emptyPart } from "@/features/quiz/quiz-editor";
import { getEditorQuiz, listQuizzes, saveQuiz } from "@/features/quiz/data";
import {
  addToBank,
  copyToBank,
  deleteBankQuestions,
  listBank,
  listBankShares,
  renameBankTag,
  retagBankQuestions,
  shareBank,
  unshareBank,
  updateBankQuestion,
} from "./data";

// The inputs come from the browser: checked here, before the API checks them again.
const questionIds = (max: number) => Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(max));
const optionalTag = Schema.optionalKey(Schema.NullOr(BankTag));
const optionalArea = Schema.optionalKey(Schema.NullOr(SubjectAreaSchema));

const changed = <A>(result: Outcome<A>): Outcome<A> => {
  if ("ok" in result) {
    revalidatePath("/teacher/question-bank");
    revalidatePath("/teacher/assessments", "layout");
  }
  return result;
};

// Adds questions (picked drafts, say) to the teacher's own bank.
export async function addToBankAction(input: {
  questions: readonly Question[];
  subject?: string | null;
  subjectArea?: SubjectArea | null;
  topic?: string | null;
}) {
  const parsed = parseForm(
    Schema.Struct({
      questions: Schema.Array(Question).check(Schema.isMinLength(1), Schema.isMaxLength(maxBankAdd)),
      subject: optionalTag,
      subjectArea: optionalArea,
      topic: optionalTag,
    }),
    input,
  );
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  return changed(await addToBank(parsed.success));
}

export async function updateBankQuestionAction(input: {
  question: Question;
  subject: string | null;
  subjectArea: SubjectArea | null;
}) {
  const parsed = parseForm(
    Schema.Struct({ question: Question, subject: Schema.NullOr(BankTag), subjectArea: Schema.NullOr(SubjectAreaSchema) }),
    input,
  );
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  return changed(await updateBankQuestion(parsed.success));
}

export async function deleteBankQuestionsAction(ids: readonly string[]) {
  const parsed = parseForm(questionIds(maxBankSelection), ids);
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  return changed(await deleteBankQuestions(parsed.success));
}

export async function retagBankQuestionsAction(input: {
  questionIds: readonly string[];
  subject?: string | null;
  subjectArea?: SubjectArea | null;
  topic?: string | null;
}) {
  const parsed = parseForm(
    Schema.Struct({ questionIds: questionIds(maxBankSelection), subject: optionalTag, subjectArea: optionalArea, topic: optionalTag }),
    input,
  );
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  return changed(await retagBankQuestions(parsed.success));
}

export async function renameBankTagAction(input: { kind: "subject" | "topic"; from: string; to: string }) {
  const parsed = parseForm(
    Schema.Struct({ kind: Schema.Literals(["subject", "topic"]), from: BankTag, to: BankTag }),
    input,
  );
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  return changed(await renameBankTag(parsed.success));
}

export async function shareBankAction(input: {
  recipients: readonly string[];
  scope: "subject" | "topic" | "question";
  subject?: string;
  topic?: string;
  questionIds?: readonly string[];
}) {
  const parsed = parseForm(
    Schema.Struct({
      recipients: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(maxShareRecipients)),
      scope: BankShareScope,
      subject: Schema.optionalKey(BankTag),
      topic: Schema.optionalKey(BankTag),
      questionIds: Schema.optionalKey(questionIds(maxBankSelection)),
    }),
    input,
  );
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  return changed(await shareBank(parsed.success));
}

export async function unshareBankAction(shareId: string) {
  return changed(await unshareBank(shareId));
}

export async function copyToBankAction(ids: readonly string[]) {
  const parsed = parseForm(questionIds(maxBankAdd), ids);
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  return changed(await copyToBank(parsed.success));
}

// What the teacher shares and what is shared with them, for the share dialog.
export async function listBankSharesAction() {
  return listBankShares();
}

// The teacher's drafts: quizzes that have not been run yet, which questions can still be added to.
export async function listDraftQuizzesAction() {
  const quizzes = await listQuizzes();
  return quizzes
    .filter((item) => item.sessions.length === 0)
    .map((item) => ({ id: item.quiz.id, title: item.quiz.title, questionCount: item.questionCount }));
}

// Appends bank questions (by id, as the teacher can see them) to the end of a draft quiz's last part, each with a
// fresh id like the editor's own bank picker, and saves the quiz.
export async function addToQuizAction(quizId: string, ids: readonly string[]) {
  const parsed = parseForm(questionIds(maxBankSelection), ids);
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  const [quiz, bank] = await Promise.all([getEditorQuiz(quizId), listBank()]);
  if (!quiz) return { error: "That quiz no longer exists." };
  const wanted = new Set(parsed.success);
  const questions = bank
    .filter((b) => wanted.has(b.question.id))
    .map((b) => ({ ...structuredClone(b.question), id: crypto.randomUUID().slice(0, 8) }));
  if (questions.length !== wanted.size) return { error: "Some of those questions are no longer in your bank." };
  const parts = quiz.parts.length > 0 ? quiz.parts : [emptyPart("Questions")];
  const last = parts.length - 1;
  const saved = await saveQuiz({ ...quiz, parts: parts.map((p, i) => (i === last ? insertQuestions(p, questions) : p)) });
  if ("error" in saved) return saved;
  revalidatePath("/teacher/assessments", "layout");
  return { ok: { quizId, count: questions.length } };
}
