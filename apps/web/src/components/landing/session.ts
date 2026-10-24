"use client";

import { useSyncExternalStore } from "react";
import { homeFor, isPersonalRole, isPlatformRole, roleOf } from "@examinus/domain/roles";

// The landing page is built once, at build time, so it can't know who is visiting. After it loads, this asks Better
// Auth (proxied at /api/auth) for the session once per page load; signed-in visitors get the way back into their area.
let home: string | null = null;
let requested = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!requested) {
    requested = true;
    fetch("/api/auth/get-session", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((session: { user?: { role?: unknown; personalRole?: unknown } } | null) => {
        const { role, personalRole } = session?.user ?? {};
        if (!isPlatformRole(role) || !isPersonalRole(personalRole)) return;
        // The raw session has no organization roles: a member's area is settled by the proxy from here.
        home = homeFor(roleOf({ role, personalRole, organization: null }));
        for (const notify of listeners) notify();
      })
      .catch(() => {});
  }
  return () => {
    listeners.delete(listener);
  };
}

// Where a signed-in visitor's area is, or null for visitors who aren't signed in (and until the session is known).
export function useHome(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => home,
    () => null,
  );
}
