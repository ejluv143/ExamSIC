import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ModeBadge } from "@/components/assessment-bits";
import { requirePermission } from "@/lib/auth/dal";
import { getClasses, listSessions } from "@/lib/data/teacher";

export const metadata: Metadata = { title: "Grading" };

export default async function GradingPage() {
  await requirePermission({ submission: ["grade"] });
  const [sessions, classes] = await Promise.all([listSessions(), getClasses()]);
  const className = new Map(classes.map((c) => [c.id, `${c.courseCode} · ${c.section}`]));
  const rows = sessions.filter((s) => s.needsGrading > 0);

  return (
    <>
      <PageHeader
        title="Grading"
        description="Everything except essays and code is scored automatically. Grade essays here, and check blank and enumeration answers the key didn't accept."
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nothing to grade" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(({ session, quizTitle, submittedCount, needsGrading }) => (
              <li key={session.id}>
                <Link
                  href={`/teacher/grading/${session.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-surface-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{quizTitle}</p>
                    <p className="text-sm text-muted">
                      {(session.classId && className.get(session.classId)) || "No class"} · {submittedCount} submitted
                    </p>
                  </div>
                  <ModeBadge mode={session.mode} />
                  <Badge tone="warning">{needsGrading} to grade</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
