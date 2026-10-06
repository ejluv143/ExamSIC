import { blankAnswers, splitAlternatives } from "./blanks";
import { parseNumber } from "./math";
import type { AnswerValue, Question, Submission } from "./types";

function matches(given: string, accepted: string[], caseSensitive: boolean): boolean {
  const g = caseSensitive ? given.trim() : given.trim().toLowerCase();
  return g !== "" && accepted.some((a) => (caseSensitive ? a.trim() : a.trim().toLowerCase()) === g);
}

// Equal share of the points per part, rounded to hundredths.
function share(points: number, correct: number, total: number): number {
  return total === 0 ? 0 : Math.round(((points * correct) / total) * 100) / 100;
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
    case "fill_in_the_blank": {
      const blanks = blankAnswers(question.prompt);
      const given = Array.isArray(answer) ? answer : [];
      const correct = blanks.filter((accepted, i) => matches(given[i] ?? "", accepted, question.caseSensitive)).length;
      return share(question.points, correct, blanks.length);
    }
    case "enumeration": {
      const items = question.items.map(splitAlternatives);
      const given = Array.isArray(answer) ? answer : [];
      let correct = 0;
      if (question.orderMatters) {
        correct = items.filter((accepted, i) => matches(given[i] ?? "", accepted, question.caseSensitive)).length;
      } else {
        // Each item can be credited once, so repeating an answer doesn't score twice.
        const unused = [...items];
        for (const g of given) {
          const i = unused.findIndex((accepted) => matches(g, accepted, question.caseSensitive));
          if (i !== -1) {
            unused.splice(i, 1);
            correct++;
          }
        }
      }
      return share(question.points, correct, items.length);
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

export function questionScore(question: Question, submission: Submission): number | null {
  if (question.type === "essay") return submission.manualScores[question.id] ?? null;
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
