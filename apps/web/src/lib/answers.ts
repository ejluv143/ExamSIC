// Readable text for answer keys and students' answers, for previews and results. The text is markdown
// (choices, matching items and prompts are), so callers show it with `Markdown`.
import { blankKey, parseDrawingAnswer, splitAlternatives, rubricTotal } from "@examora/contract";
import type { AnswerValue, Question } from "@examora/contract";

export function answerKey(q: Question): string {
  switch (q.type) {
    case "multiple_choice": {
      const correct = q.choices.filter((c) => q.correctChoiceIds.includes(c.id)).map((c) => c.text);
      return correct.length > 0 ? correct.join("; ") : "—";
    }
    case "numeric":
      return `${q.answer}${q.tolerance ? ` ± ${q.tolerance}` : ""}${q.unit ? ` ${q.unit}` : ""}`;
    case "true_false":
      return q.answer ? "True" : "False";
    case "blank":
      return blankKey(q)
        .map((accepted) => accepted.join(" / "))
        .join("; ");
    case "matching":
      return q.left.map((l) => `${l.text} → ${q.right.find((r) => r.id === l.rightId)?.text ?? "—"}`).join("; ");
    case "enumeration":
      return q.items.map((x) => splitAlternatives(x).join(" / ")).join("; ") + (q.orderMatters ? " (in order)" : "");
    case "essay":
    case "drawing":
      return q.rubric.length > 0
        ? `${q.rubric.map((r) => `${r.criterion} (${r.points})`).join("; ")}; ${rubricTotal(q.rubric)} pts in all`
        : "Graded by hand";
    case "code":
      return `Passes ${q.tests.length} test ${q.tests.length === 1 ? "case" : "cases"}`;
    case "sql":
      return q.answerSql.trim() || "Returns the expected rows";
  }
}

// What the student put, as text. Empty string when they left it blank.
export function answerText(q: Question, value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (q.type === "multiple_choice") {
    const ids = Array.isArray(value) ? value : [value];
    return q.choices
      .filter((c) => ids.includes(c.id))
      .map((c) => c.text)
      .join("; ");
  }
  if (q.type === "drawing") {
    const d = parseDrawingAnswer(value);
    const parts = [
      ...(d.strokes.length > 0 ? [`${d.strokes.length} ${d.strokes.length === 1 ? "stroke" : "strokes"}`] : []),
      ...(d.photos.length > 0 ? [`${d.photos.length} ${d.photos.length === 1 ? "photo" : "photos"}`] : []),
    ];
    return parts.length > 0 ? `Drawing (${parts.join(", ")})` : "";
  }
  if (q.type === "matching") {
    const ids = Array.isArray(value) ? value : [];
    if (!ids.some((id) => id !== "")) return "";
    return q.left.map((l, i) => `${l.text} → ${q.right.find((r) => r.id === ids[i])?.text ?? "—"}`).join("; ");
  }
  if (q.type === "true_false") return typeof value === "boolean" ? (value ? "True" : "False") : "";
  if (Array.isArray(value)) return value.some((x) => x.trim()) ? value.map((x) => x.trim() || "—").join("; ") : "";
  return typeof value === "string" ? value.trim() : "";
}
