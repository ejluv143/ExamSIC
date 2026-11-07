import "server-only";
import { command } from "../session/commands";
import type { Call, Failure } from "@/lib/api/helpers";

// The teacher's live controls of a game. Like the session commands, each owns its permission, the write and the
// refresh, so the pages that show the game's status re-read when one succeeds.
const host = <A, E extends Failure>(call: Call<A, E>) => command({ session: ["host"] }, call);

export const openLobby = (sessionId: string) => host((api) => api["game.openLobby"]({ sessionId }));
export const startGame = (sessionId: string) => host((api) => api["game.start"]({ sessionId }));
export const advanceGame = (sessionId: string) => host((api) => api["game.advance"]({ sessionId }));
export const endGame = (sessionId: string) => host((api) => api["game.end"]({ sessionId }));

// Teacher-paced clock controls.
export const pauseGame = (sessionId: string) => host((api) => api["game.pause"]({ sessionId }));
export const resumeGame = (sessionId: string) => host((api) => api["game.resume"]({ sessionId }));
// Opens the question at `index` (not played yet) instead of the next one.
export const goToQuestion = (sessionId: string, index: number) => host((api) => api["game.goTo"]({ sessionId, index }));
export const setGameSeconds = (sessionId: string, seconds: number) => host((api) => api["game.setSeconds"]({ sessionId, seconds }));

export const kickPlayer = (sessionId: string, attemptId: string) => host((api) => api["game.kick"]({ sessionId, attemptId }));
// Lets a removed player join again with the key.
export const allowRejoin = (sessionId: string, userId: string) => host((api) => api["game.allowRejoin"]({ sessionId, userId }));

// Team Relay, in the lobby.
export const assignTeam = (sessionId: string, attemptId: string, teamId: string | null) =>
  host((api) => api["game.assignTeam"]({ sessionId, attemptId, teamId }));
export const randomizeTeams = (sessionId: string) => host((api) => api["game.randomizeTeams"]({ sessionId }));
export const balanceTeams = (sessionId: string) => host((api) => api["game.balanceTeams"]({ sessionId }));
export const addTeam = (sessionId: string) => host((api) => api["game.addTeam"]({ sessionId }));
export const removeTeam = (sessionId: string, teamId: string) => host((api) => api["game.removeTeam"]({ sessionId, teamId }));
export const setStudentPick = (sessionId: string, allowed: boolean) => host((api) => api["game.setStudentPick"]({ sessionId, allowed }));
