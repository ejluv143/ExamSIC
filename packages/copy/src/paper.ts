// How a paper names its parts and points, and why a student's attempt ended.
import type { StudentEndReason } from "@examinus/contract/live";

// Roman numeral for "Part IV".
export function roman(n: number): string {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, symbol] of table) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
}

// "Part II – Matching" from the part's number and title. A title that already starts with "Part …" is kept as
// it is, so "Part I" or "Part I – Basics" never prints as "Part I – Part I".
export function partHeading(title: string, number: number): string {
  const name = title.trim();
  if (/^part\s+([ivxlc]+|\d+)\b/i.test(name)) return name;
  return name ? `Part ${roman(number)} – ${name}` : `Part ${roman(number)}`;
}

// "1 pt", "5 pts"
export const pointsLabel = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

export const endedText: Record<StudentEndReason, string> = {
  teacher: "Your teacher submitted your attempt.",
  session_ended: "Your teacher ended the session, so your attempt was submitted.",
  time_up: "Time ran out, so your attempt was submitted.",
};
