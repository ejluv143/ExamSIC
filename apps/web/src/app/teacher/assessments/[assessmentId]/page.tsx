import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Pencil, PenLine } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { KindBadge, StatusBadge } from "@/components/assessment-bits";
import { getAssessment, getClasses, getStudents, getSubmissions } from "@/lib/data/teacher";
import { MathText } from "@/components/math-text";
import { blankedPrompt } from "@/lib/blanks";
import { formatDateTime, fullName, questionTypeLabel } from "@/lib/format";
import { percent, questionScore, submissionScore } from "@/lib/scoring";

export async function generateMetadata(
  props: PageProps<"/teacher/assessments/[assessmentId]">,
): Promise<Metadata> {
  const { assessmentId } = await props.params;
  return { title: (await getAssessment(assessmentId))?.title ?? "Assessment" };
}

const releaseLabel = {
  immediately: "Right after submitting",
  after_close: "After it closes",
  manual: "When you release them",
};

export default async function AssessmentPage(props: PageProps<"/teacher/assessments/[assessmentId]">) {
  const { assessmentId } = await props.params;
  const a = await getAssessment(assessmentId);
  if (!a) notFound();

  const classes = (await getClasses()).filter((c) => a.classIds.includes(c.id));
  const enrolledIds = [...new Set(classes.flatMap((c) => c.studentIds))];
  const [students, submissions] = await Promise.all([getStudents(enrolledIds), getSubmissions(a.id)]);
  const subByStudent = new Map(submissions.map((s) => [s.studentId, s]));

  const scored = submissions
    .filter((s) => s.submittedAt)
    .map((s) => ({ s, ...submissionScore(a.questions, s) }));
  const pcts = scored.map((x) => percent(x.score, x.gradedMax));
  const avg = pcts.length ? Math.round(pcts.reduce((n, p) => n + p, 0) / pcts.length) : null;
  const needsGrading = submissions.filter((s) => s.status === "needs_grading").length;

  // Share of students who got each auto-graded item fully right.
  const itemStats = a.questions.map((q) => {
    const results = scored
      .map(({ s }) => questionScore(q, s))
      .filter((x): x is number => x !== null);
    const avgPoints = results.length ? results.reduce((n, x) => n + x, 0) / results.length : null;
    return { q, pct: avgPoints === null ? null : percent(avgPoints, q.points), graded: results.length };
  });

  // Score distribution in 10-point bands.
  const bands = Array.from({ length: 10 }, (_, i) => ({
    label: i === 9 ? "90–100" : `${i * 10}–${i * 10 + 9}`,
    count: pcts.filter((p) => Math.min(9, Math.floor(p / 10)) === i).length,
  }));
  const maxBand = Math.max(1, ...bands.map((b) => b.count));

  return (
    <>
      <PageHeader
        back={{ href: "/teacher/assessments", label: "Quizzes & exams" }}
        title={a.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <KindBadge kind={a.kind} />
            <StatusBadge status={a.status} />
            {classes.map((c) => `${c.courseCode} ${c.section}`).join(", ")}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/teacher/assessments/${a.id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden /> Edit
            </ButtonLink>
            {needsGrading > 0 && (
              <ButtonLink href={`/teacher/grading/${a.id}`}>
                <PenLine className="size-4" aria-hidden /> Grade essays ({needsGrading})
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Submitted" value={`${scored.length} / ${students.length}`} />
        <StatCard
          label="Average score"
          value={avg === null ? "—" : `${avg}%`}
          hint={needsGrading ? "provisional until essays are graded" : undefined}
        />
        <StatCard
          label="Highest / lowest"
          value={pcts.length ? `${Math.max(...pcts)}% / ${Math.min(...pcts)}%` : "—"}
        />
        <StatCard label="Needs grading" value={needsGrading} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Score distribution" description="Number of students per score band (%)" />
          {pcts.length === 0 ? (
            <EmptyState title="No submissions yet" />
          ) : (
            <div className="px-5 pt-6 pb-4">
              <div className="flex h-44 items-end gap-0.5 border-b border-border" role="img" aria-label="Score distribution">
                {bands.map((b) => (
                  <div key={b.label} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                    {b.count > 0 && (
                      <span className="mb-1 text-xs text-muted tabular-nums">{b.count}</span>
                    )}
                    <div
                      className="w-full max-w-6 rounded-t bg-primary transition-opacity group-hover:opacity-80"
                      style={{ height: `${(b.count / maxBand) * 85}%` }}
                      title={`${b.label}%: ${b.count} ${b.count === 1 ? "student" : "students"}`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-0.5">
                {bands.map((b) => (
                  <span key={b.label} className="flex-1 text-center text-[10px] text-muted tabular-nums">
                    {b.label.split("–")[0]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Settings" />
          <dl className="divide-y divide-border text-sm">
            {[
              ["Opens", formatDateTime(a.settings.opensAt)],
              ["Closes", formatDateTime(a.settings.closesAt)],
              ["Time limit", a.settings.timeLimitMinutes ? `${a.settings.timeLimitMinutes} min` : "None"],
              ["Attempts", a.settings.attemptsAllowed],
              ["Shuffle", [a.settings.shuffleQuestions && "questions", a.settings.shuffleChoices && "choices"].filter(Boolean).join(", ") || "Off"],
              ["Results shown", releaseLabel[a.settings.resultsRelease]],
              ...(a.kind === "exam" ? [["Tab-switch log", a.settings.trackTabSwitches ? "On" : "Off"]] : []),
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4 px-5 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Item analysis" description="Average score on each question. Low items may be unclear or mis-keyed." />
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Question</Th>
              <Th className="hidden md:table-cell">Type</Th>
              <Th className="w-56">Avg. score</Th>
            </tr>
          </thead>
          <tbody>
            {itemStats.map(({ q, pct, graded }, i) => (
              <tr key={q.id}>
                <Td className="text-muted tabular-nums">{i + 1}</Td>
                <Td>
                  <p className="line-clamp-2">
                    <MathText text={blankedPrompt(q.prompt)} />
                  </p>
                </Td>
                <Td className="hidden text-muted md:table-cell">{questionTypeLabel[q.type]}</Td>
                <Td>
                  {pct === null ? (
                    <span className="text-muted">Not graded yet</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-primary-soft">
                        <div
                          className={pct < 50 ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-primary"}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right tabular-nums">{pct}%</span>
                      {pct < 50 && (
                        <span title="Fewer than half got this right" className="text-warning">
                          <AlertTriangle className="size-4" aria-label="Review this item" />
                        </span>
                      )}
                    </div>
                  )}
                  {q.type === "essay" && pct !== null && (
                    <p className="mt-0.5 text-xs text-muted">{graded} graded so far</p>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Students" />
        <Table>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th className="hidden sm:table-cell">Submitted</Th>
              {a.kind === "exam" && <Th className="hidden md:table-cell">Left tab</Th>}
              <Th className="text-right">Score</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {students.map((st) => {
              const sub = subByStudent.get(st.id);
              const result = sub?.submittedAt ? submissionScore(a.questions, sub) : null;
              return (
                <tr key={st.id}>
                  <Td>
                    <p className="font-medium">{fullName(st)}</p>
                    <p className="font-mono text-xs text-muted">{st.studentNumber}</p>
                  </Td>
                  <Td className="hidden text-muted sm:table-cell">{formatDateTime(sub?.submittedAt ?? null)}</Td>
                  {a.kind === "exam" && (
                    <Td className="hidden md:table-cell">
                      {sub && sub.tabSwitches > 0 ? (
                        <Badge tone="warning">
                          {sub.tabSwitches}× left
                        </Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                  )}
                  <Td className="text-right tabular-nums">
                    {result ? (
                      <>
                        <span className="font-medium">{result.score}</span>
                        <span className="text-muted"> / {result.max}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {!sub ? (
                      <Badge>Not started</Badge>
                    ) : sub.status === "needs_grading" ? (
                      <Link href={`/teacher/grading/${a.id}?submission=${sub.id}`}>
                        <Badge tone="warning">Needs grading</Badge>
                      </Link>
                    ) : sub.status === "graded" ? (
                      <Badge tone="success">Graded</Badge>
                    ) : (
                      <Badge tone="info">In progress</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
