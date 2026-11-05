import { describe, expect, test } from "bun:test";
import type { Question } from "@examinus/domain/question";
import { newQuestion } from "./question-defaults";
import { emptyPart, type EditorQuiz } from "./quiz-editor";
import * as edit from "./quiz-editing";

const mc = (id: string, points = 1): Question => {
  const q = newQuestion("multiple_choice", id);
  if (q.type !== "multiple_choice") throw new Error("expected a multiple choice question");
  return { ...q, prompt: `Prompt ${id}`, points, choices: q.choices.map((c) => ({ ...c, text: `Choice ${c.id}` })) };
};

function quiz(parts: { id: string; pool?: number; questions: Question[] }[]): EditorQuiz {
  return {
    id: "q1",
    title: "Quiz",
    description: "",
    header: {} as EditorQuiz["header"],
    paper: {} as EditorQuiz["paper"],
    settings: { shuffleQuestions: false, shuffleChoices: false, shuffleParts: false },
    parts: parts.map((p) => ({ ...emptyPart(`Part ${p.id}`), id: p.id, poolSize: p.pool ?? null, questions: p.questions })),
  };
}

const ids = (s: edit.QuizEditing, partId: string) => s.quiz.parts.find((p) => p.id === partId)!.questions.map((q) => q.id);

describe("import, move, validate", () => {
  test("imported questions take a pool's points, survive a move, and the quiz validates", () => {
    let s = edit.startEditing(quiz([{ id: "a", questions: [mc("x", 2)] }, { id: "pool", pool: 1, questions: [mc("p1", 3)] }]));
    s = edit.importQuestions(s, "pool", [mc("i1", 1), mc("i2", 1)], "add");
    expect(s.quiz.parts[1]!.questions.map((q) => q.points)).toEqual([3, 3, 3]);
    s = edit.moveQuestionTo(s, "x", "pool", 0);
    expect(ids(s, "pool")).toEqual(["x", "p1", "i1", "i2"]);
    expect(ids(s, "a")).toEqual([]);
    // The pool keeps its own points: the moved question takes them.
    expect(s.quiz.parts[1]!.questions.every((q) => q.points === 3)).toBe(true);
    // Part "a" is now empty, which is a problem; removing it makes the quiz valid.
    expect(edit.validateQuiz(s.quiz).some((p) => p.includes("has no questions"))).toBe(true);
    s = edit.deletePart(s, 0, "remove");
    expect(edit.validateQuiz(s.quiz)).toEqual([]);
  });

  test("replace swaps the part's questions; a pool larger than its questions is flagged", () => {
    let s = edit.startEditing(quiz([{ id: "p", pool: 3, questions: [mc("a"), mc("b"), mc("c")] }]));
    s = edit.importQuestions(s, "p", [mc("n")], "replace");
    expect(ids(s, "p")).toEqual(["n"]);
    expect(edit.validateQuiz(s.quiz)).toEqual(["Part p draws 3 questions but has only 1."]);
  });

  test("moving down within a part lands after the next question", () => {
    let s = edit.startEditing(quiz([{ id: "a", questions: [mc("1"), mc("2"), mc("3")] }]));
    s = edit.moveQuestionTo(s, "1", "a", 2);
    expect(ids(s, "a")).toEqual(["2", "1", "3"]);
  });

  test("an empty prompt names the question's number and part", () => {
    const s = edit.startEditing(quiz([{ id: "a", questions: [mc("1"), { ...mc("2"), prompt: " " }] }]));
    expect(edit.validateQuiz(s.quiz)).toEqual(["Question 2 (Part a) has no question text."]);
    expect([...edit.questionProblems(s.quiz).keys()]).toEqual(["2"]);
  });
});

describe("cancelling a question window", () => {
  test("removes a question that was just added, but not an edited one", () => {
    let s = edit.startEditing(quiz([{ id: "a", questions: [mc("old")] }]));
    s = edit.addQuestions(s, "a", [mc("new")]);
    s = edit.cancelQuestion(s, "old");
    expect(ids(s, "a")).toEqual(["old", "new"]);
    s = edit.cancelQuestion(s, "new");
    expect(ids(s, "a")).toEqual(["old"]);
    expect(edit.isDirty(s)).toBe(false);
  });

  test("saving the window keeps a fresh question, and a later cancel leaves it", () => {
    let s = edit.startEditing(quiz([{ id: "a", questions: [] }]));
    s = edit.addQuestions(s, "a", [mc("new")]);
    s = edit.saveQuestion(s, { ...mc("new"), prompt: "Written" });
    s = edit.cancelQuestion(s, "new");
    expect(s.quiz.parts[0]!.questions[0]!.prompt).toBe("Written");
  });

  test("a batch is not fresh", () => {
    let s = edit.startEditing(quiz([{ id: "a", questions: [] }]));
    s = edit.addQuestions(s, "a", [mc("1"), mc("2")]);
    expect(ids(edit.cancelQuestion(s, "1"), "a")).toEqual(["1", "2"]);
  });
});

describe("pool points", () => {
  test("saving one question's points moves the whole pool", () => {
    let s = edit.startEditing(quiz([{ id: "p", pool: 1, questions: [mc("a"), mc("b")] }]));
    s = edit.saveQuestion(s, mc("a", 4));
    expect(s.quiz.parts[0]!.questions.map((q) => q.points)).toEqual([4, 4]);
  });

  test("bulk type points skip pools; part points apply to all of a part", () => {
    let s = edit.startEditing(quiz([{ id: "a", questions: [mc("1"), mc("2")] }, { id: "p", pool: 1, questions: [mc("3")] }]));
    s = edit.setTypePoints(s, "multiple_choice", 5);
    expect(s.quiz.parts.map((p) => p.questions.map((q) => q.points))).toEqual([[5, 5], [1]]);
    s = edit.setPartPoints(s, "p", 2);
    expect(s.quiz.parts[1]!.questions[0]!.points).toBe(2);
  });

  test("turning a pool on equalises points to the first question; a duplicate in a pool takes the pool's points", () => {
    const s = edit.startEditing(quiz([{ id: "a", questions: [mc("1", 3), mc("2", 1)] }]));
    const pool = edit.withPool(s.quiz.parts[0]!, true);
    expect(pool.poolSize).toBe(2);
    expect(pool.questions.map((q) => q.points)).toEqual([3, 3]);
    const dup = edit.duplicateQuestion(edit.updatePart(s, "a", pool), "a", 0);
    expect(dup.quiz.parts[0]!.questions).toHaveLength(3);
    expect(dup.quiz.parts[0]!.questions[1]!.id).not.toBe("1");
  });
});

describe("dirty flag and saving", () => {
  test("any edit marks dirty; undoing it by hand clears it; markSaved resets", () => {
    let s = edit.startEditing(quiz([{ id: "a", questions: [mc("1")] }]));
    expect(edit.isDirty(s)).toBe(false);
    s = edit.setSettings(s, { shuffleChoices: true });
    expect(edit.isDirty(s)).toBe(true);
    s = edit.setSettings(s, { shuffleChoices: false });
    expect(edit.isDirty(s)).toBe(false);
    s = edit.removeQuestion(s, "1");
    expect(edit.isDirty(s)).toBe(true);
    s = edit.markSaved(s, s.quiz);
    expect(edit.isDirty(s)).toBe(false);
  });

  test("forSave gives the quiz when valid and the problems otherwise", () => {
    const ok = edit.startEditing(quiz([{ id: "a", questions: [mc("1")] }]));
    expect(edit.forSave(ok)).toEqual({ quiz: ok.quiz });
    expect(edit.forSave(edit.removeQuestion(ok, "1"))).toEqual({ problems: ["Add at least one question."] });
  });
});

describe("appending to a quiz (question bank)", () => {
  test("goes to the last part with fresh ids, and makes a part when there is none", () => {
    const q = quiz([{ id: "a", questions: [mc("1")] }, { id: "b", questions: [] }]);
    const added = edit.appendQuestions(q, [mc("bank")]);
    expect(added.parts[0]!.questions).toHaveLength(1);
    expect(added.parts[1]!.questions).toHaveLength(1);
    expect(added.parts[1]!.questions[0]!.id).not.toBe("bank");
    const bare = edit.appendQuestions({ ...q, parts: [] }, [mc("bank")]);
    expect(bare.parts.map((p) => p.title)).toEqual(["Questions"]);
  });

  test("into a pool, new questions take the pool's points", () => {
    const added = edit.appendQuestions(quiz([{ id: "p", pool: 1, questions: [mc("1", 4)] }]), [mc("b", 1)]);
    expect(added.parts[0]!.questions.map((q) => q.points)).toEqual([4, 4]);
  });
});
