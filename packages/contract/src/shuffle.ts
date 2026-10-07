// Seeded shuffling: the same attempt seed always gives the same paper, so the order survives a reload and
// the teacher sees exactly what a student saw. Answers are keyed by question id, so order never affects scoring.
import type { Question } from "./question.ts";
import type { QuizSettings } from "./quiz.ts";

// A small, fast, deterministic generator returning numbers in [0, 1).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The generator for the lists inside one question (cloze dropdowns and word bank), derived from the attempt's
// seed and the question's id so it doesn't depend on which other questions were drawn. undefined: the quiz
// doesn't shuffle choices.
export function paperRandom(settings: QuizSettings, seed: number, questionId: string): (() => number) | undefined {
  if (!settings.shuffleChoices) return undefined;
  let h = 2166136261;
  for (let i = 0; i < questionId.length; i++) h = Math.imul(h ^ questionId.charCodeAt(i), 16777619);
  return mulberry32((h ^ seed) >>> 0);
}

// Fisher-Yates on a copy.
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

type OrderablePart = { shuffleQuestions: boolean; poolSize: number | null; questions: readonly Question[] };

// The parts and questions one attempt gets, in the order it sees them: parts (if the quiz shuffles them),
// then each part's questions (drawing `poolSize` of them when set), then multiple-choice choices and the right
// column of matching questions. Cloze dropdowns and word banks are shuffled by `paperRandom` when the student's
// question is made.
export function orderForAttempt<P extends OrderablePart>(
  settings: QuizSettings,
  parts: readonly P[],
  seed: number,
): (Omit<P, "questions"> & { questions: Question[] })[] {
  const random = mulberry32(seed);
  const ordered = settings.shuffleParts ? shuffled(parts, random) : [...parts];
  return ordered.map((part) => {
    let questions: Question[] = [...part.questions];
    const shuffle = settings.shuffleQuestions || part.shuffleQuestions;
    if (part.poolSize !== null && part.poolSize < questions.length) {
      const drawn = new Set(shuffled(questions, random).slice(0, part.poolSize));
      questions = questions.filter((q) => drawn.has(q));
    }
    if (shuffle) questions = shuffled(questions, random);
    if (settings.shuffleChoices) {
      questions = questions.map((q) => {
        if (q.type === "multiple_choice") return { ...q, choices: shuffled(q.choices, random) };
        if (q.type === "matching") return { ...q, right: shuffled(q.right, random) };
        return q;
      });
    }
    return { ...part, questions };
  });
}

// How many questions and points a student's paper has, counting a pool as its draw size
// (every question in a pool has the same points).
export function quizTotals(parts: readonly { poolSize: number | null; questions: readonly { points: number }[] }[]) {
  let questionCount = 0;
  let totalPoints = 0;
  for (const part of parts) {
    const n = part.poolSize === null ? part.questions.length : Math.min(part.poolSize, part.questions.length);
    questionCount += n;
    totalPoints += part.poolSize === null ? part.questions.reduce((sum, q) => sum + q.points, 0) : n * (part.questions[0]?.points ?? 0);
  }
  return { questionCount, totalPoints };
}
