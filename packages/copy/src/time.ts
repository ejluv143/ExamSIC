// Dates and times as people read them. Every schedule is Manila time (UTC+8, no daylight saving), the school's.
export const manilaZone = "Asia/Manila";
const manilaOffset = "+08:00";
const manilaOffsetMs = 8 * 3600_000;

const format = (options: Intl.DateTimeFormatOptions, iso: string) =>
  new Intl.DateTimeFormat("en-PH", { ...options, timeZone: manilaZone }).format(new Date(iso));

// "Nov 5, 8:30 AM"
export const formatDateTime = (iso: string | null) =>
  iso ? format({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, iso) : "—";

// "Nov 5, 2026"
export const formatDate = (iso: string | null) =>
  iso ? format({ month: "short", day: "numeric", year: "numeric" }, iso) : "—";

// Calendar day, e.g. "Wednesday, Oct 8". Also usable as a key for grouping by day.
export const formatDay = (iso: string) => format({ weekday: "long", month: "short", day: "numeric" }, iso);

// "8:30 AM"
export const formatTime = (iso: string) => format({ hour: "numeric", minute: "2-digit" }, iso);

// "8:30:05 AM", for logs where the second matters.
export const formatTimeSeconds = (iso: string) => format({ hour: "numeric", minute: "2-digit", second: "2-digit" }, iso);

// "Nov 5, 2026, 8:30:05 AM", for audit trails.
export const formatStamp = (iso: string) =>
  format({ month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }, iso);

// "October 2026"
export const formatMonthYear = (iso: string) => format({ month: "long", year: "numeric" }, iso);

// "Wednesday"
export const formatWeekday = (iso: string) => format({ weekday: "long" }, iso);

// "Oct 8"
export const formatMonthDay = (iso: string) => format({ month: "short", day: "numeric" }, iso);

// A date's short month and day of the month, e.g. { month: "Oct", day: "8" }, for a calendar tile.
export function dateParts(iso: string): { month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: manilaZone }).formatToParts(new Date(iso));
  return { month: parts.find((p) => p.type === "month")?.value ?? "", day: parts.find((p) => p.type === "day")?.value ?? "" };
}

// "Wed, Oct 8" for a meeting date (YYYY-MM-DD), which is a calendar date, not an instant.
export function formatMeetingDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

// "Good morning", "Good afternoon" or "Good evening", by the hour in Manila.
export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: manilaZone }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

// "October 5-9, 2026", "Sept 30 - October 2, 2026" or "October 5, 2026".
export function formatDateRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "";
  const parts = (iso: string) => {
    const p = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: manilaZone }).formatToParts(new Date(iso));
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

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
type Unit = "year" | "month" | "week" | "day" | "hour" | "minute";
const steps: [Unit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

// "2 days ago", "in 3 hours", "just now".
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  for (const [unit, size] of steps)
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "just now";
}

const shortUnits: Record<Unit, string> = { year: "y", month: "mo", week: "w", day: "d", hour: "h", minute: "m" };

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

// --- Manila wall time ---
// A calendar date (YYYY-MM-DD) is held as its noon in Manila, so formatting it never slips to a neighbouring day.
export const manilaNoon = (date: string) => `${date}T12:00:00${manilaOffset}`;

// <input type="datetime-local"> works in wall time: "2026-11-06T09:30" for an instant, read in Manila.
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + manilaOffsetMs).toISOString().slice(0, 16);
}

// The instant for a Manila wall time like "2026-11-06T09:30".
export function fromLocalInput(value: string): string | null {
  return value ? `${value}:00${manilaOffset}` : null;
}

// A datetime-local value moved by `minutes` (both in Manila wall time).
export function shiftLocal(local: string, minutes: number): string {
  return toLocalInput(new Date(new Date(`${local}:00${manilaOffset}`).getTime() + minutes * 60_000).toISOString());
}
