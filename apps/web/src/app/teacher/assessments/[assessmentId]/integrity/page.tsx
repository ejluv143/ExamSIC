import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { alertStyle, AlertChip } from "@/components/integrity-chip";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { getAssessment, getStudents, getSubmissions } from "@/lib/data/teacher";
import { formatDateTime, formatRelative, fullName } from "@/lib/format";
import { awayCount } from "@/lib/integrity";
import type { IntegrityEventType } from "@/lib/types";
import { TypeFilter } from "./type-filter";

export const metadata: Metadata = { title: "Anti-cheating" };

// Same student, same color, so names are quick to scan.
const avatarColors = [
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
];
const avatarColor = (id: string) => avatarColors[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % avatarColors.length];

export default async function IntegrityPage(props: PageProps<"/teacher/assessments/[assessmentId]/integrity">) {
  const { assessmentId } = await props.params;
  const { type } = await props.searchParams;
  const a = await getAssessment(assessmentId);
  if (!a) notFound();

  const submissions = (await getSubmissions(a.id)).filter((s) => s.integrityEvents.length > 0);
  const students = new Map((await getStudents(submissions.map((s) => s.studentId))).map((s) => [s.id, s]));

  // One row per submission with its alerts grouped by type, most alerts first.
  const rows = submissions
    .map((s) => {
      const counts = new Map<IntegrityEventType, number>();
      for (const e of s.integrityEvents) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      return {
        sub: s,
        student: students.get(s.studentId),
        counts: [...counts].sort((x, y) => y[1] - x[1]),
        total: s.integrityEvents.length,
        away: awayCount(s.integrityEvents),
        last: s.integrityEvents.reduce((m, e) => (e.at > m ? e.at : m), ""),
      };
    })
    .sort((x, y) => y.away - x.away || y.total - x.total);

  const typeCounts = new Map<IntegrityEventType, number>();
  for (const r of rows) for (const [t] of r.counts) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  const filter = typeof type === "string" && typeCounts.has(type as IntegrityEventType) ? (type as IntegrityEventType) : null;
  const shown = filter ? rows.filter((r) => r.counts.some(([t]) => t === filter)) : rows;

  return (
    <>
      <PageHeader
        back={{ href: `/teacher/assessments/${a.id}`, label: a.title }}
        title="Anti-cheating"
        description="What the anti-cheating checks noticed while students took it. A flag isn't proof of cheating: a notification or a lost connection can cause one too."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5" aria-hidden />
          {rows.length} {rows.length === 1 ? "student" : "students"} with alerts
        </h2>
        {a.settings.integrity.autoSubmitAfter !== null && (
          <Badge tone="warning">Auto-submit at {a.settings.integrity.autoSubmitAfter} warnings</Badge>
        )}
        {filter && (
          <span className="text-sm text-muted">
            · showing {shown.length} with “{alertStyle[filter].label}”
          </span>
        )}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No alerts">
            <ShieldCheck className="mx-auto mb-1 size-6 text-success" aria-hidden />
            Nobody left the page, copied or pasted during this {a.kind}.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>
                  <Suspense>
                    <TypeFilter
                      options={[...typeCounts].map(([t, count]) => ({ value: t, label: alertStyle[t].label, count }))}
                    />
                  </Suspense>
                </Th>
                <Th className="text-right">Total alerts</Th>
                <Th className="hidden md:table-cell">Last alert</Th>
                <Th>
                  <span className="sr-only">Log</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ sub, student, counts, total, away, last }) => (
                <tr key={sub.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${avatarColor(sub.studentId)}`}
                        aria-hidden
                      >
                        {student ? `${student.firstName[0]}${student.lastName[0]}` : "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">{student ? fullName(student) : "Unknown student"}</p>
                        <p className="font-mono text-xs text-muted">{student?.studentNumber}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {counts.map(([t, n]) => (
                        <AlertChip key={t} type={t} count={n} />
                      ))}
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">
                    <span className="font-semibold">{total}</span>
                    {away > 0 && <span className="block text-xs text-danger">left {away}×</span>}
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span title={formatDateTime(last)}>{formatRelative(last)}</span>
                  </Td>
                  <Td className="text-right">
                    <ButtonLink
                      href={`/teacher/grading/${a.id}?submission=${sub.id}`}
                      variant="ghost"
                      className="px-2.5 py-1.5"
                    >
                      View log
                    </ButtonLink>
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
