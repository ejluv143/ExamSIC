import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { KindBadge, StatusBadge } from "@/components/assessment-bits";
import { getAssessments, getClasses } from "@/lib/data/teacher";
import { formatDateTime } from "@/lib/format";
import { maxScore } from "@/lib/scoring";
import type { AssessmentKind } from "@/lib/types";

export const metadata: Metadata = { title: "Quizzes & exams" };

const tabs: { label: string; kind?: AssessmentKind }[] = [
  { label: "All" },
  { label: "Exams", kind: "exam" },
  { label: "Quizzes", kind: "quiz" },
];

export default async function AssessmentsPage(props: PageProps<"/teacher/assessments">) {
  const { kind: rawKind } = await props.searchParams;
  const kind = rawKind === "exam" || rawKind === "quiz" ? rawKind : undefined;

  const [assessments, classes] = await Promise.all([getAssessments({ kind }), getClasses()]);
  const classById = new Map(classes.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        title="Quizzes & exams"
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

      <div className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((t) => {
          const active = t.kind === kind;
          return (
            <Link
              key={t.label}
              href={t.kind ? `/teacher/assessments?kind=${t.kind}` : "/teacher/assessments"}
              className={clsx(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <Card>
        {assessments.length === 0 ? (
          <EmptyState title="Nothing here yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Type</Th>
                <Th className="hidden md:table-cell">Class</Th>
                <Th className="hidden lg:table-cell">Window</Th>
                <Th className="text-right">Items</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => (
                <tr key={a.id} className="hover:bg-surface-muted">
                  <Td>
                    <Link href={`/teacher/assessments/${a.id}`} className="font-medium hover:text-primary">
                      {a.title}
                    </Link>
                  </Td>
                  <Td>
                    <KindBadge kind={a.kind} />
                  </Td>
                  <Td className="hidden text-muted md:table-cell">
                    {a.classIds
                      .map((id) => {
                        const c = classById.get(id);
                        return c ? `${c.courseCode} ${c.section}` : id;
                      })
                      .join(", ")}
                  </Td>
                  <Td className="hidden text-muted lg:table-cell">
                    {a.settings.opensAt
                      ? `${formatDateTime(a.settings.opensAt)} – ${formatDateTime(a.settings.closesAt)}`
                      : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {a.questions.length}
                    <span className="text-muted"> · {maxScore(a.questions)} pts</span>
                  </Td>
                  <Td>
                    <StatusBadge status={a.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
