import { blankAnswers } from "@examinus/domain/blanks";
import { blankStyle, type AnswerBox, type BlankMode, type BlankQuestion } from "@examinus/domain/kinds/blank";
import { keyHeading, newBase, splitsPoints } from "../shared/editor-model";
import type { EditorModel } from "../views/editor-model";

// `answerBox` "boxes": an identification answered in one box per letter.
export function newBlankQuestion(mode: BlankMode, id?: string, answerBox?: AnswerBox): BlankQuestion {
  return {
    ...newBase(id),
    prompt: mode === "fill" ? "" : "A {{primary key|PK}} uniquely identifies each {{row|record}} in a table.",
    type: "blank",
    mode,
    caseSensitive: false,
    acceptedAnswers: mode === "fill" ? [""] : [],
    ...(answerBox === "boxes" ? { answerBox } : {}),
    clozeInput: "typed",
    wrongOptions: [],
    extraWords: [],
  };
}

export const blankModel: EditorModel<"blank"> = {
  type: "blank",
  create: (id) => newBlankQuestion("fill", id),
  validate(q) {
    if (blankStyle(q) === "single")
      return q.acceptedAnswers.some((a) => a.trim())
        ? null
        : "needs at least one accepted answer, or blanks in the question (use Insert blank).";
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
    if (q.mode === "cloze" && q.clozeInput === "bank" && q.extraWords.some((w) => !w.trim())) return "has an empty extra word.";
    return null;
  },
  promptPlaceholder: (q) =>
    blankStyle(q) === "single"
      ? "e.g. What do we call a column that uniquely identifies each row? Or write blanks: A {{primary key|PK}} uniquely identifies each {{row|record}}."
      : "e.g. A {{primary key|PK}} uniquely identifies each {{row|record}} in a table.",
  promptBlanks: true,
  answer: keyHeading,
  unit: { noun: "blank", labels: (q) => blankAnswers(q.prompt).map((a) => a[0] || "(empty)") },
  partialCredit: { applies: splitsPoints },
  summary: (q) =>
    blankStyle(q) === "single"
      ? q.acceptedAnswers.filter(Boolean).join(" / ")
      : blankAnswers(q.prompt).map((a) => a.join(" / ")).join("; "),
  answerCell: {
    editable: (q) => blankStyle(q) === "single",
    text: (q) => (blankStyle(q) === "single" ? q.acceptedAnswers.join(" | ") : ""),
    parse(q, t) {
      if (blankStyle(q) !== "single") return { error: "Edit the answers inside the prompt, as {{answer|other answer}}." };
      const answers = t.split(/[|;\n]/).map((s) => s.trim()).filter(Boolean);
      if (answers.length === 0) return { error: "Give at least one accepted answer, separated by |." };
      return { question: { ...q, acceptedAnswers: answers } };
    },
  },
  // Identification and fill in the blank are one kind: a prompt with [brackets] (or {{braces}}) has inline blanks,
  // otherwise Correct Answer holds the accepted answers. Old spreadsheets' [answer] brackets become {{answer}}.
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
      const prompt = raw.replace(/\[([^[\]]*)\]/g, "{{$1}}");
      const fill = { ...base, prompt, type: "blank", mode: "fill", caseSensitive: false, clozeInput: "typed", wrongOptions: [], extraWords: [] } as const;
      const blanks = blankAnswers(prompt);
      if (blanks.length > 0) {
        if (blanks.some((b) => b.length === 0)) return { error: "A blank is empty. Write the answer inside the [brackets]." };
        return { ...fill, acceptedAnswers: [] };
      }
      const accepted = [...answer.split("|"), ...options].map((x) => x.trim()).filter(Boolean);
      if (!accepted.length) return { error: "Add the answer in Correct Answer. Separate alternatives with |." };
      return { ...fill, acceptedAnswers: [...new Set(accepted)] };
    },
  },
};
