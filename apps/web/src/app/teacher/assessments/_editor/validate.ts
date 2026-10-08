import { markdownImages } from "@examora/contract";
import { validateQuestion } from "@/lib/question-defaults";
import { allQuestions, partName, type EditorQuiz } from "@/lib/quiz-editor";

// What is wrong with the quiz, before it is saved: one message per problem.
export function validateQuiz(a: EditorQuiz): string[] {
  const problems: string[] = [];
  if (!a.title.trim()) problems.push("Add a title.");
  if (markdownImages(a.description).some((m) => !m.alt.trim()))
    problems.push("The quiz instructions have an image without alt text. Describe it, or remove it.");
  const total = allQuestions(a).length;
  if (total === 0) problems.push("Add at least one question.");
  let number = 0;
  a.parts.forEach((part, i) => {
    const name = partName(part, i);
    if (!part.title.trim()) problems.push(`Part ${i + 1} needs a title.`);
    if (markdownImages(part.instructions).some((m) => !m.alt.trim()))
      problems.push(`${name}: the instructions have an image without alt text. Describe it, or remove it.`);
    if (part.questions.length === 0 && total > 0) problems.push(`${name} has no questions. Add one or delete the part.`);
    if (part.poolSize !== null) {
      if (!Number.isInteger(part.poolSize) || part.poolSize < 1)
        problems.push(`${name}: a pool must draw at least 1 question.`);
      else if (part.poolSize > part.questions.length)
        problems.push(`${name} draws ${part.poolSize} questions but has only ${part.questions.length}.`);
      const points = [...new Set(part.questions.map((q) => q.points))];
      if (points.length > 1)
        problems.push(`${name} is a pool, so all its questions need equal points (it has ${points.join(", ")}).`);
    }
    for (const q of part.questions) {
      number += 1;
      const problem = validateQuestion(q);
      if (problem) problems.push(`Question ${number} (${name}) ${problem}`);
    }
  });
  return problems;
}

// The first thing wrong with each question that has a problem, by question id: for the warning dots.
export function questionProblems(a: EditorQuiz): Map<string, string> {
  const found = new Map<string, string>();
  for (const q of allQuestions(a)) {
    const problem = validateQuestion(q);
    if (problem) found.set(q.id, problem);
  }
  return found;
}
