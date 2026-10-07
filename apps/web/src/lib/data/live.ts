// Live sessions on the server side of the web app: tickets for the browser's WebSocket, and the teacher's
// actions while a session runs.
import "server-only";
import type { TicketTarget } from "@examora/contract";
import { requirePermission } from "../auth/dal";
import { read, write } from "./api";

// A short-lived, single-use ticket for the live WebSocket. The browser can't send its login cookie to the API's
// host, so this server asks for the ticket with the cookie and hands it to the browser.
export async function getLiveTicket(target: TicketTarget) {
  await requirePermission(target._tag === "teacher" ? { session: ["host"] } : { attempt: ["read"] });
  return write((api) => api["live.ticket"]({ target }));
}

export async function pauseSession(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.pause"]({ sessionId }));
}

export async function resumeSession(sessionId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.resume"]({ sessionId }));
}

// Extra time for one student (attemptId) or everyone still taking the session.
export async function addTime(sessionId: string, seconds: number, attemptId?: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.addTime"]({ sessionId, seconds, ...(attemptId === undefined ? {} : { attemptId }) }));
}

export async function warnStudent(attemptId: string, message: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.warn"]({ attemptId, message }));
}

export async function setLocked(attemptId: string, locked: boolean) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.setLocked"]({ attemptId, locked }));
}

export async function forceSubmit(attemptId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.forceSubmit"]({ attemptId }));
}

export async function allowBackIn(attemptId: string) {
  await requirePermission({ session: ["host"] });
  return write((api) => api["session.allowBackIn"]({ attemptId }));
}

// One attempt with everything the live drawer shows: answers, typing, events and the actions taken.
export async function getLiveAttempt(attemptId: string) {
  await requirePermission({ session: ["read"] });
  return read((api) => api["session.liveAttempt"]({ attemptId }));
}
