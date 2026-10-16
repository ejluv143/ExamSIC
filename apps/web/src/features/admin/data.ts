// Account management for admins. Accounts come from the API.
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import type { Account } from "@examinus/domain/user";
import { callApi, forwardedHeaders } from "@/lib/api/client";

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
