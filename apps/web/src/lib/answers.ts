// Readable text for answer keys and students' answers, for previews and results. The text is markdown
// (choices, matching items and prompts are), so callers show it with `Markdown`.
import {
  blankKey,
  parseCategorizationAnswer,
  parseDrawingAnswer,
  parseHotspotAnswer,
  parseOrderingAnswer,
  splitAlternatives,
  rubricTotal,
} from "@examora/contract";
import type { AnswerValue, CategorizationQuestion, HotspotQuestion, Question } from "@examora/contract";

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
    case "categorization":
      return categorizationKey(q);
    case "ordering":
      return q.items.map(itemText).join(" → ");
    case "hotspot":
      return hotspotKey(q);
  }
}

// An item as text: its words, else "(picture)".
const itemText = (item: { text: string; imageId?: string | undefined; alt?: string | undefined }) =>
  item.text.trim() || item.alt?.trim() || (item.imageId ? "(picture)" : "—");

function categorizationKey(q: CategorizationQuestion): string {
  const groups = q.categories.map((c) => {
    const items = q.items.filter((i) => i.categoryId === c.id).map(itemText);
    return `${c.name.trim() || "(unnamed)"}: ${items.length > 0 ? items.join(", ") : "—"}`;
  });
  const leftOut = q.items.filter((i) => i.categoryId === null).map(itemText);
  return [...groups, ...(leftOut.length > 0 ? [`Left unsorted: ${leftOut.join(", ")}`] : [])].join("; ");
}

function hotspotKey(q: HotspotQuestion): string {
  const labels = q.regions.map((r) => r.label?.trim()).filter(Boolean);
  return `${q.regions.length} ${q.regions.length === 1 ? "area" : "areas"}${labels.length > 0 ? `: ${labels.join(", ")}` : ""}`;
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
  if (q.type === "categorization") {
    const given = parseCategorizationAnswer(value);
    const groups = q.categories.flatMap((c) => {
      const items = q.items.filter((i) => given[i.id] === c.id).map(itemText);
      return items.length > 0 ? [`${c.name.trim() || "(unnamed)"}: ${items.join(", ")}`] : [];
    });
    const sorted = new Set(q.categories.map((c) => c.id));
    const unsorted = q.items.filter((i) => !sorted.has(given[i.id] ?? "")).map(itemText);
    if (groups.length === 0) return "";
    return [...groups, ...(unsorted.length > 0 ? [`Unsorted: ${unsorted.join(", ")}`] : [])].join("; ");
  }
  if (q.type === "ordering") {
    const order = parseOrderingAnswer(q, value);
    if (!order) return "";
    return order.map((id) => itemText(q.items.find((i) => i.id === id) ?? { text: "" })).join(" → ");
  }
  if (q.type === "hotspot") {
    const n = parseHotspotAnswer(value).length;
    return n > 0 ? `${n} ${n === 1 ? "marker" : "markers"}` : "";
  }
  if (q.type === "true_false") return typeof value === "boolean" ? (value ? "True" : "False") : "";
  if (Array.isArray(value)) return value.some((x) => x.trim()) ? value.map((x) => x.trim() || "—").join("; ") : "";
  return typeof value === "string" ? value.trim() : "";
}
