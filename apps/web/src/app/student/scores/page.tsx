import type { Metadata } from "next";
import Link from "next/link";
import { ModeBadge } from "@/components/assessment-bits";
import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { getMySessions, getMyClasses } from "@/lib/data/student";
import { formatDate } from "@/lib/format";
import { percent } from "@examora/contract/scoring";

export const metadata: Metadata = { title: "Scores" };

export default async function ScoresPage() {
  const [classes, items] = await Promise.all([getMyClasses(), getMySessions()]);
  const submitted = items.filter((i) => i.lastSubmittedAt);

  return (
    <>
      <PageHeader
        title="Scores"
        description="Your scores on quizzes and exams. Teachers may release some scores later."
      />
      <div className="space-y-6">
        {classes.map((c) => {
          const rows = submitted.filter((i) => i.session.classId === c.id);
          // Only fully graded scores count; one with an essay still waiting would look too low.
          const pcts = rows.flatMap((i) =>
            i.result && i.result.pendingEssays === 0 ? [percent(i.result.score, i.result.max)] : [],
          );
          const average = pcts.length ? Math.round(pcts.reduce((n, p) => n + p, 0) / pcts.length) : null;
          return (
            <Card key={c.id}>
              <CardHeader
                title={`${c.courseCode} · ${c.title}`}
                description={c.section}
                action={
                  <div className="text-right">
                    <p className="text-xs text-muted">Average</p>
                    <p className="text-lg font-semibold tabular-nums">{average === null ? "—" : `${average}%`}</p>
                  </div>
                }
              />
              {rows.length === 0 ? (
                <EmptyState title="Nothing submitted yet" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Quiz or exam</Th>
                      <Th className="hidden sm:table-cell">Submitted</Th>
                      <Th className="text-right">Score</Th>
                      <Th className="w-40">%</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => {
                      const pct = i.result && i.result.pendingEssays === 0 ? percent(i.result.score, i.result.max) : null;
                      return (
                        <tr key={i.session.id}>
                          <Td>
                            <Link href={`/student/assessments/${i.session.id}/result`} className="font-medium hover:underline">
                              {i.quizTitle}
                            </Link>{" "}
                            <ModeBadge mode={i.session.mode} />
                          </Td>
                          <Td className="hidden text-muted sm:table-cell">{formatDate(i.lastSubmittedAt)}</Td>
                          <Td className="text-right tabular-nums">
                            {i.result ? (
                              <>
                                <span className="font-medium">{i.result.score}</span>
                                <span className="text-muted"> / {i.result.max}</span>
                                {i.result.pendingEssays > 0 && (
                                  <span className="block text-xs text-muted">so far, essays being graded</span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted">Not released</span>
                            )}
                          </Td>
                          <Td>
                            {pct !== null && (
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 rounded-full bg-primary-soft">
                                  <div
                                    className={pct < 50 ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-primary"}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="w-10 text-right tabular-nums">{pct}%</span>
                              </div>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
