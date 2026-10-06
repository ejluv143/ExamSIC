import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getUser } from "../data/auth";
import { readSession } from "./session";

// Every data read goes through here, so pages stay protected even if the proxy redirect is skipped.
export const verifySession = cache(async () => {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  const user = await getUser(session.userId);
  if (!user) redirect("/login");
  return user;
});
