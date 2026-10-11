// Durations for the session report: "34s", "1m 08s", "1h 05m".
export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

// "+12s" / "-8s" against a reference time.
export function formatDelta(ms: number): string {
  return `${ms < 0 ? "-" : "+"}${formatMs(Math.abs(ms))}`;
}

// The anchor the timeline links to and the review list scrolls to; `number` is 1-based.
export const questionAnchor = (number: number) => `question-${number}`;

// Question types the practice page can check in the browser; essays and drawings need a teacher, code and SQL a runner.
export const practiceTypes: ReadonlySet<string> = new Set(["multiple_choice", "true_false", "blank", "enumeration", "matching", "categorization", "ordering", "hotspot"]);
