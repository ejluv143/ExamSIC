"use server";

import type { TicketTarget } from "@examora/contract";
import {
  addTime,
  allowBackIn,
  forceSubmit,
  getLiveAttempt,
  grantRetake,
  getLiveTicket,
  pauseSession,
  resumeSession,
  setLocked,
  warnStudent,
} from "@/lib/data/live";
import { endSession, startSession } from "@/lib/data/teacher";

// What the browser calls while a session runs. Each one re-checks the role on the server.
export async function liveTicketAction(target: TicketTarget) {
  return getLiveTicket(target);
}

export const liveAttemptAction = getLiveAttempt;
export const startSessionAction = startSession;
export const endSessionAction = endSession;
export const pauseSessionAction = pauseSession;
export const resumeSessionAction = resumeSession;
export const addTimeAction = addTime;
export const warnStudentAction = warnStudent;
export const setLockedAction = setLocked;
export const forceSubmitAction = forceSubmit;
export const allowBackInAction = allowBackIn;
export const grantRetakeAction = grantRetake;
