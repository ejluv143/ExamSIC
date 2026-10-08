// Shared plumbing for the data modules: runs an API call with the browser's cookies and turns the declared
// errors into what pages need (a redirect, a 404, or a message for a form).
import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Result, type Effect } from "effect";
import type { RpcClientError } from "effect/rpc";
import type { ClassInfo, RosterStudent } from "@examora/contract";
import { callApi, forwardedHeaders, type Api } from "../api/client";
import type { Class, Student } from "../types";

type Call<A, E> = Parameters<typeof callApi<A, E>>[0];
type Failure = { readonly _tag: string; readonly message?: string };

const request = async <A, E>(call: Call<A, E>) => callApi(call, forwardedHeaders(await headers()));

// For reads: the result, or a redirect (signed out, or the role changed since the page check) or a 404.
export async function read<A, E extends Failure>(call: Call<A, E>): Promise<A> {
  const result = await request(call);
  if (Result.isSuccess(result)) return result.success;
  const { _tag } = result.failure;
  if (_tag === "NotFound") notFound();
  redirect(_tag === "Unauthorized" ? "/login" : "/");
}

// For reads of one record that may not exist (or isn't the signed-in user's): null instead of a 404.
export async function readOrNull<A, E extends Failure>(call: Call<A, E>): Promise<A | null> {
  const result = await request(call);
  if (Result.isSuccess(result)) return result.success;
  const { _tag } = result.failure;
  if (_tag === "NotFound") return null;
  redirect(_tag === "Unauthorized" ? "/login" : "/");
}

// For reads whose refusal the page explains (Forbidden, Conflict): the failure's tag and message.
export type Refusal = { refused: { tag: string; message: string } };
export async function readOrRefusal<A, E extends Failure>(call: Call<A, E>): Promise<A | Refusal | null> {
  const result = await request(call);
  if (Result.isSuccess(result)) return result.success;
  const { _tag, message } = result.failure;
  if (_tag === "NotFound") return null;
  if (_tag === "Forbidden" || _tag === "Conflict") return { refused: { tag: _tag, message: message ?? "" } };
  redirect(_tag === "Unauthorized" ? "/login" : "/");
}

export type Outcome<A> = { ok: A } | { error: string };

// For actions: the declared errors come back as a message to show.
export async function write<A, E extends Failure>(call: Call<A, E>): Promise<Outcome<A>> {
  const result = await request(call);
  if (Result.isSuccess(result)) return { ok: result.success };
  const { _tag, message } = result.failure;
  if (_tag === "Unauthorized") redirect("/login");
  return { error: message ?? (_tag === "NotFound" ? "That no longer exists." : "You can't do that.") };
}

type SessionRefusal = { readonly _tag: "Unauthorized" | "Forbidden" };

// A lost session goes to sign-in and a refused permission home (the pages check both first, so either means
// the session or role changed in between). Other declared errors come back in the result.
export async function apiCall<A, E extends { readonly _tag: string }>(
  run: (api: Api) => Effect.Effect<A, E | RpcClientError.RpcClientError>,
): Promise<Result.Result<A, Exclude<E, SessionRefusal>>> {
  const result = await callApi(run, forwardedHeaders(await headers()));
  if (Result.isFailure(result)) {
    if (result.failure._tag === "Unauthorized") redirect("/login");
    if (result.failure._tag === "Forbidden") redirect("/");
  }
  return result as Result.Result<A, Exclude<E, SessionRefusal>>;
}

// For calls with no errors beyond the session and permission ones.
export async function apiValue<A>(
  run: (api: Api) => Effect.Effect<A, SessionRefusal | RpcClientError.RpcClientError>,
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
