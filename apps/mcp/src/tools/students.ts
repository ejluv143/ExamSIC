// Tools that report on a class and on one student, from `session.classScores` and the students' attempts.
// Game sessions are left out: their points are not a share of the quiz's score.
import { median } from "@examinus/domain/analytics";
import { percent } from "@examinus/domain/scoring";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { api } from "../api.ts";
import { integrityOf, loadSession, scoreOf, topicTotals } from "../session-data.ts";
import { averagePercent, fullName, run } from "../util.ts";

const atRiskBelow = 60;
const atRiskMissed = 2;

// A session still counts as missed only once it has ended.
const hasEnded = (status: string) => status === "ended";

async function loadClass(classId: string) {
  const cls = await api((a) => a["class.get"]({ classId }));
  if (!cls) throw new Error(`NotFound: class ${classId} does not exist or is not yours.`);
  const [roster, scores] = await Promise.all([
    cls.studentIds.length > 0 ? api((a) => a["class.students"]({ studentIds: cls.studentIds })) : [],
    api((a) => a["session.classScores"]({ classId })),
  ]);
  return { cls, roster, sessions: scores.filter((s) => s.mode !== "game") };
}

export function registerStudents(server: McpServer) {
  server.registerTool(
    "class_overview",
    {
      description: `A class at a glance: students, per-session mean and median, each student's average percent and missed sessions, and the at-risk list (average below ${atRiskBelow}% or ${atRiskMissed} or more missed sessions). Game sessions are not counted.`,
      inputSchema: z.object({ classId: z.string() }),
    },
    ({ classId }) =>
      run(async () => {
        const { cls, roster, sessions } = await loadClass(classId);
        const sessionRows = sessions.map((s) => {
          const graded = s.scores.flatMap((r) => (r.score === null ? [] : [percent(r.score, s.maxScore)]));
          return {
            sessionId: s.sessionId,
            title: s.title,
            mode: s.mode,
            status: s.status,
            maxScore: s.maxScore,
            submitted: s.scores.length,
            needsGrading: s.scores.length - graded.length,
            mean: averagePercent(graded),
            median: median(graded),
          };
        });
        const students = roster
          .map((student) => {
            const mine = sessions.flatMap((s) => {
              const row = s.scores.find((r) => r.studentId === student.id);
              return row ? [{ s, row }] : [];
            });
            const percents = mine.flatMap(({ s, row }) => (row.score === null ? [] : [percent(row.score, s.maxScore)]));
            const missed = sessions.filter((s) => hasEnded(s.status) && !s.scores.some((r) => r.studentId === student.id)).length;
            const average = averagePercent(percents);
            const reasons = [
              ...(average !== null && average < atRiskBelow ? [`average ${average}%`] : []),
              ...(missed >= atRiskMissed ? [`${missed} missed sessions`] : []),
            ];
            return { studentId: student.id, name: fullName(student), studentNumber: student.studentNumber, averagePercent: average, taken: mine.length, missed, reasons };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          classId,
          course: `${cls.courseCode} ${cls.title}`,
          section: cls.section,
          studentCount: students.length,
          sessions: sessionRows,
          students: students.map(({ reasons: _reasons, ...s }) => s),
          atRisk: students.filter((s) => s.reasons.length > 0).map((s) => ({ studentId: s.studentId, name: s.name, averagePercent: s.averagePercent, missed: s.missed, reasons: s.reasons })),
        };
      }),
  );

  server.registerTool(
    "student_report",
    {
      description:
        "One student's record in a class: each session's score, max, percent, status and integrity level, weakest topics across sessions, and the trend from the first to the last scored session. Game sessions are not counted.",
      inputSchema: z.object({ classId: z.string(), studentId: z.string() }),
    },
    ({ classId, studentId }) =>
      run(async () => {
        const { cls, roster, sessions } = await loadClass(classId);
        const student = roster.find((s) => s.id === studentId);
        if (!student || !cls.studentIds.includes(studentId)) throw new Error(`NotFound: student ${studentId} is not in class ${classId}.`);

        const topics = new Map<string, { got: number; max: number; answers: number }>();
        const rows = await Promise.all(
          sessions.map(async (s) => {
            const entry = s.scores.find((r) => r.studentId === studentId);
            if (!entry) return { sessionId: s.sessionId, title: s.title, status: hasEnded(s.status) ? "Missed" : "Not submitted", at: null, percent: null };
            const { questions, latest } = await loadSession(s.sessionId, false);
            const last = latest.get(studentId);
            if (!last) return { sessionId: s.sessionId, title: s.title, status: "Not submitted", at: null, percent: null };
            const score = scoreOf(questions, last);
            for (const [topic, t] of topicTotals(questions, [last])) {
              const total = topics.get(topic) ?? { got: 0, max: 0, answers: 0 };
              topics.set(topic, { got: total.got + t.got, max: total.max + t.max, answers: total.answers + t.answers });
            }
            return {
              sessionId: s.sessionId,
              title: s.title,
              status: last.attempt.status === "graded" ? "Graded" : "Needs grading",
              at: entry.submittedAt,
              score: score.score,
              max: score.max,
              percent: score.ungraded === 0 ? percent(score.score, score.max) : null,
              integrity: integrityOf(questions, latest).attempts[last.attempt.id]?.level ?? null,
            };
          }),
        );

        const scored = rows
          .flatMap((r) => (r.percent === null || r.at === null ? [] : [{ at: r.at, percent: r.percent, title: r.title }]))
          .sort((a, b) => a.at.localeCompare(b.at));
        const first = scored[0];
        const last = scored[scored.length - 1];
        const delta = first && last && scored.length > 1 ? last.percent - first.percent : null;
        const weakest = [...topics]
          .filter(([, t]) => t.max > 0)
          .map(([topic, t]) => ({ topic, percent: percent(t.got, t.max), answers: t.answers }))
          .sort((a, b) => a.percent - b.percent)
          .slice(0, 5);

        return {
          classId,
          studentId,
          name: fullName(student),
          studentNumber: student.studentNumber,
          averagePercent: averagePercent(scored.map((r) => r.percent)),
          sessions: rows.map(({ at: _at, ...r }) => r),
          weakestTopics: weakest,
          trend: {
            first: first ? { title: first.title, percent: first.percent } : null,
            last: last ? { title: last.title, percent: last.percent } : null,
            delta,
            direction: delta === null ? "not enough scored sessions" : delta > 5 ? "improving" : delta < -5 ? "declining" : "steady",
          },
        };
      }),
  );
}

