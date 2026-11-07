import type { ClozeInput } from "@examinus/domain/kinds/blank";
import type { ExamPeriod, Semester } from "@examinus/domain/quiz";
import type { QuizStatus } from "@examinus/copy/status";

// How the printed paper is titled: "Quiz", or "<period> Examination" for exams.
export type PaperKind = "quiz" | "exam";

export const clozeInputLabel: Record<ClozeInput, string> = {
  typed: "Typed",
  dropdown: "Dropdown",
  bank: "Word bank",
};

export const statusTone = {
  draft: "neutral",
  scheduled: "info",
  lobby: "info",
  running: "success",
  ended: "warning",
} as const satisfies Record<QuizStatus, string>;

export function fullName(s: { firstName: string; lastName: string }) {
  return `${s.lastName}, ${s.firstName}`;
}

// A name safe to put in a download's file name: letters, digits and dashes.
export function fileSlug(text: string): string {
  return text.normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "export";
}

export const periodLabel: Record<ExamPeriod, string> = {
  prelim: "Prelim",
  midterm: "Midterm",
  prefinal: "Pre-final",
  final: "Final",
};

// The big heading on the paper, e.g. "Midterm Examination" or "Quiz".
export function paperTitle(kind: PaperKind, period: ExamPeriod | null): string {
  const noun = kind === "exam" ? "Examination" : "Quiz";
  if (!period) return noun;
  return `${period === "prelim" ? "Preliminary" : periodLabel[period]} ${noun}`;
}

export const semesterLabel: Record<Semester, string> = {
  first: "First Semester",
  second: "Second Semester",
  summer: "Summer",
};
