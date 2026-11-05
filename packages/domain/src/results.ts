// What a session's results say, worked out from the attempts as the teacher sees them (`session.attempts`) and the
// quiz's questions. One place for the rules, so the results page and the MCP tools can't drift apart:
// the latest submitted attempt counts, a pool paper has only its drawn questions, and answers still waiting for
// a teacher are left out of every average. `sessionResults` answers the whole view of a session in one call.
import { median, topicTags } from "./analytics.ts";
import { analyzeSession, type IntegrityAttempt, type SessionIntegrity } from "./integrity.ts";
import type { Question } from "./question.ts";
import { hasAnswer, type SessionMode } from "./quiz.ts";
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

// The most recent submitted attempt per key (a student, a session): attempts in progress and items without a key
// are skipped. A tie keeps the first. `submittedAt` is an ISO string or a Date, so server rows and API rows both fit.
export function latestSubmitted<T>(
  items: Iterable<T>,
  keyOf: (item: T) => string | null,
  attemptOf: (item: T) => { status: string; submittedAt: Date | string | null },
): Map<string, T> {
  const at = (item: T) => {
    const { status, submittedAt } = attemptOf(item);
    return status === "in_progress" || submittedAt === null ? null : new Date(submittedAt).getTime();
  };
  const latest = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    const time = at(item);
    if (key === null || time === null) continue;
    const prev = latest.get(key);
    if (!prev || at(prev)! < time) latest.set(key, item);
  }
  return latest;
}

// Each student's latest submitted attempt, by roster id.
export const latestByStudent = <T extends ResultAttempt>(details: readonly T[]) => latestSubmitted(details, (d) => d.studentId, (d) => d.attempt);

// The points of a score only once nothing waits for a teacher; null until then. The one rule for "final".
export const finalScore = (score: Pick<AttemptScore, "score" | "ungraded">): number | null => (score.ungraded === 0 ? score.score : null);

export const finalPercent = (score: AttemptScore): number | null => (score.ungraded === 0 ? percent(score.score, score.max) : null);

// Question number (1-based) in the quiz's order.
export const questionNumber = (questions: readonly Question[], id: string) => questions.findIndex((q) => q.id === id) + 1;

// Points one student earned on one question; 0 when never answered, null while it waits for a teacher.
export function earnedOn(q: Question, d: ResultAttempt): number | null {
  const answer = d.answers.find((a) => a.questionId === q.id);
  return answer ? questionScore(q, answer) : 0;
}

export type StudentStatus = "Graded" | "Needs grading" | "In progress" | "Not submitted";

// One student's place in a session: the latest submitted attempt, its score and how long it took.
function studentResult<T extends ResultAttempt>(questions: readonly Question[], studentId: string, attempts: readonly T[], last: T | undefined, integrity: SessionIntegrity) {
  const mine = attempts.filter((d) => d.studentId === studentId).length;
  const score = last ? scoreOf(questions, last) : null;
  const status: StudentStatus = last ? (last.attempt.status === "graded" ? "Graded" : "Needs grading") : mine > 0 ? "In progress" : "Not submitted";
  const ms = last ? Date.parse(last.attempt.submittedAt!) - Date.parse(last.attempt.startedAt) : null;
  return {
    studentId,
    attempts: mine,
    last,
    score,
    status,
    // What the score is worth so far, even while an answer waits for a teacher.
    scorePercent: score ? percent(score.score, score.max) : null,
    // Only a score with nothing waiting for a teacher is a final percent.
    percent: score ? finalPercent(score) : null,
    timeMs: ms !== null && ms > 0 ? ms : null,
    integrity: (last && integrity.attempts[last.attempt.id]) || null,
    // This student's points per topic tag.
    topics: last ? topicTotals(questions, [last]) : new Map<string, TopicTotal>(),
  };
}

// How a question went over some attempts: those whose paper had it, and whose answer is scored.
function questionTally(q: Question, attempts: Iterable<ResultAttempt>) {
  const had = [...attempts].filter((d) => d.questionOrder.includes(q.id));
  const scores = had.flatMap((d) => {
    const s = earnedOn(q, d);
    return s === null ? [] : [s];
  });
  const times = had.flatMap((d) => d.answers.filter((a) => a.questionId === q.id && a.timeSpentMs !== undefined).map((a) => a.timeSpentMs!));
  const got = scores.reduce((a, b) => a + b, 0);
  const max = q.points * scores.length;
  return {
    question: q,
    // Students whose paper had it, and how many of them gave an answer.
    had: had.length,
    answered: had.filter((d) => hasAnswer(d.answers.find((a) => a.questionId === q.id)?.value ?? null)).length,
    // Points earned and possible over the scored answers, so any group of questions can be summed.
    scored: scores.length,
    got,
    max,
    percent: scores.length ? percent(got, max) : null,
    meanTimeMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
  };
}

export type TopicTotal = { got: number; max: number; answers: number; times: number[] };

// Points earned per topic tag over some attempts: the class mastery. Answers waiting for a teacher are left out.
function topicTotals(questions: readonly Question[], attempts: Iterable<ResultAttempt>): Map<string, TopicTotal> {
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

// The average the results show: a whole percent; null with nothing to average.
export const averagePercent = (xs: readonly number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

// The teacher's whole view of a session in one call. `studentIds` are the roster rows to show; the class figures
// (questions, topics, integrity) cover every student's latest submitted attempt. `typingFlags` (attempt id → flagged
// typing histories) is only known to callers that analyse typing.
export function sessionResults<T extends ResultAttempt>({
  questions,
  studentIds,
  attempts,
  typingFlags,
}: {
  questions: readonly Question[];
  studentIds: readonly string[];
  attempts: readonly T[];
  typingFlags?: Readonly<Record<string, number>>;
}) {
  const latest = latestByStudent(attempts);
  const taken = [...latest.values()];
  const integrity = analyzeSession({ attempts: taken, questions, ...(typingFlags ? { typingFlags } : {}) });
  const rows = studentIds.map((id) => studentResult(questions, id, attempts, latest.get(id), integrity));

  const percents = rows.flatMap((r) => (r.percent === null ? [] : [r.percent]));
  const distribution = Array.from({ length: 10 }, () => 0);
  for (const p of percents) distribution[Math.min(9, Math.floor(p / 10))]!++;
  const times = rows.flatMap((r) => (r.timeMs === null ? [] : [r.timeMs]));
  const status: Record<StudentStatus, number> = { Graded: 0, "Needs grading": 0, "In progress": 0, "Not submitted": 0 };
  for (const r of rows) status[r.status]++;

  const tallies = questions.map((q, i) => ({ ...questionTally(q, taken), number: i + 1 }));
  const byId = new Map(tallies.map((t) => [t.question.id, t]));
  const totals = topicTotals(questions, taken);

  return {
    rows,
    // Each student's latest submitted attempt, by roster id.
    latest,
    summary: {
      students: rows.length,
      submitted: latest.size,
      // Final percents only: a student with an answer still waiting for a teacher is not in them.
      percents,
      average: averagePercent(percents),
      median: median(percents),
      highest: percents.length ? Math.max(...percents) : null,
      lowest: percents.length ? Math.min(...percents) : null,
      averageTimeMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
      // Students per 10% band; 100% joins the top band.
      distribution,
      status,
    },
    questions: tallies,
    // The percent earned over a group of questions (a part), by question id.
    earnedPercent(ids: Iterable<string>): number | null {
      let got = 0;
      let max = 0;
      for (const id of ids) {
        const t = byId.get(id);
        if (t) {
          got += t.got;
          max += t.max;
        }
      }
      return max > 0 ? percent(got, max) : null;
    },
    // Topics with points at stake, weakest first.
    topics: [...totals]
      .filter(([, t]) => t.max > 0)
      .map(([topic, t]) => ({ topic, percent: percent(t.got, t.max), answers: t.answers, medianTimeMs: median(t.times) }))
      .sort((a, b) => a.percent - b.percent),
    integrity,
  };
}

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
