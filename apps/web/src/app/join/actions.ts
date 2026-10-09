"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";
import { joinAsGuest } from "@/lib/data/guest";

export const joinAsGuestAction = joinAsGuest;

// A guest signing out: back to /join, where another key (and name) can be entered.
export async function leaveAsGuest() {
  const result = await callApi((api) => api["auth.signOut"](), forwardedHeaders(await headers()));
  if (Result.isSuccess(result)) applyCookies(await cookies(), result.success.cookies);
  redirect("/join");
}
