import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Check } from "lucide-react";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { NewQuizButton } from "./assessments/_editor/new-quiz-button";
import { ModeBadge, StatusBadge } from "@/components/assessment-bits";
import { requireTeacher } from "@/lib/auth/dal";
import { getClasses, listSessions } from "@/lib/data/teacher";
import { getTodaysMeetings } from "@/lib/data/attendance";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function TeacherDashboard() {
  const [user, classes, sessions, today] = await Promise.all([
    requireTeacher(),
    getClasses(),
    listSessions(),
    getTodaysMeetings(),
  ]);
  const classById = new Map(classes.map((c) => [c.id, c]));

  const studentCount = new Set(classes.flatMap((c) => c.studentIds)).size;
  const upcoming = sessions
    .filter((s) => s.session.status !== "ended")
    .sort((a, b) => (a.session.opensAt ?? "").localeCompare(b.session.opensAt ?? ""));
  const toGrade = sessions.filter((s) => s.needsGrading > 0);
  const pendingTotal = toGrade.reduce((n, s) => n + s.needsGrading, 0);

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name}`}
        description={user.department ?? undefined}
        actions={
          <>
            <NewQuizButton classes={classes} />
          </>
        }
      />

      {today.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Today's classes" />
          <ul className="divide-y divide-border">
            {today.map(({ meeting, cls }) => (
              <li key={`${cls.id}-${meeting.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <CalendarCheck className="size-5 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {cls.courseCode} · {cls.section}
                  </p>
                  <p className="text-sm text-muted">
                    {cls.schedule} · {cls.room}
                  </p>
                </div>
                {meeting.takenAt ? (
                  <Link
                    href={`/teacher/classes/${cls.id}/attendance/${meeting.id}`}
                    className="inline-flex items-center gap-1 text-sm text-success hover:underline"
                  >
                    <Check className="size-4" aria-hidden /> Attendance taken
                  </Link>
                ) : (
                  <ButtonLink href={`/teacher/classes/${cls.id}/attendance/${meeting.id}`}>Take attendance</ButtonLink>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Classes" value={classes.length} hint="1st Sem 2026–2027" />
        <StatCard label="Students" value={studentCount} hint="across all sections" />
        <StatCard label="Open & upcoming" value={upcoming.length} hint="quiz and exam sessions" />
        <StatCard label="To grade" value={pendingTotal} hint="essay answers waiting" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Open & upcoming"
            action={
              <Link href="/teacher/assessments" className="text-sm text-primary hover:underline">
                View all
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled">Create a quiz and start a session to get started.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map(({ session, quizTitle }) => (
                <li key={session.id}>
                  <Link
                    href={`/teacher/assessments/${session.quizId}/sessions/${session.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-surface-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{quizTitle}</p>
                      <p className="text-sm text-muted">
                        {(session.classId && classById.get(session.classId)?.section) || "No class"} ·{" "}
                        {formatDateTime(session.opensAt)} – {formatDateTime(session.closesAt)}
                      </p>
                    </div>
                    <ModeBadge mode={session.mode} />
                    <StatusBadge status={session.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Needs grading" />
          {toGrade.length === 0 ? (
            <EmptyState title="All caught up" />
          ) : (
            <ul className="divide-y divide-border">
              {toGrade.map(({ session, quizTitle, needsGrading }) => (
                <li key={session.id}>
                  <Link
                    href={`/teacher/grading/${session.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-muted"
                  >
                    <span className="truncate font-medium">{quizTitle}</span>
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning tabular-nums">
                      {needsGrading}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="My classes"
          action={
            <Link href="/teacher/classes" className="text-sm text-primary hover:underline">
              Manage
            </Link>
          }
        />
        <div className="grid gap-px bg-border sm:grid-cols-3">
          {classes.map((c) => (
            <Link
              key={c.id}
              href={`/teacher/classes/${c.id}`}
              className="bg-surface p-5 hover:bg-surface-muted"
            >
              <p className="text-xs font-semibold tracking-wide text-primary">{c.courseCode}</p>
              <p className="mt-1 font-medium">{c.title}</p>
              <p className="mt-1 text-sm text-muted">
                {c.section} · {c.studentIds.length} students
              </p>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
