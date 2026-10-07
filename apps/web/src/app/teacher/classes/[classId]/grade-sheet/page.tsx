import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import clsx from "clsx";
import { PrintButton } from "@/components/print-button";
import { requireTeacher } from "@/lib/auth/dal";
import { getClassRecord } from "@/lib/data/class-records";
import { schoolProfile } from "@/lib/data/teacher";
import { formatDate, semesterLabel } from "@/lib/format";
import { courseResult } from "@/lib/grading";

export const metadata: Metadata = { title: "Grade sheet" };

const red = (remark: string) => remark !== "P" && "text-red-700";
const grade = (g: number) => g.toFixed(2);

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0">{label}</span>
      <span className="flex-1 border-b border-black font-semibold">{children}</span>
    </div>
  );
}

function Signature({ label, name, role }: { label: string; name: string; role: string }) {
  return (
    <div>
      <p>{label}</p>
      <p className="mt-8 border-t border-black pt-0.5 text-center font-semibold uppercase">{name || " "}</p>
      <p className="text-center">{role}</p>
    </div>
  );
}

// The Collegiate Grade Sheet, laid out like the school's form, ready to print.
export default async function GradeSheetPage(props: PageProps<"/teacher/classes/[classId]/grade-sheet">) {
  const { classId } = await props.params;
  const [user, data] = await Promise.all([requireTeacher(), getClassRecord(classId)]);
  if (!data) notFound();
  const { cls, record, linked } = data;
  const byName = (a: { lastName: string; firstName: string }, b: { lastName: string; firstName: string }) =>
    `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`);
  const groups = [
    { label: "MALE STUDENTS", list: data.students.filter((s) => s.sex === "M").sort(byName) },
    { label: "FEMALE STUDENTS", list: data.students.filter((s) => s.sex === "F").sort(byName) },
  ].filter((g) => g.list.length > 0);
  let n = 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/teacher/classes/${cls.id}/record`} className="text-sm text-muted hover:text-foreground">
          ← Class record
        </Link>
        <PrintButton label="Print grade sheet" />
      </div>

      <article className="mx-auto max-w-[8.5in] bg-white p-8 font-serif text-[11pt] text-black shadow-sm ring-1 ring-black/10 print:p-0 print:shadow-none print:ring-0">
        <header className="text-center">
          <p className="text-lg font-bold">{schoolProfile.school.toUpperCase()}</p>
          <p>{schoolProfile.schoolAddress}</p>
          <p className="mt-3 text-base font-bold tracking-wide">COLLEGIATE GRADE SHEET</p>
          <p>
            {semesterLabel[schoolProfile.semester]}, AY {schoolProfile.academicYear}
          </p>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1 text-[10pt]">
          <Info label="Course Code:">{cls.courseCode}</Info>
          <Info label="Instructor:">{user.name}</Info>
          <Info label="Course Title:">{cls.title}</Info>
          <Info label="Class Sched.:">{cls.schedule}</Info>
          <Info label="Unit Credit:">{cls.units}</Info>
          <Info label="Room:">{cls.room}</Info>
        </section>

        <p className="mt-4 text-[9pt] italic">
          (Alphabetized by surname and grouped into men and women.) F, DR and FA are printed in red.
        </p>

        <table className="mt-2 w-full border-collapse text-[9.5pt] [&_td]:border [&_td]:border-black [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:border [&_th]:border-black [&_th]:px-1 [&_th]:py-0.5">
          <thead>
            <tr>
              <th rowSpan={2}>No.</th>
              <th rowSpan={2} className="text-left">
                Name of Students (Surname, First name, MI)
              </th>
              <th rowSpan={2}>Course &amp; Year</th>
              <th colSpan={3}>MIDTERM</th>
              <th colSpan={3}>FINAL TERM</th>
              <th rowSpan={2}>
                COURSE
                <br />
                GRADE
              </th>
              <th rowSpan={2}>R</th>
            </tr>
            <tr>
              {["A", "Grade", "R", "A", "Grade", "R"].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.label}>
                <tr>
                  <td colSpan={11} className="font-bold">
                    {g.label}
                  </td>
                </tr>
                {g.list.map((s) => {
                  const c = courseResult(record, linked, s.id);
                  n++;
                  return (
                    <tr key={s.id}>
                      <td className="text-center">{n}</td>
                      <td>
                        {s.lastName}, {s.firstName}
                      </td>
                      <td className="text-center">{cls.section}</td>
                      <td className="text-center">{c.midterm.absences}</td>
                      <td className={clsx("text-center", red(c.midterm.remark))}>{grade(c.midterm.grade)}</td>
                      <td className={clsx("text-center", red(c.midterm.remark))}>{c.midterm.remark}</td>
                      <td className="text-center">{c.final.absences}</td>
                      <td className={clsx("text-center", red(c.final.remark))}>{grade(c.final.grade)}</td>
                      <td className={clsx("text-center", red(c.final.remark))}>{c.final.remark}</td>
                      <td className={clsx("text-center font-bold", red(c.remark))}>{grade(c.grade)}</td>
                      <td className={clsx("text-center font-bold", red(c.remark))}>{c.remark}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-center text-[9pt] tracking-widest">-----Grade sheet closed-----</p>

        <section className="mt-4 grid grid-cols-2 gap-6 text-[9pt]">
          <div>
            <p className="font-bold">Legend:</p>
            <p>A = Absences · R = Remarks</p>
            <p>P = Passed · F = Failed · FA = Failure due to absences · DR = Dropped</p>
          </div>
          <div className="text-right">Date: {formatDate(new Date().toISOString())}</div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-x-10 gap-y-6 text-[9.5pt]">
          <Signature label="Submitted by:" name={user.name} role="Instructor" />
          <Signature label="Checked:" name={record.signatories.dean} role="Dean / Program Head" />
          <Signature label="Noted:" name={record.signatories.vpaa} role="VPAA" />
          <Signature label="Received:" name={record.signatories.registrar} role="Registrar" />
        </section>
      </article>
    </>
  );
}
