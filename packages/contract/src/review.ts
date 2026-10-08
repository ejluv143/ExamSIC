// Moving between questions and marking them for review: the rules the API enforces and the student's page
// shows, and the short answer summaries of the review screen.
import { drawingAssetIds, parseDrawingAnswer } from "./drawing.ts";
import type { Question, StudentQuestion } from "./question.ts";
import type { AnswerValue, SessionMode, SessionNavigation } from "./quiz.ts";

// What a new session starts with: exams send students forward and let them come back to 5 marked questions.
export const defaultNavigation = (mode: SessionMode): SessionNavigation => (mode === "exam" ? "marked_only" : "free");
export const defaultMaxMarked = (mode: SessionMode): number | null => (mode === "exam" ? 5 : null);

export const markLimitMessage = (max: number) =>
  `You can mark at most ${max} ${max === 1 ? "question" : "questions"} for review.`;

// Whether a question has an answer that says something. Untouched starter code and an empty canvas don't count.
export function answerGiven(q: Question | StudentQuestion, v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (q.type === "drawing") {
    const drawing = parseDrawingAnswer(v);
    return drawing.strokes.length > 0 || drawingAssetIds(drawing).length > 0;
  }
  if (q.type === "code" || q.type === "sql")
    return typeof v === "string" && v.trim() !== "" && v.trim() !== q.starterCode.trim();
  if (Array.isArray(v)) return v.some((x) => x.trim());
  return typeof v === "string" ? v.trim() !== "" : true;
}

// Markdown on one short line (math stays, for the page to render).
function oneLine(markdown: string, max = 80): string {
  const text = markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// The answer in a few words for the review screen ("B. Mitochondria", "12 lines of code"); null when not answered.
export function answerSummary(q: Question | StudentQuestion, v: AnswerValue | undefined): string | null {
  if (!answerGiven(q, v)) return null;
  switch (q.type) {
    case "multiple_choice": {
      const picked = Array.isArray(v) ? v : [String(v)];
      return q.choices
        .map((c, i) => (picked.includes(c.id) ? `${String.fromCharCode(65 + i)}. ${oneLine(c.text, 40) || c.alt || "Picture"}` : null))
        .filter((x): x is string => x !== null)
        .join("; ");
    }
    case "true_false":
      return v === true ? "True" : "False";
    case "matching": {
      const given = Array.isArray(v) ? v : [];
      const done = q.left.filter((_, i) => (given[i] ?? "") !== "").length;
      return `${done} of ${q.left.length} matched`;
    }
    case "blank":
    case "enumeration":
      return oneLine((Array.isArray(v) ? v : [String(v)]).map((x) => x.trim() || "—").join(" · "));
    case "code":
    case "sql": {
      const lines = String(v).trim().split("\n").length;
      return `${lines} ${lines === 1 ? "line" : "lines"} of ${q.type === "sql" ? "SQL" : "code"}`;
    }
    case "drawing": {
      const drawing = parseDrawingAnswer(v);
      const photos = drawing.photos.length;
      return drawing.strokes.length > 0 || drawing.assetId !== null
        ? `Drawing${photos ? ` and ${photos} ${photos === 1 ? "photo" : "photos"}` : ""}`
        : `${photos} ${photos === 1 ? "photo" : "photos"}`;
    }
    default:
      return oneLine(String(v));
  }
}

// One question at a time: why the student on question `from` can't open question `to` (0-based), or null when
// they can. `furthest` is the furthest question they have reached; `current` is the question they are on now.
// Questions whose time ran out never reopen. `free` goes anywhere. `forward_only` only goes on to the next question,
// once this one is answered (or its time is up). `marked_only` goes on the same way (a mark also lets them move on),
// returns to any question while it is marked for review, and back to the furthest one reached.
export function moveRefusal(input: {
  navigation: SessionNavigation;
  from: number;
  to: number;
  furthest: number;
  total: number;
  target: { marked: boolean; closed: boolean };
  current: { answered: boolean; marked: boolean; timeUp: boolean };
}): string | null {
  const { navigation, from, to, furthest, total, target, current } = input;
  if (!Number.isInteger(to) || to < 0 || to >= total) return "That question isn't on your paper.";
  if (to === from) return null;
  const n = to + 1;
  if (target.closed) return `The time for question ${n} ran out, so it can't be opened again.`;
  if (navigation === "free") return null;
  if (navigation === "forward_only") {
    if (to < from) return "This session doesn't let you go back to earlier questions.";
    if (to > from + 1) return "Answer the questions in order: go on to the next question first.";
    return current.answered || current.timeUp ? null : "Answer this question before moving on.";
  }
  if (to < furthest) return target.marked ? null : `You can only go back to questions marked for review. Question ${n} isn't marked.`;
  if (to === furthest) return null;
  if (from < furthest) return `Go on from question ${furthest + 1} first.`;
  if (to > furthest + 1) return "Answer the questions in order: go on to the next question first.";
  return current.answered || current.marked || current.timeUp
    ? null
    : "Answer this question, or mark it for review, before moving on.";
}
