"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assetIdsIn, defaultIntegrity, toStudentQuestion, type Paper } from "@examora/contract";
import { requirePermission } from "@/lib/auth/dal";
import { assetUrls } from "@/lib/data/assets";
import {
  createSession,
  duplicateQuiz,
  endSession,
  getSession,
  releaseResults,
  removeQuiz,
  removeSession,
  saveQuiz,
  startSession,
  updateSession,
  type SessionInput,
} from "@/lib/data/teacher";
import { quizPaperTotals, toDraft, type EditorQuiz } from "@/lib/quiz-editor";

// Lists, class records and students' pages all read quizzes and sessions.
function refresh() {
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
}

// Saves a quiz from the editor. A new one moves on to its own edit page, so reloading doesn't start a blank one.
export async function saveQuizAction(quiz: EditorQuiz) {
  const result = await saveQuiz(quiz);
  if ("error" in result) return result;
  refresh();
  if (quiz.id === "new") redirect(`/teacher/assessments/${result.ok.quizId}/edit?saved=1`);
  return { ok: result.ok };
}

export async function duplicateQuizAction(quizId: string) {
  const result = await duplicateQuiz(quizId);
  if ("error" in result) return result;
  refresh();
  redirect(`/teacher/assessments/${result.ok.quizId}`);
}

export async function removeQuizAction(quizId: string) {
  const result = await removeQuiz(quizId);
  if ("error" in result) return result;
  refresh();
  redirect("/teacher/assessments");
}

// Starts a session of the quiz for a class's students (roster ids).
export async function createSessionAction(quizId: string, input: SessionInput) {
  const result = await createSession(quizId, input);
  if ("error" in result) return result;
  refresh();
  return result;
}

export async function updateSessionAction(sessionId: string, input: SessionInput) {
  const result = await updateSession(sessionId, input);
  if ("error" in result) return result;
  refresh();
  return result;
}

// Opens a scheduled session now.
export async function startSessionAction(sessionId: string) {
  const result = await startSession(sessionId);
  if (!("error" in result)) refresh();
  return result;
}

// Ends a session now; attempts still in progress are submitted.
export async function endSessionAction(sessionId: string) {
  const result = await endSession(sessionId);
  if (!("error" in result)) refresh();
  return result;
}

export async function removeSessionAction(sessionId: string) {
  const result = await removeSession(sessionId);
  if (!("error" in result)) refresh();
  return result;
}

export async function releaseResultsAction(sessionId: string, released: boolean) {
  const result = await releaseResults(sessionId, released);
  if (!("error" in result)) refresh();
  return result;
}

// The editor's online preview: the paper as a student gets it (no answers, no shuffling), built from the
// unsaved draft. The session around it is a stand-in and is never stored.
export async function previewPaperAction(quiz: EditorQuiz): Promise<Paper> {
  await requirePermission({ assessment: ["read"] });
  const draft = toDraft(quiz);
  return {
    session: {
      id: "preview",
      quizId: quiz.id,
      classId: null,
      mode: "quiz",
      pacing: "student",
      status: "running",
      opensAt: null,
      closesAt: null,
      timeLimitMinutes: null,
      oneQuestionAtATime: false,
      questionTimeLimitSeconds: null,
      lateJoinMinutes: null,
      roomPasswordRequired: false,
      ipRestricted: false,
      attemptsAllowed: 1,
      resultsRelease: "immediately",
      resultsReleased: false,
      integrity: defaultIntegrity("quiz"),
      mastery: null,
      exam: null,
      game: null,
      countInRecord: false,
      joinCode: null,
      startedAt: null,
      endedAt: null,
      pausedAt: null,
    },
    quiz: {
      id: quiz.id,
      title: draft.title,
      description: draft.description,
      subject: draft.subject,
      subjectArea: draft.subjectArea,
      header: draft.header,
    },
    parts: draft.parts.map((part, position) => ({
      id: part.id,
      quizId: quiz.id,
      position,
      title: part.title,
      instructions: part.instructions,
      shuffleQuestions: false,
      poolSize: null,
      questions: part.questions.map((q) => toStudentQuestion(q)),
    })),
    attempt: null,
    attemptsUsed: 0,
    ...quizPaperTotals(quiz),
    progress: null,
    answers: {},
    assetUrls: await assetUrls(assetIdsIn(JSON.stringify([draft.description, draft.parts]))),
    typing: {},
    deadline: null,
    codeRunner: false,
    paused: false,
    locked: false,
  };
}

// The roster ids, room password and network allowlist of a session, to fill the form when the teacher edits it.
export async function sessionStudentsAction(sessionId: string) {
  const found = await getSession(sessionId);
  return found ? { studentIds: found.studentIds, roomPassword: found.roomPassword, ipAllowlist: found.ipAllowlist } : null;
}
