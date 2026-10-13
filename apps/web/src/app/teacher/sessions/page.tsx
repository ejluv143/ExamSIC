import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Gamepad2,
  MonitorPlay,
  Radio,
  Repeat,
  Search,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { SessionListItem } from "@examinus/contract/session";
import type { SessionMode } from "@examinus/domain/quiz";
import { Button, ButtonLink, Card, EmptyState, inputClass, segmentClass, segmentGroupClass } from "@/components/ui";
import {
  LiveDot,
  SessionStatusPill,
  sessionGroupEdge,
  sessionGroupOf,
  sessionGroups,
  type SessionGroup,
} from "@/components/assessment-bits";
import { JoinKey } from "@/components/join-key";
import { getClasses, listSessions } from "@/lib/data/teacher";
import { formatDateTime } from "@/lib/format";
import { modeLabel } from "@/lib/sessions";

export const metadata: Metadata = { title: "Sessions" };

const modes: SessionMode[] = ["quiz", "exam", "mastery", "game"];
const modeIcon: Record<SessionMode, LucideIcon> = {
  quiz: ClipboardList,
  exam: ShieldCheck,
  mastery: Repeat,
  game: Gamepad2,
};
const groupHint: Record<SessionGroup, string> = {
  live: "Students can join or are taking it now.",
  upcoming: "Scheduled, or waiting for you to start them.",
  ended: "Most recent first.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SessionsPage(props: PageProps<"/teacher/sessions">) {
  const params = await props.searchParams;
  const status = sessionGroups.find((g) => g.key === one(params.status))?.key;
  const mode = modes.find((m) => m === one(params.mode));
  const q = (one(params.q) ?? "").trim();

  const [all, classes] = await Promise.all([listSessions(), getClasses()]);
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const searched = q ? all.filter((i) => i.quizTitle.toLowerCase().includes(q.toLowerCase())) : all;

  // Each filter's counts follow the other filters, so a count is what clicking it shows.
  const groupCounts: Record<SessionGroup, number> = { live: 0, upcoming: 0, ended: 0 };
  const modeCounts: Record<SessionMode, number> = { quiz: 0, exam: 0, mastery: 0, game: 0 };
  for (const i of searched) {
    if (!mode || i.session.mode === mode) groupCounts[sessionGroupOf(i.session)]++;
    if (!status || sessionGroupOf(i.session) === status) modeCounts[i.session.mode]++;
  }

  const items = searched.filter((i) => (!status || sessionGroupOf(i.session) === status) && (!mode || i.session.mode === mode));
  // Live and upcoming by opening time (sessions started by hand last); ended ones most recent first.
  const byGroup: Record<SessionGroup, SessionListItem[]> = { live: [], upcoming: [], ended: [] };
  for (const i of items) byGroup[sessionGroupOf(i.session)].push(i);
  const opens = (i: SessionListItem) => i.session.opensAt ?? "\uffff";
  byGroup.live.sort((a, b) => opens(a).localeCompare(opens(b)));
  byGroup.upcoming.sort((a, b) => opens(a).localeCompare(opens(b)));
  byGroup.ended.sort((a, b) => (b.session.closesAt ?? b.session.opensAt ?? "").localeCompare(a.session.closesAt ?? a.session.opensAt ?? ""));

  const href = (next: { status?: string; mode?: string }) => {
    const sp = new URLSearchParams();
    const s = "status" in next ? next.status : status;
    const m = "mode" in next ? next.mode : mode;
    if (s) sp.set("status", s);
    if (m) sp.set("mode", m);
    if (q) sp.set("q", q);
    const qs = sp.toString();
    return qs ? `/teacher/sessions?${qs}` : "/teacher/sessions";
  };
  const filtered = Boolean(status || mode || q);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sessions</h1>
          <p className="mt-1 text-sm text-muted">Every quiz, exam, mastery set and game you ran, across all your quizzes.</p>
        </div>
        <ButtonLink href="/teacher/assessments" variant="secondary">
          <ClipboardList className="size-4" aria-hidden /> Start one from a quiz
        </ButtonLink>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <nav aria-label="Status" className={segmentGroupClass}>
          <Link href={href({ status: undefined })} className={segmentClass(!status)} aria-current={!status ? "page" : undefined}>
            All
          </Link>
          {sessionGroups.map((g) => (
            <Link key={g.key} href={href({ status: g.key })} className={segmentClass(status === g.key)} aria-current={status === g.key ? "page" : undefined}>
              {g.key === "live" && groupCounts.live > 0 && <LiveDot />}
              {g.label}
              <span className="tabular-nums opacity-70">{groupCounts[g.key]}</span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Mode" className={segmentGroupClass}>
          <Link href={href({ mode: undefined })} className={segmentClass(!mode)} aria-current={!mode ? "page" : undefined}>
            Any mode
          </Link>
          {modes.map((m) => {
            const Icon = modeIcon[m];
            return (
              <Link key={m} href={href({ mode: m })} className={segmentClass(mode === m)} aria-current={mode === m ? "page" : undefined} title={modeLabel(m)}>
                <Icon className="size-4" aria-hidden />
                <span className="max-sm:sr-only">{modeLabel(m)}</span>
                <span className="tabular-nums opacity-70">{modeCounts[m]}</span>
              </Link>
            );
          })}
        </nav>
        <form action="/teacher/sessions" role="search" className="flex w-full gap-2 sm:ml-auto sm:w-80">
          {status && <input type="hidden" name="status" value={status} />}
          {mode && <input type="hidden" name="mode" value={mode} />}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" name="q" defaultValue={q} placeholder="Search quiz titles" aria-label="Search by quiz title" className={clsx(inputClass, "pl-9")} />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      {filtered && items.length > 0 && (
        <p className="-mt-3 mb-4 text-sm text-muted" aria-live="polite">
          {items.length} {items.length === 1 ? "session" : "sessions"}
          {q && <> matching “{q}”</>} ·{" "}
          <Link href="/teacher/sessions" className="text-primary hover:underline">
            Clear filters
          </Link>
        </p>
      )}

      {items.length === 0 ? (
        <Card className="border-dashed">
          {all.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No sessions yet"
              action={
                <ButtonLink href="/teacher/assessments">
                  <ClipboardList className="size-4" aria-hidden /> Go to Quizzes &amp; exams
                </ButtonLink>
              }
            >
              Open a quiz and start a session to give it to a class, or to anyone with its key.
            </EmptyState>
          ) : (
            <EmptyState
              icon={Search}
              title="No sessions match"
              action={
                <ButtonLink href="/teacher/sessions" variant="secondary">
                  Clear filters
                </ButtonLink>
              }
            >
              Try another status, mode or search.
            </EmptyState>
          )}
        </Card>
      ) : (
        <div className="space-y-8">
          {sessionGroups
            .filter((g) => byGroup[g.key].length > 0)
            .map((g) => (
              <section key={g.key} aria-labelledby={`group-${g.key}`}>
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 id={`group-${g.key}`} className="flex items-center gap-2 text-lg font-semibold">
                    {g.label}
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted tabular-nums">{byGroup[g.key].length}</span>
                  </h2>
                  <p className="text-sm text-muted">{groupHint[g.key]}</p>
                </div>
                <ul className="space-y-3">
                  {byGroup[g.key].map((item) => {
                    const c = item.session.classId ? classById[item.session.classId] : undefined;
                    return (
                      <SessionRow
                        key={item.session.id}
                        item={item}
                        group={g.key}
                        classLabel={item.session.classId ? (c ? `${c.courseCode} · ${c.section}` : "Class") : null}
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      )}
    </>
  );
}

function SessionRow({ item, group, classLabel }: { item: SessionListItem; group: SessionGroup; classLabel: string | null }) {
  const { session, quizTitle, studentCount, submittedCount, needsGrading } = item;
  const base = `/teacher/assessments/${session.quizId}/sessions/${session.id}`;
  const Icon = modeIcon[session.mode];
  const share = studentCount > 0 ? Math.round((submittedCount / studentCount) * 100) : 0;

  return (
    <li
      className={clsx(
        "relative grid gap-x-6 gap-y-3 overflow-hidden rounded-xl border border-border bg-surface py-4 pr-4 pl-5 shadow-sm transition-shadow hover:shadow-md",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        "md:grid-cols-[minmax(0,1fr)_12rem] xl:grid-cols-[minmax(0,1fr)_14rem_auto] xl:items-center",
        sessionGroupEdge[group],
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SessionStatusPill session={session} />
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
            <Icon className="size-3.5" aria-hidden /> {modeLabel(session.mode)}
          </span>
        </div>
        <Link href={base} className="mt-1.5 block truncate font-semibold hover:text-primary">
          {quizTitle}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5 shrink-0" aria-hidden />
            {classLabel ?? "Anyone with the key"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden />
            {!session.opensAt
              ? session.status === "scheduled"
                ? "Starts when you press Start"
                : "Started by hand"
              : session.closesAt
                ? `${formatDateTime(session.opensAt)} – ${formatDateTime(session.closesAt)}`
                : session.status === "ended"
                  ? `Opened ${formatDateTime(session.opensAt)}`
                  : `${formatDateTime(session.opensAt)} – until you end it`}
          </span>
          {session.joinCode && session.status !== "ended" && <JoinKey code={session.joinCode} />}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="tabular-nums">
            <span className="font-medium">{submittedCount}</span>
            <span className="text-muted"> of {studentCount} submitted</span>
          </span>
          <span className="text-muted tabular-nums">{share}%</span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-label="Submitted"
          aria-valuemin={0}
          aria-valuemax={studentCount}
          aria-valuenow={submittedCount}
        >
          <div className={clsx("h-full rounded-full", share === 100 ? "bg-success" : "bg-primary")} style={{ width: `${share}%` }} />
        </div>
        {needsGrading > 0 && (
          <Link
            href={`/teacher/grading/${session.id}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning hover:underline"
          >
            <ClipboardCheck className="size-3.5" aria-hidden />
            {needsGrading} to grade
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
        {session.mode === "game" && session.status !== "ended" && (
          <ButtonLink href={`${base}/present`}>
            <MonitorPlay className="size-4" aria-hidden /> Present
          </ButtonLink>
        )}
        {session.mode !== "game" && (session.status === "running" || session.status === "scheduled") && (
          <ButtonLink href={`${base}/live`}>
            <Radio className="size-4" aria-hidden /> Live view
          </ButtonLink>
        )}
        <ButtonLink href={base} variant="secondary">
          <BarChart3 className="size-4" aria-hidden /> Results
        </ButtonLink>
      </div>
    </li>
  );
}
