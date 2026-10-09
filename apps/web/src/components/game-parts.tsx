"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Check, Crown } from "lucide-react";
import type { GameBucket, GameRow, GameView } from "@examora/contract";
import { followGame, type LiveStatus } from "@/lib/live/client";

// A view with the moment it arrived, so the browser can count down against the server's clock.
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

// Milliseconds left until `endsAt`, by the server's clock; null when there is no countdown. While the game is
// paused, the time left when it stopped.
export function useRemainingMs(stamped: Stamped | null): number | null {
  const endsAt = stamped?.view.endsAt ?? null;
  const paused = stamped?.view.paused ?? false;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null || paused) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [endsAt, paused]);
  if (!stamped || endsAt === null) return null;
  if (paused) return stamped.view.pausedRemainingMs ?? 0;
  const skew = Date.parse(stamped.view.serverNow) - stamped.receivedAt;
  return Math.max(0, Date.parse(endsAt) - (now + skew));
}

// The colour of the Nth answer, the same on the projector and on the phones.
export const choiceStyles = [
  "bg-red-600 text-white",
  "bg-blue-600 text-white",
  "bg-amber-500 text-slate-950",
  "bg-emerald-600 text-white",
  "bg-violet-600 text-white",
  "bg-pink-600 text-white",
];

export function CountdownBar({ remainingMs, totalSeconds, dark }: { remainingMs: number | null; totalSeconds: number; dark?: boolean }) {
  if (remainingMs === null) return null;
  const share = Math.min(1, remainingMs / (totalSeconds * 1000));
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${Math.ceil(remainingMs / 1000)} seconds left`}>
      <div className={clsx("h-3 flex-1 overflow-hidden rounded-full", dark ? "bg-white/20" : "bg-surface-muted")}>
        <div
          className={clsx("h-full rounded-full transition-[width] duration-100", share < 0.25 ? "bg-red-500" : "bg-emerald-500")}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <span className="w-10 text-right text-2xl font-bold tabular-nums">{Math.ceil(remainingMs / 1000)}</span>
    </div>
  );
}

export function Leaderboard({
  rows,
  meId,
  dark,
  big,
}: {
  rows: readonly GameRow[];
  meId?: string | null;
  dark?: boolean;
  big?: boolean;
}) {
  return (
    <ol className={clsx("space-y-2", big && "space-y-3")}>
      {rows.map((row) => (
        <li
          key={row.attemptId}
          className={clsx(
            "flex items-center gap-3 rounded-lg px-4 py-2.5",
            big && "px-6 py-4 text-2xl",
            dark ? "bg-white/10" : "border border-border bg-surface",
            row.attemptId === meId && (dark ? "ring-2 ring-amber-400" : "ring-2 ring-primary"),
          )}
        >
          <span className="w-8 text-right font-bold tabular-nums opacity-70">{row.rank}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
          <span className="font-bold tabular-nums">{row.points.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

// The top three on a podium: second, first, third.
export function Podium({ rows, dark }: { rows: readonly GameRow[]; dark?: boolean }) {
  const places = [rows[1], rows[0], rows[2]];
  const heights = ["h-28", "h-40", "h-20"];
  const medals = ["bg-slate-300 text-slate-900", "bg-amber-400 text-slate-900", "bg-orange-400 text-slate-900"];
  return (
    <div className="flex items-end justify-center gap-3" aria-label="Podium">
      {places.map((row, i) =>
        row ? (
          <div key={row.attemptId} className="flex w-32 flex-col items-center sm:w-44">
            {i === 1 && <Crown className="mb-1 size-7 text-amber-400" aria-hidden />}
            <p className="max-w-full truncate text-center font-semibold">{row.name}</p>
            <p className={clsx("text-sm tabular-nums", dark ? "text-white/70" : "text-muted")}>{row.points.toLocaleString()}</p>
            <div className={clsx("mt-2 grid w-full place-items-start rounded-t-lg pt-2 text-center text-3xl font-black", heights[i], medals[i])}>
              <span className="w-full">{row.rank}</span>
            </div>
          </div>
        ) : (
          <div key={i} className="w-32 sm:w-44" />
        ),
      )}
    </div>
  );
}

// How the answers split after a question; the right answer has a tick.
export function Buckets({ buckets, dark }: { buckets: readonly GameBucket[]; dark?: boolean }) {
  const most = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <ul className="space-y-2">
      {buckets.map((b, i) => (
        <li key={`${i}-${b.label}`} className="flex items-center gap-3">
          <span className={clsx("w-40 shrink-0 truncate text-right text-sm sm:w-56", b.correct && "font-semibold")}>{b.label}</span>
          <div className={clsx("h-9 flex-1 overflow-hidden rounded-md", dark ? "bg-white/10" : "bg-surface-muted")}>
            <div
              className={clsx("flex h-full items-center justify-end rounded-md px-2 text-sm font-bold text-white transition-[width]", b.correct ? "bg-emerald-600" : "bg-slate-500")}
              style={{ width: `${Math.max(b.count === 0 ? 0 : 6, (b.count / most) * 100)}%` }}
            >
              {b.count > 0 && b.count}
            </div>
          </div>
          <span className="w-6">{b.correct && <Check className="size-5 text-emerald-500" aria-label="Right answer" />}</span>
        </li>
      ))}
    </ul>
  );
}
