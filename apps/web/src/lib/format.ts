import type { ClozeInput } from "@examinus/domain/kinds/blank";
import type { QuestionType } from "@examinus/domain/question";
import type { ExamPeriod, Semester, SessionStatus } from "@examinus/domain/quiz";

// How the printed paper is titled: "Quiz", or "<period> Examination" for exams.
export type PaperKind = "quiz" | "exam";

// What a quiz shows in the teacher's lists: its latest session's status, or "draft" when it has no session.
export type QuizStatus = SessionStatus | "draft";

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

// A date's short month and day of the month in Manila, e.g. { month: "Oct", day: "8" }, for a calendar tile.
export function dateParts(iso: string): { month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: TZ }).formatToParts(new Date(iso));
  return { month: parts.find((p) => p.type === "month")?.value ?? "", day: parts.find((p) => p.type === "day")?.value ?? "" };
}

// "Good morning", "Good afternoon" or "Good evening", by the hour in Manila.
export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const steps: [ShortUnit, number][] = [
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

type ShortUnit = "year" | "month" | "week" | "day" | "hour" | "minute";
const shortUnits: Record<ShortUnit, string> = { year: "y", month: "mo", week: "w", day: "d", hour: "h", minute: "m" };

// "6d ago", "in 3h", "just now": for tight places like card footers.
export function formatRelativeShort(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) < size) continue;
    const n = Math.round(Math.abs(seconds) / size);
    return seconds < 0 ? `${n}${shortUnits[unit]} ago` : `in ${n}${shortUnits[unit]}`;
  }
  return "just now";
}

export const questionTypeLabel: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  blank: "Identification",
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

// A question's type for display.
export const questionLabel = (q: { type: QuestionType }) => questionTypeLabel[q.type];

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
