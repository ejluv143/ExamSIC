// Starting shapes for new questions, and the checks a question must pass before the quiz is saved.
import { blankAnswers, rubricTotal, unitCount } from "@examora/contract";
import type { BlankMode, BlankQuestion, Question, QuestionType } from "@examora/contract";
import { starterTemplates } from "./code";
import { checkQuery } from "./sql";

const newId = () => crypto.randomUUID().slice(0, 8);

export const sqlTemplate = `CREATE TABLE students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    program TEXT
);

INSERT INTO students VALUES
    (1, 'Ana Cruz', 'BSIT'),
    (2, 'Ben Reyes', 'BSCS'),
    (3, 'Carla Lim', 'BSIT');
`;

const base = (id: string | undefined) => ({
  id: id ?? newId(),
  prompt: "",
  points: 1,
  gamePoints: "standard" as const,
  partialCredit: true,
});

export function newBlankQuestion(mode: BlankMode, id?: string): BlankQuestion {
  return {
    ...base(id),
    prompt: mode === "identification" ? "" : "A {{primary key|PK}} uniquely identifies each {{row|record}} in a table.",
    type: "blank",
    mode,
    caseSensitive: false,
    acceptedAnswers: mode === "identification" ? [""] : [],
    clozeInput: "typed",
    wrongOptions: [],
    extraWords: [],
  };
}

export function newQuestion(type: QuestionType, id?: string): Question {
  const common = base(id);
  switch (type) {
    case "multiple_choice":
      return {
        ...common,
        type,
        choices: ["a", "b", "c", "d"].map((c) => ({ id: c, text: "" })),
        correctChoiceIds: ["a"],
        multipleCorrect: false,
      };
    case "true_false":
      return { ...common, type, answer: true };
    case "blank":
      return newBlankQuestion("inline", id);
    case "matching": {
      const ids = [newId(), newId()];
      return {
        ...common,
        type,
        left: ids.map((rightId) => ({ id: newId(), text: "", rightId })),
        right: ids.map((rightId) => ({ id: rightId, text: "" })),
      };
    }
    case "enumeration":
      return { ...common, type, items: ["", "", ""], orderMatters: false, caseSensitive: false };
    case "numeric":
      return { ...common, type, answer: 0, tolerance: 0, unit: "" };
    case "essay":
      return { ...common, type, rubric: [] };
    case "code":
      return {
        ...common,
        type,
        language: "python",
        starterCode: starterTemplates.python,
        tests: [{ id: newId(), input: "", expectedOutput: "", hidden: false }],
        rubric: "",
      };
    case "sql":
      return {
        ...common,
        type,
        setupSql: sqlTemplate,
        answerSql: "",
        hiddenDataSql: "",
        orderMatters: false,
        starterCode: "SELECT ",
        rubric: "",
      };
  }
}

// The first thing wrong with a question, or null. Callers add "Question N" in front.
export function validateQuestion(q: Question): string | null {
  if (!q.prompt.trim()) return "has no question text.";
  if (q.points <= 0) return "must be worth more than 0 points.";
  if (!Number.isInteger(q.points * 2)) return "can only be worth whole or half points.";
  if ("weights" in q && q.weights && q.weights.length > 0) {
    if (q.weights.length !== unitCount(q) || q.weights.some((w) => !(w >= 0)) || !q.weights.some((w) => w > 0))
      return "has custom weights that don't match its parts. Edit the weights again or switch back to equal shares.";
  }
  switch (q.type) {
    case "multiple_choice": {
      if (q.choices.some((c) => !c.text.trim())) return "has an empty choice.";
      const correct = q.correctChoiceIds.filter((id) => q.choices.some((c) => c.id === id));
      if (correct.length === 0) return "needs a correct choice.";
      if (!q.multipleCorrect && correct.length > 1) return "has more than one correct choice.";
      return null;
    }
    case "blank": {
      if (q.mode === "identification")
        return q.acceptedAnswers.some((a) => a.trim()) ? null : "needs at least one accepted answer.";
      const blanks = blankAnswers(q.prompt);
      if (blanks.length === 0) return "has no blanks. Use Insert blank to mark each answer.";
      if (blanks.some((a) => a.length === 0)) return "has an empty blank.";
      if (q.mode === "cloze" && q.clozeInput === "dropdown") {
        for (let i = 0; i < blanks.length; i++) {
          const wrong = q.wrongOptions[i] ?? [];
          if (wrong.length === 0) return `needs at least one wrong option for blank ${i + 1}.`;
          if (wrong.some((w) => !w.trim())) return `has an empty wrong option for blank ${i + 1}.`;
        }
      }
      if (q.mode === "cloze" && q.clozeInput === "bank" && q.extraWords.some((w) => !w.trim()))
        return "has an empty extra word.";
      return null;
    }
    case "matching": {
      if (q.left.length === 0) return "needs at least one item to match.";
      if (q.left.some((l) => !l.text.trim()) || q.right.some((r) => !r.text.trim())) return "has an empty matching item.";
      if (q.left.some((l) => !q.right.some((r) => r.id === l.rightId))) return "has an item with no match chosen.";
      return null;
    }
    case "enumeration":
      return q.items.some((x) => !x.trim()) ? "has an empty enumeration item." : null;
    case "essay": {
      if (q.rubric.length === 0) return null;
      if (q.rubric.some((r) => !r.criterion.trim())) return "has a rubric row with no criterion.";
      return rubricTotal(q.rubric) === q.points ? null : `has a rubric worth ${rubricTotal(q.rubric)} points, not ${q.points}.`;
    }
    case "sql": {
      if (!q.setupSql.trim()) return "has no tables (setup SQL).";
      const problem = checkQuery(q.answerSql);
      return problem ? `answer query: ${problem}` : null;
    }
    case "code":
      if (q.tests.length === 0) return "needs at least one test case.";
      return q.tests.some((t) => !t.expectedOutput.trim()) ? "has a test case with no expected output." : null;
    default:
      return null;
  }
}
