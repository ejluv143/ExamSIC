"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flag, Wifi, WifiOff } from "lucide-react";
import type { LiveStudent } from "@examora/contract";
import { Card, CardHeader } from "@/components/ui";
import { followTeacher, type LiveStatus } from "@/lib/live/client";

const offlineAfterMs = 30_000;

// Students with an attempt in progress right now, from the teacher's live stream: who, how far they are,
// whether they're still connected. Sits beside the results while the session runs; the live view has the rest.
export function TakingNow({
  sessionId,
  names,
  liveHref,
}: {
  sessionId: string;
  // Roster id → name.
  names: Readonly<Record<string, string>>;
  liveHref: string;
}) {
  const [rows, setRows] = useState<Readonly<Record<string, LiveStudent>>>({});
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [now, setNow] = useState(() => Date.now());

  useEffect(
    () =>
      followTeacher(sessionId, {
        onStatus: setStatus,
        onEvent: (event) => {
          if (event._tag === "snapshot") setRows(Object.fromEntries(event.students.map((s) => [s.studentId, s])));
          else if (event._tag === "student") setRows((prev) => ({ ...prev, [event.student.studentId]: event.student }));
        },
      }),
    [sessionId],
  );
  // "Online" is a gap since the last check-in, so it needs a clock.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const taking = Object.values(rows)
    .filter((s) => s.status === "in_progress" && s.attemptId !== null)
    .sort((a, b) => (names[a.studentId] ?? "").localeCompare(names[b.studentId] ?? ""));

  return (
    <aside aria-label="Taking it now" className="lg:sticky lg:top-6 lg:self-start">
      <Card>
        <CardHeader
          title="Taking it now"
          description={status === "live" ? `${taking.length} ${taking.length === 1 ? "student" : "students"}` : status === "closed" ? "Not available" : "Connecting…"}
        />
        {taking.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">Nobody is taking it right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {taking.map((s) => {
              const online = s.lastSeenAt !== null && now - Date.parse(s.lastSeenAt) < offlineAfterMs;
              const share = s.questionCount > 0 ? s.answered / s.questionCount : 0;
              return (
                <li key={s.studentId} className="space-y-1.5 px-5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{names[s.studentId] ?? "Student"}</span>
                    {s.marked > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-muted" title={`${s.marked} marked for review`}>
                        <Flag className="size-3.5" aria-hidden /> {s.marked}
                      </span>
                    )}
                    {online ? (
                      <Wifi className="size-4 text-success" aria-label="Online" />
                    ) : (
                      <WifiOff className="size-4 text-muted" aria-label="Offline" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
                    </div>
                    <span className="tabular-nums">
                      {s.answered} / {s.questionCount}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-border px-5 py-3 text-sm">
          <Link href={liveHref} className="text-primary hover:underline">
            Open the live view
          </Link>
        </div>
      </Card>
    </aside>
  );
}
