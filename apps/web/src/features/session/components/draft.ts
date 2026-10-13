import { answerMap, questionsOf } from "@/features/session/attempt-view";
import type { DraftRow } from "@/components/question-kinds/views/review";
import type { AttemptDetail } from "@examinus/contract/session";
import { encodeDrawingFeedback, parseDrawingFeedback } from "@examinus/domain/drawing";
import type { Question } from "@examinus/domain/question";
import type { Answer } from "@examinus/domain/quiz";
import { questionScore, reviewableTypes } from "@examinus/domain/scoring";

export type Draft = Record<string, DraftRow>;
export type Change = { q: Question; manualScore: number | null; feedback: string | null; scoreChanged: boolean };

// What the answer earned by itself, in points. null: nothing has checked it yet (essays, unrun code).
export const autoPoints = (q: Question, answer: Answer | undefined) =>
  questionScore(q, { autoScore: answer?.autoScore ?? null, manualScore: null });

// The questions of an attempt a teacher can re-score.
export const reviewableOf = (all: readonly Question[], d: AttemptDetail) =>
  questionsOf(all, d).filter((q) => reviewableTypes.includes(q.type));

export function draftFor(questions: Question[], d: AttemptDetail | undefined): Draft {
  const answers = d && answerMap(d);
  return Object.fromEntries(
    questions.map((q) => {
      const answer = answers?.get(q.id);
      // A drawing's feedback holds the comment and the marks drawn on the picture.
      const drawn = q.type === "drawing" ? parseDrawingFeedback(answer?.feedback) : null;
      return [
        q.id,
        {
          points: questionScore(q, answer)?.toString() ?? "",
          feedback: drawn ? drawn.text : (answer?.feedback ?? ""),
          marks: drawn ? [...drawn.marks] : [],
        },
      ];
    }),
  );
}

// Worth a look: every essay, any answer the key didn't fully accept, and anything already re-scored.
export function needsLook(q: Question, answer: Answer | undefined) {
  if (q.type === "essay" || q.type === "drawing" || answer?.manualScore != null) return true;
  return (autoPoints(q, answer) ?? 0) < q.points;
}

// What the teacher changed in the draft, or the first score that isn't valid.
export function changesOf(
  reviewable: readonly Question[],
  all: readonly Question[],
  attempt: AttemptDetail,
  draft: Draft,
): { changes: Change[] } | { error: string } {
  const answers = answerMap(attempt);
  const changes: Change[] = [];
  for (const q of reviewable) {
    const raw = draft[q.id].points.trim();
    const points = Number(raw);
    if (raw === "" || Number.isNaN(points) || points < 0 || points > q.points) {
      return { error: `Question ${all.indexOf(q) + 1}: enter a score from 0 to ${q.points}.` };
    }
    const answer = answers.get(q.id);
    // Only keep scores that differ from the automatic one, so a later key fix still applies.
    const manualScore = q.type === "essay" || q.type === "drawing" || points !== autoPoints(q, answer) ? points : null;
    // A drawing's feedback is its comment and marks in one string; plain text saved earlier counts as a comment.
    const feedback =
      q.type === "drawing"
        ? encodeDrawingFeedback({ text: draft[q.id].feedback.trim(), marks: draft[q.id].marks })
        : draft[q.id].feedback.trim() || null;
    const before =
      q.type === "drawing" ? encodeDrawingFeedback(parseDrawingFeedback(answer?.feedback)) : (answer?.feedback ?? null);
    if (manualScore !== (answer?.manualScore ?? null) || feedback !== before) {
      // The score the student sees changes only when the points do, not when a manual score just repeats the automatic one.
      const scoreChanged = questionScore(q, { autoScore: answer?.autoScore ?? null, manualScore }) !== questionScore(q, answer);
      changes.push({ q, manualScore, feedback, scoreChanged });
    }
  }
  return { changes };
}
