// The game's live view and the clocks counting against the server's time (the web's `useGameView`, `useRemainingMs`
// and `useRoundMs`).
import type { GameView } from "@examinus/contract/game";
import type { LiveStatus } from "@examinus/client/live";
import { useEffect, useState } from "react";
import { followGame } from "@/live/client";

// A view with the moment it arrived, so the phone can count down against the server's clock.
export type Stamped = { view: GameView; receivedAt: number };

// Follows the game's stream: the latest view, and whether the connection is live.
export function useGameView(sessionId: string, enabled = true) {
  const [stamped, setStamped] = useState<Stamped | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  useEffect(() => {
    if (!enabled) return;
    return followGame(sessionId, {
      onEvent: (view) => setStamped({ view, receivedAt: Date.now() }),
      onStatus: (next) => setStatus(next),
    });
  }, [sessionId, enabled]);
  return { stamped, status };
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

// Milliseconds left until `endsAt` by the server's clock; null when there is no countdown. While paused, the time left
// when it stopped.
export function useRemainingMs(stamped: Stamped | null): number | null {
  const endsAt = stamped?.view.endsAt ?? null;
  const paused = stamped?.view.paused ?? false;
  const now = useNow(endsAt !== null && !paused);
  if (!stamped || endsAt === null) return null;
  if (paused) return stamped.view.pausedRemainingMs ?? 0;
  const skew = Date.parse(stamped.view.serverNow) - stamped.receivedAt;
  return Math.max(0, Date.parse(endsAt) - (now + skew));
}

// Milliseconds left in the relay round; null before the start or outside a relay game.
export function useRoundMs(stamped: Stamped | null): number | null {
  const endsAt = stamped?.view.relay?.roundEndsAt ?? null;
  const now = useNow(endsAt !== null);
  if (!stamped || endsAt === null) return null;
  const skew = Date.parse(stamped.view.serverNow) - stamped.receivedAt;
  return Math.max(0, Date.parse(endsAt) - (now + skew));
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
