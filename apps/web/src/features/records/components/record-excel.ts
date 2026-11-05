import { categoryResult, courseResult, termResult, type ClassRecord, type LinkedScores } from "@examinus/domain/class-record";
import type { GradingTerm } from "@examinus/domain/attendance";
import type { Class } from "@/features/classes/types";

export const termLabel: Record<GradingTerm, string> = { midterm: "Midterm", final: "Final term" };

type Groups = { label: string; list: { id: string; name: string }[] }[];

// The class record as an .xlsx: one sheet per term (scores and computed columns) and one for the grade sheet.
export async function exportExcel(cls: Class, record: ClassRecord, groups: Groups, linked: LinkedScores) {
  // Loaded on click: the Excel writer is large and only this export needs it.
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const bold = (value: string | number) => ({ value, fontWeight: "bold" as const });
  const score = (itemId: string, sid: string) => linked[itemId]?.[sid] ?? record.scores[itemId]?.[sid] ?? null;
  const title = [bold(`${cls.courseCode} · ${cls.title}`), null, null, `${cls.section} · ${cls.term}`];

  const termSheet = (term: GradingTerm) => {
    const cats = [...record.terms[term].filter((c) => !c.isExam), ...record.terms[term].filter((c) => c.isExam)];
    const head1 = ["No.", "Name", "Abs", ...cats.flatMap((c) => [bold(`${c.name} (${c.weight}%)`), ...c.items.map(() => null)]), "ADW", "RS", "Grade"].map(
      (v) => (typeof v === "string" ? bold(v) : v),
    );
    const head2 = [null, null, null, ...cats.flatMap((c) => [...c.items.map((i) => `${i.title} /${i.maxScore}`), "%"]), null, null, null];
    const rows = groups.flatMap((g) => [
      [bold(g.label)],
      ...g.list.map((s, n) => {
        const r = termResult(record, linked, term, s.id);
        return [
          n + 1,
          s.name,
          record.absences[term][s.id] ?? 0,
          ...cats.flatMap((c) => [...c.items.map((i) => score(i.id, s.id)), Number(categoryResult(record, linked, c, s.id).weighted.toFixed(2))]),
          r.adw,
          r.rawScore,
          r.grade,
        ];
      }),
    ]);
    return { sheet: termLabel[term], data: [title, [], head1, head2, ...rows], columns: [{ width: 5 }, { width: 30 }], stickyRowsCount: 4 };
  };

  const sheetRows = groups.flatMap((g) => [
    [bold(g.label)],
    ...g.list.map((s, n) => {
      const c = courseResult(record, linked, s.id);
      return [n + 1, s.name, c.midterm.absences, c.midterm.grade, c.midterm.remark, c.final.absences, c.final.grade, c.final.remark, c.grade, c.remark];
    }),
  ]);
  await writeExcelFile([
    termSheet("midterm"),
    termSheet("final"),
    {
      sheet: "Grade Sheet",
      data: [
        title,
        [],
        ["No.", "Name", "Midterm A", "Midterm Grade", "R", "Final A", "Final Grade", "R", "Course Grade", "Remarks"].map(bold),
        ...sheetRows,
      ],
      columns: [{ width: 5 }, { width: 30 }],
      stickyRowsCount: 3,
    },
  ]).toFile(`class-record-${cls.courseCode}-${cls.section}.xlsx`.replace(/\s+/g, "-"));
}
