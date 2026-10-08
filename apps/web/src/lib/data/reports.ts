// What the teacher's printable reports and Excel exports are built from: one student's integrity report, and
// the scores of a whole session.
import "server-only";
import {
  eventsLevel,
  integrityReport,
  paperVersion,
  type ExamRecord,
  type IntegrityLevel,
  type IntegrityReport,
  type Question,
  type QuizDetail,
  type Session,
  type Signal,
} from "@examora/contract";
import { attemptScore, questionScore, type AttemptScore } from "@examora/contract/scoring";
import { answerMap, questionsOf, quizQuestions, scoreOf } from "../attempt-view";
import { sessionIntegrity } from "../session-integrity";
import type { Student } from "../types";
import { getExamRecord } from "./live";
import { getAttempts, getSession, getStudent, getStudents } from "./teacher";

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
  const detail = await getSession(sessionId);
  if (!detail || detail.session.quizId !== quizId) return null;
  const record = await getExamRecord(attemptId);
  if (!record || record.detail.attempt.sessionId !== sessionId) return null;
  const questions = quizQuestions(detail.quiz);
  const attempts = await getAttempts(sessionId);
  const { analysis } = sessionIntegrity(questions, attempts);
  const own = analysis.attempts[attemptId];
  // An attempt that isn't its student's latest submitted one (or isn't submitted) has no comparison with others.
  const report = own?.report ?? integrityReport(record.detail.integrityEvents);
  return {
    session: detail.session,
    quiz: detail.quiz,
    questions,
    student: await getStudent(record.detail.studentId),
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
  return { session: detail.session, quiz: detail.quiz, questions, rows };
}
