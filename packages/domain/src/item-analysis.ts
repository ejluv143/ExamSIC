// Item analysis of one session: how hard each question was, how well it told strong students from weak ones, how
// the wrong answers spread, and how reliable the whole paper was. Pure functions over the students' latest
// submitted attempts, shared by the results page and the Excel export.
import { asList } from "./kinds/base.ts";
import type { Question } from "./question.ts";
import { hasAnswer, type AnswerValue } from "./quiz.ts";
import { questionScore } from "./scoring.ts";

// The part of a stored answer the analysis reads (the domain `Answer` fits).
export type ScoredAnswerLike = {
  readonly questionId: string;
  readonly value: AnswerValue | null;
  readonly autoScore: number | null;
  readonly manualScore: number | null;
};

// One student's attempt: the questions they got (pools draw a subset) and what they answered.
export type ItemAttempt = {
  readonly questionOrder: readonly string[];
  readonly answers: readonly ScoredAnswerLike[];
};

export type DifficultyBand = "easy" | "moderate" | "hard";
export type DiscriminationQuality = "good" | "fair" | "poor" | "negative";

export type Distractor = {
  // The choice id (multiple choice) or "true" / "false".
  readonly key: string;
  readonly count: number;
  readonly correct: boolean;
};

export type ItemStat = {
  readonly questionId: string;
  // Attempts that got the question and have it scored (ungraded answers are left out).
  readonly n: number;
  // Difficulty index: the share of those attempts that earned full points. null without attempts.
  readonly p: number | null;
  // Mean of points earned over points possible. null without attempts.
  readonly meanFraction: number | null;
  // Point-biserial correlation between getting the item right and the rest score (mean fraction on the student's
  // other scored items). null with fewer than 2 attempts, or when everyone did the same on the item or the rest.
  readonly discrimination: number | null;
  readonly band: DifficultyBand | null;
  readonly quality: DiscriminationQuality | null;
  // Of the n attempts, how many left it unanswered.
  readonly blank: number;
  // Multiple choice and true/false only: how many attempts picked each option. null for other types.
  readonly distractors: readonly Distractor[] | null;
};

export type ItemAnalysisSummary = {
  // Attempts behind the figures below: those scored on every common item.
  readonly n: number;
  // Questions every used attempt got.
  readonly commonItems: number;
  readonly kr20: number | null;
  readonly meanPercent: number | null;
  readonly sdPercent: number | null;
};

export type ItemAnalysis = {
  readonly items: readonly ItemStat[];
  readonly summary: ItemAnalysisSummary;
};

export const difficultyBand = (p: number): DifficultyBand => (p >= 0.8 ? "easy" : p >= 0.3 ? "moderate" : "hard");

export const discriminationQuality = (d: number): DiscriminationQuality =>
  d >= 0.3 ? "good" : d >= 0.1 ? "fair" : d >= 0 ? "poor" : "negative";

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: readonly number[]) => {
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
};

// Pearson correlation; with a 0/1 `x` this is the point-biserial. null when either side doesn't vary.
function correlation(x: readonly number[], y: readonly number[]): number | null {
  if (x.length < 2) return null;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  // Tolerance for floating point noise on a constant series.
  if (sxx < 1e-12 || syy < 1e-12) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// One question of one attempt, scored: `fraction` of the points earned, `correct` when all of them were.
type Scored = { readonly fraction: number; readonly correct: boolean; readonly answer: ScoredAnswerLike | undefined };

// The analysis for `questions` over `attempts` (pass each student's latest submitted attempt only).
//
// KR-20 assumptions: every item is scored right/wrong (full points = right, anything less = wrong, so partial
// credit counts as wrong); it is computed over the items every used attempt got and that are scored in all of
// them, with Σpq from each item's share right and the variance of the number-right totals taken over the same
// attempts (population form, divided by n). It needs at least 2 items, 2 attempts and some spread in the totals.
// Attempts with an ungraded answer on a common item are left out of the summary.
export function itemAnalysis(questions: readonly Question[], attempts: readonly ItemAttempt[]): ItemAnalysis {
  // Per attempt: question id → scored result (absent: not in the paper, or waiting for a teacher).
  const scored = attempts.map((attempt) => {
    const byQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));
    const order = new Set(attempt.questionOrder);
    const got = new Map<string, Scored>();
    const present = new Set<string>();
    for (const q of questions) {
      if (!order.has(q.id)) continue;
      present.add(q.id);
      const answer = byQuestion.get(q.id);
      const points = answer ? questionScore(q, answer) : 0;
      if (points === null) continue;
      got.set(q.id, { fraction: q.points > 0 ? points / q.points : 1, correct: points >= q.points, answer });
    }
    return { got, present };
  });

  const items = questions.map((q): ItemStat => {
    const xs: number[] = [];
    const rest: number[] = [];
    const fractions: number[] = [];
    let right = 0;
    let blank = 0;
    const tally = new Map<string, number>();
    for (const { got } of scored) {
      const mine = got.get(q.id);
      if (!mine) continue;
      fractions.push(mine.fraction);
      if (mine.correct) right++;
      const value = mine.answer?.value ?? null;
      if (!hasAnswer(value)) blank++;
      else if (q.type === "multiple_choice") for (const id of new Set(asList(value))) tally.set(id, (tally.get(id) ?? 0) + 1);
      else if (q.type === "true_false" && typeof value === "boolean") tally.set(String(value), (tally.get(String(value)) ?? 0) + 1);
      const others = [...got].filter(([id]) => id !== q.id).map(([, s]) => s.fraction);
      if (others.length > 0) {
        xs.push(mine.correct ? 1 : 0);
        rest.push(mean(others));
      }
    }
    const n = fractions.length;
    const p = n > 0 ? right / n : null;
    const discrimination = correlation(xs, rest);
    const distractors: Distractor[] | null =
      q.type === "multiple_choice"
        ? q.choices.map((c) => ({ key: c.id, count: tally.get(c.id) ?? 0, correct: q.correctChoiceIds.includes(c.id) }))
        : q.type === "true_false"
          ? [true, false].map((v) => ({ key: String(v), count: tally.get(String(v)) ?? 0, correct: q.answer === v }))
          : null;
    return {
      questionId: q.id,
      n,
      p,
      meanFraction: n > 0 ? mean(fractions) : null,
      discrimination,
      band: p === null ? null : difficultyBand(p),
      quality: discrimination === null ? null : discriminationQuality(discrimination),
      blank,
      distractors,
    };
  });

  const common = questions.filter((q) => scored.length > 0 && scored.every((s) => s.present.has(q.id)));
  const used = scored.filter((s) => common.every((q) => s.got.has(q.id)));
  const summary: ItemAnalysisSummary = { n: used.length, commonItems: common.length, kr20: null, meanPercent: null, sdPercent: null };
  if (common.length === 0 || used.length === 0) return { items, summary };

  const maxPoints = common.reduce((a, q) => a + q.points, 0);
  const percents = used.map((s) =>
    maxPoints > 0 ? (common.reduce((a, q) => a + s.got.get(q.id)!.fraction * q.points, 0) / maxPoints) * 100 : 0,
  );
  let kr20: number | null = null;
  if (common.length >= 2 && used.length >= 2) {
    const totals = used.map((s) => common.filter((q) => s.got.get(q.id)!.correct).length);
    const total = variance(totals);
    if (total > 1e-12) {
      const pq = common.reduce((a, q) => {
        const p = used.filter((s) => s.got.get(q.id)!.correct).length / used.length;
        return a + p * (1 - p);
      }, 0);
      kr20 = (common.length / (common.length - 1)) * (1 - pq / total);
    }
  }
  return { items, summary: { ...summary, kr20, meanPercent: mean(percents), sdPercent: Math.sqrt(variance(percents)) } };
}
