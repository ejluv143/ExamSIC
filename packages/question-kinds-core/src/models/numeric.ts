import { parseNumber } from "../math.ts";
import { keyHeading, newBase, defaultPlaceholder } from "../editor-shared.ts";
import type { EditorModel } from "../editor-model.ts";

export const numericModel: EditorModel<"numeric"> = {
  type: "numeric",
  create: (id) => ({ ...newBase(id), type: "numeric", answer: 0, tolerance: 0, unit: "" }),
  promptPlaceholder: defaultPlaceholder,
  answer: keyHeading,
  summary: (q) => `${q.answer}${q.tolerance ? ` ±${q.tolerance}` : ""}${q.unit ? ` ${q.unit}` : ""}`,
  answerCell: {
    numeric: true,
    text: (q) => String(q.answer),
    parse(q, t) {
      const n = parseNumber(t);
      return n === null ? { error: `“${t}” is not a number.` } : { question: { ...q, answer: n } };
    },
  },
  sheet: {
    aliases: ["numeric", "number", "numerical", "problem solving", "computation"],
    parse({ base, answer, at }) {
      const value = parseNumber(answer);
      if (value === null) return { error: `Correct Answer must be a number, like 12, -3.5 or 3/4 (got “${answer}”).` };
      const rawTolerance = at("Tolerance");
      const tolerance = rawTolerance ? parseNumber(rawTolerance) : 0;
      if (tolerance === null || tolerance < 0) return { error: `Tolerance must be 0 or more (got “${rawTolerance}”).` };
      return { ...base, type: "numeric", answer: value, tolerance, unit: at("Unit") };
    },
  },
};
