import { keyHeading, newBase, no, yes, defaultPlaceholder } from "../editor-shared.ts";
import type { EditorModel } from "../editor-model.ts";

export const trueFalseModel: EditorModel<"true_false"> = {
  type: "true_false",
  create: (id) => ({ ...newBase(id), type: "true_false", answer: true }),
  promptPlaceholder: defaultPlaceholder,
  answer: keyHeading,
  summary: (q) => (q.answer ? "True" : "False"),
  answerCell: {
    text: (q) => (q.answer ? "true" : "false"),
    options: [
      ["true", "True"],
      ["false", "False"],
    ],
    parse(q, t) {
      if (yes.test(t)) return { question: { ...q, answer: true } };
      if (no.test(t)) return { question: { ...q, answer: false } };
      return { error: `“${t}” is not True or False.` };
    },
  },
  sheet: {
    aliases: ["true/false", "true or false", "true false", "tf"],
    parse({ base, answer, optionByNumber }) {
      // Excel turns TRUE/FALSE into booleans, which norm() makes "true"/"false".
      const a = (optionByNumber(answer.toLowerCase()) ?? answer.toLowerCase()).toLowerCase();
      if (["true", "t"].includes(a)) return { ...base, type: "true_false", answer: true };
      if (["false", "f"].includes(a)) return { ...base, type: "true_false", answer: false };
      return { error: "Correct Answer must be True or False." };
    },
  },
};
