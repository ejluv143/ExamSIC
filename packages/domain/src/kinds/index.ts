// The registry: every question type's kind, by type. The table is typed on `QuestionType`, so a type listed in
// `questionTypes` (../question.ts) without a kind here is a compile error. To add a type, write its module in this
// folder and list it here and in the unions of ../question.ts.
import type { QuestionType } from "../question.ts";
import type { QuestionKind } from "./base.ts";
import { blank } from "./blank.ts";
import { categorization } from "./categorization.ts";
import { code } from "./code.ts";
import { drawing } from "./drawing.ts";
import { enumeration } from "./enumeration.ts";
import { essay } from "./essay.ts";
import { hotspot } from "./hotspot.ts";
import { matching } from "./matching.ts";
import { multipleChoice } from "./multiple-choice.ts";
import { numeric } from "./numeric.ts";
import { ordering } from "./ordering.ts";
import { sql } from "./sql.ts";
import { trueFalse } from "./true-false.ts";

export type { QuestionKind } from "./base.ts";

export const questionKinds: { readonly [T in QuestionType]: QuestionKind<T> } = {
  multiple_choice: multipleChoice,
  true_false: trueFalse,
  blank,
  matching,
  enumeration,
  numeric,
  essay,
  code,
  sql,
  drawing,
  categorization,
  ordering,
  hotspot,
};

// The kind of a question (or of anything that has its type). The table is exhaustive by type, so the kind found by
// `q.type` is the one that takes `q`; TypeScript can't see that correlation across the union, hence the one cast.
export const kindOf = (q: { readonly type: QuestionType }): QuestionKind<QuestionType> => questionKinds[q.type] as unknown as QuestionKind<QuestionType>;

// The kinds in the order of `questionTypes`.
export const allKinds = (): QuestionKind<QuestionType>[] => Object.values(questionKinds) as unknown as QuestionKind<QuestionType>[];
