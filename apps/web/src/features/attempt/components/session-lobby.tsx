"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { Card } from "@/components/ui";
import { followLobby, type LiveStatus } from "@/features/live/client";
import { modeLabel } from "@/features/session/sessions";
import type { Session } from "@examinus/domain/quiz";
import type { AttemptHrefs } from "../hrefs";

// While the lobby is open: students gather here until the teacher presses Start. `hrefs`: this player's pages.
export function SessionLobby({
  sessionId,
  title,
  mode,
  studentName,
  hrefs,
}: {
  sessionId: string;
  title: string;
  mode: Session["mode"];
  studentName: string;
  hrefs: AttemptHrefs;
}) {
  const router = useRouter();
  const [connection, setConnection] = useState<LiveStatus>("connecting");

  useEffect(
    () =>
      followLobby(sessionId, {
        onStatus: setConnection,
        onEvent: (session) => {
          if (session.status === "running") router.refresh();
          else if (session.status === "ended") router.push(hrefs.result);
        },
      }),
    [sessionId, router, hrefs.result],
  );

  // Without a working connection, ask the server every few seconds so nobody is stuck here.
  const offline = connection === "reconnecting" || connection === "closed";
  useEffect(() => {
    if (!offline) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [offline, router]);

  const initials =
    studentName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";

  return (
    <>
      {hrefs.list && (
        <Link href={hrefs.list} className="mb-4 inline-block text-sm text-muted hover:text-foreground">
          ← Quizzes & exams
        </Link>
      )}
      <Card className="animate-rise mx-auto flex max-w-lg flex-col items-center gap-3 p-8 text-center">
        <span
          aria-hidden
          className="animate-bob grid size-24 place-items-center rounded-full bg-primary-soft text-3xl font-semibold text-primary"
        >
          {initials}
        </span>
        <p className="text-sm text-muted">{studentName}</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted">{modeLabel(mode)}</p>
        <p className="animate-pop-in text-xl font-medium text-primary">You&apos;re in!</p>
        <p role="status" className="inline-flex items-center gap-2 text-sm text-muted">
          <span className="flex gap-1" aria-hidden>
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </span>
          Waiting for your teacher to start…
        </p>
        {offline && (
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
            <WifiOff className="size-3.5" aria-hidden /> Reconnecting to your teacher…
          </p>
        )}
      </Card>
    </>
  );
}
