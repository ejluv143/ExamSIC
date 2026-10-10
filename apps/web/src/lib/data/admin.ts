// Account management for admins. Accounts and the class roster come from the API.
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import type { Account } from "@examora/contract";
import { callApi, forwardedHeaders } from "../api/client";

// The API checks the permission; a refusal here means the session or role changed since the page check.
async function fromApi<A>(result: Result.Result<A, { _tag: "Unauthorized" | "Forbidden" }>): Promise<A> {
  if (Result.isSuccess(result)) return result.success;
  redirect(result.failure._tag === "Unauthorized" ? "/login" : "/");
}

export async function listUsers(): Promise<readonly Account[]> {
  return fromApi(await callApi((api) => api["admin.listUsers"](), forwardedHeaders(await headers())));
}

export async function getAccount(userId: string): Promise<Account | null> {
  return fromApi(await callApi((api) => api["admin.getUser"]({ userId }), forwardedHeaders(await headers())));
}

// Class-roster entries a student account can sign in as. An entry imported from Google Classroom has no student
// number until the student first signs in, so it shows their email instead.
export async function getRoster() {
  const roster = await fromApi(await callApi((api) => api["admin.listRoster"](), forwardedHeaders(await headers())));
  return roster
    .map((s) => ({ id: s.id, label: `${s.lastName}, ${s.firstName} · ${s.studentNumber || s.email}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
