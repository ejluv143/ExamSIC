import type { Session, SessionMode } from "@examinus/domain/quiz";
import { statusTone } from "@/lib/format";
import { statusLabel, type QuizStatus } from "@examinus/copy/status";
import { modeLabel } from "@examinus/copy/modes";
import { Badge } from "@/components/ui";

export function StatusBadge({ status }: { status: QuizStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

export function ModeBadge({ mode }: { mode: SessionMode }) {
  return <Badge tone={mode === "exam" ? "primary" : "neutral"}>{modeLabel(mode)}</Badge>;
}

// Sessions are grouped (and filtered) as live now, coming up, or over; that is also the order they're listed in.
export type SessionGroup = "live" | "upcoming" | "ended";
export const sessionGroups: { key: SessionGroup; label: string }[] = [
  { key: "live", label: "Live" },
  { key: "upcoming", label: "Upcoming" },
  { key: "ended", label: "Ended" },
];
export const sessionGroupOf = ({ status }: Pick<Session, "status">): SessionGroup =>
  status === "running" || status === "lobby" ? "live" : status === "scheduled" ? "upcoming" : "ended";
export const sessionGroupRank: Record<SessionGroup, number> = { live: 0, upcoming: 1, ended: 2 };
// The coloured left edge of a session's card or row (needs `before:absolute before:inset-y-0 before:left-0 before:w-1`).
export const sessionGroupEdge: Record<SessionGroup, string> = { live: "before:bg-success", upcoming: "before:bg-info", ended: "before:bg-border" };

export function LiveDot() {
  return (
    <span className="relative flex size-2" aria-hidden>
      <span className="absolute inline-flex size-full rounded-full bg-success opacity-75 motion-safe:animate-ping" />
      <span className="relative inline-flex size-2 rounded-full bg-success" />
    </span>
  );
}

// A session's state as a pill: live (pulsing), paused, lobby, scheduled or ended.
export function SessionStatusPill({ session }: { session: Pick<Session, "status" | "pausedAt"> }) {
  const { status, pausedAt } = session;
  if (status === "running" && pausedAt)
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning">Paused</span>;
  if (status === "running" || status === "lobby")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
        <LiveDot />
        {status === "lobby" ? "Lobby open" : "Live"}
      </span>
    );
  if (status === "scheduled")
    return <span className="inline-flex items-center rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-semibold text-info">Scheduled</span>;
  return <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted">Ended</span>;
}
