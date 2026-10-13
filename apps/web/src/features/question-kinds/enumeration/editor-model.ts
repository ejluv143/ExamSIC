import { keyHeading, newBase, splitsPoints } from "../shared/editor-model";
import type { EditorModel } from "../views/editor-model";

export const enumerationModel: EditorModel<"enumeration"> = {
  type: "enumeration",
  create: (id) => ({ ...newBase(id), type: "enumeration", items: ["", "", ""], orderMatters: false, caseSensitive: false }),
  validate: (q) => (q.items.some((x) => !x.trim()) ? "has an empty enumeration item." : null),
  promptPlaceholder: "e.g. Give the three anomalies that normalization prevents.",
  answer: keyHeading,
  unit: {
    noun: "item",
    labels: (q) => q.items.map((x, i) => x.split("|")[0]!.trim() || `Item ${i + 1}`),
  },
  partialCredit: { applies: splitsPoints },
  summary: (q) => q.items.filter(Boolean).join("; "),
  answerCell: {
    text: (q) => q.items.join("; "),
    parse(q, t) {
      const items = t.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) return { error: "List at least one item, separated by semicolons." };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { weights: _weights, ...rest } = q;
      return { question: items.length === q.items.length ? { ...q, items } : { ...rest, items } };
    },
  },
  sheet: {
    aliases: ["enumeration", "enumerate", "list"],
    parse({ base, answer, options, rawPoints, points }) {
      const items = [...options, ...answer.split(";")].map((x) => x.trim()).filter(Boolean);
      if (!items.length) return { error: "List the expected items in Option 1–5, or in Correct Answer separated by ;." };
      return { ...base, type: "enumeration", points: rawPoints ? points : items.length, items, orderMatters: false, caseSensitive: false };
    },
  },
};
