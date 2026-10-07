import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { KindBadge } from "@/components/assessment-bits";
import { getAssessments, getSubmissions } from "@/lib/data/teacher";
import { reviewableTypes } from "@/lib/scoring";

export const metadata: Metadata = { title: "Grading" };

export default async function GradingPage() {
  const assessments = (await getAssessments()).filter((a) =>
    a.questions.some((q) => reviewableTypes.includes(q.type)),
  );
  const rows = await Promise.all(
    assessments.map(async (a) => {
      const subs = (await getSubmissions(a.id)).filter((s) => s.submittedAt);
      return {
        a,
        pending: subs.filter((s) => s.status === "needs_grading").length,
        graded: subs.filter((s) => s.status === "graded").length,
      };
    }),
  );

  return (
    <>
      <PageHeader
        title="Grading"
        description="Everything except essays is scored automatically. Grade essays here, and check identification, fill in the blank and enumeration answers the key didn't accept."
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nothing to review yet" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(({ a, pending, graded }) => (
              <li key={a.id}>
                <Link
                  href={`/teacher/grading/${a.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-surface-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-muted">
                      {graded} graded · {pending} waiting
                    </p>
                  </div>
                  <KindBadge kind={a.kind} />
                  {pending > 0 ? (
                    <Badge tone="warning">{pending} to grade</Badge>
                  ) : (
                    <Badge tone="success">Graded</Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
