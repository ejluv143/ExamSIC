import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { getSummaryReport } from "@/lib/data/class-records";
import { schoolProfile } from "@/lib/data/teacher";
import { formatDate, semesterLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Summary report" };

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "—");

// The Summary Report on Class Academic Performance, one row per class, from each class record.
export default async function ReportsPage() {
  const { faculty, rows } = await getSummaryReport();
  const missing = rows.filter((r) => !r.hasRecord);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Summary report"
          description="Passed, failed, FA and DR in each of your classes, from their class records."
          actions={<PrintButton label="Print report" />}
        />
        {missing.length > 0 && (
          <p className="mb-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">
            No class record yet for {missing.map((r, i) => (
              <span key={r.cls.id}>
                {i > 0 && ", "}
                <Link href={`/teacher/classes/${r.cls.id}/record`} className="font-medium underline">
                  {r.cls.courseCode} {r.cls.section}
                </Link>
              </span>
            ))}
            . Those rows show no results until you start one.
          </p>
        )}
      </div>

      <article className="mx-auto max-w-[11in] bg-white p-8 font-serif text-[10.5pt] text-black shadow-sm ring-1 ring-black/10 print:p-0 print:shadow-none print:ring-0">
        <header className="text-center">
          <p className="text-lg font-bold">{schoolProfile.school.toUpperCase()}</p>
          <p>{schoolProfile.schoolAddress}</p>
          <p className="mt-3 text-base font-bold tracking-wide">SUMMARY REPORT ON CLASS ACADEMIC PERFORMANCE</p>
          <p>
            {semesterLabel[schoolProfile.semester]}, A.Y. {schoolProfile.academicYear}
          </p>
        </header>

        <section className="mt-5 flex flex-wrap justify-between gap-4">
          <div>
            <p>
              Name of Faculty: <span className="font-semibold">{faculty}</span>
            </p>
            <p>{schoolProfile.department}</p>
          </div>
          <div className="text-right">
            <p>Date: {formatDate(new Date().toISOString())}</p>
            <p>
              ☐ Full-time &nbsp; ☐ Part-time
            </p>
          </div>
        </section>

        <table className="mt-4 w-full border-collapse text-[9.5pt] [&_td]:border [&_td]:border-black [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:border-black [&_th]:px-1 [&_th]:py-1">
          <thead>
            <tr>
              <th rowSpan={2}>#</th>
              <th rowSpan={2} className="text-left">
                Subject Code and Title
              </th>
              <th rowSpan={2}>Credit Units</th>
              <th rowSpan={2}>Total No. of Students</th>
              <th colSpan={2}>Passed</th>
              <th colSpan={2}>Failed</th>
              <th colSpan={2}>FA</th>
              <th colSpan={2}>DR</th>
            </tr>
            <tr>
              {Array.from({ length: 4 }, (_, i) => (
                <th key={i} colSpan={1}>
                  No
                </th>
              )).flatMap((no, i) => [no, <th key={`p${i}`}>%</th>])}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cls, total, counts, hasRecord }, i) => (
              <tr key={cls.id}>
                <td className="text-center">{i + 1}</td>
                <td>
                  {cls.courseCode} – {cls.title}
                  <span className="text-[8.5pt]"> ({cls.section})</span>
                </td>
                <td className="text-center">{cls.units}</td>
                <td className="text-center">{total}</td>
                {(["P", "F", "FA", "DR"] as const).map((k) => (
                  <FragmentCells key={k} n={hasRecord ? counts[k] : null} total={total} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-10 grid grid-cols-2 gap-10">
          <div>
            <p>Submitted by:</p>
            <p className="mt-8 border-t border-black pt-0.5 text-center font-semibold uppercase">{faculty}</p>
            <p className="text-center">Faculty Name and Signature</p>
          </div>
          <div>
            <p>Noted by:</p>
            <p className="mt-8 border-t border-black pt-0.5 text-center">&nbsp;</p>
            <p className="text-center">Dean / Program Head, {schoolProfile.department}</p>
          </div>
        </section>
      </article>
    </>
  );
}

function FragmentCells({ n, total }: { n: number | null; total: number }) {
  return (
    <>
      <td className="text-center">{n ?? "—"}</td>
      <td className="text-center">{n === null ? "—" : pct(n, total)}</td>
    </>
  );
}
