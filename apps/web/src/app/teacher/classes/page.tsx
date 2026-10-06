import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { ClassroomSyncButton } from "@/components/classroom-sync-button";
import { getAssessments, getClasses, getClassroomConnection } from "@/lib/data/teacher";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage() {
  const [classes, assessments, connection] = await Promise.all([
    getClasses(),
    getAssessments(),
    getClassroomConnection(),
  ]);

  return (
    <>
      <PageHeader
        title="Classes"
        description={`Imported from Google Classroom (${connection.email}). Last synced ${formatDateTime(connection.lastSyncedAt)}.`}
        actions={<ClassroomSyncButton />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {classes.map((c) => {
          const count = assessments.filter((a) => a.classIds.includes(c.id)).length;
          return (
            <Link key={c.id} href={`/teacher/classes/${c.id}`} className="group">
              <Card className="h-full p-5 transition-colors group-hover:border-primary">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold tracking-wide text-primary">{c.courseCode}</p>
                  <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted">
                    Google Classroom
                  </span>
                </div>
                <h2 className="mt-1 text-lg font-semibold">{c.title}</h2>
                <p className="text-sm text-muted">
                  {c.section} · {c.term}
                </p>
                <ul className="mt-4 space-y-1.5 text-sm text-muted">
                  <li className="flex items-center gap-2">
                    <CalendarClock className="size-4" aria-hidden /> {c.schedule}
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin className="size-4" aria-hidden /> {c.room}
                  </li>
                  <li className="flex items-center gap-2">
                    <Users className="size-4" aria-hidden /> {c.studentIds.length} students ·{" "}
                    {count} {count === 1 ? "assessment" : "assessments"}
                  </li>
                </ul>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
