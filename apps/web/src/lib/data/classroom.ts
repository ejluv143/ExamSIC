// Google Classroom for teachers: connecting their Google account, importing courses as classes, syncing rosters.
// The API talks to Google; this only relays.
import "server-only";
import { Result } from "effect";
import type { ClassroomCourse, ResponseCookie } from "@examora/contract";
import { requirePermission } from "../auth/dal";
import { apiCall, apiValue } from "./api";

export async function getClassroomStatus() {
  await requirePermission({ class: ["create"] });
  return apiValue((api) => api["classroom.status"]());
}

// The teacher's Classroom courses, or a message saying why they can't be listed (not connected, Google refused).
export async function getClassroomCourses(): Promise<{ courses: readonly ClassroomCourse[] } | { error: string }> {
  await requirePermission({ class: ["read"] });
  const result = await apiCall((api) => api["classroom.courses"]());
  return Result.isSuccess(result) ? { courses: result.success } : { error: result.failure.message };
}

// Google's consent URL and Better Auth's OAuth state cookie, or a message.
export async function connectClassroom(): Promise<{ url: string; cookies: readonly ResponseCookie[] } | { error: string }> {
  await requirePermission({ class: ["create"] });
  const result = await apiCall((api) =>
    api["classroom.connect"]({
      callbackURL: "/teacher/classes/import",
      errorCallbackURL: "/teacher/classes?classroom=failed",
    }),
  );
  return Result.isSuccess(result) ? result.success : { error: result.failure.message };
}

export async function importClassroomCourses(courseIds: string[]): Promise<{ classIds: readonly string[] } | { error: string }> {
  await requirePermission({ class: ["create"], roster: ["update"] });
  const result = await apiCall((api) => api["classroom.import"]({ courseIds }));
  return Result.isSuccess(result) ? result.success : { error: result.failure.message };
}

// Adds students who joined the Classroom course since the last sync. A message for people either way.
export async function syncClassroomRoster(classId: string): Promise<{ ok: string } | { error: string }> {
  await requirePermission({ roster: ["update"] });
  const result = await apiCall((api) => api["classroom.sync"]({ classId }));
  if (Result.isFailure(result)) return { error: result.failure.message };
  const { added, total } = result.success;
  return {
    ok: added === 0 ? `Up to date: ${total} students.` : `Added ${added} new ${added === 1 ? "student" : "students"}; ${total} in all.`,
  };
}
