import { describe, expect, test } from "bun:test";
import type { AttemptItem } from "../../database/schemas/index.ts";
import { attemptItem, choiceQuestion, quizDetail } from "../../testing/session-rows.ts";
import { authoredQuestions, clampSpentMs, gameQuestions, latestSubmitted, paperOf, paperQuestions, statusAfterScoring } from "./paper.ts";

const ids = (qs: readonly { id: string }[]) => qs.map((q) => q.id);
const questions = ["q1", "q2", "q3", "q4", "q5", "q6"].map((id) => choiceQuestion(id));

// A quiz that shuffles its questions, so the seed decides the paper.
const shuffling = () => {
  const detail = quizDetail(questions);
  return { ...detail, quiz: { ...detail.quiz, settings: { ...detail.quiz.settings, shuffleQuestions: true } } };
};

describe("paperOf", () => {
  test("the same seed gives the same paper, a shuffling quiz gives other seeds another", () => {
    const detail = shuffling();
    expect(ids(paperQuestions(detail, 7))).toEqual(ids(paperQuestions(detail, 7)));
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ids(paperQuestions(detail, seed)).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  test("the parts hold the questions in the order of the flat paper", () => {
    const paper = paperOf(shuffling(), 3);
    expect(ids(paper.parts.flatMap((p) => p.questions))).toEqual(ids(paper.questions));
  });

  test("the score counts a question without an answer row as unanswered", () => {
    const paper = paperOf(quizDetail(questions.slice(0, 2)), 1);
    const score = paper.score([{ questionId: "q1", autoScore: 1, manualScore: null }]);
    expect(score).toMatchObject({ score: 2, max: 4, ungraded: 0 });
  });

  test("a question with no score yet is left for the teacher", () => {
    const paper = paperOf(quizDetail(questions.slice(0, 2)), 1);
    const score = paper.score([
      { questionId: "q1", autoScore: 1, manualScore: null },
      { questionId: "q2", autoScore: null, manualScore: null },
    ]);
    expect(score.ungraded).toBe(1);
  });

  test("the teacher's points win over the automatic score", () => {
    const paper = paperOf(quizDetail(questions.slice(0, 1)), 1);
    expect(paper.score([{ questionId: "q1", autoScore: 1, manualScore: 0.5 }]).score).toBe(0.5);
  });
});

describe("authoredQuestions and gameQuestions", () => {
  test("authored questions ignore the seed, and a relay plays them as written", () => {
    const detail = shuffling();
    expect(ids(authoredQuestions(detail))).toEqual(ids(questions));
    expect(ids(gameQuestions(detail, 5, true))).toEqual(ids(questions));
  });

  test("any other game gets the seed's paper", () => {
    const detail = shuffling();
    expect(ids(gameQuestions(detail, 5, false))).toEqual(ids(paperQuestions(detail, 5)));
  });
});

describe("statusAfterScoring", () => {
  test("anything still for the teacher means the attempt needs grading, else it is graded", () => {
    expect(statusAfterScoring({ ungraded: 1 })).toBe("needs_grading");
    expect(statusAfterScoring({ ungraded: 0 })).toBe("graded");
  });
});

describe("latestSubmitted", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 2, 2, 8, minute));
  type Row = { key: string | null; attempt: AttemptItem };
  const row = (id: string, key: string | null, over: Partial<AttemptItem> = {}): Row => ({
    key,
    attempt: attemptItem({ id, status: "graded", submittedAt: at(0), ...over }),
  });
  const pick = (rows: Row[]) => latestSubmitted(rows, (r) => r.key, (r) => r.attempt);

  test("keeps the most recently submitted attempt per key", () => {
    const latest = pick([row("old", "s1", { submittedAt: at(1) }), row("new", "s1", { submittedAt: at(9) }), row("other", "s2")]);
    expect(latest.get("s1")?.attempt.id).toBe("new");
    expect(latest.get("s2")?.attempt.id).toBe("other");
  });

  test("skips attempts in progress and items without a key", () => {
    const latest = pick([row("open", "s1", { status: "in_progress", submittedAt: null }), row("nokey", null)]);
    expect(latest.size).toBe(0);
  });
});

describe("clampSpentMs", () => {
  test("keeps the time within what is possible", () => {
    expect(clampSpentMs(-5)).toBe(0);
    expect(clampSpentMs(1234)).toBe(1234);
    expect(clampSpentMs(30 * 3600_000)).toBe(24 * 3600_000);
  });
});
