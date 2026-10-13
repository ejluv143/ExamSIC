import "server-only";
import { cookies, headers } from "next/headers";
import { Result } from "effect";
import type { GameFound } from "@examinus/contract/game";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";
import type { Avatar } from "@examinus/domain/avatar";
import { requirePermission } from "@/lib/auth/dal";
import { read, write } from "@/lib/api/helpers";

export async function joinAsGuest(name: string, code: string): Promise<{ ok: GameFound } | { error: string }> {
  const result = await callApi((api) => api["auth.joinAsGuest"]({ name, code }), forwardedHeaders(await headers()));
  if (Result.isFailure(result)) return { error: result.failure.message };
  applyCookies(await cookies(), result.success.cookies);
  return { ok: result.success.found };
}

export async function getMyAvatar() {
  await requirePermission({ avatar: ["update"] });
  return read((api) => api["avatar.mine"]());
}

export async function saveAvatar(avatar: Avatar) {
  await requirePermission({ avatar: ["update"] });
  return write((api) => api["avatar.save"]({ avatar }));
}
