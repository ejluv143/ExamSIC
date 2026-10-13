import { keyHeading, newBase, newId, splitsPoints } from "../shared/editor-model";
import type { EditorModel } from "../views/editor-model";

export const matchingModel: EditorModel<"matching"> = {
  type: "matching",
  create(id) {
    const ids = [newId(), newId()];
    return {
      ...newBase(id),
      type: "matching",
      left: ids.map((rightId) => ({ id: newId(), text: "", rightId })),
      right: ids.map((rightId) => ({ id: rightId, text: "" })),
    };
  },
  validate(q) {
    if (q.left.length === 0) return "needs at least one item to match.";
    if (q.left.some((l) => !l.text.trim() && l.imageId === undefined) || q.right.some((r) => !r.text.trim() && r.imageId === undefined))
      return "has an empty matching item.";
    if (q.left.some((l) => !q.right.some((r) => r.id === l.rightId))) return "has an item with no match chosen.";
    return null;
  },
  promptPlaceholder: "e.g. Match each term to its definition.",
  answer: keyHeading,
  unit: { noun: "pair", labels: (q) => q.left.map((l, i) => l.text.trim() || `Item ${i + 1}`) },
  partialCredit: { applies: splitsPoints },
  summary: (q) => `${q.left.length} pairs`,
};
