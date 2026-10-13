import type { ClassRecord } from "@examinus/contract";

const terms = ["midterm", "final"] as const;

// Keeps a record from the editor in bounds: numbers in range, text cut to length, and only this class's
// students and sessions.
export function cleanRecord(
  raw: ClassRecord,
  enrolled: ReadonlySet<string>,
  sessionIds: ReadonlySet<string>,
): Omit<ClassRecord, "classId"> {
  const num = (v: number, max: number) => (Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  const text = (v: string, max: number) => v.slice(0, max);
  const clean = { midterm: [], final: [] } as { [T in (typeof terms)[number]]: ClassRecord["terms"][T][number][] };
  for (const term of terms)
    clean[term] = raw.terms[term].slice(0, 20).map((c) => ({
      id: text(c.id, 40),
      name: text(c.name, 60) || "Category",
      weight: num(c.weight, 100) ?? 0,
      isExam: c.isExam,
      items: c.items.slice(0, 40).map((i) => ({
        id: text(i.id, 40),
        title: text(i.title, 80),
        maxScore: num(i.maxScore, 1000) ?? 0,
        sessionId: i.sessionId !== null && sessionIds.has(i.sessionId) ? i.sessionId : null,
        ...(i.source === "attendance" ? { source: "attendance" as const } : {}),
      })),
    }));
  const scores: Record<string, Record<string, number | null>> = {};
  for (const [itemId, byStudent] of Object.entries(raw.scores))
    scores[itemId] = Object.fromEntries(
      Object.entries(byStudent)
        .filter(([sid]) => enrolled.has(sid))
        .map(([sid, v]) => [sid, v === null ? null : num(v, 1000)]),
    );
  const absences = { midterm: {}, final: {} } as Record<(typeof terms)[number], Record<string, number>>;
  for (const term of terms)
    for (const [sid, v] of Object.entries(raw.absences[term]))
      if (enrolled.has(sid) && num(v, 200) !== null) absences[term][sid] = Math.floor(v);
  return {
    terms: clean,
    scores,
    absences,
    dropped: [...new Set(raw.dropped.filter((sid) => enrolled.has(sid)))],
    unlinked: [...new Set((raw.unlinked ?? []).filter((id) => sessionIds.has(id)))],
    signatories: {
      dean: text(raw.signatories.dean, 80),
      vpaa: text(raw.signatories.vpaa, 80),
      registrar: text(raw.signatories.registrar, 80),
    },
  };
}

// Only one student's part of a record: the categories and items, their own scores and absences, and their DR mark.
export function onlyStudent(record: ClassRecord, studentId: string): ClassRecord {
  const own = <V>(byStudent: Record<string, V>) => (studentId in byStudent ? { [studentId]: byStudent[studentId]! } : {});
  return {
    ...record,
    scores: Object.fromEntries(Object.entries(record.scores).map(([itemId, byStudent]) => [itemId, own(byStudent)])),
    absences: { midterm: own(record.absences.midterm), final: own(record.absences.final) },
    dropped: record.dropped.filter((sid) => sid === studentId),
  };
}
