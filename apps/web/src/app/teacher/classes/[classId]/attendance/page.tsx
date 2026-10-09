import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { attendancePolicy, statusLabel, termOf } from "@/lib/attendance";
import { getAttendance } from "@/lib/data/attendance";
import { getStoredRecord } from "@/lib/data/class-records";
import { formatDay, fullName } from "@/lib/format";
import { AttendanceExcel } from "./attendance-excel";
import { DropButton } from "./drop-button";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage(props: PageProps<"/teacher/classes/[classId]/attendance">) {
  const { classId } = await props.params;
  const data = await getAttendance(classId);
  if (!data) notFound();
  const { cls, meetings } = data;
  const dropped = new Set((await getStoredRecord(classId))?.dropped ?? []);
  const open = meetings.filter((m) => !m.takenAt);
  const held = meetings.filter((m) => m.takenAt).length;
  // Students closest to being dropped first.
  const rows = [...data.students].sort(
    (a, b) => b.tally.effectiveAbsences - a.tally.effectiveAbsences || fullName(a.student).localeCompare(fullName(b.student)),
  );
  const count = (records: Record<string, string>, status: string) => Object.values(records).filter((s) => s === status).length;

  return (
    <>
      <PageHeader
        back={{ href: `/teacher/classes/${cls.id}`, label: `${cls.courseCode} · ${cls.section}` }}
        title="Attendance"
        description={`${cls.schedule} · ${held} ${held === 1 ? "meeting" : "meetings"} so far · ${attendancePolicy.latesPerAbsence} lates = 1 absence · dropped at ${attendancePolicy.dropAtAbsences} absences`}
        actions={
          <AttendanceExcel
            fileName={`${cls.courseCode}-${cls.section}`.replace(/\s+/g, "-")}
            title={`${cls.courseCode} · ${cls.title} · ${cls.section} · ${cls.schedule}`}
            meetings={meetings}
            students={data.students.map(({ student: s }) => ({
              id: s.id,
              name: `${s.lastName}, ${s.firstName}`,
              studentNumber: s.studentNumber,
              sex: s.sex,
            }))}
            dropped={[...dropped]}
          />
        }
      />

      {open.map((m) => (
        <Card key={m.id} className="mb-6 flex flex-wrap items-center justify-between gap-4 border-primary/40 bg-primary-soft p-5">
          <div className="flex items-center gap-3">
            <CalendarCheck className="size-6 text-primary" aria-hidden />
            <div>
              <p className="font-semibold">{formatDay(`${m.date}T12:00:00+08:00`)}</p>
              <p className="text-sm text-muted">Attendance not taken yet</p>
            </div>
          </div>
          <ButtonLink href={`/teacher/classes/${cls.id}/attendance/${m.id}`}>Take attendance</ButtonLink>
        </Card>
      ))}

      <Card>
        <CardHeader
          title="Students"
          description="Absences count lates (7 = 1) but not excused absences."
          action={
            <ButtonLink href={`/teacher/classes/${cls.id}/record`} variant="ghost" className="px-2.5 py-1.5 text-sm">
              Class record →
            </ButtonLink>
          }
        />
        <p className="border-b border-border bg-info-soft px-5 py-2 text-sm text-info">
          These absences fill in the class record&apos;s No. of Absences, and its Attendance item scores meetings held
          minus absences.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th className="text-right">Present</Th>
              <Th className="text-right">Late</Th>
              <Th className="text-right">Absent</Th>
              <Th className="hidden text-right sm:table-cell">Excused</Th>
              <Th className="text-right">Absences</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student: s, tally: t, standing }) => (
              <tr key={s.id}>
                <Td>
                  <p className="font-medium">{fullName(s)}</p>
                  <p className="font-mono text-xs text-muted">{s.studentNumber}</p>
                </Td>
                <Td className="text-right tabular-nums">{t.present}</Td>
                <Td className="text-right tabular-nums">{t.late}</Td>
                <Td className="text-right tabular-nums">{t.absent}</Td>
                <Td className="hidden text-right tabular-nums sm:table-cell">{t.excused}</Td>
                <Td className="text-right font-semibold tabular-nums">
                  {t.effectiveAbsences}
                  {t.late >= attendancePolicy.latesPerAbsence && (
                    <span className="block text-xs font-normal text-muted">incl. {Math.floor(t.late / attendancePolicy.latesPerAbsence)} from lates</span>
                  )}
                </Td>
                <Td>
                  {dropped.has(s.id) ? (
                    <Badge>Dropped (DR)</Badge>
                  ) : standing === "drop" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="danger">Reached {attendancePolicy.dropAtAbsences} – drop</Badge>
                      <DropButton classId={cls.id} studentId={s.id} name={fullName(s)} />
                    </div>
                  ) : standing === "warning" ? (
                    <Badge tone="warning">One more absence = drop</Badge>
                  ) : (
                    <Badge tone="success">OK</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Meetings" />
        {meetings.length === 0 ? (
          <EmptyState title="No meetings yet">Meetings appear from the class schedule, starting with the semester.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th className="hidden sm:table-cell">Term</Th>
                {(["late", "absent", "excused"] as const).map((s) => (
                  <Th key={s} className="text-right">
                    {statusLabel[s]}
                  </Th>
                ))}
                <Th>
                  <span className="sr-only">Edit</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id}>
                  <Td className="font-medium whitespace-nowrap">{formatDay(`${m.date}T12:00:00+08:00`)}</Td>
                  <Td className="hidden text-muted sm:table-cell">{termOf(m.date) === "midterm" ? "Midterm" : "Final term"}</Td>
                  {m.takenAt ? (
                    (["late", "absent", "excused"] as const).map((s) => (
                      <Td key={s} className="text-right tabular-nums">
                        {count(m.records, s) || <span className="text-muted">0</span>}
                      </Td>
                    ))
                  ) : (
                    (["late", "absent", "excused"] as const).map((s, i) => (
                      <Td key={s} className="text-right text-muted">
                        {i === 0 ? "Not taken" : "—"}
                      </Td>
                    ))
                  )}
                  <Td className="text-right">
                    <ButtonLink href={`/teacher/classes/${cls.id}/attendance/${m.id}`} variant="ghost" className="px-2.5 py-1.5">
                      {m.takenAt ? "Edit" : "Take"}
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
