// A session's quiz, attempts and roster, read the way the teacher's results page reads them
// (apps/web/src/features/session/attempt-view.ts and session-integrity.ts, without the typing analysis).
import type { AttemptDetail } from "@examinus/contract/session";
import type { RosterStudent } from "@examinus/domain/classes";
import { topicTags } from "@examinus/domain/analytics";
import { analyzeSession } from "@examinus/domain/integrity";
import type { Question } from "@examinus/domain/question";
import { attemptScore, questionScore } from "@examinus/domain/scoring";
import { api } from "./api.ts";

export const isSubmitted = (d: AttemptDetail) => d.attempt.submittedAt !== null;

// The questions this student's paper had (a pool draws only some), in the quiz's order.
export function questionsOf(all: readonly Question[], d: AttemptDetail): Question[] {
  const had = new Set(d.questionOrder);
  return all.filter((q) => had.has(q.id));
}

export const scoreOf = (all: readonly Question[], d: AttemptDetail) =>
  attemptScore(
    questionsOf(all, d),
    new Map(d.answers.map((a) => [a.questionId, a])),
  );

// Each student's latest submitted attempt, by roster id.
export function latestSubmitted(details: readonly AttemptDetail[]): Map<string, AttemptDetail> {
  const latest = new Map<string, AttemptDetail>();
  for (const d of details) {
    if (!isSubmitted(d)) continue;
    const prev = latest.get(d.studentId);
    if (!prev || d.attempt.submittedAt! > prev.attempt.submittedAt!) latest.set(d.studentId, d);
  }
  return latest;
}

// Points one student earned on one question; 0 when never answered, null while it waits for a teacher.
export function earnedOn(q: Question, d: AttemptDetail): number | null {
  const answer = d.answers.find((a) => a.questionId === q.id);
  return answer ? questionScore(q, answer) : 0;
}

// `withNames: false` skips the roster lookup when only scores are needed.
export async function loadSession(sessionId: string, withNames = true) {
  const [detail, attempts] = await Promise.all([
    api((a) => a["session.get"]({ sessionId })),
    api((a) => a["session.attempts"]({ sessionId })),
  ]);
  const questions = detail.quiz.parts.flatMap((p) => p.questions);
  const ids = [...new Set([...detail.studentIds, ...attempts.map((d) => d.studentId)])];
  const roster = withNames && ids.length > 0 ? await api((a) => a["class.students"]({ studentIds: ids })) : [];
  const names = new Map<string, RosterStudent>(roster.map((s) => [s.id, s]));
  const latest = latestSubmitted(attempts);
  return { detail, session: detail.session, attempts, questions, ids, names, latest };
}

// The integrity analysis of the latest submitted attempts (typing flags left out).
export const integrityOf = (questions: readonly Question[], latest: ReadonlyMap<string, AttemptDetail>) =>
  analyzeSession({ attempts: [...latest.values()], questions });

// Question number (1-based) in the quiz's order.
export const numberOf = (questions: readonly Question[], id: string) => questions.findIndex((q) => q.id === id) + 1;

// Percent of the points earned per topic tag over some attempts: the page's class mastery. Answers waiting for a
// teacher are left out.
export function topicTotals(questions: readonly Question[], attempts: Iterable<AttemptDetail>) {
  const totals = new Map<string, { got: number; max: number; answers: number; times: number[] }>();
  for (const d of attempts) {
    for (const q of questions) {
      if (!d.questionOrder.includes(q.id)) continue;
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
