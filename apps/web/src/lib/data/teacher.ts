// Data access for the teacher module: classes and rosters, quizzes, sessions, the question bank and attempts all
// come from the API.
import "server-only";
import type {
  AttemptDetail,
  ClassFields,
  PaperHeader,
  PaperSettings,
  Question,
  QuizListItem,
  Session,
  SessionListItem,
  SessionSettingsFields,
} from "@examora/contract";
import { assetIdsIn } from "@examora/contract";
import { requirePermission } from "../auth/dal";
import { assetUrls } from "./assets";
import { toDraft, toEditorQuiz, type EditorQuiz } from "../quiz-editor";
import { apiCall, apiValue, messageOf, read, readOrNull, toClass, toStudent, write, type Outcome } from "./api";
import type { Class, Student } from "../types";

// Defaults for new papers; each quiz keeps its own copy so it can be changed.
export const defaultGeneralInstructions = [
  "PRAY before you start.",
  "READ and follow all instructions carefully for each test section.",
  "WRITE your answers clearly and neatly using a black or blue pen.",
  "AVOID erasures, alterations, or superimpositions on your answer sheet.",
  "MANAGE your time wisely and review your answers before submitting.",
  "MAINTAIN academic integrity cheating in any form will result in disciplinary action.",
];

export const schoolPaper: PaperSettings = {
  size: "long",
  answerSheet: false,
  // Filled in with the signed-in teacher's name when a quiz is created.
  instructor: "",
  generalInstructions: defaultGeneralInstructions,
  footer: {
    documentNo: "SIC-F-CIM-03",
    effectivityDate: "August 3, 2026",
    revisionNo: "00",
    member: "Member: PAASCU, CEAP, BUACS",
    motto: "Forming Competent Men and Women of Prayer and Service for Others",
  },
};

export const schoolProfile: Omit<PaperHeader, "period" | "dates"> = {
  schoolLogoUrl: "/logos/san-isidro-college.png",
  departmentLogoUrl: "/logos/school-of-it.png",
  school: "San Isidro College",
  schoolAddress: "City of Malaybalay",
  department: "School of Information Technology",
  semester: "first",
  academicYear: "2026-2027",
};

// The signed-in teacher's classes (archived ones left out).
export async function getClasses(): Promise<Class[]> {
  await requirePermission({ class: ["read"] });
  return (await apiValue((api) => api["class.list"]())).map(toClass);
}

// One of the signed-in teacher's classes, or null.
export async function getClass(id: string): Promise<Class | null> {
  await requirePermission({ class: ["read"] });
  const cls = await apiValue((api) => api["class.get"]({ classId: id }));
  return cls && toClass(cls);
}

// Students on the teacher's class rosters or on their sessions' rosters; other ids are left out.
export async function getStudents(ids: string[]): Promise<Student[]> {
  await requirePermission({ roster: ["read"] });
  if (ids.length === 0) return [];
  const list = await apiValue((api) => api["class.students"]({ studentIds: ids }));
  return list.map(toStudent).sort((a, b) => a.lastName.localeCompare(b.lastName));
}

export async function getStudent(id: string) {
  return (await getStudents([id]))[0] ?? null;
}

// Creates a class with a new join code; returns its id.
export async function createClass(fields: ClassFields): Promise<string> {
  await requirePermission({ class: ["create"] });
  return (await apiValue((api) => api["class.create"](fields))).id;
}

// The rest return an error message, or null when done.
export async function updateClass(classId: string, fields: ClassFields) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.update"]({ classId, fields })));
}

export async function archiveClass(classId: string) {
  await requirePermission({ class: ["delete"] });
  return messageOf(await apiCall((api) => api["class.archive"]({ classId })));
}

export async function newJoinCode(classId: string) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.newJoinCode"]({ classId })));
}

export async function removeStudent(classId: string, studentId: string) {
  await requirePermission({ roster: ["update"] });
  return messageOf(await apiCall((api) => api["class.removeStudent"]({ classId, studentId })));
}

// --- Quizzes ---

// The teacher's quizzes with their sessions, newest session first.
export async function listQuizzes(): Promise<readonly QuizListItem[]> {
  await requirePermission({ assessment: ["read"] });
  return read((api) => api["quiz.list"]());
}

// A quiz in the shape the editor works on, or null when it doesn't exist.
export async function getEditorQuiz(quizId: string): Promise<EditorQuiz | null> {
  await requirePermission({ assessment: ["read"] });
  const detail = await readOrNull((api) => api["quiz.get"]({ quizId }));
  return detail && toEditorQuiz(detail);
}

export async function getQuiz(quizId: string) {
  await requirePermission({ assessment: ["read"] });
  return readOrNull((api) => api["quiz.get"]({ quizId }));
}

export async function getQuestionBank(): Promise<readonly Question[]> {
  await requirePermission({ assessment: ["read"] });
  return read((api) => api["quiz.bank"]());
}

// Signed image URLs for whatever quiz content a teacher page shows: every asset id found in `content`.
export async function contentAssetUrls(content: unknown): Promise<Record<string, string>> {
  await requirePermission({ assessment: ["read"] });
  return assetUrls(assetIdsIn(JSON.stringify(content)));
}

// Saves a quiz from the editor; a new one gets its id here.
export async function saveQuiz(quiz: EditorQuiz): Promise<Outcome<{ quizId: string }>> {
  await requirePermission({ assessment: [quiz.id === "new" ? "create" : "update"] });
  return write((api) => api["quiz.save"]({ draft: toDraft(quiz) }));
}

export async function removeQuiz(quizId: string) {
  await requirePermission({ assessment: ["delete"] });
  return write((api) => api["quiz.remove"]({ quizId }));
}

export async function duplicateQuiz(quizId: string) {
  await requirePermission({ assessment: ["create"] });
  return write((api) => api["quiz.duplicate"]({ quizId }));
}

// --- Sessions ---

// classId null: no class, so any student on a class roster may join with the key.
export type SessionInput = SessionSettingsFields & { classId: string | null };
export type NewSessionInput = SessionInput & { startNow: boolean };

export async function listSessions(filter: { quizId?: string; classId?: string } = {}): Promise<readonly SessionListItem[]> {
  await requirePermission({ session: ["read"] });
  return read((api) => api["session.list"](filter));
}

// A session with its quiz (answer key included) and the roster ids on it.
export async function getSession(sessionId: string) {
  await requirePermission({ session: ["read"] });
  return readOrNull((api) => api["session.get"]({ sessionId }));
}

export async function createSession(quizId: string, input: NewSessionInput): Promise<Outcome<Session>> {
  await requirePermission({ session: ["create"] });
  return write((api) => api["session.create"]({ quizId, ...input }));
}

export async function updateSession(sessionId: string, input: SessionInput): Promise<Outcome<Session>> {
  await requirePermission({ session: ["create"] });
  return write((api) => api["session.update"]({ sessionId, ...input }));
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
