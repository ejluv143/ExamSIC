// Readable text for answer keys and students' answers, for previews and results.
import { promptParts, splitAlternatives } from "./blanks";
import type { AnswerValue, Question } from "@examora/contract";

export function answerKey(q: Question): string {
  switch (q.type) {
    case "multiple_choice":
      return q.choices.find((c) => c.id === q.correctChoiceId)?.text ?? "—";
    case "numeric":
      return `${q.answer}${q.tolerance ? ` ± ${q.tolerance}` : ""}${q.unit ? ` ${q.unit}` : ""}`;
    case "true_false":
      return q.answer ? "True" : "False";
    case "identification":
      return q.acceptedAnswers.join(" / ");
    case "fill_in_the_blank":
      return promptParts(q.prompt)
        .flatMap((p) => ("answers" in p ? [p.answers.join(" / ")] : []))
        .join("; ");
    case "enumeration":
      return q.items.map((x) => splitAlternatives(x).join(" / ")).join("; ") + (q.orderMatters ? " (in order)" : "");
    case "essay":
      return q.rubric || "Graded by hand";
    case "code":
      return `Passes ${q.tests.length} test ${q.tests.length === 1 ? "case" : "cases"}`;
    case "sql":
      return q.answerSql.trim() || "Returns the expected rows";
  }
}

// What the student put, as text. Empty string when they left it blank.
export function answerText(q: Question, value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (q.type === "multiple_choice") return q.choices.find((c) => c.id === value)?.text ?? "";
  if (q.type === "true_false") return typeof value === "boolean" ? (value ? "True" : "False") : "";
  if (Array.isArray(value)) return value.some((x) => x.trim()) ? value.map((x) => x.trim() || "—").join("; ") : "";
  return typeof value === "string" ? value.trim() : "";
}
