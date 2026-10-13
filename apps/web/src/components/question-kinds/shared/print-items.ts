import type { Question } from "@examinus/domain/question";
import { idRandom, shuffled, shuffledNotSorted } from "@examinus/domain/random";

// What a printed paper lists for categorization and ordering, in an order that is the same on the paper and the
// answer sheet but never gives the answer away: ordering items never come in their correct order.
export function printedItems(q: Extract<Question, { type: "categorization" | "ordering" }>) {
  const random = idRandom(q.id);
  return q.type === "ordering" ? shuffledNotSorted(q.items, random) : shuffled(q.items, random);
}
