// Playing as a guest: /join makes an anonymous account named as typed and opens the game the key leads to.
import "server-only";
import { cookies, headers } from "next/headers";
import { Result } from "effect";
import type { GameFound } from "@examora/contract";
import { applyCookies, callApi, forwardedHeaders } from "../api/client";

export async function joinAsGuest(name: string, code: string): Promise<{ ok: GameFound } | { error: string }> {
  const result = await callApi((api) => api["auth.joinAsGuest"]({ name, code }), forwardedHeaders(await headers()));
  if (Result.isFailure(result)) return { error: result.failure.message };
  applyCookies(await cookies(), result.success.cookies);
  return { ok: result.success.found };
}
