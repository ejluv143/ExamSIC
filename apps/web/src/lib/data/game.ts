// Game mode on the server side of the web app: joining with a code, playing, and the teacher's controls.
import "server-only";
import type { AnswerValue } from "@examinus/contract";
import { requirePermission } from "../auth/dal";
import { readOrNull, readOrRefusal, write } from "./api";

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

// Teacher-paced clock controls.
export async function pauseGame(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.pause"]({ sessionId }));
}

export async function resumeGame(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.resume"]({ sessionId }));
}

// Opens the question at `index` (not played yet) instead of the next one.
export async function goToQuestion(sessionId: string, index: number) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.goTo"]({ sessionId, index }));
}

export async function setGameSeconds(sessionId: string, seconds: number) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.setSeconds"]({ sessionId, seconds }));
}

export async function endGame(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.end"]({ sessionId }));
}

export async function kickPlayer(sessionId: string, attemptId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.kick"]({ sessionId, attemptId }));
}

// Lets a removed player join again with the key.
export async function allowRejoin(sessionId: string, userId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.allowRejoin"]({ sessionId, userId }));
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

// --- Team Relay: the teacher, in the lobby ---

export async function assignTeam(sessionId: string, attemptId: string, teamId: string | null) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.assignTeam"]({ sessionId, attemptId, teamId }));
}

export async function randomizeTeams(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.randomizeTeams"]({ sessionId }));
}

export async function balanceTeams(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.balanceTeams"]({ sessionId }));
}

export async function addTeam(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.addTeam"]({ sessionId }));
}

export async function removeTeam(sessionId: string, teamId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.removeTeam"]({ sessionId, teamId }));
}

export async function setStudentPick(sessionId: string, allowed: boolean) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["game.setStudentPick"]({ sessionId, allowed }));
}
