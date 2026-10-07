// Account management for admins. Accounts come from the API; the roster is still mock data.
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import type { Account } from "@examora/contract";
import { callApi, forwardedHeaders } from "../api/client";
import { requirePermission } from "../auth/dal";
import { students } from "./mock";

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

// Class-roster entries a student account can sign in as.
export async function getRoster() {
  await requirePermission({ user: ["list"] });
  return students
    .map((s) => ({ id: s.id, label: `${s.lastName}, ${s.firstName} · ${s.studentNumber}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
