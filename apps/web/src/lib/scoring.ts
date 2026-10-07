import { blankAnswers, splitAlternatives } from "./blanks";
import { parseNumber } from "./math";
import type { AnswerValue, Question, QuestionType, Submission } from "./types";

// Typed answers a teacher may want to check by hand: essays always need it, and the others can be
// re-scored when the key missed a valid answer (a misspelling, a synonym, a different wording).
export const reviewableTypes: QuestionType[] = ["identification", "fill_in_the_blank", "enumeration", "essay"];

function matches(given: string, accepted: string[], caseSensitive: boolean): boolean {
  const g = caseSensitive ? given.trim() : given.trim().toLowerCase();
  return g !== "" && accepted.some((a) => (caseSensitive ? a.trim() : a.trim().toLowerCase()) === g);
}

// Equal share of the points per part, rounded to hundredths.
function share(points: number, correct: number, total: number): number {
  return total === 0 ? 0 : Math.round(((points * correct) / total) * 100) / 100;
}

export type PartResult = { given: string; correct: boolean };

// Each blank or listed item with whether it matched the key, in the order the student wrote them.
export function partResults(question: Question, answer: AnswerValue): PartResult[] | null {
  const given = Array.isArray(answer) ? answer : [];
  if (question.type === "fill_in_the_blank") {
    return blankAnswers(question.prompt).map((accepted, i) => ({
      given: given[i] ?? "",
      correct: matches(given[i] ?? "", accepted, question.caseSensitive),
    }));
  }
  if (question.type !== "enumeration") return null;
  const items = question.items.map(splitAlternatives);
  if (question.orderMatters) {
    return items.map((accepted, i) => ({
      given: given[i] ?? "",
      correct: matches(given[i] ?? "", accepted, question.caseSensitive),
    }));
  }
  // Each item can be credited once, so repeating an answer doesn't score twice.
  const unused = [...items];
  return items.map((_, i) => {
    const g = given[i] ?? "";
    const hit = unused.findIndex((accepted) => matches(g, accepted, question.caseSensitive));
    if (hit !== -1) unused.splice(hit, 1);
    return { given: g, correct: hit !== -1 };
  });
}

export function maxScore(questions: Question[]): number {
  return questions.reduce((sum, q) => sum + q.points, 0);
}

// Points for one auto-graded answer; null means it needs a teacher (essays).
export function autoScore(question: Question, answer: AnswerValue): number | null {
  switch (question.type) {
    case "multiple_choice":
      return answer === question.correctChoiceId ? question.points : 0;
    case "true_false":
      return answer === question.answer ? question.points : 0;
    case "identification":
      return typeof answer === "string" && matches(answer, question.acceptedAnswers, question.caseSensitive)
        ? question.points
        : 0;
    case "fill_in_the_blank":
    case "enumeration": {
      const parts = partResults(question, answer)!;
      return share(question.points, parts.filter((p) => p.correct).length, parts.length);
    }
    case "numeric": {
      const given = typeof answer === "string" ? parseNumber(answer) : null;
      // A little slack so 0.1 + 0.2 style rounding never costs a point.
      return given !== null && Math.abs(given - question.answer) <= question.tolerance + 1e-9 ? question.points : 0;
    }
    case "essay":
      return null;
  }
}

// A teacher's score wins over the automatic one; essays have no score until the teacher gives one.
export function questionScore(question: Question, submission: Submission): number | null {
  const manual = submission.manualScores[question.id];
  if (manual !== undefined) return manual;
  return autoScore(question, submission.answers[question.id] ?? null);
}

export function submissionScore(questions: Question[], submission: Submission) {
  let score = 0;
  let ungraded = 0;
  // Points of the questions already scored, so a provisional percentage ignores ungraded essays.
  let gradedMax = 0;
  for (const q of questions) {
    const s = questionScore(q, submission);
    if (s === null) ungraded++;
    else {
      score += s;
      gradedMax += q.points;
    }
  }
  return { score, max: maxScore(questions), gradedMax, ungraded };
}

export function percent(score: number, max: number): number {
  return max === 0 ? 0 : Math.round((score / max) * 100);
}
