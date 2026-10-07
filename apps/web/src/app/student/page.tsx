import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, PlayCircle } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { getMySessions, getMyClasses } from "@/lib/data/student";
import { percent } from "@examora/contract/scoring";
import { AssessmentRow, bucketOf } from "./assessment-row";
import { JoinForm } from "./join/join-form";

export const metadata: Metadata = { title: "Dashboard" };

function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href} className="text-sm font-normal text-muted hover:text-foreground">
      See all →
    </Link>
  );
}

export default async function StudentHome() {
  const [user, classes, items] = await Promise.all([requireStudent(), getMyClasses(), getMySessions()]);
  const todo = items.filter((i) => bucketOf(i) === "todo");
  const upcoming = items.filter((i) => bucketOf(i) === "upcoming");
  const results = items
    .filter((i) => i.result)
    .sort((x, y) => (y.lastSubmittedAt ?? "").localeCompare(x.lastSubmittedAt ?? ""));
  // Scores with essays still being graded would drag the average down, so they wait.
  const pcts = results
    .filter((i) => i.result!.pendingEssays === 0)
    .map((i) => percent(i.result!.score, i.result!.max));
  const average = pcts.length ? Math.round(pcts.reduce((n, p) => n + p, 0) / pcts.length) : null;

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        description={
          <span className="flex flex-wrap gap-1.5">
            {classes.map((c) => (
              <Badge key={c.id}>
                {c.courseCode} · {c.section}
              </Badge>
            ))}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="To do" value={todo.length} hint={todo.length ? "open now" : "all caught up"} />
        <StatCard label="Upcoming" value={upcoming.length} />
        <StatCard label="Average score" value={average === null ? "—" : `${average}%`} hint="fully graded results" />
        <StatCard label="Classes" value={classes.length} />
      </div>

      <div className="mt-6 space-y-6">
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Join with code</h2>
            <p className="text-sm text-muted">Your teacher shows a code for a game or a session.</p>
          </div>
          <JoinForm compact />
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 border-b border-border px-5 py-4 font-semibold">
            <PlayCircle className="size-5 text-primary" aria-hidden /> Open now
          </h2>
          {todo.length === 0 ? (
            <EmptyState title="Nothing to take right now" />
          ) : (
            <ul className="divide-y divide-border">
              {todo.map((i) => (
                <AssessmentRow key={i.session.id} item={i} classes={classes} />
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="flex items-center gap-2 border-b border-border px-5 py-4 font-semibold">
              <CalendarClock className="size-5 text-info" aria-hidden />
              <span className="flex-1">Coming up</span>
              <SeeAll href="/student/schedule" />
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState title="Nothing scheduled" />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.slice(0, 3).map((i) => (
                  <AssessmentRow key={i.session.id} item={i} classes={classes} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 border-b border-border px-5 py-4 font-semibold">
              <CheckCircle2 className="size-5 text-success" aria-hidden />
              <span className="flex-1">Recent results</span>
              <SeeAll href="/student/scores" />
            </h2>
            {results.length === 0 ? (
              <EmptyState title="No scores released yet" />
            ) : (
              <ul className="divide-y divide-border">
                {results.slice(0, 3).map((i) => (
                  <AssessmentRow key={i.session.id} item={i} classes={classes} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
