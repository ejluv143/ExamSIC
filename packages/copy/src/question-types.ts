// How a question's type is named to people.
import type { QuestionType } from "@examinus/domain/question";

export const questionTypeLabel: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  blank: "Identification",
  matching: "Matching",
  enumeration: "Enumeration",
  numeric: "Numeric",
  essay: "Essay",
  drawing: "Drawing",
  code: "Code",
  sql: "SQL query",
  categorization: "Categorization",
  ordering: "Re-ordering",
  hotspot: "Hotspot",
};

// A question's type for display.
export const questionLabel = (q: { type: QuestionType }) => questionTypeLabel[q.type];
