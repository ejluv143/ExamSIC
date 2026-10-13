import type { QuestionType } from "@examinus/domain/question";
import type { QuestionUi } from "./types";
import { ui as multiple_choice } from "./multiple-choice";
import { ui as true_false } from "./true-false";
import { ui as blank } from "./blank";
import { ui as matching } from "./matching";
import { ui as enumeration } from "./enumeration";
import { ui as numeric } from "./numeric";
import { ui as essay } from "./essay";
import { ui as code } from "./code";
import { ui as sql } from "./sql";
import { ui as drawing } from "./drawing";
import { ui as categorization } from "./categorization";
import { ui as ordering } from "./ordering";
import { ui as hotspot } from "./hotspot";

// Every question type's UI module. A type missing here is a compile error; the domain side is
// `@examinus/domain/kinds`.
export const questionUi: { readonly [T in QuestionType]: QuestionUi<T> } = {
  multiple_choice,
  true_false,
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
