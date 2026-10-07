import type { Metadata } from "next";
import clsx from "clsx";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getMyStanding } from "@/lib/data/student";
import { absenceLimit, passingGrade, transmutationTable, type Remark } from "@/lib/grading";

export const metadata: Metadata = { title: "Standing" };

type Subject = Awaited<ReturnType<typeof getMyStanding>>[number];
type Term = NonNullable<Subject["terms"]>["midterm"];

const remarkBadge: Record<Remark, { tone: "success" | "danger" | "warning" | "neutral"; label: string }> = {
  P: { tone: "success", label: "Passing" },
  F: { tone: "danger", label: "Failing so far" },
  FA: { tone: "danger", label: "Too many absences" },
  DR: { tone: "neutral", label: "Dropped" },
};

const fmtGrade = (g: number) => g.toFixed(2);

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 flex-1 rounded-full bg-primary-soft">
      <div
        className={clsx("h-full rounded-full", pct < 50 ? "bg-warning" : "bg-primary")}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function TermBreakdown({ label, term }: { label: string; term: Term }) {
  if (!term.started) {
    return (
      <div>
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="mt-1 text-sm text-muted">Nothing recorded yet.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="text-sm text-muted">
          Grade <span className="font-semibold text-foreground tabular-nums">{fmtGrade(term.grade)}</span> · raw{" "}
          <span className="tabular-nums">{term.rawScore}</span> · {term.weightSoFar}% of the term recorded
        </p>
      </div>
      <ul className="mt-3 space-y-3">
        {term.categories.map((c) => (
          <li key={c.name} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">{c.name}</span>
              <Badge>{c.weight}%</Badge>
              <span className="ml-auto text-muted tabular-nums">
                {c.result ? (
                  <>
                    {c.result.raw} / {c.result.max} ·{" "}
                    <span className="font-medium text-foreground">{c.result.weighted}</span> of {c.weight}
                  </>
                ) : (
                  "Not yet"
                )}
              </span>
            </div>
            {c.result && (
              <div className="mt-2 flex items-center gap-2">
                <Bar pct={c.result.max ? (c.result.raw / c.result.max) * 100 : 0} />
              </div>
            )}
            {c.items.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {c.items.map((i) => (
                  <li key={i.title} className="flex justify-between gap-3">
                    <span className="truncate">{i.title}</span>
                    <span className="shrink-0 tabular-nums">
                      {i.pending ? "Being graded" : !i.recorded ? "Not yet" : i.score === null ? "0 (missed)" : `${i.score} / ${i.maxScore}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Absences this term: {term.absences}
      </p>
    </div>
  );
}

export default async function StandingPage() {
  const subjects = await getMyStanding();

  return (
    <>
      <PageHeader
        title="Standing"
        description={`Your grade in each subject so far, the way your teacher's class record computes it. 1.00 is the highest; ${fmtGrade(passingGrade)} is passing.`}
      />

      {subjects.length === 0 ? (
        <Card>
          <EmptyState title="You're not in any class yet" />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map(({ class: c, current }) => (
              <a key={c.id} href={`#${c.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
                <Card className="h-full p-5 hover:bg-surface-muted">
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">{c.courseCode}</p>
                  <p className="truncate text-sm text-muted">{c.title}</p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <p className="text-3xl font-semibold tabular-nums">{current ? fmtGrade(current.grade) : "—"}</p>
                    {current ? (
                      <Badge tone={remarkBadge[current.remark].tone}>{remarkBadge[current.remark].label}</Badge>
                    ) : (
                      <Badge>No grades yet</Badge>
                    )}
                  </div>
                  {current && (
                    <p className="mt-1 text-xs text-muted tabular-nums">
                      Raw score {current.rawScore} · {current.absences}{" "}
                      {current.absences === 1 ? "absence" : "absences"}
                    </p>
                  )}
                </Card>
              </a>
            ))}
          </div>

          <div className="mt-6 space-y-6">
            {subjects.map(({ class: c, terms, current }) => (
              <Card key={c.id} id={c.id} className="scroll-mt-24">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div>
                    <h2 className="font-semibold">
                      {c.courseCode} · {c.title}
                    </h2>
                    <p className="text-sm text-muted">
                      {c.section} · {c.term}
                    </p>
                  </div>
                  {current && (
                    <div className="text-right">
                      <p className="text-xs text-muted">Current grade</p>
                      <p className="text-2xl font-semibold tabular-nums">{fmtGrade(current.grade)}</p>
                    </div>
                  )}
                </div>
                {terms ? (
                  <div className="grid gap-6 p-5 lg:grid-cols-2">
                    <TermBreakdown label="Midterm" term={terms.midterm} />
                    <TermBreakdown label="Finals" term={terms.final} />
                  </div>
                ) : (
                  <EmptyState title="Your teacher hasn't set up the class record yet" />
                )}
                {current && current.absences > absenceLimit - 2 && current.remark !== "FA" && (
                  <p className="mx-5 mb-5 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                    You have {current.absences} absences. More than {absenceLimit} makes a failing grade FA (failure due
                    to absences).
                  </p>
                )}
              </Card>
            ))}
          </div>

          <details className="mt-6 rounded-xl border border-border bg-surface p-5 text-sm">
            <summary className="cursor-pointer font-medium">How your grade is computed</summary>
            <div className="mt-3 space-y-3 text-muted">
              <p>
                Each term grade comes from weighted categories: activities and daily work (quizzes, labs, recitation)
                plus the major exam. Your raw score out of 100 is turned into a grade with the school&apos;s
                transmutation table below. The subject grade is the average of the midterm and finals raw scores.
              </p>
              <p>
                Until a term is complete, only categories with recorded work count, so this is where you stand now, not
                a final grade. Missed work you didn&apos;t submit counts as 0.
              </p>
              <div className="grid grid-cols-3 gap-x-6 gap-y-1 sm:grid-cols-6">
                {transmutationTable.map(([min, grade]) => (
                  <div key={grade} className="flex justify-between gap-2 tabular-nums">
                    <span>{min}+</span>
                    <span className="font-medium text-foreground">{fmtGrade(grade)}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </>
      )}
    </>
  );
}
