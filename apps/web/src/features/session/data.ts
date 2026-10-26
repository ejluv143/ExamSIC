import "server-only";
import { cache } from "react";
import type { QuizDetail } from "@examinus/contract/quiz";
import type { AttemptDetail, SessionListItem, SessionSettingsFields, ExamRecord } from "@examinus/contract/session";
import type { Accommodations } from "@examinus/domain/accommodations";
import type { Question } from "@examinus/domain/question";
import type { Session } from "@examinus/domain/quiz";
import { requirePermission } from "@/lib/auth/dal";
import { read, readOrNull, write, type Outcome } from "@/lib/api/helpers";
import type { Student } from "@/features/classes/types";
import { paperVersion } from "@examinus/domain/exam";
import {
  eventsLevel,
  integrityReport,
  type IntegrityLevel,
  type IntegrityReport,
  type Signal,
} from "@examinus/domain/integrity";
import { itemAnalysis, type ItemAnalysis } from "@examinus/domain/item-analysis";
import { attemptScore, questionScore, type AttemptScore } from "@examinus/domain/scoring";
import { answerMap, questionsOf, quizQuestions, scoreOf } from "./attempt-view";
import { sessionIntegrity } from "./session-integrity";
import { getExamRecord } from "@/features/live/data";
import { getStudent, getStudents } from "@/features/classes/data";

// classId null: no class, so any student on a class roster may join with the key.
export type SessionInput = SessionSettingsFields & { classId: string | null };
export type NewSessionInput = SessionInput & { startNow: boolean };

export async function listSessions(filter: { quizId?: string; classId?: string } = {}): Promise<readonly SessionListItem[]> {
  await requirePermission({ session: ["read"] });
  return read((api) => api["session.list"](filter));
}

// A session with its quiz (answer key included) and the roster ids on it. Once per request: a page and the
// helpers below it can all ask for the same session.
export const getSession = cache(async (sessionId: string) => {
  await requirePermission({ session: ["read"] });
  return readOrNull((api) => api["session.get"]({ sessionId }));
});

export async function createSession(quizId: string, input: NewSessionInput): Promise<Outcome<Session>> {
  await requirePermission({ session: ["create"] });
  return write((api) => api["session.create"]({ quizId, ...input }));
}

export async function updateSession(sessionId: string, input: SessionInput): Promise<Outcome<Session>> {
  await requirePermission({ session: ["create"] });
  return write((api) => api["session.update"]({ sessionId, ...input }));
}

export async function openLobby(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.openLobby"]({ sessionId }));
}

export async function startSession(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.start"]({ sessionId }));
}

export async function endSession(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.end"]({ sessionId }));
}

export async function removeSession(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.remove"]({ sessionId }));
}

// Sets (null: clears) what one student of the roster gets in this session: more time, more attempts, exemptions.
export async function setAccommodations(sessionId: string, studentId: string, accommodations: Accommodations | null) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.setAccommodations"]({ sessionId, studentId, accommodations }));
}

export async function releaseResults(sessionId: string, released: boolean) {
  await requirePermission({ result: ["release"] });
  return write((api) => api["session.releaseResults"]({ sessionId, released }));
}

// Every attempt of a session, submitted or not, with answers, scores and what the integrity checks saw.
export async function getAttempts(sessionId: string): Promise<readonly AttemptDetail[]> {
  await requirePermission({ session: ["read"] });
  return read((api) => api["session.attempts"]({ sessionId }));
}

// Sets (null clears) the teacher's score in points and the feedback for one answer. Exam sessions need a
// `reason` when a score changes after the results were released.
export async function gradeAnswer(
  attemptId: string,
  questionId: string,
  manualScore: number | null,
  feedback: string | null,
  reason?: string,
) {
  await requirePermission({ session: ["host"] });
  return write((api) =>
    api["session.grade"]({ attemptId, questionId, manualScore, feedback, ...(reason === undefined ? {} : { reason }) }),
  );
}

export type AttemptReport = {
  session: Session;
  quiz: QuizDetail;
  questions: readonly Question[];
  student: Student | null;
  record: ExamRecord;
  report: IntegrityReport;
  level: IntegrityLevel;
  signals: readonly Signal[];
  score: AttemptScore;
  version: string;
};

// The integrity report of one attempt of a session, or null when the session, the attempt or the quiz doesn't match.
export async function getAttemptReport(quizId: string, sessionId: string, attemptId: string): Promise<AttemptReport | null> {
  const [detail, record] = await Promise.all([getSession(sessionId), getExamRecord(attemptId)]);
  if (!detail || detail.session.quizId !== quizId) return null;
  if (!record || record.detail.attempt.sessionId !== sessionId) return null;
  const questions = quizQuestions(detail.quiz);
  // After the checks, so a session that doesn't match still returns null rather than a 404.
  const [attempts, student] = await Promise.all([getAttempts(sessionId), getStudent(record.detail.studentId)]);
  const { analysis } = sessionIntegrity(questions, attempts);
  const own = analysis.attempts[attemptId];
  // An attempt that isn't its student's latest submitted one (or isn't submitted) has no comparison with others.
  const report = own?.report ?? integrityReport(record.detail.integrityEvents);
  return {
    session: detail.session,
    quiz: detail.quiz,
    questions,
    student,
    record,
    report,
    level: own?.level ?? eventsLevel(record.detail.integrityEvents),
    signals: own?.signals ?? [],
    score: scoreOf(questions, record.detail),
    version: paperVersion(record.detail.attempt.seed),
  };
}

export type ResultsRow = {
  student: Student;
  status: "Graded" | "Needs grading" | "In progress" | "Not submitted";
  score: AttemptScore | null;
  level: IntegrityLevel | null;
  version: string | null;
  submittedAt: string | null;
  // Points per part and per question (quiz order); null when the student's paper didn't have it or it still waits for grading.
  parts: (number | null)[];
  questions: (number | null)[];
};

export type ResultsExport = {
  session: Session;
  quiz: QuizDetail;
  questions: readonly Question[];
  rows: ResultsRow[];
  // Item analysis of the latest submitted attempts.
  analysis: ItemAnalysis;
};

// Every rostered student of a session with the latest submitted attempt's scores, or null when it doesn't match.
export async function getResultsExport(quizId: string, sessionId: string): Promise<ResultsExport | null> {
  const detail = await getSession(sessionId);
  if (!detail || detail.session.quizId !== quizId) return null;
  const questions = quizQuestions(detail.quiz);
  const [attempts, roster] = await Promise.all([getAttempts(sessionId), getStudents([...detail.studentIds])]);
  const { latest, analysis } = sessionIntegrity(questions, attempts);

  const rows = roster.map((student): ResultsRow => {
    const last = latest.get(student.id);
    if (!last) {
      const started = attempts.some((d) => d.studentId === student.id);
      return {
        student,
        status: started ? "In progress" : "Not submitted",
        score: null,
        level: null,
        version: null,
        submittedAt: null,
        parts: detail.quiz.parts.map(() => null),
        questions: questions.map(() => null),
      };
    }
    const answers = answerMap(last);
    const had = new Set(questionsOf(questions, last).map((q) => q.id));
    const points = new Map(questions.map((q) => [q.id, had.has(q.id) ? questionScore(q, answers.get(q.id) ?? undefined) ?? null : null]));
    // A question without an answer row was left blank and earns nothing.
    for (const q of questions) if (had.has(q.id) && !answers.has(q.id)) points.set(q.id, 0);
    return {
      student,
      status: last.attempt.status === "graded" ? "Graded" : "Needs grading",
      score: attemptScore(questionsOf(questions, last), answers),
      level: analysis.attempts[last.attempt.id]?.level ?? null,
      version: paperVersion(last.attempt.seed),
      submittedAt: last.attempt.submittedAt,
      parts: detail.quiz.parts.map((part) => {
        const own = part.questions.filter((q) => had.has(q.id));
        if (own.length === 0) return null;
        const earned = own.map((q) => points.get(q.id) ?? null);
        return earned.some((p) => p === null) ? null : earned.reduce<number>((n, p) => n + (p ?? 0), 0);
      }),
      questions: questions.map((q) => points.get(q.id) ?? null),
    };
  });
  return { session: detail.session, quiz: detail.quiz, questions, rows, analysis: itemAnalysis(questions, [...latest.values()]) };
}
