import { Schema } from "effect";
import { shuffled } from "../random.ts";
import type { AnswerValue } from "../quiz.ts";
import { asList, image, imageRefs, oneLine, shown, studentBase, studentCommon, teacherBase, type QuestionKind } from "./base.ts";
import { defaultPlaceholder, keyHeading, letter, newBase } from "./editor.ts";
import { previewText } from "../markdown.ts";
import { subjectAreaNames } from "../roles.ts";

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
  label: "Multiple choice",
  subjects: subjectAreaNames,
  create: (id) => ({
    ...newBase(id),
    type: "multiple_choice",
    choices: ["a", "b", "c", "d"].map((c) => ({ id: c, text: "" })),
    correctChoiceIds: ["a"],
    multipleCorrect: false,
  }),
  validate(q) {
    if (q.choices.some((c) => !c.text.trim() && c.imageId === undefined)) return "has an empty choice.";
    const correct = q.correctChoiceIds.filter((id) => q.choices.some((c) => c.id === id));
    if (correct.length === 0) return "needs a correct choice.";
    if (!q.multipleCorrect && correct.length > 1) return "has more than one correct choice.";
    return null;
  },
  editor: {
    promptPlaceholder: defaultPlaceholder,
    answer: keyHeading,
    partialCredit: { applies: (q) => q.multipleCorrect, hint: "Right ticks earn a share; wrong ticks take one back." },
    summary(q) {
      const correct = q.choices.flatMap((c, i) =>
        q.correctChoiceIds.includes(c.id) ? [`${letter(i)}. ${previewText(c.text) || (c.imageId ? "(picture)" : "(empty)")}`] : [],
      );
      return correct.join("; ");
    },
    answerCell: {
      text: (q) => q.choices.flatMap((c, i) => (q.correctChoiceIds.includes(c.id) ? [letter(i)] : [])).join(", "),
      parse(q, t) {
        const picks = [...new Set((t.toUpperCase().match(/[A-Z]/g) ?? []).map((c) => c.charCodeAt(0) - 65))];
        if (picks.length === 0 || picks.some((i) => i >= q.choices.length))
          return { error: `Name the correct choice by letter, A to ${letter(q.choices.length - 1)}. Several: “A, C”.` };
        return {
          question: {
            ...q,
            correctChoiceIds: picks.sort((a, b) => a - b).map((i) => q.choices[i]!.id),
            multipleCorrect: q.multipleCorrect || picks.length > 1,
          },
        };
      },
    },
  },
  sheet: {
    aliases: ["multiple choice", "multiple-choice", "mcq", "mc"],
    parse({ base, answer, options, optionByNumber }) {
      if (options.length < 2) return { error: "Multiple choice needs at least 2 options." };
      if (!answer) return { error: "Correct Answer is empty. Put the option number, e.g. 2." };
      if (answer.includes(",")) return { error: "Only one correct option is supported per question." };
      // Wayground uses the option number; also accept the option's text.
      const correct = (optionByNumber(answer) ?? answer).toLowerCase();
      const index = options.findIndex((o) => o.toLowerCase() === correct);
      if (index < 0) return { error: `Correct Answer “${answer}” doesn't match any option.` };
      const choices = options.map((text, n) => ({ id: String.fromCharCode(97 + n), text }));
      return { ...base, type: "multiple_choice", choices, correctChoiceIds: [choices[index]!.id], multipleCorrect: false };
    },
  },
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
