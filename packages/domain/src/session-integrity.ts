// The anti-cheating case file of a finished session: one answer to "who should I look at, and why". It ranks the
// students, lists what pairs of students share (every kind, one population, one threshold, one verdict), tallies
// each submission's alerts and names the answers whose typing looks wrong. The pages, the export and the MCP tool
// read it; none of them works out a finding.
//
// Findings come from `analyzeSession` over each student's latest submitted attempt, so a pair shown here is a pair
// that counted toward a level. Typing replays are analysed by the clients (they need the typing package), so the
// caller passes the outcome in as a `TypingCheck`.
import { awayCount, analyzeSession, type AttemptIntegrity, type IntegrityLevel, type PairFinding, type SessionIntegrity } from "./integrity.ts";
import type { Question } from "./question.ts";
import type { IntegrityEventType } from "./quiz.ts";
import { isSubmitted, latestByStudent, type ResultAttempt } from "./results.ts";

// What the case file reads of an attempt. `typing` is the recorded typing history per question id.
export type CaseAttempt<Log = unknown> = ResultAttempt & { typing: Readonly<Record<string, Log>> };

// --- Typing ---

// Code and SQL start from the starter code; essays and blanks start empty.
const typedTypes = new Set<Question["type"]>(["code", "sql", "essay", "blank"]);

export type OddTyping<Flag extends string = string> = { attemptId: string; studentId: string; questionId: string; flags: readonly Flag[] };

export type TypingCheck<Flag extends string = string> = {
  // Whether any question has a typing replay to look at.
  checked: boolean;
  odd: OddTyping<Flag>[];
  // Attempt id → how many of its answers looked wrong, which adds to its level.
  flags: Record<string, number>;
};

// Looks at the typing history of every submitted attempt's code, SQL, essay and blank answers. `flagsOf` is the
// typing analysis: the flags for one history that ends in the submitted text.
export function checkTyping<Log, Flag extends string>({
  questions,
  attempts,
  flagsOf,
}: {
  questions: readonly Question[];
  attempts: readonly CaseAttempt<Log>[];
  flagsOf: (starter: string, log: Log, final: string) => readonly Flag[];
}): TypingCheck<Flag> {
  const typed = questions.filter((q) => typedTypes.has(q.type));
  const odd = attempts.filter(isSubmitted).flatMap((d) =>
    typed.flatMap((q): OddTyping<Flag>[] => {
      const log = d.typing[q.id];
      const value = d.answers.find((a) => a.questionId === q.id)?.value;
      if (!log || typeof value !== "string") return [];
      const flags = flagsOf(q.type === "code" || q.type === "sql" ? q.starterCode : "", log, value);
      return flags.length ? [{ attemptId: d.attempt.id, studentId: d.studentId, questionId: q.id, flags }] : [];
    }),
  );
  const flags: Record<string, number> = {};
  for (const o of odd) flags[o.attemptId] = (flags[o.attemptId] ?? 0) + 1;
  return { checked: typed.length > 0, odd, flags };
}

// --- The case file ---

// How strongly a finding should read: a shared device or network address is only a flag.
export type Verdict = "danger" | "warning" | "info";

export type CaseFinding = PairFinding & {
  studentA: string;
  studentB: string;
  // Question numbers (1-based, the quiz's order) behind the finding.
  numbers: number[];
  verdict: Verdict;
  // Whether the two answers can be shown side by side.
  comparable: boolean;
};

export type CaseStudent<T> = { studentId: string; attempt: T; integrity: AttemptIntegrity };

// One submission with events: its alerts grouped by type, most first.
export type CaseAlerts<T> = {
  attempt: T;
  studentId: string;
  counts: [IntegrityEventType, number][];
  total: number;
  // How many times the student left (page, app, full screen).
  away: number;
  // ISO time of the latest alert.
  last: string;
};

const levelRank: Record<IntegrityLevel, number> = { high: 2, medium: 1, low: 0 };

const verdictOf = (p: PairFinding): Verdict => (p.kind === "device" || p.kind === "network" ? "info" : p.strength >= 0.7 ? "danger" : "warning");

const comparableKinds = new Set<PairFinding["kind"]>(["wrong_answers", "essay_text", "code"]);

export function integrityCaseFile<T extends ResultAttempt, Flag extends string = string>({
  questions,
  attempts,
  typing = { checked: false, odd: [], flags: {} },
}: {
  questions: readonly Question[];
  attempts: readonly T[];
  // Without it, no typing replay was looked at (the findings don't depend on it, only the levels do).
  typing?: TypingCheck<Flag>;
}) {
  const submitted = attempts.filter(isSubmitted);
  const latest = latestByStudent(submitted);
  const analysis: SessionIntegrity = analyzeSession({ attempts: [...latest.values()], questions, typingFlags: typing.flags });
  const byAttempt = analysis.attempts;
  const number = (questionId: string) => questions.findIndex((q) => q.id === questionId) + 1;
  const attemptById = new Map(submitted.map((d) => [d.attempt.id, d]));

  // Highest concern first.
  const students = [...latest.values()]
    .flatMap((attempt): CaseStudent<T>[] => {
      const integrity = byAttempt[attempt.attempt.id];
      return integrity ? [{ studentId: attempt.studentId, attempt, integrity }] : [];
    })
    .sort((x, y) => levelRank[y.integrity.level] - levelRank[x.integrity.level] || y.integrity.score - x.integrity.score);

  const findings = analysis.pairs.flatMap((p): CaseFinding[] => {
    const a = attemptById.get(p.a);
    const b = attemptById.get(p.b);
    if (!a || !b) return [];
    return [{ ...p, studentA: a.studentId, studentB: b.studentId, numbers: p.questionIds.map(number), verdict: verdictOf(p), comparable: comparableKinds.has(p.kind) }];
  });

  // Alerts are listed for every submission, not only the latest: the log of an earlier attempt still happened.
  const alerts = submitted
    .filter((d) => d.integrityEvents.length > 0)
    .map((attempt): CaseAlerts<T> => {
      const counts = new Map<IntegrityEventType, number>();
      for (const e of attempt.integrityEvents) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      return {
        attempt,
        studentId: attempt.studentId,
        counts: [...counts].sort((x, y) => y[1] - x[1]),
        total: attempt.integrityEvents.length,
        away: awayCount(attempt.integrityEvents),
        last: attempt.integrityEvents.reduce((m, e) => (e.at > m ? e.at : m), ""),
      };
    })
    .sort((x, y) => y.away - x.away || y.total - x.total);

  // Submissions per alert type, for the filter.
  const alertTypes = new Map<IntegrityEventType, number>();
  for (const r of alerts) for (const [t] of r.counts) alertTypes.set(t, (alertTypes.get(t) ?? 0) + 1);

  return {
    // Each student's latest submitted attempt, by roster id.
    latest,
    // The level, report and signals of each latest attempt, by attempt id.
    byAttempt,
    students,
    findings,
    alerts,
    alertTypes: [...alertTypes].map(([type, count]) => ({ type, count })),
    // The alerts of submissions with `type`; every submission when `type` is not one that occurs.
    alertsWith(type: unknown): { filter: IntegrityEventType | null; shown: CaseAlerts<T>[] } {
      const filter = typeof type === "string" && alertTypes.has(type as IntegrityEventType) ? (type as IntegrityEventType) : null;
      return { filter, shown: filter ? alerts.filter((r) => r.counts.some(([t]) => t === filter)) : alerts };
    },
    typing,
    // Two attempts side by side: the finding that counted for them (`questionId` picks the answer for an essay or
    // code finding) with both attempts and the questions it rests on. null when no such finding counted.
    drillDown(kind: PairFinding["kind"], attemptA: string, attemptB: string, questionId?: string) {
      const finding = findings.find(
        (f) =>
          f.kind === kind &&
          ((f.a === attemptA && f.b === attemptB) || (f.a === attemptB && f.b === attemptA)) &&
          (kind === "wrong_answers" || f.questionIds[0] === questionId),
      );
      const a = attemptById.get(attemptA);
      const b = attemptById.get(attemptB);
      if (!finding || !a || !b) return null;
      return { finding, a, b, questions: finding.questionIds.flatMap((id) => questions.filter((q) => q.id === id)) };
    },
  };
}
