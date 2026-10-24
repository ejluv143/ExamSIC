// The answer input of the question's type. Every type has a module here that exports `Input` (and `Review`, for
// ./review.tsx); this picks the one for `question.type`. Used by the paper (take), mastery and the games.
import type { ComponentType } from "react";
import type { QuestionType } from "@examinus/domain/question";
import { Input as Blank } from "./blank";
import { Input as Categorization } from "./categorization";
import { Input as Code } from "./code";
import { Input as Drawing } from "./drawing";
import { Input as Enumeration } from "./enumeration";
import { Input as Essay } from "./essay";
import { Input as Hotspot } from "./hotspot";
import { Input as Matching } from "./matching";
import { Input as MultipleChoice } from "./multiple-choice";
import { Input as Numeric } from "./numeric";
import { Input as Ordering } from "./ordering";
import { Input as Sql } from "./sql";
import { Input as TrueFalse } from "./true-false";
import type { QuestionInputProps } from "./types";

export type { DrawingFinalizer, QuestionInputProps, TapAnswer } from "./types";

// Each entry takes the question of its own type; the registry is keyed by type, so the one cast below is sound.
const inputs: Record<QuestionType, ComponentType<never>> = {
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

export function QuestionInput(props: QuestionInputProps) {
  const Input = inputs[props.question.type] as ComponentType<QuestionInputProps>;
  return <Input {...props} />;
}
