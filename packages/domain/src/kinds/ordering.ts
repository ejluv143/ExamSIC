import { Schema } from "effect";
import { orderingResults, parseOrderingAnswer } from "../placement.ts";
import { idRandom, shuffledNotSorted } from "../random.ts";
import {
  imageRefs,
  itemText,
  MatchItem,
  shown,
  studentBase,
  studentCommon,
  teacherBase,
  weightedFraction,
  type QuestionKind,
} from "./base.ts";
import { keyHeading, newBase, newId } from "./editor.ts";
import { subjectAreaNames } from "../roles.ts";

const type = Schema.Literal("ordering");

// The items are listed in their correct order; students get them shuffled and drag them into order. Points are
// shared equally by the positions.
const fields = { items: Schema.Array(MatchItem) };

export const OrderingBody = Schema.Struct({ type, ...fields });
export const OrderingQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type OrderingQuestion = typeof OrderingQuestion.Type;
// The items come in a shuffled order that is never the right one.
export const StudentOrderingQuestion = Schema.Struct({ ...studentBase, type, items: Schema.Array(MatchItem) });
export type StudentOrderingQuestion = typeof StudentOrderingQuestion.Type;

export const ordering: QuestionKind<"ordering"> = {
  type: "ordering",
  label: "Re-ordering",
  subjects: subjectAreaNames,
  create: (id) => ({ ...newBase(id), type: "ordering", items: [0, 1, 2, 3].map(() => ({ id: newId(), text: "" })) }),
  validate(q) {
    if (q.items.length < 3 || q.items.length > 10) return "needs 3 to 10 items to put in order.";
    return q.items.some((i) => !i.text.trim() && i.imageId === undefined) ? "has an empty item." : null;
  },
  editor: {
    promptPlaceholder: "e.g. Put the steps of the water cycle in order.",
    answer: keyHeading,
    unit: { noun: "position" },
    partialCredit: {},
    summary: (q) => `${q.items.length} items in order`,
  },
  // Always shuffled, or the list would give the answer away; without a seed, by one taken from the question's id.
  toStudent: (q, random) => ({
    ...studentCommon(q),
    type: q.type,
    items: shuffledNotSorted(q.items, random ?? idRandom(q.id)).map(shown),
  }),
  images: (q) => imageRefs(q.items.map((c, i) => [c.imageId, c.alt, `item ${i + 1}`])),
  cleanAnswer: parseOrderingAnswer,
  autoScore: (q, answer) =>
    answer === null
      ? 0
      : weightedFraction(
          orderingResults(q, answer).map((r) => r.correct),
          undefined,
          q.partialCredit,
        ),
  units: (q) => q.items.length,
  reviewable: false,
  answerKey: (q) => q.items.map(itemText).join(" → "),
  answerText: (q, value) => {
    const order = parseOrderingAnswer(q, value);
    if (!order) return "";
    return order.map((id) => itemText(q.items.find((i) => i.id === id) ?? { text: "" })).join(" → ");
  },
  summary: () => "Order set",
  typing: false,
  gameAnswer: (q) => q.items.map((i) => i.text || "(image)").join(" → "),
};
