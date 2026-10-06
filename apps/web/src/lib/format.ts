import type { AssessmentKind, AssessmentStatus, ExamPeriod, QuestionType, Semester } from "./types";

const TZ = "Asia/Manila";

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(iso));
}

export const questionTypeLabel: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  identification: "Identification",
  fill_in_the_blank: "Fill in the blanks",
  enumeration: "Enumeration",
  numeric: "Numeric",
  essay: "Essay",
};

export const statusLabel: Record<AssessmentStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  open: "Open",
  closed: "Closed",
};

export const statusTone = {
  draft: "neutral",
  scheduled: "info",
  open: "success",
  closed: "warning",
} as const satisfies Record<AssessmentStatus, string>;

export function fullName(s: { firstName: string; lastName: string }) {
  return `${s.lastName}, ${s.firstName}`;
}

export const periodLabel: Record<ExamPeriod, string> = {
  prelim: "Prelim",
  midterm: "Midterm",
  prefinal: "Pre-final",
  final: "Final",
};

// The big heading on the paper, e.g. "Midterm Examination" or "Quiz".
export function paperTitle(kind: AssessmentKind, period: ExamPeriod | null): string {
  const noun = kind === "exam" ? "Examination" : "Quiz";
  if (!period) return noun;
  return `${period === "prelim" ? "Preliminary" : periodLabel[period]} ${noun}`;
}

export const semesterLabel: Record<Semester, string> = {
  first: "First Semester",
  second: "Second Semester",
  summer: "Summer",
};

// "October 5-9, 2026", "Sept 30 - October 2, 2026" or "October 5, 2026", in Manila time.
export function formatDateRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "";
  const parts = (iso: string) => {
    const p = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TZ })
      .formatToParts(new Date(iso));
    const get = (t: string) => p.find((x) => x.type === t)!.value;
    return { month: get("month"), day: get("day"), year: get("year") };
  };
  const a = parts(startIso);
  const b = endIso ? parts(endIso) : a;
  if (a.year !== b.year) return `${a.month} ${a.day}, ${a.year} - ${b.month} ${b.day}, ${b.year}`;
  if (a.month !== b.month) return `${a.month} ${a.day} - ${b.month} ${b.day}, ${b.year}`;
  if (a.day !== b.day) return `${a.month} ${a.day}-${b.day}, ${a.year}`;
  return `${a.month} ${a.day}, ${a.year}`;
}
