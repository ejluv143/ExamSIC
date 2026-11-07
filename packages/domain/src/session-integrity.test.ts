import { describe, expect, test } from "bun:test";
import type { Answer, Attempt, IntegrityEvent } from "./quiz.ts";
import { checkTyping, integrityCaseFile, type CaseAttempt } from "./session-integrity.ts";
import * as f from "./test-fixtures.ts";

const answer = (questionId: string, over: Partial<Answer> = {}): Answer => ({
  attemptId: "x",
  questionId,
  value: null,
  correct: true,
  autoScore: 1,
  manualScore: null,
  feedback: null,
  markedForReview: false,
  ...over,
});

let n = 0;
const attempt = (
  studentId: string,
  over: {
    submittedAt?: string | null;
    status?: Attempt["status"];
    order?: string[];
    answers?: Answer[];
    events?: IntegrityEvent[];
    deviceId?: string;
    typing?: Record<string, string[]>;
  } = {},
): CaseAttempt<string[]> => {
  const id = `a${++n}`;
  return {
    attempt: {
      id,
      sessionId: "s",
      studentId,
      seed: 1,
      status: over.status ?? "graded",
      startedAt: "2026-01-01T10:00:00.000Z",
      submittedAt: over.submittedAt === undefined ? "2026-01-01T10:10:00.000Z" : over.submittedAt,
      pledgeAcceptedAt: null,
    },
    studentId,
    questionOrder: over.order ?? [],
    answers: over.answers ?? [],
    integrityEvents: over.events ?? [],
    ip: null,
    deviceId: over.deviceId ?? null,
    client: null,
    typing: over.typing ?? {},
  };
};

const event = (type: IntegrityEvent["type"], at: string): IntegrityEvent => ({ type, at });

// A solution long enough to fingerprint, and two that look nothing like it or each other.
const solution = [
  "def total(items):",
  "    result = 0",
  "    for item in items:",
  "        if item.price > 0:",
  "            result = result + item.price * item.count",
  "    return result",
  "def report(items):",
  "    rows = []",
  "    for item in items:",
  "        rows.append(item.name + ':' + str(item.price))",
  "    return '\\n'.join(rows)",
].join("\n");
const other1 = ["import math", "def area(r):", "    return math.pi * r ** 2", "while True:", "    x = int(input())", "    if x == 0:", "        break", "    print(area(x))", "print('done')"].join("\n");
const other2 = ["class Stack:", "    def __init__(self):", "        self.data = []", "    def push(self, v):", "        self.data.append(v)", "    def pop(self):", "        return self.data.pop()", "s = Stack()", "s.push(1)", "print(s.pop())"].join("\n");

describe("case file: code answers", () => {
  const co = f.code({ id: "co" });
  const mc = f.mc({ id: "mc" });
  const quiz = [mc, co];
  const code = (text: string) => [answer("co", { value: text })];

  test("a code pair counts toward the level and is listed, with one verdict and the question number", () => {
    const x = attempt("s1", { answers: code(solution) });
    const y = attempt("s2", { answers: code(solution) });
    const z = attempt("s3", { answers: code(other1) });
    const w = attempt("s4", { answers: code(other2) });
    const file = integrityCaseFile({ questions: quiz, attempts: [z, w, x, y] });

    expect(file.findings).toHaveLength(1);
    expect(file.findings[0]).toMatchObject({ kind: "code", studentA: "s1", studentB: "s2", strength: 1, numbers: [2], verdict: "danger", comparable: true });
    // The pair is what moves the two to the top of the ranking, ahead of students listed first.
    expect(file.students.map((s) => [s.studentId, s.integrity.level])).toEqual([
      ["s1", "medium"],
      ["s2", "medium"],
      ["s3", "low"],
      ["s4", "low"],
    ]);
    expect(file.students[0]!.integrity.signals.map((s) => s.key)).toEqual(["pairs"]);
  });

  test("only each student's latest submitted attempt is compared: an earlier copy no longer counts", () => {
    const earlier = attempt("s1", { answers: code(solution), submittedAt: "2026-01-01T10:10:00.000Z" });
    const later = attempt("s1", { answers: code(other1), submittedAt: "2026-01-02T10:10:00.000Z" });
    const copied = attempt("s2", { answers: code(solution) });
    const z = attempt("s3", { answers: code(other2) });
    const file = integrityCaseFile({ questions: quiz, attempts: [earlier, later, copied, z] });
    expect(file.findings).toEqual([]);
    expect(file.students.map((s) => s.attempt)).toEqual(expect.arrayContaining([later, copied, z]));
    expect(file.students).toHaveLength(3);
  });

  test("an unsubmitted attempt is not part of the case file", () => {
    const x = attempt("s1", { answers: code(solution) });
    const open = attempt("s2", { answers: code(solution), submittedAt: null, status: "in_progress" });
    expect(integrityCaseFile({ questions: quiz, attempts: [x, open] }).findings).toEqual([]);
  });

  test("the drill-down finds the finding that counted, with either attempt first, and nothing else", () => {
    const x = attempt("s1", { answers: code(solution) });
    const y = attempt("s2", { answers: code(solution) });
    const z = attempt("s3", { answers: code(other1) });
    const w = attempt("s4", { answers: code(other2) });
    const file = integrityCaseFile({ questions: quiz, attempts: [x, y, z, w] });

    const found = file.drillDown("code", y.attempt.id, x.attempt.id, "co")!;
    expect(found.finding.kind).toBe("code");
    expect([found.a, found.b]).toEqual([y, x]);
    expect(found.questions.map((q) => q.id)).toEqual(["co"]);
    // A pair that didn't count, the wrong kind, or the wrong question has nothing to compare.
    expect(file.drillDown("code", x.attempt.id, z.attempt.id, "co")).toBeNull();
    expect(file.drillDown("essay_text", x.attempt.id, y.attempt.id, "co")).toBeNull();
    expect(file.drillDown("code", x.attempt.id, y.attempt.id, "mc")).toBeNull();
    expect(file.drillDown("code", x.attempt.id, "missing", "co")).toBeNull();
  });
});

describe("case file: the same wrong answer", () => {
  const qs = ["q1", "q2", "q3", "q4"].map((id) => f.mc({ id }));
  const wrong = (id: string) => answer(id, { value: "b", correct: false, autoScore: 0 });
  const right = (id: string) => answer(id, { value: "a" });
  // s1 and s2 share a wrong answer on q1–q3 and, with s3 and s4, on q4 too (four students: not rare).
  const attempts = [
    attempt("s1", { answers: [wrong("q1"), wrong("q2"), wrong("q3"), wrong("q4")] }),
    attempt("s2", { answers: [wrong("q1"), wrong("q2"), wrong("q3"), wrong("q4")] }),
    attempt("s3", { answers: [right("q1"), right("q2"), right("q3"), wrong("q4")] }),
    attempt("s4", { answers: [right("q1"), right("q2"), right("q3"), wrong("q4")] }),
    attempt("s5", { answers: qs.map((q) => right(q.id)) }),
    attempt("s6", { answers: qs.map((q) => right(q.id)) }),
  ];
  const file = integrityCaseFile({ questions: qs, attempts });

  test("only rare shared wrong answers count: a wrong answer four students gave is left out", () => {
    expect(file.findings).toHaveLength(1);
    expect(file.findings[0]).toMatchObject({ kind: "wrong_answers", studentA: "s1", studentB: "s2", numbers: [1, 2, 3], verdict: "danger", comparable: true });
  });

  test("the drill-down shows the questions behind the finding, not every shared wrong answer", () => {
    const found = file.drillDown("wrong_answers", attempts[0]!.attempt.id, attempts[1]!.attempt.id)!;
    expect(found.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    // s1 and s3 only share the common q4: no finding, so nothing to compare.
    expect(file.drillDown("wrong_answers", attempts[0]!.attempt.id, attempts[2]!.attempt.id)).toBeNull();
  });
});

describe("case file: shared devices", () => {
  test("a shared device is a flag: it is listed with the info verdict, can't be compared and adds no points", () => {
    const x = attempt("s1", { deviceId: "dev" });
    const y = attempt("s2", { deviceId: "dev" });
    const file = integrityCaseFile({ questions: [], attempts: [x, y] });
    expect(file.findings).toHaveLength(1);
    expect(file.findings[0]).toMatchObject({ kind: "device", verdict: "info", comparable: false, numbers: [] });
    expect(file.students.every((s) => s.integrity.level === "low")).toBe(true);
  });
});

describe("case file: alerts", () => {
  const a = attempt("s1", {
    events: [event("copy", "2026-01-01T10:01:00.000Z"), event("left_page", "2026-01-01T10:02:00.000Z"), event("copy", "2026-01-01T10:03:00.000Z"), event("switched_app", "2026-01-01T10:04:00.000Z")],
  });
  const b = attempt("s2", { events: [event("copy", "2026-01-01T10:05:00.000Z"), event("copy", "2026-01-01T10:06:00.000Z"), event("paste", "2026-01-01T10:07:00.000Z")] });
  const quiet = attempt("s3");
  const retaken = attempt("s3", { events: [event("left_page", "2026-01-01T09:00:00.000Z")], submittedAt: "2026-01-01T09:30:00.000Z" });
  const open = attempt("s4", { events: [event("copy", "2026-01-01T10:00:00.000Z")], submittedAt: null, status: "in_progress" });
  const file = integrityCaseFile({ questions: [], attempts: [b, a, quiet, retaken, open] });

  test("each submission with events is one row: counts by type, total, times left, last alert", () => {
    expect(file.alerts.map(({ studentId, counts, total, away, last }) => ({ studentId, counts, total, away, last }))).toEqual([
      { studentId: "s1", counts: [["copy", 2], ["left_page", 1], ["switched_app", 1]], total: 4, away: 2, last: "2026-01-01T10:04:00.000Z" },
      { studentId: "s3", counts: [["left_page", 1]], total: 1, away: 1, last: "2026-01-01T09:00:00.000Z" },
      // Leaving ranks above any number of copies and pastes.
      { studentId: "s2", counts: [["copy", 2], ["paste", 1]], total: 3, away: 0, last: "2026-01-01T10:07:00.000Z" },
    ]);
  });

  test("the filter lists the types that occurred, with how many submissions had each", () => {
    expect(file.alertTypes).toEqual([
      { type: "copy", count: 2 },
      { type: "left_page", count: 2 },
      { type: "switched_app", count: 1 },
      { type: "paste", count: 1 },
    ]);
  });

  test("filtering by a type that occurred narrows the rows; any other value shows them all", () => {
    expect(file.alertsWith("paste")).toMatchObject({ filter: "paste", shown: [{ studentId: "s2" }] });
    expect(file.alertsWith("left_page").shown.map((r) => r.studentId)).toEqual(["s1", "s3"]);
    for (const value of [undefined, "print", ["copy"], 3]) {
      const all = file.alertsWith(value);
      expect(all.filter).toBeNull();
      expect(all.shown).toHaveLength(3);
    }
  });
});

describe("case file: typing", () => {
  const essay = f.essay({ id: "es" });
  const co = f.code({ id: "co", starterCode: "# start" });
  const mc = f.mc({ id: "mc" });
  const flagsOf = (starter: string, log: string[], final: string) => (log.includes("paste") ? ["bulk_insert" as const] : starter === "# start" && final === "" ? ["replay_mismatch" as const] : []);

  test("only submitted attempts' typed answers are checked, from the starter code for code and SQL", () => {
    const pasted = attempt("s1", { answers: [answer("es", { value: "text" })], typing: { es: ["paste"] } });
    const mismatch = attempt("s2", { answers: [answer("co", { value: "" })], typing: { co: ["key"] } });
    const fine = attempt("s3", { answers: [answer("es", { value: "text" })], typing: { es: ["key"] } });
    const noText = attempt("s4", { answers: [answer("es", { value: null })], typing: { es: ["paste"] } });
    const open = attempt("s5", { answers: [answer("es", { value: "text" })], typing: { es: ["paste"] }, submittedAt: null });
    const notTyped = attempt("s6", { answers: [answer("mc", { value: "a" })], typing: { mc: ["paste"] } });
    const check = checkTyping({ questions: [essay, co, mc], attempts: [pasted, mismatch, fine, noText, open, notTyped], flagsOf });

    expect(check.checked).toBe(true);
    expect(check.odd).toEqual([
      { attemptId: pasted.attempt.id, studentId: "s1", questionId: "es", flags: ["bulk_insert"] },
      { attemptId: mismatch.attempt.id, studentId: "s2", questionId: "co", flags: ["replay_mismatch"] },
    ]);
    expect(check.flags).toEqual({ [pasted.attempt.id]: 1, [mismatch.attempt.id]: 1 });
  });

  test("a quiz with no typed questions has nothing to check", () => {
    expect(checkTyping({ questions: [mc], attempts: [attempt("s1")], flagsOf })).toEqual({ checked: false, odd: [], flags: {} });
  });

  test("flagged typing adds to the student's level in the case file, and is carried on it", () => {
    const x = attempt("s1", { answers: [answer("es", { value: "text" })], typing: { es: ["paste"] } });
    const y = attempt("s2", { answers: [answer("es", { value: "text" })], typing: { es: ["paste"] } });
    const typing = checkTyping({ questions: [essay], attempts: [x, y], flagsOf });
    const file = integrityCaseFile({ questions: [essay], attempts: [x, y], typing });
    expect(file.typing).toBe(typing);
    expect(file.byAttempt[x.attempt.id]!.signals.map((s) => s.key)).toContain("typing");
    const without = integrityCaseFile({ questions: [essay], attempts: [x, y] });
    expect(file.byAttempt[x.attempt.id]!.score).toBeGreaterThan(without.byAttempt[x.attempt.id]!.score);
  });
});
