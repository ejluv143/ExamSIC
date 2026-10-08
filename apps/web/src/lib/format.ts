import type { BlankMode, ClozeInput, ExamPeriod, QuestionType, Semester } from "@examora/contract";
import type { PaperKind, QuizStatus } from "./types";

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

// Calendar day in Manila, e.g. "Wednesday, Oct 8". Also usable as a key for grouping by day.
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

// "2 days ago", "in 3 hours", "now".
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  for (const [unit, size] of steps)
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "just now";
}

export const questionTypeLabel: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  blank: "Blank",
  matching: "Matching",
  enumeration: "Enumeration",
  numeric: "Numeric",
  essay: "Essay",
  drawing: "Drawing",
  code: "Code",
  sql: "SQL query",
  categorization: "Categorization",
  ordering: "Re-ordering",
  hotspot: "Hotspot",
};

// A question's type for display; blank questions show their mode.
export const questionLabel = (q: { type: QuestionType; mode?: BlankMode }) =>
  q.type === "blank" && q.mode ? blankModeLabel[q.mode] : questionTypeLabel[q.type];

export const blankModeLabel: Record<BlankMode, string> = {
  fill: "Identification / Fill in the blank",
  cloze: "Cloze",
};

export const clozeInputLabel: Record<ClozeInput, string> = {
  typed: "Typed",
  dropdown: "Dropdown",
  bank: "Word bank",
};

export const statusLabel: Record<QuizStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  lobby: "Lobby",
  running: "Open",
  ended: "Ended",
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
