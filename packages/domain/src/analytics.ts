// Session analytics: what one submitted attempt says about the student, beyond the score. Pure functions over
// the attempt's telemetry, shared by the API (it feeds the AI coach) and the web app (the charts), so both read the
// same numbers. The AI coach's report schema and its rule-based fallback live here too.
import { Schema } from "effect";
import { answerKey, answerText } from "./answer-text.ts";
import type { Question } from "./question.ts";
import { hasAnswer, type AnswerValue } from "./quiz.ts";

// --- Telemetry: what was recorded ---

// One question of the attempt, in the order the student got them.
export type QuestionTelemetry = {
  readonly questionId: string;
  readonly prompt: string;
  readonly explanation: string | null;
  // From the question's topic ("Data-Structures, Trees" is two tags). Untagged questions count under `untagged`.
  readonly topicTags: readonly string[];
  // Multiple choice and true/false: the ids picked and the right ones (several when more than one is right).
  readonly selectedOptionId: string | null;
  readonly correctOptionId: string | null;
  // The answers in words, for the review list and the coach.
  readonly userAnswer: string | null;
  readonly correctAnswer: string | null;
  // null: waits for the teacher (an essay, a drawing).
  readonly isCorrect: boolean | null;
  // Left blank, or never reached before the time ran out.
  readonly skipped: boolean;
  // Time the question was on screen; null when the browser didn't measure it.
  readonly timeTakenMs: number | null;
  // The session's time per question, when it has one.
  readonly targetTimeMs: number | null;
  // How many times the answer changed before the attempt was handed in; null when changes aren't recorded.
  readonly optionSwitchesCount: number | null;
};

export type SessionTelemetry = {
  readonly sessionId: string;
  readonly userId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly totalDurationMs: number;
  readonly questions: readonly QuestionTelemetry[];
};

export const untagged = "General";

// "Data-Structures, Trees" → ["Data-Structures", "Trees"]; no topic → ["General"].
export function topicTags(topic: string | undefined | null): string[] {
  const tags = (topic ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  return tags.length > 0 ? [...new Set(tags)] : [untagged];
}

const optionIds = (value: unknown): string | null =>
  typeof value === "boolean" ? String(value) : Array.isArray(value) ? value.join(",") || null : typeof value === "string" ? value || null : null;

// The part of a student's result (`attempt.result`) the telemetry reads.
export type ReleasedResult = {
  session: { id: string; questionTimeLimitSeconds: number | null };
  startedAt: string | null;
  submittedAt: string | null;
  items: readonly {
    question: Question;
    answer: AnswerValue;
    points: number | null;
    timeSpentMs: number | null;
    answerChanges: number | null;
  }[];
};

// The telemetry of the student's released result (`attempt.result`), as both the API (for the coach) and the result
// page read it. A partly right answer counts as wrong; one waiting for the teacher has `isCorrect` null.
export function resultTelemetry(result: ReleasedResult, userId: string): SessionTelemetry {
  const startedAt = result.startedAt ?? result.submittedAt ?? new Date(0).toISOString();
  const completedAt = result.submittedAt ?? startedAt;
  const target = result.session.questionTimeLimitSeconds;
  return {
    sessionId: result.session.id,
    userId,
    startedAt,
    completedAt,
    totalDurationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    questions: result.items.map(({ question: q, answer, points, timeSpentMs, answerChanges }) => {
      const skipped = !hasAnswer(answer);
      const options = q.type === "multiple_choice" || q.type === "true_false";
      return {
        questionId: q.id,
        prompt: q.prompt,
        explanation: q.explanation ?? null,
        topicTags: topicTags(q.topic),
        selectedOptionId: options ? optionIds(answer) : null,
        correctOptionId: q.type === "multiple_choice" ? q.correctChoiceIds.join(",") : q.type === "true_false" ? String(q.answer) : null,
        userAnswer: skipped ? null : answerText(q, answer) || null,
        correctAnswer: answerKey(q) || null,
        isCorrect: skipped ? false : points === null ? null : points >= q.points,
        skipped,
        timeTakenMs: timeSpentMs,
        targetTimeMs: target === null ? null : target * 1000,
        optionSwitchesCount: answerChanges,
      };
    }),
  };
}

// --- Analytics: what it means ---

export type Outcome = "correct" | "incorrect" | "skipped" | "pending";

// Speed against accuracy, relative to the student's own average time per question. Questions in the middle band
// (between 0.8x and 1.3x the average) aren't put in any of the four.
export type Quadrant = "fluent_recall" | "effortful_success" | "impulsive_error" | "time_sink";

export const quadrantLabels: Record<Quadrant, string> = {
  fluent_recall: "Fluent recall",
  effortful_success: "Effortful success",
  impulsive_error: "Impulsive error",
  time_sink: "Time sink",
};

export type TopicBadge = "strength" | "needs_review" | "hesitation";

export const topicBadgeLabels: Record<TopicBadge, string> = {
  strength: "Strength",
  needs_review: "Needs review",
  hesitation: "Hesitation zone",
};

export type QuestionAnalysis = QuestionTelemetry & {
  // 0-based position in the attempt.
  readonly index: number;
  readonly outcome: Outcome;
  readonly quadrant: Quadrant | null;
  // Time against the student's average; null without a time.
  readonly deltaMs: number | null;
};

export type TopicStat = {
  readonly topic: string;
  readonly total: number;
  // Questions already scored (not waiting for the teacher) and how many of them were right.
  readonly graded: number;
  readonly correct: number;
  // Percent of the scored ones; null when none is scored yet.
  readonly accuracy: number | null;
  // Share of the attempt's questions, 0..1.
  readonly weight: number;
  readonly medianTimeMs: number | null;
  readonly badge: TopicBadge | null;
};

export type HalfStat = { readonly avgTimeMs: number | null; readonly accuracy: number | null };

export type SessionAnalytics = {
  readonly summary: {
    readonly total: number;
    readonly correct: number;
    readonly incorrect: number;
    readonly skipped: number;
    readonly pending: number;
    // Percent right of the scored questions (a skipped one counts as wrong); null when none is scored.
    readonly accuracy: number | null;
    readonly totalDurationMs: number;
    // Over the questions with a measured time.
    readonly avgTimeMs: number | null;
    readonly targetTimeMs: number | null;
    // Average time minus the target (negative: faster than asked); null without a target.
    readonly pacingDeltaMs: number | null;
  };
  readonly topics: readonly TopicStat[];
  readonly questions: readonly QuestionAnalysis[];
  readonly behavior: Readonly<Record<Quadrant, number>>;
  readonly pacing: {
    readonly firstHalf: HalfStat;
    readonly secondHalf: HalfStat;
    // Second half's average time minus the first half's.
    readonly driftMs: number | null;
    // Slower by more than 25% while accuracy fell by more than 15 points.
    readonly fatigue: boolean;
  };
};

const fastRatio = 0.8;
const slowRatio = 1.3;

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const outcomeOf = (q: QuestionTelemetry): Outcome =>
  q.skipped ? "skipped" : q.isCorrect === null ? "pending" : q.isCorrect ? "correct" : "incorrect";

const accuracyOf = (outcomes: readonly Outcome[]) => {
  const graded = outcomes.filter((o) => o !== "pending");
  return graded.length ? Math.round((graded.filter((o) => o === "correct").length / graded.length) * 100) : null;
};

function quadrantOf(outcome: Outcome, time: number | null, avg: number | null): Quadrant | null {
  if (outcome === "pending" || time === null || avg === null || avg === 0) return null;
  const right = outcome === "correct";
  if (time <= fastRatio * avg) return right ? "fluent_recall" : "impulsive_error";
  if (time >= slowRatio * avg) return right ? "effortful_success" : "time_sink";
  return null;
}

function badgeOf(accuracy: number | null, medianTime: number | null, avg: number | null): TopicBadge | null {
  if (accuracy === null) return null;
  if (accuracy < 60) return "needs_review";
  const slow = medianTime !== null && avg !== null && medianTime >= slowRatio * avg;
  if (accuracy >= 70 && slow) return "hesitation";
  if (accuracy >= 80) return "strength";
  return null;
}

function half(items: readonly QuestionAnalysis[]): HalfStat {
  const avg = mean(items.flatMap((q) => (q.timeTakenMs === null ? [] : [q.timeTakenMs])));
  return { avgTimeMs: avg === null ? null : Math.round(avg), accuracy: accuracyOf(items.map((q) => q.outcome)) };
}

export function analyzeAttempt(telemetry: SessionTelemetry): SessionAnalytics {
  const timed = telemetry.questions.flatMap((q) => (q.timeTakenMs === null ? [] : [q.timeTakenMs]));
  const avgRaw = mean(timed);
  const avg = avgRaw === null ? null : Math.round(avgRaw);
  const questions: QuestionAnalysis[] = telemetry.questions.map((q, index) => {
    const outcome = outcomeOf(q);
    return {
      ...q,
      index,
      outcome,
      quadrant: quadrantOf(outcome, q.timeTakenMs, avg),
      deltaMs: q.timeTakenMs === null || avg === null ? null : q.timeTakenMs - avg,
    };
  });
  const count = (o: Outcome) => questions.filter((q) => q.outcome === o).length;

  // A question with two tags counts in both.
  const byTopic = new Map<string, QuestionAnalysis[]>();
  for (const q of questions) for (const tag of q.topicTags) byTopic.set(tag, [...(byTopic.get(tag) ?? []), q]);
  const topics: TopicStat[] = [...byTopic].map(([topic, items]) => {
    const graded = items.filter((q) => q.outcome !== "pending");
    const accuracy = accuracyOf(items.map((q) => q.outcome));
    const medianTime = median(items.flatMap((q) => (q.timeTakenMs === null ? [] : [q.timeTakenMs])));
    return {
      topic,
      total: items.length,
      graded: graded.length,
      correct: graded.filter((q) => q.outcome === "correct").length,
      accuracy,
      weight: questions.length ? items.length / questions.length : 0,
      medianTimeMs: medianTime === null ? null : Math.round(medianTime),
      badge: badgeOf(accuracy, medianTime, avg),
    };
  });
  topics.sort((a, b) => b.total - a.total || a.topic.localeCompare(b.topic));

  const behavior: Record<Quadrant, number> = { fluent_recall: 0, effortful_success: 0, impulsive_error: 0, time_sink: 0 };
  for (const q of questions) if (q.quadrant) behavior[q.quadrant]++;

  const split = Math.floor(questions.length / 2);
  const firstHalf = half(questions.slice(0, split));
  const secondHalf = half(questions.slice(split));
  const driftMs =
    firstHalf.avgTimeMs === null || secondHalf.avgTimeMs === null ? null : secondHalf.avgTimeMs - firstHalf.avgTimeMs;
  const fatigue =
    firstHalf.avgTimeMs !== null &&
    secondHalf.avgTimeMs !== null &&
    firstHalf.avgTimeMs > 0 &&
    secondHalf.avgTimeMs > firstHalf.avgTimeMs * 1.25 &&
    firstHalf.accuracy !== null &&
    secondHalf.accuracy !== null &&
    firstHalf.accuracy - secondHalf.accuracy > 15;

  const targets = telemetry.questions.flatMap((q) => (q.targetTimeMs === null ? [] : [q.targetTimeMs]));
  const target = mean(targets);
  return {
    summary: {
      total: questions.length,
      correct: count("correct"),
      incorrect: count("incorrect"),
      skipped: count("skipped"),
      pending: count("pending"),
      accuracy: accuracyOf(questions.map((q) => q.outcome)),
      totalDurationMs: telemetry.totalDurationMs,
      avgTimeMs: avg,
      targetTimeMs: target === null ? null : Math.round(target),
      pacingDeltaMs: avg === null || target === null ? null : Math.round(avg - target),
    },
    topics,
    questions,
    behavior,
    pacing: { firstHalf, secondHalf, driftMs, fatigue },
  };
}

// The topic to practise first: the least accurate topic below 80%, ties going to the one with more questions.
export function weakestTopic(analytics: SessionAnalytics): string | null {
  const weak = analytics.topics
    .filter((t) => t.accuracy !== null && t.accuracy < 80)
    .sort((a, b) => a.accuracy! - b.accuracy! || b.total - a.total);
  return weak[0]?.topic ?? null;
}

// --- The AI coach ---

// What the model is given: numbers already interpreted, no student names. Keys follow the coach's prompt.
export type CoachContext = {
  readonly score: string;
  readonly total_time_seconds: number;
  readonly avg_time_per_question_seconds: number | null;
  readonly fatigue_flag: boolean;
  readonly top_strengths: readonly CoachTopic[];
  readonly top_weaknesses: readonly CoachTopic[];
  readonly hesitation_topics: readonly CoachTopic[];
  readonly behavioral_counts: {
    readonly fluent_recall: number;
    readonly effortful_success: number;
    readonly impulsive_errors: number;
    readonly time_sinks: number;
  };
  readonly critical_misses: readonly {
    readonly prompt: string;
    readonly topic: string;
    readonly user_answer: string;
    readonly correct_answer: string;
    readonly time_spent_s: number | null;
    readonly quadrant: string | null;
  }[];
};

export type CoachTopic = { readonly topic: string; readonly accuracy: string; readonly median_time_s: number | null };

const seconds = (ms: number | null) => (ms === null ? null : Math.round(ms / 1000));
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function coachContext(analytics: SessionAnalytics): CoachContext {
  const { summary } = analytics;
  const scored = summary.total - summary.pending;
  const topic = (t: TopicStat): CoachTopic => ({
    topic: t.topic,
    accuracy: `${t.accuracy ?? 0}%`,
    median_time_s: seconds(t.medianTimeMs),
  });
  const withBadge = (badge: TopicBadge) => analytics.topics.filter((t) => t.badge === badge);
  // Misses that say the most: slow ones first (a gap), then the rushed ones.
  const misses = analytics.questions
    .filter((q) => q.outcome === "incorrect" || q.outcome === "skipped")
    .sort((a, b) => (b.timeTakenMs ?? 0) - (a.timeTakenMs ?? 0))
    .slice(0, 5);
  return {
    score: `${summary.correct}/${scored} (${summary.accuracy ?? 0}%)`,
    total_time_seconds: seconds(summary.totalDurationMs) ?? 0,
    avg_time_per_question_seconds: seconds(summary.avgTimeMs),
    fatigue_flag: analytics.pacing.fatigue,
    top_strengths: withBadge("strength").sort((a, b) => b.accuracy! - a.accuracy!).slice(0, 3).map(topic),
    top_weaknesses: withBadge("needs_review").sort((a, b) => a.accuracy! - b.accuracy!).slice(0, 3).map(topic),
    hesitation_topics: withBadge("hesitation").slice(0, 3).map(topic),
    behavioral_counts: {
      fluent_recall: analytics.behavior.fluent_recall,
      effortful_success: analytics.behavior.effortful_success,
      impulsive_errors: analytics.behavior.impulsive_error,
      time_sinks: analytics.behavior.time_sink,
    },
    critical_misses: misses.map((q) => ({
      prompt: clip(q.prompt, 300),
      topic: q.topicTags.join(", "),
      user_answer: clip(q.userAnswer ?? "(no answer)", 200),
      correct_answer: clip(q.correctAnswer ?? "(see explanation)", 200),
      time_spent_s: seconds(q.timeTakenMs),
      quadrant: q.quadrant ? quadrantLabels[q.quadrant] : null,
    })),
  };
}

export const CoachReport = Schema.Struct({
  headline: Schema.String,
  // Two short paragraphs, separated by a blank line.
  narrativeAssessment: Schema.String,
  primaryTakeaways: Schema.Array(Schema.String),
  recommendedDrillTopic: Schema.NullOr(Schema.String),
});
export type CoachReport = typeof CoachReport.Type;

// `ai`: written by the model; `rules`: the template below (no AI configured, or the model failed).
export const CoachSource = Schema.Literals(["ai", "rules"]);
export type CoachSource = typeof CoachSource.Type;

export const CoachResult = Schema.Struct({
  report: CoachReport,
  source: CoachSource,
  generatedAt: Schema.String,
});
export type CoachResult = typeof CoachResult.Type;

// The model's reply must stay within this; longer replies are cut, not refused.
export const coachMaxWords = 150;

const list = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

// The coach without a model: the same diagnosis in fixed sentences.
export function fallbackCoach(analytics: SessionAnalytics): CoachReport {
  const { summary, behavior, pacing } = analytics;
  const strengths = analytics.topics.filter((t) => t.badge === "strength").map((t) => t.topic);
  const review = analytics.topics.filter((t) => t.badge === "needs_review").map((t) => t.topic);
  const hesitation = analytics.topics.filter((t) => t.badge === "hesitation").map((t) => t.topic);
  const drill = weakestTopic(analytics);
  const accuracy = summary.accuracy ?? 0;

  const headline =
    accuracy >= 85
      ? "Strong, confident session"
      : accuracy >= 60
        ? review.length
          ? `Solid base, with gaps in ${review[0]}`
          : "Solid base with room to sharpen"
        : drill
          ? `Rebuild the foundations, starting with ${drill}`
          : "Rebuild the foundations";

  const first = [
    strengths.length ? `You were sure-footed in ${list(strengths)}.` : null,
    behavior.fluent_recall > 0 ? `${behavior.fluent_recall} answers came quickly and right: that recall is secure.` : null,
    hesitation.length ? `In ${list(hesitation)} you got there, but slowly: the ideas are in place and need recall practice.` : null,
  ].filter((s): s is string => s !== null);
  const second = [
    review.length ? `${list(review)} ${review.length === 1 ? "needs" : "need"} another look before the next assessment.` : null,
    behavior.time_sink > 0
      ? `${behavior.time_sink} ${behavior.time_sink === 1 ? "question" : "questions"} took long and still went wrong, which points to a gap in understanding rather than a slip.`
      : null,
    behavior.impulsive_error > 0
      ? `${behavior.impulsive_error} quick ${behavior.impulsive_error === 1 ? "miss looks" : "misses look"} like misreading: slow down on the question stem.`
      : null,
    pacing.fatigue ? "You slowed down and slipped in the second half, so short breaks may help." : null,
  ].filter((s): s is string => s !== null);

  const takeaways = [
    drill ? `Practise ${drill} until it feels as quick as your best topics.` : null,
    behavior.time_sink > 0 ? "Review the explanations of the questions you spent longest on and missed." : null,
    behavior.impulsive_error > 0 ? "Read each question to the end before choosing an answer." : null,
    hesitation.length ? `Use quick recall drills on ${hesitation[0]} to turn hesitation into speed.` : null,
    strengths.length ? `Keep your pace from ${strengths[0]} as your benchmark.` : null,
    "Retake the quiz later to check the gains hold.",
  ].filter((s): s is string => s !== null);

  return {
    headline,
    narrativeAssessment: [
      first.join(" ") || `You answered ${summary.correct} of ${summary.total - summary.pending} correctly.`,
      second.join(" ") || "No pattern of rushed or stuck answers stood out.",
    ].join("\n\n"),
    primaryTakeaways: takeaways.slice(0, 3),
    recommendedDrillTopic: drill,
  };
}

// Keeps a report (the model's or the template's) within the word limit: the headline and the three takeaways get
// their share first, the narrative what is left, so a long narrative can't push the takeaways out.
export function fitCoachReport(report: CoachReport, topics: readonly string[]): CoachReport {
  const words = (text: string) => text.trim().split(/\s+/).filter((w) => w !== "");
  const cut = (text: string, max: number) => {
    const all = words(text);
    return all.length > max ? `${all.slice(0, max).join(" ")}…` : all.join(" ");
  };
  const headline = cut(report.headline, 12);
  const takeaways = report.primaryTakeaways
    .slice(0, 3)
    .map((t) => cut(t, 20))
    .filter((t) => t !== "");
  let budget = coachMaxWords - words(headline).length - takeaways.reduce((n, t) => n + words(t).length, 0);
  const narrative = report.narrativeAssessment
    .split(/\n\s*\n/)
    .slice(0, 2)
    .map((p) => {
      const text = cut(p, Math.max(0, budget));
      budget -= words(p).length;
      return text;
    })
    .filter((p) => p !== "" && p !== "…")
    .join("\n\n");
  // A drill topic must be one the session had.
  const drill = report.recommendedDrillTopic && topics.includes(report.recommendedDrillTopic) ? report.recommendedDrillTopic : null;
  return { headline, narrativeAssessment: narrative, primaryTakeaways: takeaways, recommendedDrillTopic: drill };
}
