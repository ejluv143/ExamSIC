// The Excel files teachers download: one student's integrity report and a session's results.
import "server-only";
import { awayTypes, type GameStandings } from "@examora/contract";
import { percent } from "@examora/contract/scoring";
import writeExcelFile from "write-excel-file/node";
import type { CellObject, SheetData } from "write-excel-file/node";
import { fullName, questionLabel } from "../format";
import { integrityEventLabel } from "../integrity";
import { answerHistoryRows, attemptIncidents, eventTypeName, formatStamp, gradeChangeRows, reportTimeline, shortPrompt } from "../report-view";
import type { AttemptReport, ResultsExport } from "./reports";

const bold = (value: string | number): CellObject => ({ value, fontWeight: "bold" });
const header = (...labels: string[]) => labels.map(bold);
// Excel cells hold at most 32,767 characters.
const cell = (text: string) => text.slice(0, 32_000);
const minutes = (ms: number) => Math.round((ms / 60_000) * 10) / 10;

export const xlsxType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// The student's integrity report as sheets: Summary, Timeline, Events, Incidents, Answer history, Grade changes.
export async function reportWorkbook(r: AttemptReport): Promise<Uint8Array> {
  const { attempt } = r.record.detail;
  const name = r.student ? fullName(r.student) : "Unknown student";
  const summary: SheetData = [
    [bold("Integrity report")],
    [],
    ["Student", name],
    ["Student no.", r.student?.studentNumber ?? ""],
    ["Assessment", r.quiz.quiz.title],
    ["Paper version", r.version],
    ["Started", formatStamp(attempt.startedAt)],
    ["Submitted", attempt.submittedAt ? formatStamp(attempt.submittedAt) : "Not submitted"],
    ["Honor pledge accepted", attempt.pledgeAcceptedAt ? formatStamp(attempt.pledgeAcceptedAt) : "Not recorded"],
    ["IP address", r.record.detail.ip ?? ""],
    ["Device", r.record.detail.deviceId ?? ""],
    ["Score", `${r.score.score} / ${r.score.max} (${percent(r.score.score, r.score.max)}%)`],
    ["Integrity level", r.level],
    ...r.signals.map((s) => [`  ${s.label}`, `+${s.points}`]),
    ["Minutes away (other tabs or apps)", minutes(r.report.awayMs)],
    ["Minutes out of full screen", minutes(r.report.fullscreenMs)],
    ["Minutes disconnected", minutes(r.report.disconnectedMs)],
    ["Longest gap (minutes)", minutes(r.report.longestGapMs)],
    [],
    header("Event", "Count", "Total time (s)"),
    ...r.report.byType.map((t) => [eventTypeName(t.type), t.count, Math.round(t.totalMs / 1000)]),
  ];

  const timeline: SheetData = [
    header("Time", "Source", "What happened"),
    ...reportTimeline(r, name).map((row) => [formatStamp(row.at), row.source, row.what]),
  ];
  const events: SheetData = [
    header("Time", "Type", "Duration (s)", "Away from the exam", "Description"),
    ...r.report.timeline.map((e) => [
      formatStamp(e.at),
      eventTypeName(e.type),
      e.durationMs ? Math.round(e.durationMs / 1000) : null,
      awayTypes.includes(e.type) ? "Yes" : "",
      integrityEventLabel[e.type],
    ]),
  ];
  const incidents: SheetData = [
    header("Time", "Action", "Applies to", "Detail"),
    ...attemptIncidents(r, name).map(({ incident, text }) => [
      formatStamp(incident.at),
      incident.kind.replaceAll("_", " "),
      incident.attemptId ? name : "Whole session",
      text,
    ]),
  ];
  const history: SheetData = [
    header("Saved at", "Question", "Type", "Prompt", "Answer"),
    ...answerHistoryRows(r).map((h) => [
      formatStamp(h.at),
      h.number ? `Q${h.number}` : "",
      h.question ? questionLabel(h.question) : "",
      h.question ? shortPrompt(h.question, 80) : "",
      cell(h.answer),
    ]),
  ];
  const changes: SheetData = [
    header("Time", "Question", "Changed by", "Old score", "New score", "Reason"),
    ...gradeChangeRows(r).map((c) => [
      formatStamp(c.at),
      c.number ? `Q${c.number}` : "",
      c.changedBy ? "Teacher" : "",
      c.oldScore,
      c.newScore,
      c.reason,
    ]),
  ];

  return writeExcelFile([
    { sheet: "Summary", data: summary, columns: [{ width: 36 }, { width: 48 }, { width: 16 }] },
    { sheet: "Timeline", data: timeline, columns: [{ width: 24 }, { width: 10 }, { width: 90 }], stickyRowsCount: 1 },
    { sheet: "Events", data: events, columns: [{ width: 24 }, { width: 18 }, { width: 12 }, { width: 20 }, { width: 70 }], stickyRowsCount: 1 },
    { sheet: "Incidents", data: incidents, columns: [{ width: 24 }, { width: 24 }, { width: 24 }, { width: 80 }], stickyRowsCount: 1 },
    { sheet: "Answer history", data: history, columns: [{ width: 24 }, { width: 10 }, { width: 18 }, { width: 50 }, { width: 80 }], stickyRowsCount: 1 },
    { sheet: "Grade changes", data: changes, columns: [{ width: 24 }, { width: 10 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 70 }], stickyRowsCount: 1 },
  ]).toBuffer();
}

// One row per rostered student: result and integrity, then the points of each part and each question.
export async function resultsWorkbook(r: ResultsExport): Promise<Uint8Array> {
  const parts = r.quiz.parts.map((p, i) => ({ part: p, label: `${p.title || `Part ${i + 1}`} (${p.questions.reduce((n, q) => n + q.points, 0)} pts)` }));
  const questions = r.questions.map((q, i) => `Q${i + 1} ${shortPrompt(q)} (${q.points} pts)`);
  const data: SheetData = [
    header("Name", "Student no.", "Status", "Score", "Max", "Percent", "Integrity", "Paper version", "Submitted at", ...parts.map((p) => p.label), ...questions),
    ...r.rows.map(({ student, status, score, level, version, submittedAt, parts: partScores, questions: questionScores }) => [
      fullName(student),
      student.studentNumber,
      status,
      score ? score.score : null,
      score ? score.max : null,
      score ? percent(score.score, score.max) : null,
      level ?? "",
      version ?? "",
      submittedAt ? formatStamp(submittedAt) : "",
      ...partScores,
      ...questionScores,
    ]),
  ];
  return writeExcelFile(data, {
    sheet: "Results",
    columns: [{ width: 30 }, { width: 14 }, { width: 14 }, { width: 8 }, { width: 8 }, { width: 9 }, { width: 11 }, { width: 14 }, { width: 24 }, ...parts.map(() => ({ width: 20 })), ...questions.map(() => ({ width: 22 }))],
    stickyRowsCount: 1,
    stickyColumnsCount: 1,
  }).toBuffer();
}

// The final standings of a game: rank, player, points, correct answers and the average time to answer.
export async function gameWorkbook(s: GameStandings): Promise<Uint8Array> {
  const data: SheetData = [
    header("Rank", "Name", "Student no.", "Points", "Correct", "Answered", "Questions", "Average time (s)"),
    ...s.standings.map((r) => [
      r.rank,
      r.name,
      r.studentId ?? "",
      r.points,
      r.correct,
      r.answered,
      s.questionCount,
      r.averageMs === null ? null : Math.round(r.averageMs / 100) / 10,
    ]),
  ];
  return writeExcelFile(data, {
    sheet: "Standings",
    columns: [{ width: 7 }, { width: 30 }, { width: 14 }, { width: 10 }, { width: 9 }, { width: 10 }, { width: 10 }, { width: 16 }],
    stickyRowsCount: 1,
  }).toBuffer();
}
