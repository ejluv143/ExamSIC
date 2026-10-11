"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Check, Crown, X } from "lucide-react";
import type { RelayDebriefItem, RelayTeamSummary } from "@examinus/contract";
import type { Stamped } from "./game-parts";

// Milliseconds left in the relay round by the server's clock; null before the start or outside a relay game.
export function useRoundMs(stamped: Stamped | null): number | null {
  const endsAt = stamped?.view.relay?.roundEndsAt ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [endsAt]);
  if (!stamped || endsAt === null) return null;
  const skew = Date.parse(stamped.view.serverNow) - stamped.receivedAt;
  return Math.max(0, Date.parse(endsAt) - (now + skew));
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

// The round clock; read out only on request (a live region ticking every second would be noise).
export function RoundClock({ ms, dark }: { ms: number | null; dark?: boolean }) {
  if (ms === null) return null;
  return (
    <p className={clsx("text-sm tabular-nums", dark ? "text-white/70" : "text-muted")} data-testid="round-clock">
      Round time left: <span className={clsx("font-semibold", dark ? "text-white" : "text-foreground")}>{ms === 0 ? "time's up" : formatClock(ms)}</span>
    </p>
  );
}

// Teams best first: by rank (the server's order: solved by time, then points), then by name.
export const rankedTeams = (teams: readonly RelayTeamSummary[]) =>
  [...teams].sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || a.name.localeCompare(b.name));

// How a team's round stands, in words (never by colour alone).
export function teamStatus(team: RelayTeamSummary, roundOver: boolean): string {
  if (team.solvedAt) return "Solved";
  if (team.finished) return roundOver ? "Time's up" : "Out of guesses";
  return "Playing";
}

// The top three teams on a podium: second, first, third.
export function TeamPodium({ teams, dark }: { teams: readonly RelayTeamSummary[]; dark?: boolean }) {
  const ranked = rankedTeams(teams).slice(0, 3);
  const places = [ranked[1], ranked[0], ranked[2]];
  const heights = ["h-24", "h-36", "h-16"];
  const medals = ["bg-slate-300 text-slate-900", "bg-amber-400 text-slate-900", "bg-orange-400 text-slate-900"];
  return (
    <ol className="flex items-end justify-center gap-3" aria-label="Team podium">
      {places.map((team, i) =>
        team ? (
          <li key={team.id} className="flex w-32 flex-col items-center sm:w-44">
            {i === 1 && <Crown className="mb-1 size-7 text-amber-400" aria-hidden />}
            <p className="max-w-full truncate text-lg font-semibold">{team.name}</p>
            <p className={clsx("text-sm tabular-nums", dark ? "text-white/70" : "text-muted")}>
              {team.points.toLocaleString()} points
              <span className="sr-only">, place {i === 1 ? 1 : i === 0 ? 2 : 3}</span>
            </p>
            <p className={clsx("max-w-full truncate text-xs", dark ? "text-white/60" : "text-muted")}>{team.members.map((m) => m.name).join(", ")}</p>
            <div className={clsx("mt-2 grid w-full place-items-start rounded-t-lg pt-2 text-center text-3xl font-black", heights[i], medals[i])} aria-hidden>
              {i === 1 ? 1 : i === 0 ? 2 : 3}
            </div>
          </li>
        ) : (
          <li key={i} className="w-32 sm:w-44" aria-hidden />
        ),
      )}
    </ol>
  );
}

// One team's questions after its round: who had which, what they answered, the right answer and why.
export function Debrief({ items, dark }: { items: readonly RelayDebriefItem[]; dark?: boolean }) {
  const muted = dark ? "text-white/70" : "text-muted";
  return (
    <ol className="space-y-3 text-left">
      {items.map((item, i) => (
        <li key={item.questionId} className={clsx("rounded-xl border p-4", dark ? "border-white/15 bg-white/5" : "border-border bg-surface")}>
          <p className={clsx("text-xs", muted)}>
            Question {i + 1} · {item.owner ? `${item.owner}'s question` : "no owner"}
          </p>
          <p className="mt-1 font-semibold">{item.prompt}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
            {item.answer === null ? (
              <span className={muted}>Not answered: they never got to it.</span>
            ) : (
              <>
                <span>
                  {item.owner || "They"} answered: <span className="font-medium">{item.answer === "" ? "(blank)" : item.answer}</span>
                </span>
                {item.correct === true && (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="size-4" aria-hidden /> Right
                  </span>
                )}
                {item.correct === false && (
                  <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                    <X className="size-4" aria-hidden /> Wrong
                  </span>
                )}
              </>
            )}
          </p>
          <p className="mt-1 text-sm">
            Correct answer: <span className="font-medium">{item.correctAnswer || "(not shown)"}</span>
          </p>
          {item.explanation && <p className={clsx("mt-1 text-sm", muted)}>{item.explanation}</p>}
          {(item.retries > 0 || item.rescuedBy) && (
            <p className={clsx("mt-1 text-sm", muted)}>
              {item.retries > 0 && <span>Retries: {item.retries}. </span>}
              {item.rescuedBy && (
                <span>
                  Rescued by {item.rescuedBy}
                  {item.rescueCorrect === null ? "" : item.rescueCorrect ? " (right)" : " (wrong)"}.
                </span>
              )}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
