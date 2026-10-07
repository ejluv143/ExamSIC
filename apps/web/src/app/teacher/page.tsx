import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { KindBadge, StatusBadge } from "@/components/assessment-bits";
import { requireTeacher } from "@/lib/auth/dal";
import {
  getAssessments,
  getClasses,
  getSubmissions,
} from "@/lib/data/teacher";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function TeacherDashboard() {
  const [user, classes, assessments] = await Promise.all([requireTeacher(), getClasses(), getAssessments()]);
  const classById = new Map(classes.map((c) => [c.id, c]));

  const studentCount = new Set(classes.flatMap((c) => c.studentIds)).size;
  const upcoming = assessments
    .filter((a) => a.status === "open" || a.status === "scheduled")
    .sort((a, b) => (a.settings.opensAt ?? "").localeCompare(b.settings.opensAt ?? ""));

  const toGrade = (
    await Promise.all(
      assessments.map(async (a) => ({
        assessment: a,
        pending: (await getSubmissions(a.id)).filter((s) => s.status === "needs_grading").length,
      })),
    )
  ).filter((x) => x.pending > 0);
  const pendingTotal = toGrade.reduce((n, x) => n + x.pending, 0);

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name}`}
        description={user.department}
        actions={
          <>
            <ButtonLink href="/teacher/assessments/new?kind=quiz" variant="secondary">
              <Plus className="size-4" aria-hidden /> New quiz
            </ButtonLink>
            <ButtonLink href="/teacher/assessments/new?kind=exam">
              <Plus className="size-4" aria-hidden /> New exam
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Classes" value={classes.length} hint="1st Sem 2026–2027" />
        <StatCard label="Students" value={studentCount} hint="across all sections" />
        <StatCard label="Open & upcoming" value={upcoming.length} hint="quizzes and exams" />
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
            <EmptyState title="Nothing scheduled">Create a quiz or exam to get started.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/teacher/assessments/${a.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-surface-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.title}</p>
                      <p className="text-sm text-muted">
                        {a.classIds.map((id) => classById.get(id)?.section).join(", ")} ·{" "}
                        {formatDateTime(a.settings.opensAt)} – {formatDateTime(a.settings.closesAt)}
                      </p>
                    </div>
                    <KindBadge kind={a.kind} />
                    <StatusBadge status={a.status} />
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
              {toGrade.map(({ assessment, pending }) => (
                <li key={assessment.id}>
                  <Link
                    href={`/teacher/grading/${assessment.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-muted"
                  >
                    <span className="truncate font-medium">{assessment.title}</span>
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning tabular-nums">
                      {pending}
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
