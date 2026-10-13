import { keyHeading, newBase, newId, splitsPoints } from "../shared/editor-model";
import type { EditorModel } from "../views/editor-model";

export const categorizationModel: EditorModel<"categorization"> = {
  type: "categorization",
  create(id) {
    const categories = [0, 1, 2].map(() => ({ id: newId(), name: "" }));
    return {
      ...newBase(id),
      type: "categorization",
      categories,
      items: categories.flatMap((c) => [0, 1].map(() => ({ id: newId(), text: "", categoryId: c.id }))),
    };
  },
  validate(q) {
    if (q.categories.length < 2 || q.categories.length > 6) return "needs 2 to 6 categories.";
    const names = q.categories.map((c) => c.name.trim().toLowerCase());
    if (names.some((n) => !n)) return "has a category with no name.";
    if (new Set(names).size !== names.length) return "has two categories with the same name.";
    if (q.items.length < 2) return "needs at least two items to sort.";
    if (q.items.some((i) => !i.text.trim() && i.imageId === undefined)) return "has an empty item.";
    if (q.items.some((i) => i.categoryId !== null && !q.categories.some((c) => c.id === i.categoryId)))
      return "has an item whose category is gone.";
    const used = new Set(q.items.map((i) => i.categoryId).filter((id) => id !== null));
    return used.size < 2 ? "needs items that belong to at least two different categories." : null;
  },
  promptPlaceholder: "e.g. Sort each item into the group it belongs to.",
  answer: keyHeading,
  unit: { noun: "item", labels: (q) => q.items.map((x, i) => x.text.trim() || x.alt?.trim() || `Item ${i + 1}`) },
  partialCredit: { applies: splitsPoints },
  summary: (q) => `${q.categories.length} categories · ${q.items.length} items`,
};
