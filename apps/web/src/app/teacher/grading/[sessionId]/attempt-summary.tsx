import clsx from "clsx";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { awayCount, integrityEventLabel, isAway } from "@/lib/integrity";
import { scoreOf } from "@/lib/attempt-view";
import type { AttemptDetail } from "@examinus/contract/session";
import type { Question } from "@examinus/domain/question";

// What the anti-cheating checks recorded, timed from when the student started.
export function ActivityLog({ attempt }: { attempt: AttemptDetail }) {
  const events = attempt.integrityEvents;
  const start = Date.parse(attempt.attempt.startedAt);
  const since = (at: string) => {
    const s = Math.max(0, Math.round((Date.parse(at) - start) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const away = awayCount(events);
  return (
    <Card>
      <details>
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm">
          <ShieldAlert className="size-4 text-warning" aria-hidden />
          <span className="flex-1 font-medium">Activity log</span>
          <span className="text-muted">
            {away > 0 && `Left ${away}× · `}
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
        </summary>
        <ol className="divide-y divide-border border-t border-border text-sm">
          {events.map((e, i) => (
            <li key={i} className="flex gap-4 px-5 py-2">
              <span className="w-24 shrink-0 text-muted tabular-nums" title={formatDateTime(e.at)}>
                +{since(e.at)}
              </span>
              <span className={clsx(isAway(e) || e.type === "auto_submitted" || e.type === "late_submit" ? "text-warning" : "")}>
                {integrityEventLabel[e.type]}
              </span>
            </li>
          ))}
        </ol>
        <p className="border-t border-border px-5 py-2 text-xs text-muted">
          Times are from when the student pressed Start. A flag isn&apos;t proof of cheating; a notification or a
          lost connection can cause one too.
        </p>
      </details>
    </Card>
  );
}

export function TotalScore({ questions, attempt }: { questions: readonly Question[]; attempt: AttemptDetail }) {
  const { score, max, ungraded } = scoreOf(questions, attempt);
  return (
    <span className="text-muted">
      Total{" "}
      <span className="font-semibold text-foreground tabular-nums">
        {score} / {max}
      </span>
      {ungraded > 0 && " so far"}
    </span>
  );
}
