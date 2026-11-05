"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { CellObject, SheetData } from "write-excel-file/browser";
import { Button } from "@/components/ui";
import { formatMonthDay, formatMonthYear, formatWeekday, manilaNoon } from "@examinus/copy/time";
import { Select } from "@/components/select";
import { attendancePolicy, attendanceStanding, tally } from "@examinus/domain/attendance";
import type { AttendanceStatus, ClassMeeting } from "@examinus/domain/attendance";
import { rosterGroups } from "@examinus/domain/class-record";

type ExcelStudent = { id: string; name: string; studentNumber: string; sex: "M" | "F" | null };

const monthKey = (date: string) => date.slice(0, 7);
const monthName = (key: string) => formatMonthYear(manilaNoon(`${key}-01`));
const weekday = (date: string) => formatWeekday(manilaNoon(date));
const dayLabel = (date: string) => formatMonthDay(manilaNoon(date));

const mark: Record<AttendanceStatus, string> = { present: "P", late: "L", absent: "A", excused: "E" };
// Same colors as the roll call: absent red, late amber, excused blue.
const markColor: Partial<Record<AttendanceStatus, string>> = { absent: "#C4302B", late: "#A35C00", excused: "#1E63C4" };

// Attendance as an .xlsx: a sheet per month (a column per meeting, headed by weekday and date) and a semester summary.
export function AttendanceExcel({
  fileName,
  title,
  meetings,
  students,
  dropped,
}: {
  fileName: string;
  title: string;
  meetings: readonly ClassMeeting[];
  students: ExcelStudent[];
  dropped: string[];
}) {
  const taken = meetings.filter((m) => m.takenAt).sort((a, b) => a.date.localeCompare(b.date));
  const months = [...new Set(taken.map((m) => monthKey(m.date)))];
  const [month, setMonth] = useState("all");
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const bold = (value: string | number, extra: Partial<CellObject> = {}): CellObject => ({ value, fontWeight: "bold", ...extra });
    const center = (value: string | number, extra: Partial<CellObject> = {}): CellObject => ({ value, align: "center", ...extra });
    const groups = rosterGroups(students);
    const statuses: AttendanceStatus[] = ["present", "late", "absent", "excused"];
    const legend: SheetData = [
      [],
      ["Legend: P = Present · L = Late · A = Absent · E = Excused"],
      [`${attendancePolicy.latesPerAbsence} lates count as 1 absence; excused absences don't count. Dropped at ${attendancePolicy.dropAtAbsences} absences.`],
    ];

    const monthSheet = (key: string) => {
      const days = taken.filter((m) => monthKey(m.date) === key);
      const rows: SheetData = groups.flatMap((g) => {
        let n = 0;
        return [
          [null, bold(g.label)],
          ...g.list.map((s) => {
            const count = Object.fromEntries(statuses.map((st) => [st, 0])) as Record<AttendanceStatus, number>;
            const cells = days.map((m) => {
              const status = m.records[s.id] ?? "present";
              count[status]++;
              return center(mark[status], markColor[status] ? { textColor: markColor[status], fontWeight: "bold" } : {});
            });
            return [++n, s.name, ...cells, ...statuses.map((st) => center(count[st]))];
          }),
        ];
      });
      return {
        sheet: monthName(key),
        data: [
          [bold(title)],
          [bold(`Attendance · ${monthName(key)}`)],
          [],
          // Weekday names above the dates.
          [bold("No."), bold("Name"), ...days.map((m) => center(weekday(m.date), { fontWeight: "bold" as const })), ...statuses.map((st) => center(`${st[0].toUpperCase()}${st.slice(1)}`, { fontWeight: "bold" as const }))],
          [null, null, ...days.map((m) => center(dayLabel(m.date)))],
          ...rows,
          ...legend,
        ],
        columns: [{ width: 5 }, { width: 30 }, ...days.map(() => ({ width: 11 })), ...statuses.map(() => ({ width: 9 }))],
        stickyRowsCount: 5,
        stickyColumnsCount: 2,
      };
    };

    const summary = {
      sheet: "Summary",
      data: [
        [bold(title)],
        [bold(`Attendance summary · ${taken.length} meetings`)],
        [],
        ["No.", "Name", "Student no.", "Present", "Late", "Absent", "Excused", "Absences (lates converted)", "Status"].map((h) => bold(h)),
        ...groups.flatMap((g) => {
          let n = 0;
          return [
            [null, bold(g.label)],
            ...g.list.map((s) => {
              const t = tally(meetings, s.id);
              const standing = attendanceStanding(t.effectiveAbsences);
              const status = dropped.includes(s.id)
                ? "Dropped (DR)"
                : standing === "drop"
                  ? `Reached ${attendancePolicy.dropAtAbsences} – drop`
                  : standing === "warning"
                    ? "One more absence = drop"
                    : "OK";
              return [++n, s.name, s.studentNumber, t.present, t.late, t.absent, t.excused, center(t.effectiveAbsences, { fontWeight: "bold" as const }), status];
            }),
          ];
        }),
        ...legend,
      ],
      columns: [{ width: 5 }, { width: 30 }, { width: 14 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 14 }, { width: 24 }],
      stickyRowsCount: 4,
    };

    const sheets = month === "all" ? [...months.map(monthSheet), summary] : [monthSheet(month)];
    await writeExcelFile(sheets).toFile(
      `${fileName}-attendance-${month === "all" ? "semester" : monthName(month).replace(/\s+/g, "-")}.xlsx`,
    );
    setBusy(false);
  }

  if (months.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={month}
        onChange={setMonth}
        aria-label="Month to download"
        options={[{ value: "all", label: "All months + summary" }, ...months.map((m) => ({ value: m, label: monthName(m) }))]}
      />
      <Button variant="secondary" onClick={download} disabled={busy}>
        <Download className="size-4" aria-hidden /> {busy ? "Preparing…" : "Excel"}
      </Button>
    </div>
  );
}
