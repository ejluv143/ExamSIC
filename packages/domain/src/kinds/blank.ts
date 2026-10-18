import { Schema } from "effect";
import { blankAnswers, blankCount, emptyBlanks } from "../blanks.ts";
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

export const blankModes = ["fill", "cloze"] as const;
export const BlankMode = Schema.Literals(blankModes);
export type BlankMode = typeof BlankMode.Type;

// How students fill the blanks of a cloze passage.
export const clozeInputs = ["typed", "dropdown", "bank"] as const;
export const ClozeInput = Schema.Literals(clozeInputs);
export type ClozeInput = typeof ClozeInput.Type;

// How an identification (a `fill` question without blanks) is answered: on one line, or in one box per letter, which
// also tells the student how long the answer is (spaces between words stay gaps).
export const answerBoxes = ["line", "boxes"] as const;
export const AnswerBox = Schema.Literals(answerBoxes);
export type AnswerBox = typeof AnswerBox.Type;

const type = Schema.Literal("blank");

// Blanks live in the markdown prompt as {{answer}} or {{answer|alternative}}, compared case-insensitively
// unless caseSensitive. A `fill` question with no blanks in the prompt is an identification: one answer box
// after it, and any of `acceptedAnswers` is correct. With blanks they are answered inline and `acceptedAnswers`
// is unused. `cloze` takes its answers from the prompt; cloze blanks are
// typed, picked from a dropdown (the first answer plus that blank's `wrongOptions`) or picked from one shared
// word bank (every blank's first answer plus `extraWords`).
const fields = {
  mode: BlankMode,
  caseSensitive: Schema.Boolean,
  acceptedAnswers: Schema.Array(Schema.String),
  // Missing: a line.
  answerBox: Schema.optionalKey(AnswerBox),
  clozeInput: ClozeInput,
  wrongOptions: Schema.Array(Schema.Array(Schema.String)),
  extraWords: Schema.Array(Schema.String),
  ...weights,
};

export const BlankBody = Schema.Struct({ type, ...fields });
export const BlankQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type BlankQuestion = typeof BlankQuestion.Type;
// The prompt's blanks are emptied: "A {{}} identifies a {{}}." A question without blanks has none: one box after the prompt.
export const StudentBlankQuestion = Schema.Struct({
  ...studentBase,
  type,
  mode: BlankMode,
  blankCount: Schema.Int,
  // Identification in boxes: the length of each word of the answer, so the paper shows one box per letter.
  boxes: Schema.optionalKey(Schema.Array(Schema.Int)),
  clozeInput: ClozeInput,
  // Dropdown: the choices of each blank.
  options: Schema.Array(Schema.Array(Schema.String)),
  // Word bank: every word, answers and extras together.
  bank: Schema.Array(Schema.String),
});
export type StudentBlankQuestion = typeof StudentBlankQuestion.Type;

// How a blank question is answered: one box after the prompt, blanks inside the sentence, or a cloze passage.
// The one place that decides it.
export type BlankStyle = "single" | "inline" | "cloze";
export function blankStyle(q: Pick<BlankQuestion, "mode" | "prompt">): BlankStyle {
  return q.mode === "cloze" ? "cloze" : blankCount(q.prompt) > 0 ? "inline" : "single";
}

// The accepted answers of each blank: the accepted answers of a single box, or each blank written in the prompt.
export function blankKey(q: Pick<BlankQuestion, "mode" | "prompt" | "acceptedAnswers">): string[][] {
  return blankStyle(q) === "single" ? [[...q.acceptedAnswers]] : blankAnswers(q.prompt);
}

// The boxes of an identification answered letter by letter: the word lengths of the first accepted answer, or
// undefined when it is answered on a line (or has blanks in the prompt).
export function answerBoxLengths(q: Pick<BlankQuestion, "mode" | "prompt" | "acceptedAnswers" | "answerBox">): number[] | undefined {
  if (q.answerBox !== "boxes" || blankStyle(q) !== "single") return undefined;
  const words = (q.acceptedAnswers.find((a) => a.trim()) ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length === 0 ? undefined : words.map((w) => w.length);
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
  // Cloze dropdowns and the word bank are shuffled with `random`; without it they are sorted, so their order never
  // gives an answer away.
  toStudent: (q, random) => {
    const order = (words: string[]) => (random ? shuffled(words, random) : sortWords(words));
    const key = blankKey(q);
    const cloze = q.mode === "cloze";
    const boxes = answerBoxLengths(q);
    return {
      ...studentCommon(q),
      type: q.type,
      prompt: emptyBlanks(q.prompt),
      mode: q.mode,
      blankCount: blankStyle(q) === "single" ? 1 : blankCount(q.prompt),
      ...(boxes ? { boxes } : {}),
      clozeInput: q.clozeInput,
      options:
        cloze && q.clozeInput === "dropdown"
          ? key.map((answers, i) => order([...new Set([...answers.slice(0, 1), ...(q.wrongOptions[i] ?? [])])]))
          : [],
      bank: cloze && q.clozeInput === "bank" ? order([...key.flatMap((a) => a.slice(0, 1)), ...q.extraWords]) : [],
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
    // Identification: one answer box, so the prompt has no {{blanks}}.
    decode: (raw, { prompt, base }) => {
      const accepted = [
        ...new Set((raw.acceptedAnswers ?? (typeof raw.answer === "string" ? [raw.answer] : [])).map((a) => a.trim()).filter(Boolean)),
      ];
      if (accepted.length === 0 || prompt.includes("{{")) return null;
      return {
        ...base,
        type: "blank",
        mode: "fill",
        caseSensitive: false,
        acceptedAnswers: accepted,
        clozeInput: "typed",
        wrongOptions: [],
        extraWords: [],
      };
    },
  },
};
