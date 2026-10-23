// What a live stream shows, from rows. Pure: the row types are the only thing taken from the database layer.
import { type Incident, type LiveStudent, type LiveStudentEvent } from "@examinus/contract/live";
import { type QuizDetail } from "@examinus/contract/quiz";
import { type Accommodations } from "@examinus/domain/accommodations";
import { eventsLevel, integrityReport } from "@examinus/domain/integrity";
import { hasAnswer, type IntegrityEvent } from "@examinus/domain/quiz";
import { attemptScore, autoScore } from "@examinus/domain/scoring";
import { quizTotals } from "@examinus/domain/shuffle";
import type {
  AnswerItem,
  AttemptItem,
  IncidentItem,
  IntegrityEventItem,
  QuizSessionItem,
} from "../../database/schemas/index.ts";
import { attemptDeadline } from "../session/rules.ts";
import { attemptPaper, flatQuestions, questionProgress, shownTimes } from "../attempt/rules.ts";

export const ticketTtlMs = 60_000;

const toEvent = (e: Pick<IntegrityEventItem, "type" | "at" | "durationMs">): IntegrityEvent => ({
  type: e.type,
  at: e.at.toISOString(),
  ...(e.durationMs === null ? {} : { durationMs: e.durationMs }),
});

export const toIncident = (r: IncidentItem): Incident => ({
  id: r.id,
  sessionId: r.sessionId,
  attemptId: r.attemptId,
  kind: r.kind,
  message: r.message,
  seconds: r.seconds,
  at: r.at.toISOString(),
});

// The table row for one student. `attempt` null: not started.
export function liveRow(input: {
  detail: QuizDetail;
  session: QuizSessionItem;
  rosterId: string;
  joinedAt: Date | null;
  accommodations: Accommodations | null;
  attempt: AttemptItem | null;
  answerRows: readonly AnswerItem[];
  eventRows: readonly IntegrityEventItem[];
  now: number;
}): LiveStudent {
  const { detail, session, rosterId, joinedAt, accommodations, attempt, answerRows, eventRows, now } = input;
  const joined = (joinedAt ?? attempt?.startedAt)?.toISOString() ?? null;
  if (!attempt) {
    const totals = quizTotals(detail.parts);
    return {
      studentId: rosterId,
      joinedAt: joined,
      attemptId: null,
      status: null,
      startedAt: null,
      submittedAt: null,
      lastSeenAt: null,
      answered: 0,
      questionCount: totals.questionCount,
      marked: 0,
      questionIndex: 0,
      questionStartedAt: null,
      currentQuestionId: null,
      score: 0,
      max: totals.totalPoints,
      alerts: 0,
      awayMs: 0,
      level: "low",
      locked: false,
      extraSeconds: 0,
      accommodations,
    };
  }
  const paper = flatQuestions(attemptPaper(detail, attempt.seed));
  const byQuestion = new Map(answerRows.map((a) => [a.questionId, a]));
  const open = attempt.status === "in_progress";
  const scored = new Map(
    paper.flatMap((q) => {
      const row = byQuestion.get(q.id);
      if (!row) return [];
      let auto = row.autoScore;
      if (open && session.mode !== "mastery") {
        try {
          auto = hasAnswer(row.value) ? autoScore(q, row.value, null) : null;
        } catch {
          auto = null;
        }
      }
      return [[q.id, { autoScore: auto, manualScore: row.manualScore }] as const];
    }),
  );
  const { score, max } = attemptScore(paper, scored);
  const answered = paper.filter((q) => hasAnswer(byQuestion.get(q.id)?.value ?? null)).length;

  let current = paper[0]?.id ?? null;
  let index = 0;
  if (session.mode === "mastery") {
    // The question at the head of the queue; the questions mastered so far are what the teacher watches.
    const head = attempt.masteryQueue?.[0];
    current = head ?? null;
    index = Math.max(0, paper.findIndex((q) => q.id === head));
  } else if (session.oneQuestionAtATime) {
    index = questionProgress(session, attempt, shownTimes(paper, answerRows), now).index;
    current = paper[index]?.id ?? null;
  } else {
    const latest = [...answerRows]
      .filter((a) => hasAnswer(a.value) && byQuestion.has(a.questionId))
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())[0];
    if (latest) current = latest.questionId;
    index = Math.max(0, paper.findIndex((q) => q.id === current));
  }

  const events = eventRows.map(toEvent);
  const report = integrityReport(events);
  return {
    studentId: rosterId,
    joinedAt: joined,
    attemptId: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    lastSeenAt: attempt.lastSeenAt?.toISOString() ?? null,
    answered,
    questionCount: paper.length,
    marked: paper.filter((q) => byQuestion.get(q.id)?.markedForReview).length,
    ...(session.mode === "mastery" ? { mastered: answerRows.filter((a) => a.correct === true).length } : {}),
    questionIndex: index,
    questionStartedAt: attempt.questionStartedAt?.toISOString() ?? null,
    currentQuestionId: current,
    score,
    max,
    alerts: events.filter((e) => e.type !== "window_resize").length,
    awayMs: Math.round(report.awayMs + report.fullscreenMs),
    level: eventsLevel(events),
    locked: attempt.locked,
    extraSeconds: Math.round(attempt.extraMs / 1000),
    accommodations,
  };
}

export const studentState = (
  session: Pick<QuizSessionItem, "pausedAt" | "closesAt" | "timeLimitMinutes">,
  attempt: Pick<AttemptItem, "locked" | "status" | "startedAt" | "extraMs">,
  accommodations?: Pick<Accommodations, "timeMultiplier" | "extraMinutes"> | null,
): Extract<LiveStudentEvent, { _tag: "state" }> => {
  const deadline = attemptDeadline(session, attempt, accommodations);
  return {
    _tag: "state",
    paused: session.pausedAt !== null,
    locked: attempt.locked,
    deadline: deadline === null ? null : new Date(deadline).toISOString(),
    pausedAt: session.pausedAt?.toISOString() ?? null,
    status: attempt.status,
  };
};
