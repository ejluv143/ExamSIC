"use client";
// The browser's wiring of the live WebSocket client (packages/client): tickets come from `/api/live/ticket`, and a
// backoff ends early when the network comes back or the tab is shown again.
import { makeLiveClient, type Issued, type LiveStatus } from "@examinus/client/live";
import type { TicketTarget } from "@examinus/contract/live";

export type { LiveStatus };

// A ticket, a refusal ({ error }), or null when it's worth asking again (offline, the server failed).
async function requestTicket(target: TicketTarget, signal?: AbortSignal): Promise<Issued | null> {
  try {
    const response = await fetch("/api/live/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
      cache: "no-store",
      // A redirect means the role can't follow this stream (see getLiveTicket).
      redirect: "manual",
      ...(signal ? { signal } : {}),
    });
    if (response.type === "opaqueredirect") return { error: "You can't follow this session." };
    if (!response.ok && response.status !== 401) return null;
    return (await response.json()) as Issued;
  } catch {
    return null;
  }
}

export const { followTeacher, followStudent, followLobby, followGame } = makeLiveClient({
  requestTicket,
  wake: (signal) => {
    const onVisibility = () => document.visibilityState === "visible" && signal();
    window.addEventListener("online", signal);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", signal);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  },
});
