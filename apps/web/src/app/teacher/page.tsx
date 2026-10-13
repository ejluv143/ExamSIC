import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  MapPin,
  MonitorPlay,
  Plus,
  Radio,
  Users,
} from "lucide-react";
import type { SessionListItem } from "@examinus/contract/session";
import { ButtonLink, Card, CardHeader, EmptyState, IconStat } from "@/components/ui";
import { ModeBadge, SessionStatusPill, sessionGroupOf } from "@/features/session/components/assessment-bits";
import { ClassMonogram } from "@/components/class-monogram";
import { NewQuizButton } from "@/features/quiz/components/new-quiz-button";
import { requireTeacher } from "@/lib/auth/dal";
import { getClasses } from "@/features/classes/data";
import { listSessions } from "@/features/session/data";
import { getTodaysMeetings } from "@/features/attendance/data";
import { dateParts, formatDay, formatTime, greeting } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

// How many rows the "Coming up" and "Grading queue" cards show; the rest are a click away.
const LIST_LIMIT = 6;

export default async function TeacherDashboard() {
  const [user, classes, sessions, today] = await Promise.all([requireTeacher(), getClasses(), listSessions(), getTodaysMeetings()]);
  const classById = new Map(classes.map((c) => [c.id, c]));
  const classLabel = (item: SessionListItem) => {
    const c = item.session.classId ? classById.get(item.session.classId) : undefined;
    return c ? `${c.courseCode} · ${c.section}` : "Anyone with the key";
  };

  const studentCount = new Set(classes.flatMap((c) => c.studentIds)).size;
  const terms = [...new Set(classes.map((c) => c.term).filter(Boolean))];
  const live = sessions.filter((s) => sessionGroupOf(s.session) === "live");
  // Scheduled sessions by opening time; those started by hand (no time) go last.
  const upcoming = sessions
    .filter((s) => sessionGroupOf(s.session) === "upcoming")
    .sort((a, b) => (a.session.opensAt ?? "\uffff").localeCompare(b.session.opensAt ?? "\uffff"));
  const toGrade = sessions.filter((s) => s.needsGrading > 0).sort((a, b) => b.needsGrading - a.needsGrading);
  const pendingTotal = toGrade.reduce((n, s) => n + s.needsGrading, 0);
  const now = new Date();

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{formatDay(now.toISOString())}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {greeting(now)}, {user.name}
          </h1>
          {user.department && <p className="mt-1 text-sm text-muted">{user.department}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/teacher/classes/new" variant="secondary">
            <Plus className="size-4" aria-hidden /> New class
          </ButtonLink>
          <NewQuizButton classes={classes} />
        </div>
      </header>

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4">
        <IconStat icon={Users} label="Classes" value={classes.length} hint={terms.join(", ") || undefined} href="/teacher/classes" />
        <IconStat icon={GraduationCap} label="Students" value={studentCount} hint="across all sections" tone="success" />
        <IconStat
          icon={CalendarClock}
          label="Live & upcoming"
          value={live.length + upcoming.length}
          hint={live.length > 0 ? `${live.length} live now` : "sessions"}
          tone="info"
          href="/teacher/sessions"
        />
        <IconStat
          icon={ClipboardCheck}
          label="To grade"
          value={pendingTotal}
          hint={toGrade.length > 0 ? `in ${toGrade.length} ${toGrade.length === 1 ? "session" : "sessions"}` : "all caught up"}
          tone={pendingTotal > 0 ? "warning" : "primary"}
          href="/teacher/grading"
        />
      </Card>

      {live.length > 0 && (
        <section aria-labelledby="live-heading" className="mt-8">
          <h2 id="live-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
            Happening now
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success tabular-nums">{live.length}</span>
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {live.map((item) => (
              <LiveCard key={item.session.id} item={item} classLabel={classLabel(item)} />
            ))}
          </ul>
        </section>
      )}

      {today.length > 0 && (
        <section aria-labelledby="today-heading" className="mt-8">
          <h2 id="today-heading" className="mb-3 text-lg font-semibold">
            Today&apos;s classes
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {today.map(({ meeting, cls }) => {
              const href = `/teacher/classes/${cls.id}/attendance/${meeting.id}`;
              return (
                <li key={`${cls.id}-${meeting.id}`}>
                  <Card className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <ClassMonogram cls={cls} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {cls.courseCode} · {cls.section}
                        </p>
                        <p className="flex items-center gap-1.5 text-sm text-muted">
                          <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{cls.schedule}</span>
                        </p>
                        {cls.room && (
                          <p className="flex items-center gap-1.5 text-sm text-muted">
                            <MapPin className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{cls.room}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    {meeting.takenAt ? (
                      <Link
                        href={href}
                        className="mt-auto inline-flex items-center gap-1.5 self-start rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success hover:underline"
                      >
                        <Check className="size-3.5" aria-hidden /> Attendance taken
                      </Link>
                    ) : (
                      <ButtonLink href={href} className="mt-auto self-start">
                        <CalendarCheck className="size-4" aria-hidden /> Take attendance
                      </ButtonLink>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader
            title="Coming up"
            description="Scheduled sessions, soonest first."
            action={
              upcoming.length > 0 && (
                <Link href="/teacher/sessions?status=upcoming" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  View all <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nothing scheduled">
              Open a quiz and start or schedule a session for a class.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.slice(0, LIST_LIMIT).map((item) => (
                <li key={item.session.id}>
                  <Link
                    href={`/teacher/assessments/${item.session.quizId}/sessions/${item.session.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-muted"
                  >
                    <DateTile iso={item.session.opensAt} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.quizTitle}</p>
                      <p className="truncate text-sm text-muted">
                        {classLabel(item)} ·{" "}
                        {item.session.opensAt
                          ? `${formatTime(item.session.opensAt)}${item.session.closesAt ? ` – ${formatTime(item.session.closesAt)}` : ""}`
                          : "Starts when you press Start"}
                      </p>
                    </div>
                    <ModeBadge mode={item.session.mode} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Grading queue"
            action={
              toGrade.length > 0 && (
                <Link href="/teacher/grading" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  Open <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )
            }
          />
          {toGrade.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All caught up">
              Essays and code answers you need to grade show up here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {toGrade.slice(0, LIST_LIMIT).map((item) => (
                <li key={item.session.id}>
                  <Link href={`/teacher/grading/${item.session.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.quizTitle}</p>
                      <p className="truncate text-xs text-muted">{classLabel(item)}</p>
                    </div>
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning tabular-nums">{item.needsGrading}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section aria-labelledby="classes-heading" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="classes-heading" className="text-lg font-semibold">
            My classes
          </h2>
          {classes.length > 0 && (
            <Link href="/teacher/classes" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Manage <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
        {classes.length === 0 ? (
          <Card className="border-dashed">
            <EmptyState
              icon={Users}
              title="No classes yet"
              action={
                <ButtonLink href="/teacher/classes/new">
                  <Plus className="size-4" aria-hidden /> New class
                </ButtonLink>
              }
            >
              Create a class, then share its code with your students.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/teacher/classes/${c.id}`}
                  className="group flex h-full items-center gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-primary hover:shadow-sm"
                >
                  <ClassMonogram cls={c} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium group-hover:text-primary">{c.title}</p>
                    <p className="truncate text-sm text-muted">
                      {c.courseCode} · {c.section} · {c.studentIds.length} {c.studentIds.length === 1 ? "student" : "students"}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DateTile({ iso }: { iso: string | null }) {
  if (!iso)
    return (
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-dashed border-border text-muted" aria-hidden>
        <CalendarClock className="size-4" />
      </span>
    );
  const { month, day } = dateParts(iso);
  return (
    <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-info-soft text-info" aria-hidden>
      <span className="text-[10px] leading-none font-semibold tracking-wide uppercase">{month}</span>
      <span className="text-lg leading-tight font-semibold tabular-nums">{day}</span>
    </span>
  );
}

function LiveCard({ item, classLabel }: { item: SessionListItem; classLabel: string }) {
  const { session, quizTitle, studentCount, submittedCount } = item;
  const base = `/teacher/assessments/${session.quizId}/sessions/${session.id}`;
  const share = studentCount > 0 ? Math.round((submittedCount / studentCount) * 100) : 0;
  return (
    <li className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-success">
      <div className="flex flex-wrap items-center gap-2">
        <SessionStatusPill session={session} />
        <ModeBadge mode={session.mode} />
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{quizTitle}</p>
        <p className="truncate text-sm text-muted">{classLabel}</p>
      </div>
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="tabular-nums">
            {submittedCount} of {studentCount} submitted
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
          <div className="h-full rounded-full bg-success" style={{ width: `${share}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {session.mode === "game" ? (
          <ButtonLink href={`${base}/present`}>
            <MonitorPlay className="size-4" aria-hidden /> Present
          </ButtonLink>
        ) : (
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
