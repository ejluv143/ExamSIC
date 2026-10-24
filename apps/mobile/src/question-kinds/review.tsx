// A question with the student's answer: the prompt (a blank filled in its sentence), the answer against the key, the
// teacher's feedback and the explanation. Each type has a module that exports `Review`.
import type { ComponentType } from "react";
import type { QuestionType } from "@examinus/domain/question";
import { Review as Blank } from "./blank";
import { Review as Categorization } from "./categorization";
import { Review as Code } from "./code";
import { Review as Drawing } from "./drawing";
import { Review as Enumeration } from "./enumeration";
import { Review as Essay } from "./essay";
import { Review as Hotspot } from "./hotspot";
import { Review as Matching } from "./matching";
import { Review as MultipleChoice } from "./multiple-choice";
import { Review as Numeric } from "./numeric";
import { Review as Ordering } from "./ordering";
import { Review as Sql } from "./sql";
import { Review as TrueFalse } from "./true-false";
import type { QuestionReviewProps } from "./types";

export type { QuestionReviewProps } from "./types";

const reviews: Record<QuestionType, ComponentType<never>> = {
  multiple_choice: MultipleChoice,
  true_false: TrueFalse,
  blank: Blank,
  matching: Matching,
  enumeration: Enumeration,
  numeric: Numeric,
  essay: Essay,
  code: Code,
  sql: Sql,
  drawing: Drawing,
  categorization: Categorization,
  ordering: Ordering,
  hotspot: Hotspot,
};

export function QuestionReview(props: QuestionReviewProps) {
  const Review = reviews[props.question.type] as ComponentType<QuestionReviewProps>;
  return <Review {...props} />;
}
