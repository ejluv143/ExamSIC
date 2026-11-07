import { Schema } from "effect";
import {
  categorizationResults,
  cleanCategorizationAnswer,
  parseCategorizationAnswer,
} from "../placement.ts";
import { shuffled } from "../random.ts";
import {
  image,
  imageRefs,
  itemText,
  MatchItem,
  shown,
  studentBase,
  studentCommon,
  teacherBase,
  weightedFraction,
  weights,
  type QuestionKind,
} from "./base.ts";
import { keyHeading, newBase, newId } from "./editor.ts";

// A category of a categorization question. `description` is markdown, shown under the name. May be missing.
export const Category = Schema.Struct({ id: Schema.String, name: Schema.String, description: Schema.optionalKey(Schema.String) });
export type Category = typeof Category.Type;

// An item students sort into categories. `categoryId`: the category it belongs to, or null for a distractor that
// belongs to none (it is right when left unsorted).
export const CategoryItem = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  categoryId: Schema.NullOr(Schema.String),
  ...image,
});
export type CategoryItem = typeof CategoryItem.Type;

const type = Schema.Literal("categorization");

// Students drag the items into the categories (or leave a distractor out). Points are shared by the items.
const fields = {
  categories: Schema.Array(Category),
  items: Schema.Array(CategoryItem),
  ...weights,
};

export const CategorizationBody = Schema.Struct({ type, ...fields });
export const CategorizationQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type CategorizationQuestion = typeof CategorizationQuestion.Type;
export const StudentCategorizationQuestion = Schema.Struct({
  ...studentBase,
  type,
  categories: Schema.Array(Category),
  items: Schema.Array(MatchItem),
});
export type StudentCategorizationQuestion = typeof StudentCategorizationQuestion.Type;

export const categorization: QuestionKind<"categorization"> = {
  type: "categorization",
  label: "Categorization",
  subjects: ["general", "english", "science", "programming"],
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
  editor: {
    promptPlaceholder: "e.g. Sort each item into the group it belongs to.",
    answer: keyHeading,
    unit: { noun: "item", labels: (q) => q.items.map((x, i) => x.text.trim() || x.alt?.trim() || `Item ${i + 1}`) },
    partialCredit: {},
    summary: (q) => `${q.categories.length} categories · ${q.items.length} items`,
  },
  toStudent: (q, random) => ({
    ...studentCommon(q),
    type: q.type,
    categories: q.categories.map(({ id, name, description }) => ({ id, name, ...(description === undefined ? {} : { description }) })),
    items: (random ? shuffled(q.items, random) : q.items).map(shown),
  }),
  images: (q) => imageRefs(q.items.map((c, i) => [c.imageId, c.alt, `item ${i + 1}`])),
  cleanAnswer: cleanCategorizationAnswer,
  autoScore: (q, answer) =>
    answer === null
      ? 0
      : weightedFraction(
          categorizationResults(q, answer).map((r) => r.correct),
          q.weights,
          q.partialCredit,
        ),
  units: (q) => q.items.length,
  reviewable: false,
  answerKey: (q) => {
    const groups = q.categories.map((c) => {
      const items = q.items.filter((i) => i.categoryId === c.id).map(itemText);
      return `${c.name.trim() || "(unnamed)"}: ${items.length > 0 ? items.join(", ") : "—"}`;
    });
    const leftOut = q.items.filter((i) => i.categoryId === null).map(itemText);
    return [...groups, ...(leftOut.length > 0 ? [`Left unsorted: ${leftOut.join(", ")}`] : [])].join("; ");
  },
  answerText: (q, value) => {
    const given = parseCategorizationAnswer(value);
    const groups = q.categories.flatMap((c) => {
      const items = q.items.filter((i) => given[i.id] === c.id).map(itemText);
      return items.length > 0 ? [`${c.name.trim() || "(unnamed)"}: ${items.join(", ")}`] : [];
    });
    const sorted = new Set(q.categories.map((c) => c.id));
    const unsorted = q.items.filter((i) => !sorted.has(given[i.id] ?? "")).map(itemText);
    if (groups.length === 0) return "";
    return [...groups, ...(unsorted.length > 0 ? [`Unsorted: ${unsorted.join(", ")}`] : [])].join("; ");
  },
  summary: (q, v) => {
    const given = parseCategorizationAnswer(v);
    const sorted = q.items.filter((i) => given[i.id]).length;
    return `${sorted} of ${q.items.length} sorted`;
  },
  typing: false,
  gameAnswer: (q) =>
    q.categories
      .map((c) => `${c.name}: ${q.items.filter((i) => i.categoryId === c.id).map((i) => i.text || "(image)").join(", ")}`)
      .join("; "),
};
