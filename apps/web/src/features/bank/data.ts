import "server-only";
import type { BankQuestion, BankShare } from "@examinus/contract/bank";
import type { Question } from "@examinus/domain/question";
import type { SubjectArea } from "@examinus/domain/roles";
import { requirePermission } from "@/lib/auth/dal";
import { read, write, type Outcome } from "@/lib/api/helpers";

// The shared library, the teacher's own questions and the ones other teachers shared with them.
export async function listBank(): Promise<readonly BankQuestion[]> {
  await requirePermission({ questionBank: ["read"] });
  return read((api) => api["bank.list"]());
}

// Adds questions to the teacher's own bank. `topic` absent: each keeps its own; a value (or null) is set on all.
export async function addToBank(input: {
  questions: readonly Question[];
  subject?: string | null;
  subjectArea?: SubjectArea | null;
  topic?: string | null;
}): Promise<Outcome<{ count: number; questionIds: readonly string[] }>> {
  await requirePermission({ questionBank: ["create"] });
  return write((api) => api["bank.add"](input));
}

// Replaces the body and tags of one of the teacher's questions (`question.id` names it).
export async function updateBankQuestion(input: {
  question: Question;
  subject: string | null;
  subjectArea: SubjectArea | null;
}): Promise<Outcome<BankQuestion>> {
  await requirePermission({ questionBank: ["update"] });
  return write((api) => api["bank.update"](input));
}

export async function deleteBankQuestions(questionIds: readonly string[]): Promise<Outcome<{ count: number }>> {
  await requirePermission({ questionBank: ["delete"] });
  return write((api) => api["bank.delete"]({ questionIds }));
}

// Sets the subject, subject area and/or topic of many questions; a key left out stays, null clears.
export async function retagBankQuestions(input: {
  questionIds: readonly string[];
  subject?: string | null;
  subjectArea?: SubjectArea | null;
  topic?: string | null;
}): Promise<Outcome<{ count: number }>> {
  await requirePermission({ questionBank: ["update"] });
  return write((api) => api["bank.retag"](input));
}

// Renames a subject or topic across the teacher's questions (merging into a name that exists).
export async function renameBankTag(input: {
  kind: "subject" | "topic";
  from: string;
  to: string;
}): Promise<Outcome<{ count: number }>> {
  await requirePermission({ questionBank: ["update"] });
  return write((api) => api["bank.renameTag"](input));
}

// Shares by subject, topic or question ids with teachers by email.
export async function shareBank(input: {
  recipients: readonly string[];
  scope: "subject" | "topic" | "question";
  subject?: string;
  topic?: string;
  questionIds?: readonly string[];
}): Promise<Outcome<{ count: number }>> {
  await requirePermission({ questionBank: ["share"] });
  return write((api) => api["bank.share"](input));
}

// What the teacher shares and what is shared with them.
export async function listBankShares(): Promise<{ shared: readonly BankShare[]; withMe: readonly BankShare[] }> {
  await requirePermission({ questionBank: ["read"] });
  return read((api) => api["bank.shares"]());
}

export async function unshareBank(shareId: string): Promise<Outcome<void>> {
  await requirePermission({ questionBank: ["share"] });
  return write((api) => api["bank.unshare"]({ shareId }));
}

// Copies visible questions into the teacher's own bank.
export async function copyToBank(questionIds: readonly string[]): Promise<Outcome<{ count: number; questionIds: readonly string[] }>> {
  await requirePermission({ questionBank: ["create"] });
  return write((api) => api["bank.copy"]({ questionIds }));
}
