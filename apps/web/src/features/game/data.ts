// Game mode on the server side of the web app: joining with a code, playing, and the teacher's reads.
import "server-only";
import type { AnswerValue } from "@examinus/domain/quiz";
import { requirePermission } from "@/lib/auth/dal";
import { readOrNull, readOrRefusal, write } from "@/lib/api/helpers";

// --- Students ---

// A join key to the session it opens (any mode); a classless session adds the student to its roster.
export async function findByCode(code: string) {
  await requirePermission({ attempt: ["read"] });
  return write((api) => api["game.find"]({ code }));
}

export async function joinGame(sessionId: string) {
  await requirePermission({ attempt: ["create"] });
  return write((api) => api["game.join"]({ sessionId }));
}

export async function answerGame(sessionId: string, questionId: string, value: AnswerValue) {
  await requirePermission({ attempt: ["update"] });
  return write((api) => api["game.answer"]({ sessionId, questionId, value }));
}

// Student-paced: Play, then the next question.
export async function nextGame(sessionId: string) {
  await requirePermission({ attempt: ["update"] });
  return write((api) => api["game.next"]({ sessionId }));
}

// The final standings, once the game is over. Null when the game doesn't exist.
export async function getMyGameStandings(sessionId: string) {
  await requirePermission({ attempt: ["read"] });
  return readOrRefusal((api) => api["game.standings"]({ sessionId }));
}

// --- Teachers (their live controls are in commands.ts) ---

export async function getGameStandings(sessionId: string) {
  await requirePermission({ session: ["read"] });
  return readOrNull((api) => api["game.standings"]({ sessionId }));
}

// The class gallery of one essay or drawing question.
export async function getGallery(sessionId: string, questionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.gallery"]({ sessionId, questionId }));
}

// --- Team Relay: players ---

export async function pickTeam(sessionId: string, teamId: string) {
  await requirePermission({ attempt: ["update"] });
  return write((api) => api["game.pickTeam"]({ sessionId, teamId }));
}

export async function retryQuestion(sessionId: string) {
  await requirePermission({ attempt: ["update"] });
  return write((api) => api["game.retry"]({ sessionId }));
}

export async function claimRescue(sessionId: string, questionId: string) {
  await requirePermission({ attempt: ["update"] });
  return write((api) => api["game.claimRescue"]({ sessionId, questionId }));
}

export async function answerRescue(sessionId: string, questionId: string, value: AnswerValue) {
  await requirePermission({ attempt: ["update"] });
  return write((api) => api["game.rescue"]({ sessionId, questionId, value }));
}

export async function submitPassword(sessionId: string, guess: string) {
  await requirePermission({ attempt: ["update"] });
  return write((api) => api["game.submitPassword"]({ sessionId, guess }));
}

export async function confirmPassword(sessionId: string) {
  await requirePermission({ attempt: ["update"] });
  return write((api) => api["game.confirmPassword"]({ sessionId }));
}

export async function rejectPassword(sessionId: string) {
  await requirePermission({ attempt: ["update"] });
  return write((api) => api["game.rejectPassword"]({ sessionId }));
}
