"use server";

import {
  createSession,
  endSession,
  openLobby,
  releaseResults,
  removeSession,
  setAccommodations,
  startSession,
  updateSession,
} from "@/features/session/commands";
import { getSession, gradeAnswer } from "@/features/session/data";
import { refresh } from "@/lib/refresh";

// What the browser calls on a session. The lifecycle commands (features/session/commands.ts) own their permission
// and refresh; each one re-checks the role on the server.
export const createSessionAction = createSession;
export const updateSessionAction = updateSession;
export const openLobbyAction = openLobby;
export const startSessionAction = startSession;
export const endSessionAction = endSession;
export const removeSessionAction = removeSession;
export const setAccommodationsAction = setAccommodations;
export const releaseResultsAction = releaseResults;

// The room and exit passwords, relay password and clues, and network allowlist of a session: what the form needs
// besides the Session to edit it.
export type SessionSecrets = {
  roomPassword: string | null;
  exitPassword: string | null;
  ipAllowlist: readonly string[];
  relayPassword: string | null;
  relayClues: readonly string[];
};

export async function sessionSecretsAction(sessionId: string): Promise<SessionSecrets | null> {
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
  refresh();
  return result;
}
