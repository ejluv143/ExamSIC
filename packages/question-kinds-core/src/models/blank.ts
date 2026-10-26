import { blankAnswers, blankMarker, splitAlternatives } from "@examinus/domain/blanks";
import type { BlankQuestion } from "@examinus/domain/kinds/blank";
import { keyHeading, newBase, splitsPoints } from "../editor-shared.ts";
import type { EditorModel } from "../editor-model.ts";

export const blankModel: EditorModel<"blank"> = {
  type: "blank",
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
  promptPlaceholder: "e.g. A {{primary key|PK}} uniquely identifies each {{row|record}} in a table.",
  promptBlanks: true,
  answer: keyHeading,
  unit: { noun: "blank", labels: (q) => blankAnswers(q.prompt).map((a) => a[0] || "(empty)") },
  partialCredit: { applies: splitsPoints },
  summary: (q) => blankAnswers(q.prompt).map((a) => a.join(" / ")).join("; "),
  answerCell: {
    editable: () => false,
    text: () => "",
    parse: () => ({ error: "Edit the answers inside the prompt, as {{answer|other answer}}." }),
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
};
