import type { Paper } from "@examinus/contract/attempt";
import type { StudentQuestion } from "@examinus/domain/question";
import { answerGiven, answerSummary, moveRefusal } from "@examinus/domain/review";
import type { NavItem } from "../question-navigator";
import type { Answers } from "./types";

// Every question of the paper for the overview and the review screen. One question at a time, the others come
// from the server's `review`; the one on screen follows what the student types. `refusal` is why the student can't
// open question `to` (0-based) from here; never on a paper on one page.
export function buildNavItems({
  paper,
  questions,
  answers,
  marks,
  progress,
  qSecondsLeft,
}: {
  paper: Paper;
  questions: readonly StudentQuestion[];
  answers: Answers;
  marks: Record<string, boolean>;
  progress: Paper["progress"] | null;
  qSecondsLeft: number | null;
}) {
  const sequential = progress !== null;
  const onScreen = sequential ? questions[0] : undefined;
  const baseItems: Omit<NavItem, "blocked">[] = sequential
    ? paper.review.map((r, i) => {
        const q = onScreen?.id === r.questionId ? onScreen : undefined;
        return {
          questionId: r.questionId,
          number: i + 1,
          answered: q ? answerGiven(q, answers[q.id]) : r.answered,
          marked: marks[r.questionId] ?? false,
          closed: r.closed,
          current: i === progress?.index,
          summary: q ? answerSummary(q, answers[q.id]) : r.summary,
        };
      })
    : questions.map((q, i) => ({
        questionId: q.id,
        number: i + 1,
        answered: answerGiven(q, answers[q.id]),
        marked: marks[q.id] ?? false,
        closed: false,
        current: false,
        summary: answerSummary(q, answers[q.id]),
      }));
  const here = baseItems.find((i) => i.current);
  const refusal = (to: number) =>
    progress === null
      ? null
      : moveRefusal({
          navigation: paper.session.navigation,
          from: progress.index,
          to,
          furthest: progress.furthest,
          total: baseItems.length,
          target: { marked: baseItems[to]?.marked ?? false, closed: baseItems[to]?.closed ?? false },
          current: { answered: here?.answered ?? false, marked: here?.marked ?? false, timeUp: qSecondsLeft === 0 },
        });
  const items: NavItem[] = baseItems.map((item, i) => ({ ...item, blocked: refusal(i) }));
  return { items, refusal };
}
