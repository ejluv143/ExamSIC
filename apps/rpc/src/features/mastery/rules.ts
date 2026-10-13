// Mastery mode: a self-paced queue per attempt. Each answer is graded at once; a wrong answer goes back into the
// queue (after a few other questions) until it is answered correctly or the retry limit is used up. The queue is
// stored on the attempt, so a reload (or another browser) resumes it exactly.
import { masteryRequeueGap, type MasterySettings } from "@examinus/contract";
import type { QuizSessionItem } from "../../database/schemas/index.ts";

// A question's own stats once its try has been graded. `score` null: waits for the teacher (accepted once).
export type TryResult = { score: number | null };

// What the queue looks like after the first question in it was tried. `tries` counts this try. A mastered or
// manual question leaves; a miss goes back `gap` places down, or to the end when fewer are left, until the limit.
export function advanceQueue(
  queue: readonly string[],
  result: TryResult,
  tries: number,
  retryLimit: number,
  gap: number = masteryRequeueGap,
): { queue: string[]; returns: boolean; final: boolean } {
  const [head, ...rest] = queue;
  if (head === undefined) return { queue: [], returns: false, final: false };
  if (result.score === null || result.score >= 1) return { queue: rest, returns: false, final: false };
  if (tries >= retryLimit) return { queue: rest, returns: false, final: true };
  rest.splice(Math.min(gap, rest.length), 0, head);
  return { queue: rest, returns: true, final: false };
}

export const settingsOf = (session: QuizSessionItem): MasterySettings =>
  session.mastery ?? { retryLimit: 3, targetPercent: null, showCorrectAnswer: true };
