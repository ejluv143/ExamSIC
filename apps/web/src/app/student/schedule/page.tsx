import type { Metadata } from "next";
import Link from "next/link";
import { KindBadge } from "@/components/assessment-bits";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getMyAssessments, getMyClasses } from "@/lib/data/student";
import { formatDay, formatTime } from "@/lib/format";
import { classNames } from "../assessment-row";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage() {
  const [classes, items] = await Promise.all([getMyClasses(), getMyAssessments()]);
  const now = new Date().toISOString();

  // Every future opening and deadline, soonest first, grouped by day.
  const events = items
    .flatMap((i) => [
      ...(i.opensAt && i.opensAt > now ? [{ item: i, at: i.opensAt, what: "opens" as const }] : []),
      ...(i.closesAt && i.closesAt > now && i.attemptsUsed < i.attemptsAllowed
        ? [{ item: i, at: i.closesAt, what: "closes" as const }]
        : []),
    ])
    .sort((x, y) => x.at.localeCompare(y.at));
  const days = Map.groupBy(events, (e) => formatDay(e.at));

  return (
    <>
      <PageHeader title="Schedule" description="When your quizzes and exams open and close (Philippine time)." />
      {events.length === 0 ? (
        <Card>
          <EmptyState title="Nothing coming up">New quizzes and exams appear here once your teachers schedule them.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...days].map(([day, dayEvents]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{day}</h2>
              <Card>
                <ul className="divide-y divide-border">
                  {dayEvents.map(({ item: i, at, what }) => (
                    <li key={`${i.id}-${what}`} className="flex items-center gap-4 px-5 py-3">
                      <span className="w-20 shrink-0 text-sm font-medium tabular-nums">{formatTime(at)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/student/assessments/${i.id}`} className="font-medium hover:underline">
                            {i.title}
                          </Link>
                          <KindBadge kind={i.kind} />
                        </div>
                        <p className="text-sm text-muted">{classNames(i, classes)}</p>
                      </div>
                      {what === "opens" ? <Badge tone="info">Opens</Badge> : <Badge tone="warning">Closes</Badge>}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
