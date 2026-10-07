// Game mode on the server side of the web app: joining with a code, playing, and the teacher's controls.
import "server-only";
import type { AnswerValue } from "@examora/contract";
import { requirePermission } from "../auth/dal";
import { readOrNull, readOrRefusal, write } from "./api";

// --- Students ---

// A join code to the session it opens (any mode), if the student is on its roster.
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

// --- Teachers ---

export async function openLobby(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.openLobby"]({ sessionId }));
}

export async function startGame(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.start"]({ sessionId }));
}

export async function advanceGame(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.advance"]({ sessionId }));
}

export async function endGame(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.end"]({ sessionId }));
}

export async function kickPlayer(sessionId: string, attemptId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.kick"]({ sessionId, attemptId }));
}

export async function getGameStandings(sessionId: string) {
  await requirePermission({ session: ["read"] });
  return readOrNull((api) => api["game.standings"]({ sessionId }));
}

// The class gallery of one drawing question.
export async function getGallery(sessionId: string, questionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.gallery"]({ sessionId, questionId }));
}
