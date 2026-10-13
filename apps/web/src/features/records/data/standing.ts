import "server-only";
import type { MyScore } from "@examinus/contract/attempt";
import { categoryResult, remark, transmute, type LinkedScores } from "../grading";
import type { ClassRecord, GradingTerm } from "../types";
import { blankRecord, prepareRecord } from "./record";
import { attendanceStanding, tally } from "@examinus/domain/attendance";
import { read } from "@/lib/api/helpers";
import { me } from "@/features/classes/data";

const round2 = (n: number) => Math.round(n * 100) / 100;

// The student's grade in each subject so far, from the class record. Only their own scores leave here.
// Unlike the end-of-term sheet, work that hasn't happened yet doesn't count as zero: each term's raw
// score is scaled over the categories that have recorded work, so the grade shows where they stand now.
export async function getMyStanding() {
  const { user, myClasses } = await me({ enrollment: ["read"] });
  const sid = user.studentId;
  const [scores, meetingsByClass, recordByClass] = await Promise.all([
    read((api) => api["attempt.myScores"]()) as Promise<readonly MyScore[]>,
    // Their own attendance and class record in each class (the API leaves out classmates').
    Promise.all(myClasses.map((cls) => read((api) => api["attendance.mine"]({ classId: cls.id })))),
    Promise.all(myClasses.map((cls) => read((api) => api["classRecord.mine"]({ classId: cls.id })))),
  ]);

  return myClasses.map((cls, c) => {
    const meetings = meetingsByClass[c]!;
    // The student's own attendance in this class, against the drop rule.
    const attendanceTally = tally(meetings, sid);
    const attendance = { ...attendanceTally, standing: attendanceStanding(attendanceTally.effectiveAbsences) };
    // Until the teacher saves the record, the default categories, as on the teacher's page.
    const stored = (recordByClass[c] as ClassRecord | null) ?? blankRecord(cls.id);
    // Absences and attendance items come from attendance taken in Examinus.
    const sessions = scores.filter((m) => m.classId === cls.id);
    const { record, scores: attendanceScores } = prepareRecord(stored, cls, sessions, meetings);

    // Linked items: the latest attempt's score once results are out and essays are graded.
    const linked: LinkedScores = {};
    const recorded = new Set<string>();
    // Taken, but the score isn't out yet (results not released, or an essay waiting).
    const pending = new Set<string>();
    for (const term of ["midterm", "final"] as const)
      for (const cat of record.terms[term])
        for (const item of cat.items) {
          if (item.source === "attendance") {
            linked[item.id] = { [sid]: attendanceScores[item.id]?.[sid] ?? null };
            if (item.maxScore > 0) recorded.add(item.id);
          } else if (item.sessionId) {
            const m = sessions.find((x) => x.sessionId === item.sessionId);
            linked[item.id] = { [sid]: m?.score ?? null };
            // A missed session counts once it has ended; one still open or ungraded doesn't yet.
            if (m?.score != null || (m?.closed && !m.attempted)) recorded.add(item.id);
            else if (m?.attempted) pending.add(item.id);
          } else if (Object.values(record.scores[item.id] ?? {}).some((v) => v !== null)) {
            recorded.add(item.id);
          }
        }

    const termStanding = (term: GradingTerm) => {
      const absences = record.absences[term][sid] ?? 0;
      const categories = record.terms[term].map((cat) => {
        const counted = { ...cat, items: cat.items.filter((i) => recorded.has(i.id)) };
        const result = counted.items.length ? categoryResult(record, linked, counted, sid) : null;
        return {
          name: cat.name,
          weight: cat.weight,
          isExam: cat.isExam,
          items: cat.items.map((i) => ({
            title: i.title,
            maxScore: i.maxScore,
            recorded: recorded.has(i.id),
            pending: pending.has(i.id),
            score: (linked[i.id] ?? record.scores[i.id])?.[sid] ?? null,
          })),
          result: result && { raw: result.raw, max: result.max, weighted: round2(result.weighted) },
        };
      });
      const counted = categories.filter((c) => c.result);
      const weightSoFar = counted.reduce((n, c) => n + c.weight, 0);
      if (weightSoFar === 0) return { categories, absences, started: false as const };
      const rawScore = round2((counted.reduce((n, c) => n + c.result!.weighted, 0) / weightSoFar) * 100);
      return {
        categories,
        absences,
        started: true as const,
        // How much of the term's grade is already decided by recorded work.
        weightSoFar,
        rawScore,
        grade: transmute(rawScore),
      };
    };

    const terms = { midterm: termStanding("midterm"), final: termStanding("final") };
    const started = [terms.midterm, terms.final].filter((t) => t.started);
    const dropped = record.dropped.includes(sid);
    const absences = terms.midterm.absences + terms.final.absences;
    const rawScore = started.length ? round2(started.reduce((n, t) => n + t.rawScore, 0) / started.length) : null;
    return {
      class: cls,
      attendance,
      terms,
      current:
        rawScore === null
          ? null
          : { rawScore, grade: transmute(rawScore), remark: remark(transmute(rawScore), absences, dropped), absences },
    };
  });
}
