import { keyHeading, newBase, newId, splitsPoints } from "../shared/editor-model";
import type { EditorModel } from "../views/editor-model";

export const orderingModel: EditorModel<"ordering"> = {
  type: "ordering",
  create: (id) => ({ ...newBase(id), type: "ordering", items: [0, 1, 2, 3].map(() => ({ id: newId(), text: "" })) }),
  validate(q) {
    if (q.items.length < 3 || q.items.length > 10) return "needs 3 to 10 items to put in order.";
    return q.items.some((i) => !i.text.trim() && i.imageId === undefined) ? "has an empty item." : null;
  },
  promptPlaceholder: "e.g. Put the steps of the water cycle in order.",
  answer: keyHeading,
  unit: { noun: "position" },
  partialCredit: { applies: splitsPoints },
  summary: (q) => `${q.items.length} items in order`,
};
