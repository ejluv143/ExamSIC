"use server";

import { revalidatePath } from "next/cache";
import {
  createSession,
  endSession,
  getSession,
  openLobby,
  releaseResults,
  removeSession,
  startSession,
  updateSession,
  type NewSessionInput,
  type SessionInput,
  gradeAnswer,
} from "@/features/session/data";
import { refresh } from "@/lib/refresh";

// Creates a session of the quiz, for a class's students (roster ids) or, without a class, for anyone with the key.
export async function createSessionAction(quizId: string, input: NewSessionInput) {
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

// Opens the lobby of a scheduled session.
export async function openLobbyAction(sessionId: string) {
  const result = await openLobby(sessionId);
  if (!("error" in result)) refresh();
  return result;
}

// Starts a session whose lobby is open.
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

// The room and exit passwords, relay password and clues, and network allowlist of a session, to fill the form when
// the teacher edits it.
export async function sessionSecretsAction(sessionId: string) {
  const found = await getSession(sessionId);
  return found
    ? {
        roomPassword: found.roomPassword,
        exitPassword: found.exitPassword,
        ipAllowlist: found.ipAllowlist,
        relayPassword: found.relayPassword,
        relayClues: found.relayClues,
      }
    : null;
}

// Saves the teacher's score (points; null clears it) and feedback for one answer. The result says whether
// the attempt is now graded. `reason` is kept in the exam record when a released score changes.
export async function gradeAnswerAction(
  attemptId: string,
  questionId: string,
  manualScore: number | null,
  feedback: string | null,
  reason?: string,
) {
  const result = await gradeAnswer(attemptId, questionId, manualScore, feedback, reason);
  if ("error" in result) return result;
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
  return result;
}
