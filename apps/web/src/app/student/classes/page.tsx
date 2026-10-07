import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ExternalLink, MapPin } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getMySessions, getMyClasses } from "@/lib/data/student";
import { bucketOf } from "../assessment-row";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage() {
  const [classes, items] = await Promise.all([getMyClasses(), getMySessions()]);

  return (
    <>
      <PageHeader title="Classes" description="Your classes from Google Classroom." />
      {classes.length === 0 ? (
        <Card>
          <EmptyState title="You're not in any class yet">Ask your teacher to add you in Google Classroom.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {classes.map((c) => {
            const mine = items.filter((i) => i.session.classId === c.id);
            const todo = mine.filter((i) => bucketOf(i) === "todo").length;
            const upcoming = mine.filter((i) => bucketOf(i) === "upcoming").length;
            return (
              <Card key={c.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                      {c.courseCode} · {c.section}
                    </p>
                    <h2 className="mt-1 font-semibold">{c.title}</h2>
                  </div>
                  <Badge>{c.units} units</Badge>
                </div>
                <dl className="mt-3 space-y-1 text-sm text-muted">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 shrink-0" aria-hidden />
                    <dt className="sr-only">Schedule</dt>
                    <dd>{c.schedule}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4 shrink-0" aria-hidden />
                    <dt className="sr-only">Room</dt>
                    <dd>
                      {c.room} · {c.term}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-1 flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
                  <Link href="/student/assessments?show=todo" className="text-sm hover:underline">
                    {todo > 0 ? `${todo} to do` : "Nothing to do"}
                    {upcoming > 0 && ` · ${upcoming} upcoming`}
                  </Link>
                  <a
                    href={c.classroom.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
                  >
                    Open in Classroom <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
