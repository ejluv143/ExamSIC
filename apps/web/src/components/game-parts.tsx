"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { Check, Crown, Flame } from "lucide-react";
import type { GameBucket, GameRow, GameView } from "@examinus/contract";
import { AvatarImage } from "@/components/avatar";
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

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A number that counts up (or down) to `target` instead of jumping; starts from `initial` on first show.
export function useCountUp(target: number, initial = target, durationMs = 900): number {
  const [shown, setShown] = useState(initial);
  const current = useRef(initial);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const k = reducedMotion() ? 1 : Math.min(1, (now - startedAt) / durationMs);
      current.current = Math.round(from + (target - from) * (1 - (1 - k) ** 3));
      setShown(current.current);
      if (k < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return shown;
}

export function CountUp({ value, from, prefix = "" }: { value: number; from?: number; prefix?: string }) {
  const shown = useCountUp(value, from);
  return (
    <>
      {prefix}
      {shown.toLocaleString()}
    </>
  );
}

const confettiColors = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899"];
// Repeatable "random" numbers in [0, 1), so the pieces are the same on every render.
const scatter = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Paper pieces falling over the whole screen, once. Hidden when the device asks for less motion.
export function Confetti({ pieces = 70 }: { pieces?: number }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: pieces }, (_, i) => {
        const size = 6 + scatter(i, 1) * 7;
        const style = {
          left: `${scatter(i, 2) * 100}%`,
          width: size,
          height: scatter(i, 3) < 0.3 ? size : size * 0.45,
          borderRadius: scatter(i, 3) < 0.3 ? "9999px" : "2px",
          backgroundColor: confettiColors[i % confettiColors.length],
          animationDelay: `${scatter(i, 4) * 0.7}s`,
          "--confetti-duration": `${1.8 + scatter(i, 5) * 1.6}s`,
          "--confetti-x": `${(scatter(i, 6) - 0.5) * 30}vw`,
          "--confetti-turn": `${360 + scatter(i, 7) * 900}deg`,
        } as CSSProperties;
        return <span key={i} className="animate-confetti absolute top-0 block" style={style} />;
      })}
    </div>
  );
}

const emberColors = ["#f97316", "#fb923c", "#facc15", "#ef4444", "#fdba74"];

// A right answer that extends a streak: embers rising from the bottom of the screen (more the longer the run) and
// a glowing flame badge. The embers hide when the device asks for less motion.
export function StreakFire({ streak }: { streak: number }) {
  const embers = Math.min(16 + streak * 8, 64);
  const title = streak >= 5 ? "Unstoppable!" : streak >= 3 ? "On fire!" : "Streak!";
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-screen overflow-hidden">
        {Array.from({ length: embers }, (_, i) => {
          // Whole pixels and two decimals, so the server's HTML matches the browser's render exactly.
          const size = Math.round(5 + scatter(i, 11) * 9);
          const color = emberColors[i % emberColors.length];
          const style = {
            left: `${(scatter(i, 12) * 100).toFixed(2)}%`,
            width: size,
            height: size,
            backgroundColor: color,
            boxShadow: `0 0 ${size}px ${color}`,
            animationDelay: `${(0.3 + scatter(i, 13) * 0.9).toFixed(2)}s`,
            "--ember-duration": `${(1.2 + scatter(i, 14) * 1.2).toFixed(2)}s`,
            "--ember-x": `${((scatter(i, 15) - 0.5) * 20).toFixed(2)}vw`,
          } as CSSProperties;
          return <span key={i} className="animate-ember absolute -bottom-4 block rounded-full" style={style} />;
        })}
      </div>
      <div className="animate-pop-in" style={{ animationDelay: "0.35s" }} data-testid="player-streak">
        <div className="animate-glow inline-flex items-center gap-2 rounded-full bg-linear-to-r from-orange-500 to-red-600 px-5 py-2 text-lg font-bold text-white sm:text-xl">
          <Flame className="animate-flicker size-6" aria-hidden />
          {title} {streak} in a row
        </div>
      </div>
    </>
  );
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
  const seconds = Math.ceil(remainingMs / 1000);
  const hurry = seconds > 0 && seconds <= 5;
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${seconds} seconds left`}>
      <div className={clsx("h-3 flex-1 overflow-hidden rounded-full", dark ? "bg-white/20" : "bg-surface-muted")}>
        <div
          className={clsx("h-full rounded-full transition-[width,background-color] duration-100", share < 0.25 ? "bg-red-500" : "bg-emerald-500")}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      {/* Keyed by the second, so each of the last five pulses. */}
      <span key={hurry ? seconds : "calm"} className={clsx("w-10 text-right text-2xl font-bold tabular-nums", hurry && "animate-tick text-red-500")}>
        {seconds}
      </span>
    </div>
  );
}

// Where each player was on the last leaderboard shown for a game, so the next one can move them from there.
const lastPlaces = new Map<string, Map<string, number>>();

// The standings. Rows slide in one after another; with `historyKey` (the session), players who moved since the
// last leaderboard slide from their old place to the new one. `meFrom` is the player's rank before the question:
// their row climbs (or drops) from there, over the others, even from below the rows shown.
export function Leaderboard({
  rows,
  meId,
  meFrom,
  dark,
  big,
  historyKey,
}: {
  rows: readonly GameRow[];
  meId?: string | null;
  meFrom?: number | null;
  dark?: boolean;
  big?: boolean;
  historyKey?: string;
}) {
  const list = useRef<HTMLOListElement>(null);
  // The player's own climb plays once; later pushes of the same standings shouldn't replay it.
  const meClimbed = useRef(false);
  useLayoutEffect(() => {
    const items = [...(list.current?.children ?? [])] as HTMLElement[];
    const before = historyKey ? lastPlaces.get(historyKey) : undefined;
    if (historyKey) lastPlaces.set(historyKey, new Map(rows.map((r, i) => [r.attemptId, i])));
    if (reducedMotion() || items.length === 0) return;
    const step = items.length > 1 ? items[1]!.offsetTop - items[0]!.offsetTop : items[0]!.offsetHeight;
    items.forEach((item, i) => {
      const mine = meFrom != null && item.dataset.id === meId && !meClimbed.current;
      if (mine) meClimbed.current = true;
      // From below the list counts as one row under the last.
      const was = mine ? Math.min(meFrom - 1, items.length) : before?.get(item.dataset.id ?? "");
      if (was === i) return;
      if (was === undefined)
        item.animate([{ opacity: 0, transform: "translateY(24px)" }, { opacity: 1, transform: "none" }], {
          duration: 450,
          delay: i * 70,
          easing: "ease-out",
          fill: "backwards",
        });
      else if (mine)
        // Lifted while it travels, then settles into its new place.
        item.animate(
          [
            { transform: `translateY(${(was - i) * step}px) scale(1.05)`, offset: 0 },
            { transform: `translateY(${(was - i) * step}px) scale(1.05)`, offset: 0.15 },
            { transform: "translateY(0) scale(1.05)", offset: 0.8 },
            { transform: "none", offset: 1 },
          ],
          { duration: 1400, delay: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
        );
      else
        item.animate([{ transform: `translateY(${(was - i) * step}px)` }, { transform: "none" }], {
          duration: 800,
          delay: 200,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        });
    });
  }, [rows, historyKey, meId, meFrom]);
  return (
    <ol ref={list} className={clsx("space-y-2", big && "space-y-3")}>
      {rows.map((row) => (
        <li
          key={row.attemptId}
          data-id={row.attemptId}
          className={clsx(
            "flex items-center gap-3 rounded-lg px-4 py-2",
            big && "px-6 py-3 text-2xl",
            dark ? "bg-white/10" : "border border-border bg-surface",
            row.attemptId === meId && (dark ? "relative z-10 ring-2 ring-amber-400" : "relative z-10 shadow-lg ring-2 ring-primary"),
          )}
        >
          <span className="w-8 text-right font-bold tabular-nums opacity-70">{row.rank}</span>
          <AvatarImage avatar={row.avatar} size={big ? 52 : 36} />
          <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
          <span className="font-bold tabular-nums">
            <CountUp value={row.points} />
          </span>
        </li>
      ))}
    </ol>
  );
}

// The top three on a podium: second, first, third. Third rises first and first last, then the crown drops.
export function Podium({ rows, dark }: { rows: readonly GameRow[]; dark?: boolean }) {
  const places = [rows[1], rows[0], rows[2]];
  const heights = ["h-28", "h-40", "h-20"];
  const medals = ["bg-slate-300 text-slate-900", "bg-amber-400 text-slate-900", "bg-orange-400 text-slate-900"];
  const delays = [0.7, 1.2, 0.2];
  return (
    <div className="flex items-end justify-center gap-3" aria-label="Podium">
      {places.map((row, i) =>
        row ? (
          <div key={row.attemptId} className="flex w-32 flex-col items-center sm:w-44">
            {i === 1 && <Crown className="animate-drop mb-1 size-7 text-amber-400" style={{ animationDelay: `${delays[i]! + 0.6}s` }} aria-hidden />}
            <span className="animate-pop-in mb-1 block" style={{ animationDelay: `${delays[i]! + 0.3}s` }}>
              <AvatarImage avatar={row.avatar} size={i === 1 ? 80 : 64} className="ring-4 ring-white/60" />
            </span>
            <div className="animate-rise w-full text-center" style={{ animationDelay: `${delays[i]! + 0.3}s` }}>
              <p className="max-w-full truncate font-semibold">{row.name}</p>
              <p className={clsx("text-sm tabular-nums", dark ? "text-white/70" : "text-muted")}>{row.points.toLocaleString()}</p>
            </div>
            <div
              className={clsx("animate-grow-y mt-2 grid w-full origin-bottom place-items-start rounded-t-lg pt-2 text-center text-3xl font-black", heights[i], medals[i])}
              style={{ animationDelay: `${delays[i]}s` }}
            >
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

// How the answers split after a question; the bars grow in one after another and the right answer has a tick.
export function Buckets({ buckets, dark }: { buckets: readonly GameBucket[]; dark?: boolean }) {
  const most = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <ul className="space-y-2">
      {buckets.map((b, i) => (
        <li key={`${i}-${b.label}`} className="flex items-center gap-3">
          <span className={clsx("w-40 shrink-0 truncate text-right text-sm sm:w-56", b.correct && "font-semibold")}>{b.label}</span>
          <div className={clsx("h-9 flex-1 overflow-hidden rounded-md", dark ? "bg-white/10" : "bg-surface-muted")}>
            <div
              className={clsx(
                "animate-grow-x flex h-full origin-left items-center justify-end rounded-md px-2 text-sm font-bold text-white transition-[width]",
                b.correct ? "bg-emerald-600" : "bg-slate-500",
              )}
              style={{ width: `${Math.max(b.count === 0 ? 0 : 6, (b.count / most) * 100)}%`, animationDelay: `${i * 0.12}s` }}
            >
              {b.count > 0 && b.count}
            </div>
          </div>
          <span className="w-6">
            {b.correct && <Check className="animate-pop-in size-5 text-emerald-500" style={{ animationDelay: `${buckets.length * 0.12 + 0.5}s` }} aria-label="Right answer" />}
          </span>
        </li>
      ))}
    </ul>
  );
}
