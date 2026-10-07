// Shared plumbing for the data modules: runs an API call with the browser's cookies and turns the declared
// errors into what pages need (a redirect, a 404, or a message for a form).
import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Result } from "effect";
import { callApi, forwardedHeaders } from "../api/client";

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
