import type { Question } from "@examinus/domain/question";
import { partHeading as partTitle, partTotals, type EditorPart, type EditorQuiz } from "@/features/quiz/quiz-editor";
import type { Block } from "./layout";
import { plural } from "@/components/question-kinds/shared/print-parts";

export type Printed = {
  part: EditorPart;
  // 1-based, among the parts that print.
  number: number;
  // A pool prints as many questions as a student draws.
  questions: readonly Question[];
  // The number of the part's first question; numbering runs on across parts.
  start: number;
};

export function printedParts(a: EditorQuiz): Printed[] {
  const out: Printed[] = [];
  let start = 1;
  for (const part of a.parts) {
    const questions = part.poolSize === null ? part.questions : part.questions.slice(0, part.poolSize);
    if (questions.length === 0) continue;
    out.push({ part, number: out.length + 1, questions, start });
    start += questions.length;
  }
  return out;
}

export function partHeading(p: Printed, space: number): Block {
  return {
    space,
    keepWithNext: true,
    node: (
      <p style={{ fontWeight: 700 }}>
        {partTitle(p.part.title, p.number)} ({plural(partTotals({ ...p.part, questions: p.questions, poolSize: null }).totalPoints, "pt")})
      </p>
    ),
  };
}
