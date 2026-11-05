// The game as a player or presenter sees it: the live view stamped with its arrival, the clocks counting against the
// server's time, the team standings and the order of answer colours. The web and the phone only render these.
import type { GameView, RelayTeamSummary } from "@examinus/contract/game";
import { useEffect, useState } from "react";
import type { LiveFollowers, LiveStatus } from "@examinus/client/live";

// A view with the moment it arrived, so the client can count down against the server's clock.
export type Stamped = { view: GameView; receivedAt: number };

// Follows the game's stream (`followGame` of the app's live client): the latest view, and whether the connection is live.
export function useGameView(follow: LiveFollowers["followGame"], sessionId: string, enabled = true) {
  const [stamped, setStamped] = useState<Stamped | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  useEffect(() => {
    if (!enabled) return;
    return follow(sessionId, {
      onEvent: (view) => setStamped({ view, receivedAt: Date.now() }),
      onStatus: (next) => setStatus(next),
    });
  }, [follow, sessionId, enabled]);
  return { stamped, status };
}

const tickMs = 100;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

// Milliseconds from `now` (this device's clock) until `endsAt`, which is on the server's clock: the view's `serverNow`
// against the moment it arrived tells how far the two clocks differ.
const untilServerTime = (stamped: Stamped, endsAt: string, now: number) => {
  const skew = Date.parse(stamped.view.serverNow) - stamped.receivedAt;
  return Math.max(0, Date.parse(endsAt) - (now + skew));
};

// Milliseconds left in the question or phase at `now`; null when there is no countdown. While paused, the time left
// when it stopped.
export function remainingAt(stamped: Stamped | null, now: number): number | null {
  const endsAt = stamped?.view.endsAt ?? null;
  if (!stamped || endsAt === null) return null;
  if (stamped.view.paused) return stamped.view.pausedRemainingMs ?? 0;
  return untilServerTime(stamped, endsAt, now);
}

// Milliseconds left in the relay round at `now`; null before the start or outside a relay game.
export function roundAt(stamped: Stamped | null, now: number): number | null {
  const endsAt = stamped?.view.relay?.roundEndsAt ?? null;
  if (!stamped || endsAt === null) return null;
  return untilServerTime(stamped, endsAt, now);
}

// The question or phase countdown, ticking while it runs.
export function useRemainingMs(stamped: Stamped | null): number | null {
  const running = stamped?.view.endsAt != null && !stamped.view.paused;
  return remainingAt(stamped, useNow(running));
}

// The relay round countdown, ticking while it runs.
export function useRoundMs(stamped: Stamped | null): number | null {
  return roundAt(stamped, useNow(stamped?.view.relay?.roundEndsAt != null));
}

// What a countdown bar shows: how full it is (0 to 1), the seconds to read out, whether it is in its last stretch
// (the bar turns red) and whether the last five seconds are counting (the number pulses).
export function countdownBar(remainingMs: number, totalSeconds: number) {
  const share = Math.min(1, remainingMs / (totalSeconds * 1000));
  const seconds = Math.ceil(remainingMs / 1000);
  return { share, seconds, low: share < 0.25, hurry: seconds > 0 && seconds <= 5 };
}

// Teams best first: by rank (the server's order: solved by time, then points), then by name. Unranked teams go last.
export const rankedTeams = (teams: readonly RelayTeamSummary[]) =>
  [...teams].sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || a.name.localeCompare(b.name));

// How a team's round stands, in words (never by colour alone).
export function teamStatus(team: RelayTeamSummary, roundOver: boolean): string {
  if (team.solvedAt) return "Solved";
  if (team.finished) return roundOver ? "Time's up" : "Out of guesses";
  return "Playing";
}

// The colours of the answers in order, the same on the projector and on the phones; each app styles them its own way.
export const choiceColors = ["red", "blue", "amber", "emerald", "violet", "pink"] as const;
export type ChoiceColor = (typeof choiceColors)[number];
