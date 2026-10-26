import { previewText } from "../preview-text.ts";
import { keyHeading, letter, newBase, defaultPlaceholder } from "../editor-shared.ts";
import type { EditorModel } from "../editor-model.ts";

export const multipleChoiceModel: EditorModel<"multiple_choice"> = {
  type: "multiple_choice",
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
};
