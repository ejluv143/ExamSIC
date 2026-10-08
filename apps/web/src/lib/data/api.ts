// API calls from the data layer, with the browser's session.
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result, type Effect } from "effect";
import type { RpcClientError } from "effect/rpc";
import type { ClassInfo, RosterStudent } from "@examora/contract";
import { callApi, forwardedHeaders, type Api } from "../api/client";
import type { Class, Student } from "../types";

type Refusal = { readonly _tag: "Unauthorized" | "Forbidden" };

// A lost session goes to sign-in and a refused permission home (the pages check both first, so either means
// the session or role changed in between). Other declared errors come back in the result.
export async function apiCall<A, E extends { readonly _tag: string }>(
  run: (api: Api) => Effect.Effect<A, E | RpcClientError.RpcClientError>,
): Promise<Result.Result<A, Exclude<E, Refusal>>> {
  const result = await callApi(run, forwardedHeaders(await headers()));
  if (Result.isFailure(result)) {
    if (result.failure._tag === "Unauthorized") redirect("/login");
    if (result.failure._tag === "Forbidden") redirect("/");
  }
  return result as Result.Result<A, Exclude<E, Refusal>>;
}

// For calls with no errors beyond the session and permission ones.
export async function apiValue<A>(
  run: (api: Api) => Effect.Effect<A, Refusal | RpcClientError.RpcClientError>,
): Promise<A> {
  const result = await apiCall(run);
  return (result as Result.Success<A, never>).success;
}

// An error message for people, or null when the call worked.
export const messageOf = (result: Result.Result<unknown, { readonly message: string }>) =>
  Result.isFailure(result) ? result.failure.message : null;

// The API's class in the shape the pages use.
export const toClass = (c: ClassInfo & { readonly joinCode?: string }): Class => ({
  id: c.id,
  courseCode: c.courseCode,
  title: c.title,
  section: c.section,
  term: c.term,
  schedule: c.schedule,
  room: c.room,
  units: c.units,
  classroom: c.classroom,
  studentIds: [...c.studentIds],
  // Unset: the pages guess it from the course code and title.
  ...(c.subjectArea && { subjectArea: c.subjectArea }),
  ...(c.joinCode !== undefined && { joinCode: c.joinCode }),
});

export const toStudent = (s: RosterStudent): Student => ({ ...s });
