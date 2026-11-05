import "server-only";
import type { Accommodations } from "@examinus/domain/accommodations";
import type { Permissions } from "@examinus/domain/permissions";
import { requirePermission } from "@/lib/auth/dal";
import { write, type Call, type Failure, type Outcome } from "@/lib/api/helpers";
import { refresh } from "@/lib/refresh";
import type { NewSessionInput, SessionInput } from "./data";

// Every command that changes a session or its lifecycle. Each one owns its permission, the write, and the refresh:
// when it succeeds, the teacher's and students' pages are re-read, wherever it was called from (the sessions list,
// the session page or the live view).
export async function command<A, E extends Failure>(permission: Permissions, call: Call<A, E>): Promise<Outcome<A>> {
  await requirePermission(permission);
  const result = await write(call);
  if (!("error" in result)) refresh();
  return result;
}

export const createSession = (quizId: string, input: NewSessionInput) =>
  command({ session: ["create"] }, (api) => api["session.create"]({ quizId, ...input }));

export const updateSession = (sessionId: string, input: SessionInput) =>
  command({ session: ["create"] }, (api) => api["session.update"]({ sessionId, ...input }));

export const openLobby = (sessionId: string) => command({ session: ["host"] }, (api) => api["session.openLobby"]({ sessionId }));
export const startSession = (sessionId: string) => command({ session: ["host"] }, (api) => api["session.start"]({ sessionId }));
export const pauseSession = (sessionId: string) => command({ session: ["host"] }, (api) => api["session.pause"]({ sessionId }));
export const resumeSession = (sessionId: string) => command({ session: ["host"] }, (api) => api["session.resume"]({ sessionId }));
export const endSession = (sessionId: string) => command({ session: ["host"] }, (api) => api["session.end"]({ sessionId }));
export const removeSession = (sessionId: string) => command({ session: ["host"] }, (api) => api["session.remove"]({ sessionId }));

// Sets (null: clears) what one student of the roster gets in this session: more time, more attempts, exemptions.
export const setAccommodations = (sessionId: string, studentId: string, accommodations: Accommodations | null) =>
  command({ session: ["host"] }, (api) => api["session.setAccommodations"]({ sessionId, studentId, accommodations }));

export const releaseResults = (sessionId: string, released: boolean) =>
  command({ result: ["release"] }, (api) => api["session.releaseResults"]({ sessionId, released }));
