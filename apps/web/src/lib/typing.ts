// Typing replay for code and SQL answers: every edit the student made, so the teacher can watch the
// answer being written and spot code that appeared all at once or was "typed" by a tool.

import type { TypingEdit } from "@examora/contract";

export type { TypingEdit };

export const maxEdits = 20_000;

export function applyEdit(text: string, [, from, to, insert]: TypingEdit): string {
  return text.slice(0, from) + insert + text.slice(to);
}

export function replay(initial: string, edits: readonly TypingEdit[], count = edits.length): string {
  let text = initial;
  for (let i = 0; i < count; i++) text = applyEdit(text, edits[i]);
  return text;
}

// More characters than this appearing in one edit isn't typing (auto-indent and bracket closing stay well below).
export const bulkChars = 30;
// Sustained typing faster than this many characters a second, for a long run, isn't a person.
const robotCharsPerSecond = 20;
const robotRunLength = 40;
const idleMs = 2 * 60_000;

export type TypingFlag = "bulk_insert" | "robot_typing" | "replay_mismatch";

export const typingFlagLabel: Record<TypingFlag, string> = {
  bulk_insert: "Large code appeared at once",
  robot_typing: "Typed faster than a person can",
  replay_mismatch: "Typing history doesn't match the submitted answer",
};

export type TypingAnalysis = {
  edits: number;
  // Characters typed one at a time, against the length of the final answer.
  typedChars: number;
  finalLength: number;
  largestInsert: { chars: number; at: number } | null;
  bulkInserts: { chars: number; at: number; index: number }[];
  // Runs of single-character edits at robotic speed.
  robotRuns: { start: number; end: number; chars: number; charsPerSecond: number }[];
  idleGaps: number;
  activeMs: number;
  matchesFinal: boolean;
  flags: TypingFlag[];
};

export function analyzeTyping(initial: string, edits: readonly TypingEdit[], final: string): TypingAnalysis {
  let typedChars = 0;
  let largest: TypingAnalysis["largestInsert"] = null;
  const bulkInserts: TypingAnalysis["bulkInserts"] = [];
  const robotRuns: TypingAnalysis["robotRuns"] = [];
  let idleGaps = 0;
  let activeMs = 0;
  let run: number[] = [];

  const closeRun = () => {
    if (run.length >= robotRunLength) {
      const start = edits[run[0]][0];
      const end = edits[run[run.length - 1]][0];
      const cps = (run.length - 1) / Math.max(0.001, (end - start) / 1000);
      if (cps >= robotCharsPerSecond) robotRuns.push({ start, end, chars: run.length, charsPerSecond: Math.round(cps) });
    }
    run = [];
  };

  edits.forEach(([t, , , insert], i) => {
    const gap = i === 0 ? 0 : t - edits[i - 1][0];
    if (gap > idleMs) idleGaps++;
    else activeMs += gap;
    if (insert.length === 1) {
      typedChars++;
      run.push(i);
    } else closeRun();
    // Whitespace-only inserts are auto-indentation, not pasted code.
    const meaningful = insert.replace(/\s+/g, "").length;
    if (!largest || insert.length > largest.chars) largest = { chars: insert.length, at: t };
    if (meaningful > bulkChars) bulkInserts.push({ chars: insert.length, at: t, index: i });
  });
  closeRun();

  const matchesFinal = replay(initial, edits) === final;
  const flags: TypingFlag[] = [];
  if (bulkInserts.length) flags.push("bulk_insert");
  if (robotRuns.length) flags.push("robot_typing");
  // Only meaningful when there's a history to check: an untouched answer has none.
  if (!matchesFinal && (edits.length > 0 || final.trim() !== initial.trim())) flags.push("replay_mismatch");

  return {
    edits: edits.length,
    typedChars,
    finalLength: final.length,
    largestInsert: largest,
    bulkInserts,
    robotRuns,
    idleGaps,
    activeMs,
    matchesFinal,
    flags,
  };
}
