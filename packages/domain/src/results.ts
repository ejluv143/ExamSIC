// What a session's results say, worked out from the attempts as the teacher sees them (`session.attempts`) and the
// quiz's questions. One place for the rules, so the results page and the MCP tools can't drift apart:
// the latest submitted attempt counts, a pool paper has only its drawn questions, and answers still waiting for
// a teacher are left out of every average.
import { median, topicTags } from "./analytics.ts";
import { analyzeSession, type IntegrityAttempt, type SessionIntegrity } from "./integrity.ts";
import type { Question } from "./question.ts";
import type { SessionMode } from "./quiz.ts";
import { attemptScore, percent, questionScore, type AttemptScore } from "./scoring.ts";

// What the results read of an attempt. `questionOrder` is the question ids this student's paper had.
export type ResultAttempt = IntegrityAttempt & { questionOrder: readonly string[] };

export const isSubmitted = (d: ResultAttempt) => d.attempt.submittedAt !== null;

// The questions this student's paper had (a pool draws only some), in the quiz's order.
export function questionsOf(all: readonly Question[], d: ResultAttempt): Question[] {
  const had = new Set(d.questionOrder);
  return all.filter((q) => had.has(q.id));
}

export const scoreOf = (all: readonly Question[], d: ResultAttempt): AttemptScore =>
  attemptScore(questionsOf(all, d), new Map(d.answers.map((a) => [a.questionId, a])));

// Each student's latest submitted attempt, by roster id.
export function latestSubmitted<T extends ResultAttempt>(details: readonly T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const d of details) {
    if (!isSubmitted(d)) continue;
    const prev = latest.get(d.studentId);
    if (!prev || d.attempt.submittedAt! > prev.attempt.submittedAt!) latest.set(d.studentId, d);
  }
  return latest;
}

// Question number (1-based) in the quiz's order.
export const questionNumber = (questions: readonly Question[], id: string) => questions.findIndex((q) => q.id === id) + 1;

// Points one student earned on one question; 0 when never answered, null while it waits for a teacher.
export function earnedOn(q: Question, d: ResultAttempt): number | null {
  const answer = d.answers.find((a) => a.questionId === q.id);
  return answer ? questionScore(q, answer) : 0;
}

export type StudentStatus = "Graded" | "Needs grading" | "In progress" | "Not submitted";

// One student's place in a session: the latest submitted attempt, its score and how long it took.
export function studentResult(questions: readonly Question[], studentId: string, attempts: readonly ResultAttempt[]) {
  const mine = attempts.filter((d) => d.studentId === studentId);
  const last = latestSubmitted(mine).get(studentId);
  const score = last ? scoreOf(questions, last) : null;
  const status: StudentStatus = last ? (last.attempt.status === "graded" ? "Graded" : "Needs grading") : mine.length > 0 ? "In progress" : "Not submitted";
  const ms = last ? Date.parse(last.attempt.submittedAt!) - Date.parse(last.attempt.startedAt) : null;
  return {
    attempts: mine.length,
    last,
    score,
    status,
    // Only a score with nothing waiting for a teacher is a final percent.
    percent: score && score.ungraded === 0 ? percent(score.score, score.max) : null,
    timeMs: ms !== null && ms > 0 ? ms : null,
  };
}

// The percent of the points earned on a question over some attempts: those whose paper had it, and whose answer is scored.
export function questionTally(q: Question, attempts: Iterable<ResultAttempt>) {
  const had = [...attempts].filter((d) => d.questionOrder.includes(q.id));
  const scores = had.flatMap((d) => {
    const s = earnedOn(q, d);
    return s === null ? [] : [s];
  });
  const times = had.flatMap((d) => d.answers.filter((a) => a.questionId === q.id && a.timeSpentMs !== undefined).map((a) => a.timeSpentMs!));
  return {
    had,
    scores,
    times,
    percent: scores.length ? percent(scores.reduce((a, b) => a + b, 0), q.points * scores.length) : null,
  };
}

export type TopicTotal = { got: number; max: number; answers: number; times: number[] };

// Points earned per topic tag over some attempts: the class mastery. Answers waiting for a teacher are left out.
export function topicTotals(questions: readonly Question[], attempts: Iterable<ResultAttempt>): Map<string, TopicTotal> {
  const totals = new Map<string, TopicTotal>();
  for (const d of attempts) {
    for (const q of questionsOf(questions, d)) {
      const answer = d.answers.find((a) => a.questionId === q.id);
      const earned = answer ? questionScore(q, answer) : 0;
      if (earned === null) continue;
      for (const tag of topicTags(q.topic)) {
        const t = totals.get(tag) ?? { got: 0, max: 0, answers: 0, times: [] };
        t.got += earned;
        t.max += q.points;
        t.answers++;
        if (answer?.timeSpentMs !== undefined) t.times.push(answer.timeSpentMs);
        totals.set(tag, t);
      }
    }
  }
  return totals;
}

// Topics with points at stake, weakest first.
export function topicMastery(totals: ReadonlyMap<string, TopicTotal>) {
  return [...totals]
    .filter(([, t]) => t.max > 0)
    .map(([topic, t]) => ({ topic, percent: percent(t.got, t.max), answers: t.answers, medianTimeMs: median(t.times) }))
    .sort((a, b) => a.percent - b.percent);
}

// The integrity analysis of each student's latest submitted attempt. `typingFlags` (attempt id → flagged
// typing histories) is only known to callers that analyse typing.
export const integrityOf = (questions: readonly Question[], attempts: readonly ResultAttempt[], typingFlags?: Readonly<Record<string, number>>): SessionIntegrity =>
  analyzeSession({ attempts: [...latestSubmitted(attempts).values()], questions, ...(typingFlags ? { typingFlags } : {}) });

// The average the results show: a whole percent; null with nothing to average.
export const averagePercent = (xs: readonly number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

// --- A class's record ---

// A game's points are not a share of the quiz's score, so it stays out of a student's or a class's record.
export const countsInRecord = (mode: SessionMode) => mode !== "game";

// A session is missed once it has ended and the student has no submitted attempt.
export const isMissed = (status: string, submitted: boolean) => status === "ended" && !submitted;

export const atRiskBelow = 60;
export const atRiskMissed = 2;

// Why a student is at risk: a low average, or several missed sessions. Empty when not at risk.
export function atRiskReasons(average: number | null, missed: number): string[] {
  return [
    ...(average !== null && average < atRiskBelow ? [`average ${average}%`] : []),
    ...(missed >= atRiskMissed ? [`${missed} missed sessions`] : []),
  ];
}
