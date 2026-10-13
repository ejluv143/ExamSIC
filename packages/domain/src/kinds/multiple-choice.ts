import { Schema } from "effect";
import { shuffled } from "../random.ts";
import type { AnswerValue } from "../quiz.ts";
import { asList, image, imageRefs, oneLine, shown, studentBase, studentCommon, teacherBase, type QuestionKind } from "./base.ts";

export const Choice = Schema.Struct({ id: Schema.String, text: Schema.String, ...image });
export type Choice = typeof Choice.Type;

const type = Schema.Literal("multiple_choice");

const fields = {
  choices: Schema.Array(Choice),
  // One id, unless multipleCorrect: then students tick every correct choice.
  correctChoiceIds: Schema.Array(Schema.String),
  multipleCorrect: Schema.Boolean,
};

export const MultipleChoiceBody = Schema.Struct({ type, ...fields });
export const MultipleChoiceQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type MultipleChoiceQuestion = typeof MultipleChoiceQuestion.Type;
export const StudentMultipleChoiceQuestion = Schema.Struct({
  ...studentBase,
  type,
  choices: Schema.Array(Choice),
  multipleCorrect: Schema.Boolean,
});
export type StudentMultipleChoiceQuestion = typeof StudentMultipleChoiceQuestion.Type;

// One correct choice: exact. Several: all of them and nothing else, or with partial credit
// each right tick earns a share and each wrong tick takes one back (never below 0).
function choiceFraction(q: MultipleChoiceQuestion, answer: AnswerValue): number {
  const picked = new Set(asList(answer));
  const correct = new Set(q.correctChoiceIds);
  const right = [...picked].filter((id) => correct.has(id)).length;
  const wrong = picked.size - right;
  if (right === correct.size && wrong === 0) return correct.size === 0 ? 0 : 1;
  if (!q.multipleCorrect || !q.partialCredit || correct.size === 0) return 0;
  return Math.max(0, (right - wrong) / correct.size);
}

export const multipleChoice: QuestionKind<"multiple_choice"> = {
  type: "multiple_choice",
  toStudent: (q) => ({ ...studentCommon(q), type: q.type, choices: q.choices.map(shown), multipleCorrect: q.multipleCorrect }),
  shuffle: (q, random) => ({ ...q, choices: shuffled(q.choices, random) }),
  images: (q) => imageRefs(q.choices.map((c, i) => [c.imageId, c.alt, `choice ${i + 1}`])),
  cleanAnswer: (q, v) =>
    q.multipleCorrect ? (Array.isArray(v) ? v.slice(0, 50).map(String) : null) : typeof v === "string" ? v : null,
  autoScore: choiceFraction,
  reviewable: false,
  answerKey: (q) => {
    const correct = q.choices.filter((c) => q.correctChoiceIds.includes(c.id)).map((c) => c.text);
    return correct.length > 0 ? correct.join("; ") : "—";
  },
  answerText: (q, value) => {
    const ids = Array.isArray(value) ? value : [value];
    return q.choices
      .filter((c) => ids.includes(c.id))
      .map((c) => c.text)
      .join("; ");
  },
  summary: (q, v) => {
    const picked = Array.isArray(v) ? v : [String(v)];
    return q.choices
      .map((c, i) => (picked.includes(c.id) ? `${String.fromCharCode(65 + i)}. ${oneLine(c.text, 40) || c.alt || "Picture"}` : null))
      .filter((x): x is string => x !== null)
      .join("; ");
  },
  typing: false,
  optionKey: (q) => q.correctChoiceIds.join(","),
  gameTally: (_q, value) => (Array.isArray(value) ? value : typeof value === "string" ? [value] : []),
  gameBuckets: (q, count) =>
    q.choices.map((c) => ({ label: c.text || "(image)", count: count(c.id), correct: q.correctChoiceIds.includes(c.id) })),
  gameAnswer: (q) =>
    q.choices
      .filter((c) => q.correctChoiceIds.includes(c.id))
      .map((c) => c.text || "(image)")
      .join(", "),
  draft: {
    shape:
      '{"type":"multiple_choice","prompt":"...","choices":[{"text":"...","correct":true},{"text":"...","correct":false}, ...3 to 5 choices, at least one correct]}',
    decode: (raw, { base, newId }) => {
      const choices = (raw.choices ?? []).map((c) => ({ id: newId(), text: c.text.trim(), correct: c.correct })).filter((c) => c.text !== "");
      const correct = choices.filter((c) => c.correct);
      if (choices.length < 2 || choices.length > 10 || correct.length === 0 || correct.length === choices.length) return null;
      return {
        ...base,
        type: "multiple_choice",
        choices: choices.map(({ id, text }) => ({ id, text })),
        correctChoiceIds: correct.map((c) => c.id),
        multipleCorrect: correct.length > 1,
      };
    },
  },
};
