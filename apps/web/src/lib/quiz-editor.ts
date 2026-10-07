// The editor works on the quiz the way the API stores it: parts (each with markdown instructions, shuffle and
// pool settings) holding questions. These functions convert to and from the API's shapes.
import {
  blankAnswers,
  quizTotals,
  type PaperHeader,
  type PaperSettings,
  type Question,
  type QuizDetail,
  type QuizDraft,
  type QuizDraftPart,
  type QuizSettings,
  type SubjectArea,
  blankStyle,
} from "@examora/contract";
import type { PaperKind } from "./types";

export type EditorPart = QuizDraftPart;

export type EditorQuiz = {
  // "new" until the first save.
  id: string;
  title: string;
  description: string;
  subject?: string;
  subjectArea?: SubjectArea;
  header: PaperHeader;
  paper: PaperSettings;
  settings: QuizSettings;
  parts: EditorPart[];
};

// A paper with a grading period is an exam; the rest print as quizzes.
export const paperKind = (header: PaperHeader): PaperKind => (header.period ? "exam" : "quiz");

export function toEditorQuiz({ quiz, parts }: QuizDetail): EditorQuiz {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    ...(quiz.subject === null ? {} : { subject: quiz.subject }),
    ...(quiz.subjectArea === null ? {} : { subjectArea: quiz.subjectArea }),
    header: quiz.header,
    paper: quiz.paper,
    settings: quiz.settings,
    parts: parts.map((p) => ({
      id: p.id,
      title: p.title,
      instructions: p.instructions,
      shuffleQuestions: p.shuffleQuestions,
      poolSize: p.poolSize,
      questions: [...p.questions],
    })),
  };
}

export function toDraft(q: EditorQuiz): QuizDraft {
  return {
    ...(q.id === "new" ? {} : { id: q.id }),
    title: q.title,
    description: q.description,
    subject: q.subject ?? null,
    subjectArea: q.subjectArea ?? null,
    header: q.header,
    paper: q.paper,
    settings: q.settings,
    parts: q.parts,
  };
}

// A part's or question's id until the API assigns one.
export const newLocalId = (prefix: string) => `new-${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const emptyPart = (title: string): EditorPart => ({
  id: newLocalId("part"),
  title,
  instructions: "",
  shuffleQuestions: false,
  poolSize: null,
  questions: [],
});

export const allQuestions = (q: Pick<EditorQuiz, "parts">): Question[] => q.parts.flatMap((p) => p.questions);

// What a student's paper holds from one part: a pool counts as its draw size.
export const partTotals = (part: EditorPart) => quizTotals([part]);

// Questions and points of a student's whole paper.
export const quizPaperTotals = (q: Pick<EditorQuiz, "parts">) => quizTotals(q.parts);

const roundHalf = (n: number) => Math.round(n * 2) / 2;

// The question with new points. An essay or drawing rubric is scaled so its rows still add up to the points.
export function withPoints(q: Question, points: number): Question {
  if (q.points === points) return q;
  if ((q.type !== "essay" && q.type !== "drawing") || q.rubric.length === 0) return { ...q, points };
  const ratio = points / q.points;
  let before = 0;
  let cumulative = 0;
  const rubric = q.rubric.map((row) => {
    cumulative += row.points;
    const target = roundHalf(cumulative * ratio);
    const scaled = { ...row, points: target - before };
    before = target;
    return scaled;
  });
  const last = rubric.length - 1;
  rubric[last] = { ...rubric[last]!, points: rubric[last]!.points + (points - before) };
  return { ...q, points, rubric };
}

// What every question of a pool part is worth.
export const poolPoints = (part: EditorPart) => part.questions[0]?.points ?? 1;

// A pool part's questions all take the same points; others keep theirs.
export const withPoolPoints = (part: EditorPart, points = poolPoints(part)): EditorPart =>
  part.poolSize === null ? part : { ...part, questions: part.questions.map((q) => withPoints(q, points)) };

// Adds questions to the end of a part, or at `index`. In a pool they take the pool's points.
export function insertQuestions(part: EditorPart, questions: Question[], index = part.questions.length): EditorPart {
  const points = poolPoints(part.questions.length === 0 ? { ...part, questions } : part);
  const list = [...part.questions];
  list.splice(index, 0, ...questions);
  return withPoolPoints({ ...part, questions: list }, points);
}

// Moves a question to a part (at `index`, default the end). Does nothing if the question isn't found.
export function moveQuestion(parts: EditorPart[], questionId: string, toPartId: string, index?: number): EditorPart[] {
  const from = parts.find((p) => p.questions.some((q) => q.id === questionId));
  const question = from?.questions.find((q) => q.id === questionId);
  if (!from || !question || !parts.some((p) => p.id === toPartId)) return parts;
  const fromIndex = from.questions.indexOf(question);
  // Dropping within the same part shifts the target left by one when the question came from above it.
  const target = index !== undefined && from.id === toPartId && fromIndex < index ? index - 1 : index;
  return parts.map((p) => {
    const rest = p.id === from.id ? { ...p, questions: p.questions.filter((q) => q.id !== questionId) } : p;
    return p.id === toPartId ? insertQuestions(rest, [question], target) : rest;
  });
}

// "Part II – Matching" from the part's number and title. A title that already starts with "Part …" is kept as
// it is, so "Part I" or "Part I – Basics" never prints as "Part I – Part I".
export function partHeading(title: string, number: number): string {
  const name = title.trim();
  if (/^part\s+([ivxlc]+|\d+)\b/i.test(name)) return name;
  return name ? `Part ${roman(number)} – ${name}` : `Part ${roman(number)}`;
}

// Roman numeral for "Part IV".
export function roman(n: number): string {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, symbol] of table) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
}

// A part's name wherever the editor lists parts: its title, or "Part 2" while it has none.
export const partName = (part: Pick<EditorPart, "title">, index: number) => part.title.trim() || `Part ${index + 1}`;

// The text of some markdown without its marks, on one line: for previews and the table.
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) => (alt ? `[${alt}]` : "[image]"))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "\u0000")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\u0000/g, "____")
    .replace(/\s+/g, " ")
    .trim();
}

const letter = (i: number) => String.fromCharCode(65 + i);

// The answer a question has, in a few words: what the table's Answer column shows.
export function answerSummary(q: Question): string {
  switch (q.type) {
    case "multiple_choice": {
      const correct = q.choices.flatMap((c, i) => (q.correctChoiceIds.includes(c.id) ? [`${letter(i)}. ${plainText(c.text) || (c.imageId ? "(picture)" : "(empty)")}`] : []));
      return correct.join("; ");
    }
    case "true_false":
      return q.answer ? "True" : "False";
    case "blank":
      return blankStyle(q) === "single"
        ? q.acceptedAnswers.filter(Boolean).join(" / ")
        : blankAnswers(q.prompt).map((a) => a.join(" / ")).join("; ");
    case "numeric":
      return `${q.answer}${q.tolerance ? ` ±${q.tolerance}` : ""}${q.unit ? ` ${q.unit}` : ""}`;
    case "enumeration":
      return q.items.filter(Boolean).join("; ");
    case "matching":
      return `${q.left.length} pairs`;
    case "essay":
      return q.rubric.length > 0 ? `Rubric: ${q.rubric.length} rows` : "Graded by the teacher";
    case "drawing":
      return q.rubric.length > 0 ? `Rubric: ${q.rubric.length} rows` : "Graded by the teacher";
    case "code":
      return `${q.language} · ${q.tests.length} ${q.tests.length === 1 ? "test" : "tests"}`;
    case "sql":
      return q.answerSql.trim() ? plainText(q.answerSql).slice(0, 80) : "No answer query";
  }
}

// Whether the table lets the teacher type the answer into the cell; the other types open the full editor.
export function answerEditableInTable(q: Question): boolean {
  return q.type === "multiple_choice" || q.type === "true_false" || q.type === "numeric" || q.type === "enumeration" || (q.type === "blank" && blankStyle(q) === "single");
}
