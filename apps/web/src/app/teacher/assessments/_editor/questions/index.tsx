"use client";

import { blankStyle, type Question } from "@examora/contract";
import { BlankEditor } from "./blank";
import { CodeQuestionEditor } from "./code";
import { DrawingEditor } from "./drawing";
import { RubricEditor } from "./essay";
import { EnumerationEditor } from "./enumeration";
import { MatchingEditor } from "./matching";
import { ChoicesEditor } from "./multiple-choice";
import { NumericEditor } from "./numeric";
import { SqlQuestionEditor } from "./sql";
import { TrueFalseEditor } from "./true-false";

export { ScoringSection } from "./scoring";

export function promptPlaceholder(q: Question): string {
  if (q.type === "blank") {
    if (blankStyle(q) === "single") return "e.g. What do we call a column that uniquely identifies each row? Or write blanks: A {{primary key|PK}} uniquely identifies each {{row|record}}.";
    return "e.g. A {{primary key|PK}} uniquely identifies each {{row|record}} in a table.";
  }
  if (q.type === "enumeration") return "e.g. Give the three anomalies that normalization prevents.";
  if (q.type === "matching") return "e.g. Match each term to its definition.";
  return "Type the question…";
}

// The editor of what a question's answer is, one component per type.
export function AnswerEditor({ question: q, onChange }: { question: Question; onChange: (q: Question) => void }) {
  switch (q.type) {
    case "multiple_choice":
      return <ChoicesEditor q={q} onChange={onChange} />;
    case "true_false":
      return <TrueFalseEditor q={q} onChange={onChange} />;
    case "blank":
      return <BlankEditor q={q} onChange={onChange} />;
    case "matching":
      return <MatchingEditor q={q} onChange={onChange} />;
    case "enumeration":
      return <EnumerationEditor q={q} onChange={onChange} />;
    case "numeric":
      return <NumericEditor q={q} onChange={onChange} />;
    case "code":
      return <CodeQuestionEditor q={q} onChange={onChange} />;
    case "sql":
      return <SqlQuestionEditor q={q} onChange={onChange} />;
    case "essay":
      return <RubricEditor q={q} onChange={onChange} />;
    case "drawing":
      return <DrawingEditor q={q} onChange={onChange} />;
  }
}
