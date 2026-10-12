import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, Inbox, Users } from "lucide-react";
import { ButtonLink, Card, EmptyState, IconStat } from "@/components/ui";
import { ModeBadge, SessionStatusPill } from "@/components/assessment-bits";
import { requirePermission } from "@/lib/auth/dal";
import { getClasses, listSessions } from "@/lib/data/teacher";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Grading" };

export default async function GradingPage() {
  await requirePermission({ submission: ["grade"] });
  const [sessions, classes] = await Promise.all([listSessions(), getClasses()]);
  const className = new Map(classes.map((c) => [c.id, `${c.courseCode} · ${c.section}`]));
  // Biggest piles first.
  const rows = sessions.filter((s) => s.needsGrading > 0).sort((a, b) => b.needsGrading - a.needsGrading);
  const pending = rows.reduce((n, s) => n + s.needsGrading, 0);
  const submitted = rows.reduce((n, s) => n + s.submittedCount, 0);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Grading</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Everything except essays and code is scored automatically. Grade essays here, and check blank and enumeration answers the key
          didn&apos;t accept.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={CheckCircle2}
            title="All caught up"
            action={
              <ButtonLink href="/teacher/sessions" variant="secondary">
                <CalendarClock className="size-4" aria-hidden /> View sessions
              </ButtonLink>
            }
          >
            Nothing is waiting for you. Submitted essays and code answers show up here.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="grid gap-px overflow-hidden bg-border sm:grid-cols-3">
            <IconStat icon={ClipboardCheck} label={pending === 1 ? "Attempt to grade" : "Attempts to grade"} value={pending} tone="warning" />
            <IconStat icon={Inbox} label={rows.length === 1 ? "Session waiting" : "Sessions waiting"} value={rows.length} tone="info" />
            <IconStat icon={Users} label="Students submitted" value={submitted} hint="in those sessions" tone="success" />
          </Card>

          <h2 className="mt-8 mb-3 text-lg font-semibold">Queue</h2>
          <ul className="space-y-3">
            {rows.map(({ session, quizTitle, submittedCount, needsGrading }) => (
              <li key={session.id}>
                <Link
                  href={`/teacher/grading/${session.id}`}
                  className="group flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-nowrap"
                >
                  <span className="flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-warning-soft text-warning">
                    <span className="text-lg leading-none font-semibold tabular-nums">{needsGrading}</span>
                    <span className="mt-0.5 text-[10px] leading-none font-medium tracking-wide uppercase">to grade</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SessionStatusPill session={session} />
                      <ModeBadge mode={session.mode} />
                    </div>
                    <p className="mt-1 truncate font-semibold group-hover:text-primary">{quizTitle}</p>
                    <p className="truncate text-sm text-muted">
                      {(session.classId && className.get(session.classId)) || "Anyone with the key"} · {submittedCount} submitted
                      {session.closesAt && ` · ${session.status === "ended" ? "closed" : "closes"} ${formatDateTime(session.closesAt)}`}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors group-hover:bg-primary-hover max-sm:w-full max-sm:justify-center">
                    Start grading <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
