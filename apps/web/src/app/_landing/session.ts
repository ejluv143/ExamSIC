"use client";

import { useSyncExternalStore } from "react";
import { homeFor, isRole } from "@examora/contract";

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
      .then((session: { user?: { role?: unknown } } | null) => {
        const role = session?.user?.role;
        if (!isRole(role)) return;
        home = homeFor(role);
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
