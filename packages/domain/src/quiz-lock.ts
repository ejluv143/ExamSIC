// A quiz students have taken is locked: its grades and the order of their papers are computed from the quiz as
// it is now (scores aren't stored), so nothing they depend on may change. Wording may: question prompts and
// topics, part titles and instructions, the quiz's own details and the printed paper.
import type { Question } from "./question.ts";
import type { QuizSettings } from "./quiz.ts";

type LockedPart = {
  id: string;
  shuffleQuestions: boolean;
  poolSize: number | null;
  questions: readonly Question[];
};

// The same JSON whatever order the keys came in; undefined values are left out, as JSON.stringify does.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, canonical(v)]));
};

// What grades and paper order depend on: the shuffle settings, the parts and questions (ids and order), and
// every question field besides its prompt and topic (type, points, answers, choices).
export function gradedShape(settings: QuizSettings, parts: readonly LockedPart[]): string {
  return JSON.stringify(
    canonical({
      settings,
      parts: parts.map((p) => ({
        id: p.id,
        shuffleQuestions: p.shuffleQuestions,
        poolSize: p.poolSize,
        questions: p.questions.map(({ prompt: _prompt, topic: _topic, ...graded }) => graded),
      })),
    }),
  );
}

type LockableQuiz = { settings: QuizSettings; parts: readonly LockedPart[] };

// True when saving `after` over `before` would change a grade or a paper's order.
export const changesGrading = (before: LockableQuiz, after: LockableQuiz): boolean =>
  gradedShape(before.settings, before.parts) !== gradedShape(after.settings, after.parts);

export const quizInUseMessage =
  "Students have already taken this quiz, so its questions, answers, points, parts and shuffle settings can't " +
  "change: their grades would change too. You can still fix the wording of questions, part titles and " +
  "instructions, the quiz details and the printed paper. To change the rest, duplicate the quiz and edit the copy.";
