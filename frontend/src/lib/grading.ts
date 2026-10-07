// Class record math, matching the school's Excel class record (CLASS-RECORD-2026.xlsm).
import type { ClassRecord, GradingTerm, RecordCategory } from "./types";

// The TRANSMU sheet: lowest raw score for each grade. Like Excel's VLOOKUP(…, TRUE),
// a score takes the grade of the highest row it reaches, so 49.5 is still 3.25.
const transmutation: [number, number][] = [
  [97, 1],
  [93, 1.25],
  [88, 1.5],
  [83, 1.75],
  [77, 2],
  [71, 2.25],
  [65, 2.5],
  [58, 2.75],
  [50, 3],
  [45, 3.25],
  [39, 3.5],
  [33, 3.75],
  [27, 4],
  [21, 4.25],
  [15, 4.5],
  [9, 4.75],
  [0, 5],
];

export const transmutationTable = transmutation;

export function transmute(rawScore: number): number {
  return transmutation.find(([min]) => rawScore >= min)?.[1] ?? 5;
}

export const passingGrade = 3;
// More absences than this in a term (or in total) makes a failing grade "FA".
export const absenceLimit = 7;

export type Remark = "P" | "F" | "FA" | "DR";

export function remark(grade: number, absences: number, dropped: boolean): Remark {
  if (dropped) return "DR";
  if (grade <= passingGrade) return "P";
  return absences > absenceLimit ? "FA" : "F";
}

// Scores for linked items, by item id then student id (null = didn't submit).
export type LinkedScores = Record<string, Record<string, number | null>>;

export function itemScore(record: ClassRecord, linked: LinkedScores, itemId: string, studentId: string) {
  return (linked[itemId] ?? record.scores[itemId])?.[studentId] ?? null;
}

// Raw total over the category's max, scaled to its weight and never above it (as in the sheet).
export function categoryResult(record: ClassRecord, linked: LinkedScores, cat: RecordCategory, studentId: string) {
  const max = cat.items.reduce((n, i) => n + i.maxScore, 0);
  const raw = cat.items.reduce((n, i) => n + (itemScore(record, linked, i.id, studentId) ?? 0), 0);
  const weighted = max > 0 ? Math.min(cat.weight, (raw / max) * cat.weight) : 0;
  return { raw, max, weighted };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function termResult(record: ClassRecord, linked: LinkedScores, term: GradingTerm, studentId: string) {
  const cats = record.terms[term].map((c) => ({ cat: c, ...categoryResult(record, linked, c, studentId) }));
  const adw = cats.filter((c) => !c.cat.isExam).reduce((n, c) => n + c.weighted, 0);
  const exam = cats.filter((c) => c.cat.isExam).reduce((n, c) => n + c.weighted, 0);
  const rawScore = round2(adw + exam);
  return { categories: cats, adw: round2(adw), exam: round2(exam), rawScore, grade: transmute(rawScore) };
}

export function courseResult(record: ClassRecord, linked: LinkedScores, studentId: string) {
  const midterm = termResult(record, linked, "midterm", studentId);
  const final = termResult(record, linked, "final", studentId);
  const absences = {
    midterm: record.absences.midterm[studentId] ?? 0,
    final: record.absences.final[studentId] ?? 0,
  };
  const dropped = record.dropped.includes(studentId);
  const rawScore = round2((midterm.rawScore + final.rawScore) / 2);
  const grade = transmute(rawScore);
  return {
    midterm: { ...midterm, absences: absences.midterm, remark: remark(midterm.grade, absences.midterm, dropped) },
    final: {
      ...final,
      absences: absences.final,
      remark: remark(final.grade, absences.midterm + absences.final, dropped),
    },
    rawScore,
    grade,
    remark: remark(grade, absences.midterm + absences.final, dropped),
  };
}

export const termWeightTotal = (cats: RecordCategory[]) => cats.reduce((n, c) => n + c.weight, 0);
