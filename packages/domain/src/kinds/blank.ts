import { Schema } from "effect";
import { blankAnswers, blankBoxes, blankCount, blankMarker, emptyBlanks, splitAlternatives } from "../blanks.ts";
import type { AnswerValue } from "../quiz.ts";
import { shuffled } from "../random.ts";
import {
  asList,
  cleanList,
  matches,
  oneLine,
  plainAnswerText,
  studentBase,
  studentCommon,
  teacherBase,
  weightedFraction,
  weights,
  type QuestionKind,
} from "./base.ts";
import { keyHeading, newBase } from "./editor.ts";
import { subjectAreaNames } from "../roles.ts";

// How students fill the blanks: typed, picked from a dropdown per blank, or picked from one shared word bank.
export const clozeInputs = ["typed", "dropdown", "bank"] as const;
export const ClozeInput = Schema.Literals(clozeInputs);
export type ClozeInput = typeof ClozeInput.Type;

const type = Schema.Literal("blank");

// Identification. Every answer is a blank in the markdown prompt, {{answer}} or {{answer|alternative}}, compared
// case-insensitively unless caseSensitive; {{#answer}} is answered one letter per box (spaces between words stay
// gaps), which also tells the student how long the answer is. The blanks are typed, picked from a dropdown (the
// first answer plus that blank's `wrongOptions`) or picked from one shared word bank (every blank's first answer
// plus `extraWords`).
const fields = {
  caseSensitive: Schema.Boolean,
  clozeInput: ClozeInput,
  wrongOptions: Schema.Array(Schema.Array(Schema.String)),
  extraWords: Schema.Array(Schema.String),
  ...weights,
};

export const BlankBody = Schema.Struct({ type, ...fields });
export const BlankQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type BlankQuestion = typeof BlankQuestion.Type;
// The prompt's blanks are emptied: "A {{}} identifies a {{#}}."
export const StudentBlankQuestion = Schema.Struct({
  ...studentBase,
  type,
  blankCount: Schema.Int,
  // Per blank: the length of each word of the answer, so one box per letter is drawn; null for a line.
  boxes: Schema.Array(Schema.NullOr(Schema.Array(Schema.Int))),
  clozeInput: ClozeInput,
  // Dropdown: the choices of each blank.
  options: Schema.Array(Schema.Array(Schema.String)),
  // Word bank: every word, answers and extras together.
  bank: Schema.Array(Schema.String),
});
export type StudentBlankQuestion = typeof StudentBlankQuestion.Type;

// The accepted answers of each blank written in the prompt.
export function blankKey(q: Pick<BlankQuestion, "prompt">): string[][] {
  return blankAnswers(q.prompt);
}

const sortWords = (words: string[]) => [...words].sort((a, b) => a.localeCompare(b));

const partResults = (q: BlankQuestion, answer: AnswerValue) => {
  const given = asList(answer);
  return blankKey(q).map((accepted, i) => ({
    given: given[i] ?? "",
    correct: matches(given[i] ?? "", accepted, q.caseSensitive),
  }));
};

export const blank: QuestionKind<"blank"> = {
  type: "blank",
  label: "Identification",
  subjects: subjectAreaNames,
  create: (id): BlankQuestion => ({
    ...newBase(id),
    prompt: "",
    type: "blank",
    caseSensitive: false,
    clozeInput: "typed",
    wrongOptions: [],
    extraWords: [],
  }),
  validate(q) {
    const blanks = blankAnswers(q.prompt);
    if (blanks.length === 0) return "has no blanks. Use + Blank to mark each answer.";
    if (blanks.some((a) => a.length === 0)) return "has an empty blank.";
    if (q.clozeInput === "dropdown") {
      for (let i = 0; i < blanks.length; i++) {
        const wrong = q.wrongOptions[i] ?? [];
        if (wrong.length === 0) return `needs at least one wrong option for blank ${i + 1}.`;
        if (wrong.some((w) => !w.trim())) return `has an empty wrong option for blank ${i + 1}.`;
      }
    }
    if (q.clozeInput === "bank" && q.extraWords.some((w) => !w.trim())) return "has an empty extra word.";
    return null;
  },
  editor: {
    promptPlaceholder: "e.g. A {{primary key|PK}} uniquely identifies each {{row|record}} in a table.",
    promptBlanks: true,
    answer: keyHeading,
    unit: { noun: "blank", labels: (q) => blankAnswers(q.prompt).map((a) => a[0] || "(empty)") },
    partialCredit: {},
    summary: (q) => blankAnswers(q.prompt).map((a) => a.join(" / ")).join("; "),
    answerCell: {
      editable: () => false,
      text: () => "",
      parse: () => ({ error: "Edit the answers inside the prompt, as {{answer|other answer}}." }),
    },
  },
  // Every answer is a blank in the prompt: a prompt with [brackets] (or {{braces}}) has them inline, otherwise the
  // Correct Answer column is added to the end of it as one blank. Old spreadsheets' [answer] brackets become {{answer}}.
  sheet: {
    aliases: [
      "identification",
      "fill-in-the-blank",
      "fill in the blank",
      "fill in the blanks",
      "short answer",
      "fill in the blanks (multiple)",
    ],
    parse({ base, prompt: raw, answer, options }) {
      const inline = raw.replace(/\[([^[\]]*)\]/g, "{{$1}}");
      const fill = { ...base, type: "blank", caseSensitive: false, clozeInput: "typed", wrongOptions: [], extraWords: [] } as const;
      const blanks = blankAnswers(inline);
      if (blanks.length > 0) {
        if (blanks.some((b) => b.length === 0)) return { error: "A blank is empty. Write the answer inside the [brackets]." };
        return { ...fill, prompt: inline };
      }
      const accepted = [...new Set([...splitAlternatives(answer), ...options.flatMap(splitAlternatives)])];
      if (!accepted.length) return { error: "Add the answer in Correct Answer, or put it in [brackets] in the question. Separate alternatives with |." };
      return { ...fill, prompt: `${inline} ${blankMarker(accepted, false)}` };
    },
  },
  // Cloze dropdowns and the word bank are shuffled with `random`; without it they are sorted, so their order never
  // gives an answer away.
  toStudent: (q, random) => {
    const order = (words: string[]) => (random ? shuffled(words, random) : sortWords(words));
    const key = blankKey(q);
    return {
      ...studentCommon(q),
      type: q.type,
      prompt: emptyBlanks(q.prompt),
      blankCount: blankCount(q.prompt),
      boxes: blankBoxes(q.prompt),
      clozeInput: q.clozeInput,
      options:
        q.clozeInput === "dropdown"
          ? key.map((answers, i) => order([...new Set([...answers.slice(0, 1), ...(q.wrongOptions[i] ?? [])])]))
          : [],
      bank: q.clozeInput === "bank" ? order([...key.flatMap((a) => a.slice(0, 1)), ...q.extraWords]) : [],
    };
  },
  cleanAnswer: (_q, v) => cleanList(v),
  autoScore: (q, answer) =>
    weightedFraction(
      partResults(q, answer).map((p) => p.correct),
      q.weights,
      q.partialCredit,
    ),
  units: (q) => blankKey(q).length,
  partResults,
  reviewable: true,
  answerKey: (q) =>
    blankKey(q)
      .map((accepted) => accepted.join(" / "))
      .join("; "),
  answerText: (_q, value) => plainAnswerText(value),
  summary: (_q, v) => oneLine((Array.isArray(v) ? v : [String(v)]).map((x) => x.trim() || "—").join(" · ")),
  typing: true,
  gameAnswer: (q) => blankKey(q).map((accepted) => accepted[0] ?? "").join(", "),
  draft: {
    shape:
      '{"type":"blank","prompt":"a question or statement answered in one word or phrase; no {{blanks}} in the prompt","acceptedAnswers":["answer","alternative spelling"]}',
    // The model writes the statement and the accepted answers; the answer becomes one blank after the statement.
    decode: (raw, { prompt, base }) => {
      const accepted = [
        ...new Set((raw.acceptedAnswers ?? (typeof raw.answer === "string" ? [raw.answer] : [])).map((a) => a.trim()).filter(Boolean)),
      ];
      if (accepted.length === 0 || prompt.includes("{{")) return null;
      return {
        ...base,
        type: "blank",
        prompt: `${prompt.trim()} ${blankMarker(accepted, false)}`,
        caseSensitive: false,
        clozeInput: "typed",
        wrongOptions: [],
        extraWords: [],
      };
    },
  },
};
