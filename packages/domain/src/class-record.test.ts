import { describe, expect, test } from "bun:test";
import {
  addAttendanceItem,
  addCategory,
  addItem,
  blankRecord,
  type ClassRecord,
  linkItem,
  prepareRecord,
  removeCategory,
  removeItem,
  rosterGroups,
  setAbsences,
  setDropped,
  setScore,
  studentStandings,
  teacherRecord,
  type RecordSession,
  type ScoredSession,
} from "./class-record.ts";

const cls = { id: "c1", studentIds: ["s1", "s2"] };
const session = (id: string, over: Partial<RecordSession> = {}): RecordSession => ({
  sessionId: id,
  title: `Quiz ${id}`,
  mode: "quiz",
  maxScore: 20,
  period: "midterm",
  opensAt: null,
  closesAt: null,
  countInRecord: true,
  ...over,
});
const linkedSessions = (record: ClassRecord, sessions: RecordSession[]) =>
  prepareRecord(record, cls, sessions, []).record.terms.midterm.flatMap((c) => c.items.map((i) => i.sessionId));
const quizCat = (r: ClassRecord) => r.terms.midterm.find((c) => c.name === "Quizzes")!;

describe("linking items to sessions", () => {
  test("a session of the class is added to the record by itself", () => {
    expect(linkedSessions(blankRecord("c1"), [session("a")])).toContain("a");
  });

  test("removing a linked item keeps autoLink from adding the session back", () => {
    const base = blankRecord("c1");
    const withA = prepareRecord(base, cls, [session("a")], []).record;
    const item = quizCat(withA).items[0]!;
    const removed = removeItem(withA, "midterm", quizCat(withA).id, item.id);
    expect(removed.unlinked).toEqual(["a"]);
    expect(linkedSessions(removed, [session("a")])).not.toContain("a");
  });

  test("relinking a removed session forgets that it was taken out", () => {
    const blank = blankRecord("c1");
    const base = addItem(blank, "midterm", quizCat(blank).id);
    const cat = quizCat(base);
    const item = cat.items[0]!;
    const taken = { ...base, unlinked: ["a"] };
    const linked = linkItem(taken, "midterm", cat.id, item.id, { kind: "session", id: "a", title: "Quiz a", maxScore: 20 });
    expect(linked.unlinked).toEqual([]);
    const target = quizCat(linked).items[0]!;
    expect(target).toMatchObject({ sessionId: "a", maxScore: 20 });
  });

  test("pointing an item away from a session takes that session out", () => {
    const blank = blankRecord("c1");
    const base = addItem(blank, "midterm", quizCat(blank).id);
    const cat = quizCat(base);
    const item = cat.items[0]!;
    const onA = linkItem(base, "midterm", cat.id, item.id, { kind: "session", id: "a", title: "Quiz a", maxScore: 20 });
    const onB = linkItem(onA, "midterm", cat.id, item.id, { kind: "session", id: "b", title: "Quiz b", maxScore: 10 });
    expect(onB.unlinked).toEqual(["a"]);
    const typed = linkItem(onB, "midterm", cat.id, item.id, { kind: "typed" });
    expect(typed.unlinked?.sort()).toEqual(["a", "b"]);
    expect(quizCat(typed).items[0]!.sessionId).toBeNull();
    // The session it was taken from stays out of the record.
    expect(linkedSessions(typed, [session("a"), session("b")])).not.toContain("a");
  });

  test("linking to attendance clears the session link and titles an untitled item", () => {
    const blank = blankRecord("c1");
    const base = addItem(blank, "midterm", quizCat(blank).id);
    const cat = quizCat(base);
    const item = { ...cat.items[0]!, title: "" };
    cat.items[0] = item;
    const onA = linkItem(base, "midterm", cat.id, item.id, { kind: "session", id: "a", title: "Quiz a", maxScore: 20 });
    const att = linkItem(onA, "midterm", cat.id, item.id, { kind: "attendance" });
    expect(quizCat(att).items[0]).toMatchObject({ sessionId: null, source: "attendance", title: "Quiz a" });
    expect(att.unlinked).toEqual(["a"]);
  });

  test("removing a category takes out the sessions linked in it", () => {
    const withA = prepareRecord(blankRecord("c1"), cls, [session("a")], []).record;
    const removed = removeCategory(withA, "midterm", quizCat(withA).id);
    expect(removed.terms.midterm.some((c) => c.name === "Quizzes")).toBe(false);
    expect(removed.unlinked).toEqual(["a"]);
  });

  test("the major exam can't be removed", () => {
    const base = blankRecord("c1");
    const exam = base.terms.midterm.find((c) => c.isExam)!;
    expect(removeCategory(base, "midterm", exam.id).terms.midterm).toHaveLength(base.terms.midterm.length);
  });

  test("editing returns a copy and leaves the original alone", () => {
    const base = blankRecord("c1");
    const next = setDropped(base, "s1", true);
    expect(base.dropped).toEqual([]);
    expect(next.dropped).toEqual(["s1"]);
  });
});

describe("adding items", () => {
  test("defaults: 10 points for ADW, 100 for the exam, named after the category", () => {
    let r = blankRecord("c1");
    const quizzes = quizCat(r);
    const exam = r.terms.midterm.find((c) => c.isExam)!;
    r = addItem(r, "midterm", quizzes.id);
    r = addItem(r, "midterm", quizzes.id);
    r = addItem(r, "midterm", exam.id);
    r = addItem(r, "midterm", exam.id);
    expect(quizCat(r).items.map((i) => [i.title, i.maxScore])).toEqual([
      ["Quiz 1", 10],
      ["Quiz 2", 10],
    ]);
    expect(r.terms.midterm.find((c) => c.isExam)!.items.map((i) => [i.title, i.maxScore])).toEqual([
      ["Midterm Exam", 100],
      ["Midterm Exam part 2", 100],
    ]);
  });

  test("a given maximum wins over the default", () => {
    const blank = blankRecord("c1");
    const r = addItem(blank, "final", blank.terms.final[0]!.id, 25);
    expect(r.terms.final[0]!.items[0]!.maxScore).toBe(25);
  });

  test("attendance goes into the attendance category, or a new one before the exam", () => {
    const base = blankRecord("c1");
    const attendanceCat = base.terms.midterm.find((c) => /attend/i.test(c.name))!;
    const again = addAttendanceItem(base, "midterm");
    expect(again.terms.midterm.find((c) => c.id === attendanceCat.id)!.items).toHaveLength(2);

    const noAttendance = { ...base, terms: { ...base.terms, midterm: base.terms.midterm.filter((c) => !/attend/i.test(c.name)) } };
    const made = addAttendanceItem(noAttendance, "midterm").terms.midterm;
    expect(made.at(-1)!.isExam).toBe(true);
    expect(made.at(-2)!.items[0]).toMatchObject({ source: "attendance" });
  });

  test("a new ADW category lands before the exam", () => {
    const cats = addCategory(blankRecord("c1"), "final").terms.final;
    expect(cats.at(-2)!.name).toBe("New category");
    expect(cats.at(-1)!.isExam).toBe(true);
  });
});

describe("typed values", () => {
  test("scores clamp at zero and blank clears them", () => {
    let r = setScore(blankRecord("c1"), "i1", "s1", "-4");
    expect(r.scores.i1!.s1).toBe(0);
    r = setScore(r, "i1", "s1", "7.5");
    expect(r.scores.i1!.s1).toBe(7.5);
    r = setScore(r, "i1", "s1", " ");
    expect(r.scores.i1!.s1).toBeNull();
    r = setScore(r, "i1", "s1", "abc");
    expect(r.scores.i1!.s1).toBeNull();
  });

  test("absences are whole numbers, never negative", () => {
    expect(setAbsences(blankRecord("c1"), "final", "s1", "2.9").absences.final.s1).toBe(2);
    expect(setAbsences(blankRecord("c1"), "final", "s1", "-3").absences.final.s1).toBe(0);
  });
});

describe("dropping a student", () => {
  test("is added once and can be undone", () => {
    const once = setDropped(blankRecord("c1"), "s1", true);
    expect(setDropped(once, "s1", true).dropped).toEqual(["s1"]);
    expect(setDropped(once, "s1", false).dropped).toEqual([]);
  });
});

describe("rosterGroups", () => {
  const s = (name: string, sex: "M" | "F" | null) => ({ name, sex });

  test("males, then females, then unspecified, each by 'Last, First'", () => {
    const groups = rosterGroups([
      s("Reyes, Ana", "F"),
      s("Cruz, Ben", "M"),
      s("Abad, Carl", null),
      s("Bautista, Dan", "M"),
      s("Aquino, Eve", "F"),
    ]);
    expect(groups.map((g) => g.list.map((x) => x.name))).toEqual([
      ["Bautista, Dan", "Cruz, Ben"],
      ["Aquino, Eve", "Reyes, Ana"],
      ["Abad, Carl"],
    ]);
  });

  test("leaves out empty groups", () => {
    expect(rosterGroups([s("Cruz, Ben", "M")]).map((g) => g.label)).toEqual(["MALE STUDENTS"]);
  });
});

describe("teacherRecord", () => {
  const scored = (id: string, scores: ScoredSession["scores"]): ScoredSession => ({ ...session(id), scores });

  test("fills linked scores and lists the ones waiting on an essay", () => {
    const sessions = [scored("a", [{ studentId: "s1", score: 15 }, { studentId: "s2", score: null }])];
    const { record, linked, pending, attendanceTaken } = teacherRecord(blankRecord("c1"), cls, sessions, []);
    const item = quizCat(record).items[0]!;
    expect(linked[item.id]).toEqual({ s1: 15, s2: null });
    expect(pending[item.id]).toEqual(["s2"]);
    expect(attendanceTaken).toBe(false);
  });

  test("attendance scores win once a meeting is taken", () => {
    const meetings = [{ id: "m1", classId: "c1", date: "2026-01-12", takenAt: "2026-01-12T01:00:00Z", records: { s2: "absent" } }];
    const { record, linked, attendanceTaken } = teacherRecord(blankRecord("c1"), cls, [], meetings as never);
    const item = record.terms.midterm.flatMap((c) => c.items).find((i) => i.source === "attendance")!;
    expect(attendanceTaken).toBe(true);
    expect(linked[item.id]).toEqual({ s1: 1, s2: 0 });
  });
});

describe("studentStandings", () => {
  test("one standing per class, each with only its own class's sessions and record", () => {
    const classes = [
      { id: "c1", studentIds: ["me"] },
      { id: "c2", studentIds: ["me"] },
    ];
    const mine = (classId: string, sessionId: string, score: number) => ({
      ...session(sessionId),
      classId,
      closed: true,
      attempted: true,
      score,
    });
    const out = studentStandings({
      classes,
      studentId: "me",
      scores: [mine("c1", "a", 20), mine("c2", "b", 10)],
      meetings: [[], []],
      records: [null, null],
    });
    expect(out.map((o) => o.class.id)).toEqual(["c1", "c2"]);
    expect(out[0]!.terms.midterm.categories.flatMap((c) => c.items.filter((i) => i.title.startsWith("Quiz")).map((i) => i.score))).toEqual([20]);
    expect(out[1]!.terms.midterm.categories.flatMap((c) => c.items.filter((i) => i.title.startsWith("Quiz")).map((i) => i.score))).toEqual([10]);
  });
});
