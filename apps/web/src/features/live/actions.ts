"use server";

import {
  addTime,
  allowBackIn,
  forceSubmit,
  getLiveAttempt,
  grantRetake,
  pauseSession,
  resumeSession,
  setLocked,
  warnStudent,
} from "@/features/live/data";
import { endSession, startSession } from "@/features/session/data";

// What the browser calls while a session runs. Each one re-checks the role on the server. The WebSocket ticket is a
// route (app/api/live/ticket), so reconnecting never waits behind these.
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
