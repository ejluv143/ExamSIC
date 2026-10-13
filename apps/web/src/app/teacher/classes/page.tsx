import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, MapPin, Plus, Users } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { ClassMonogram } from "@/components/class-monogram";
import { getClasses } from "@/features/classes/data";
import { listSessions } from "@/features/session/data";
import { ClassroomConnect } from "@/features/classes/components/classroom-connect";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage(props: PageProps<"/teacher/classes">) {
  const [{ classroom }, classes, sessions] = await Promise.all([props.searchParams, getClasses(), listSessions()]);
  // Why connecting Google Classroom didn't work: "failed" from Google's way back, or the API's message.
  const classroomError =
    typeof classroom === "string" ? (classroom === "failed" ? "Connecting Google Classroom didn't work. Try again." : classroom) : null;

  const sessionCount = new Map<string, number>();
  for (const { session } of sessions) if (session.classId) sessionCount.set(session.classId, (sessionCount.get(session.classId) ?? 0) + 1);
  const studentCount = new Set(classes.flatMap((c) => c.studentIds)).size;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Classes</h1>
          <p className="mt-1 text-sm text-muted">
            {classes.length > 0
              ? `${classes.length} ${classes.length === 1 ? "class" : "classes"} · ${studentCount} ${studentCount === 1 ? "student" : "students"}`
              : "Create a class and share its code, or bring classes in from Google Classroom."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ClassroomConnect />
          <ButtonLink href="/teacher/classes/new">
            <Plus className="size-4" aria-hidden /> New class
          </ButtonLink>
        </div>
      </header>

      {classroomError && (
        <p role="alert" className="mb-6 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {classroomError}
        </p>
      )}

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
            Create your first class, then share its code with your students.
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => {
            const count = sessionCount.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/teacher/classes/${c.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:hover:translate-y-0"
                >
                  <div className="flex items-start gap-3 p-5 pb-4">
                    <ClassMonogram cls={c} className="size-11" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold tracking-wide text-primary">{c.courseCode}</p>
                      <h2 className="line-clamp-2 text-lg leading-snug font-semibold group-hover:text-primary">{c.title}</h2>
                      <p className="truncate text-sm text-muted">
                        {c.section} · {c.term}
                      </p>
                    </div>
                    {c.classroom ? (
                      <span className="shrink-0 rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info">Classroom</span>
                    ) : (
                      c.joinCode && (
                        <span className="shrink-0 rounded-md border border-dashed border-border px-2 py-0.5 font-mono text-xs font-semibold tracking-wider" title="Join code">
                          {c.joinCode}
                        </span>
                      )
                    )}
                  </div>
                  <ul className="space-y-1.5 px-5 text-sm text-muted">
                    {c.schedule && (
                      <li className="flex items-center gap-2">
                        <CalendarClock className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{c.schedule}</span>
                      </li>
                    )}
                    {c.room && (
                      <li className="flex items-center gap-2">
                        <MapPin className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{c.room}</span>
                      </li>
                    )}
                  </ul>
                  <div className="min-h-4 flex-1" aria-hidden />
                  <div className="flex items-center border-t border-border bg-surface-muted/40 px-5 py-3 text-sm text-muted">
                    <span>
                      <span className="font-semibold text-foreground tabular-nums">{c.studentIds.length}</span>{" "}
                      {c.studentIds.length === 1 ? "student" : "students"}
                    </span>
                    <span className="mx-3 h-4 w-px bg-border" aria-hidden />
                    <span>
                      <span className="font-semibold text-foreground tabular-nums">{count}</span> {count === 1 ? "session" : "sessions"}
                    </span>
                    <ArrowRight className="ml-auto size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                  </div>
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/teacher/classes/new"
              className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-5 text-sm font-medium text-muted transition-colors hover:border-primary hover:bg-primary-soft/40 hover:text-primary"
            >
              <span className="grid size-10 place-items-center rounded-full bg-surface-muted">
                <Plus className="size-5" aria-hidden />
              </span>
              New class
            </Link>
          </li>
        </ul>
      )}
    </>
  );
}
