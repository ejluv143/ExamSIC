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
