// Everything that changes a quiz in the editor, as plain functions on a `QuizEditing`: adding, moving, removing and
// re-pointing questions, parts, cells of the table, dirty tracking, the one check a quiz passes before it is saved,
// and the input the save takes. The editor page, the question windows, the table view, the question bank and the
// Excel import all go through here, so a rule (a pool's questions share their points, a question added and
// cancelled leaves nothing behind) is written once. The operations on a bare list of parts stay private: nothing
// outside can change a quiz without the bookkeeping. Components keep only what is on screen: open windows, focus,
// drag position.
import { imagesWithoutAlt, markdownImages } from "@examinus/domain/asset";
import { unitCount } from "@examinus/domain/scoring";
import type { Question, QuestionType } from "@examinus/domain/question";
import type { PaperHeader, PaperSettings, QuizSettings } from "@examinus/domain/quiz";
import type { SubjectArea } from "@examinus/domain/roles";
import { kindOf } from "@examinus/domain/kinds";
import { newId } from "@examinus/domain/kinds/editor";
import { partName } from "@examinus/copy/paper";
import { allQuestions, emptyPart, poolPoints, withPoints, type EditorPart, type EditorQuiz } from "./quiz-editor";
import { parseCell, type Col } from "./table-model";

// ── Questions and points, on parts ──────────────────────────────────────────────────────────────────────────

// A pool part's questions all take the same points; others keep theirs.
const withPoolPoints = (part: EditorPart, points = poolPoints(part)): EditorPart =>
  part.poolSize === null ? part : { ...part, questions: part.questions.map((q) => withPoints(q, points)) };

// A part made a pool (drawing as many questions as it has, at least 1) or turned back into an ordinary part.
const withPool = (part: EditorPart, on: boolean): EditorPart =>
  on ? withPoolPoints({ ...part, poolSize: Math.max(1, part.questions.length) }) : { ...part, poolSize: null };

// Adds questions to the end of a part, or at `index`. In a pool they take the pool's points.
function insertQuestions(part: EditorPart, questions: Question[], index = part.questions.length): EditorPart {
  const points = poolPoints(part.questions.length === 0 ? { ...part, questions } : part);
  const list = [...part.questions];
  list.splice(index, 0, ...questions);
  return withPoolPoints({ ...part, questions: list }, points);
}

// Moves a question to a part (at `index`, default the end). Does nothing if the question isn't found.
function moveQuestion(parts: EditorPart[], questionId: string, toPartId: string, index?: number): EditorPart[] {
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

// The parts with a question swapped for its edited version. In a pool, every question follows its new points.
function replaceQuestion(parts: EditorPart[], next: Question): EditorPart[] {
  return parts.map((p) =>
    p.questions.some((x) => x.id === next.id)
      ? withPoolPoints({ ...p, questions: p.questions.map((x) => (x.id === next.id ? next : x)) }, next.points)
      : p,
  );
}

// The parts without the questions with these ids.
const withoutQuestions = (parts: EditorPart[], ids: ReadonlySet<string>): EditorPart[] =>
  parts.map((p) => (p.questions.some((q) => ids.has(q.id)) ? { ...p, questions: p.questions.filter((q) => !ids.has(q.id)) } : p));

// A copy of a question (from the bank, say, or the one above) that can sit in a quiz beside the original.
export const copyOf = (q: Question): Question => ({ ...structuredClone(q), id: newId() });

// ── The check before saving ─────────────────────────────────────────────────────────────────────────────────

// The first thing wrong with a question, or null. Callers add "Question N" in front.
export function validateQuestion(q: Question): string | null {
  if (!q.prompt.trim()) return "has no question text.";
  const noAlt = imagesWithoutAlt(q);
  if (noAlt.length > 0) return `has an image without alt text (${noAlt.join(", ")}). Describe each image so students using a screen reader can follow.`;
  if (q.points <= 0) return "must be worth more than 0 points.";
  if (!Number.isInteger(q.points * 2)) return "can only be worth whole or half points.";
  if ("weights" in q && q.weights && q.weights.length > 0) {
    if (q.weights.length !== unitCount(q) || q.weights.some((w) => !(w >= 0)) || !q.weights.some((w) => w > 0))
      return "has custom weights that don't match its parts. Edit the weights again or switch back to equal shares.";
  }
  return kindOf(q).validate?.(q) ?? null;
}

// What is wrong with the quiz, before it is saved: one message per problem.
export function validateQuiz(a: EditorQuiz): string[] {
  const problems: string[] = [];
  if (!a.title.trim()) problems.push("Add a title.");
  if (markdownImages(a.description).some((m) => !m.alt.trim()))
    problems.push("The quiz instructions have an image without alt text. Describe it, or remove it.");
  const total = allQuestions(a).length;
  if (total === 0) problems.push("Add at least one question.");
  let number = 0;
  a.parts.forEach((part, i) => {
    const name = partName(part.title, i + 1);
    if (!part.title.trim()) problems.push(`${name} needs a title.`);
    if (markdownImages(part.instructions).some((m) => !m.alt.trim()))
      problems.push(`${name}: the instructions have an image without alt text. Describe it, or remove it.`);
    if (part.questions.length === 0 && total > 0) problems.push(`${name} has no questions. Add one or delete the part.`);
    if (part.poolSize !== null) {
      if (!Number.isInteger(part.poolSize) || part.poolSize < 1)
        problems.push(`${name}: a pool must draw at least 1 question.`);
      else if (part.poolSize > part.questions.length)
        problems.push(`${name} draws ${part.poolSize} questions but has only ${part.questions.length}.`);
      const points = [...new Set(part.questions.map((q) => q.points))];
      if (points.length > 1)
        problems.push(`${name} is a pool, so all its questions need equal points (it has ${points.join(", ")}).`);
    }
    for (const q of part.questions) {
      number += 1;
      const problem = validateQuestion(q);
      if (problem) problems.push(`Question ${number} (${name}) ${problem}`);
    }
  });
  return problems;
}

// The first thing wrong with each question that has a problem, by question id: for the warning dots.
export function questionProblems(a: Pick<EditorQuiz, "parts">): Map<string, string> {
  const found = new Map<string, string>();
  for (const q of allQuestions(a)) {
    const problem = validateQuestion(q);
    if (problem) found.set(q.id, problem);
  }
  return found;
}

// Whether the quiz's title or description stops it being saved (the "details" warning).
export const hasDetailsProblem = (a: Pick<EditorQuiz, "title" | "description">): boolean =>
  !a.title.trim() || markdownImages(a.description).some((m) => !m.alt.trim());

// ── A quiz being edited ─────────────────────────────────────────────────────────────────────────────────────

// Appends questions to the end of a quiz's last part (a quiz with no part gets one, "Questions"), each with a
// fresh id. What "Add to quiz" in the question bank does.
export function appendQuestions(quiz: EditorQuiz, questions: Question[]): EditorQuiz {
  const parts = quiz.parts.length > 0 ? quiz.parts : [emptyPart("Questions")];
  const last = parts.length - 1;
  return { ...quiz, parts: parts.map((p, i) => (i === last ? insertQuestions(p, questions.map(copyOf)) : p)) };
}

export type QuizEditing = {
  quiz: EditorQuiz;
  // The quiz as last saved, to tell whether anything changed since.
  saved: string;
  // Questions added through "Add question" and not yet saved from their window: cancelling the window removes
  // them, since nothing of them was ever wanted.
  fresh: readonly string[];
};

export const startEditing = (quiz: EditorQuiz): QuizEditing => ({ quiz, saved: JSON.stringify(quiz), fresh: [] });

export const isDirty = (s: QuizEditing): boolean => JSON.stringify(s.quiz) !== s.saved;

// `quiz` (what was sent) is now what is stored; edits made while it was being saved still count as unsaved.
export const markSaved = (s: QuizEditing, quiz: EditorQuiz): QuizEditing => ({ ...s, saved: JSON.stringify(quiz) });

// The quiz to send to the server, or what stops it being saved.
export const forSave = (s: QuizEditing): { quiz: EditorQuiz } | { problems: string[] } => {
  const problems = validateQuiz(s.quiz);
  return problems.length > 0 ? { problems } : { quiz: s.quiz };
};

const withQuiz = (s: QuizEditing, quiz: EditorQuiz): QuizEditing => ({ ...s, quiz });
// A question that is gone (removed, or its part deleted) is no longer fresh.
const withParts = (s: QuizEditing, fn: (parts: EditorPart[]) => EditorPart[]): QuizEditing => {
  const parts = fn(s.quiz.parts);
  const present = new Set(parts.flatMap((p) => p.questions.map((q) => q.id)));
  return { ...s, quiz: { ...s.quiz, parts }, fresh: s.fresh.filter((id) => present.has(id)) };
};
const withPart = (s: QuizEditing, partId: string, fn: (part: EditorPart) => EditorPart): QuizEditing =>
  withParts(s, (parts) => parts.map((p) => (p.id === partId ? fn(p) : p)));

export const setTitleAndSubject = (
  s: QuizEditing,
  d: { title: string; description: string; subject?: string; subjectArea: SubjectArea },
): QuizEditing => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { subject: _previous, ...rest } = s.quiz;
  return withQuiz(s, { ...rest, title: d.title, description: d.description, subjectArea: d.subjectArea, ...(d.subject ? { subject: d.subject } : {}) });
};
export const setSettings = (s: QuizEditing, patch: Partial<QuizSettings>): QuizEditing =>
  withQuiz(s, { ...s.quiz, settings: { ...s.quiz.settings, ...patch } });
export const setHeader = (s: QuizEditing, patch: Partial<PaperHeader>): QuizEditing =>
  withQuiz(s, { ...s.quiz, header: { ...s.quiz.header, ...patch } });
export const setPaper = (s: QuizEditing, patch: Partial<PaperSettings>): QuizEditing =>
  withQuiz(s, { ...s.quiz, paper: { ...s.quiz.paper, ...patch } });

// Parts.
export const addPart = (s: QuizEditing, part: EditorPart): QuizEditing => withParts(s, (parts) => [...parts, part]);
export const updatePart = (s: QuizEditing, partId: string, part: EditorPart): QuizEditing => withPart(s, partId, () => part);

export function movePart(s: QuizEditing, index: number, delta: -1 | 1): QuizEditing {
  return withParts(s, (parts) => {
    if (!parts[index] || !parts[index + delta]) return parts;
    const next = [...parts];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    return next;
  });
}

// Deleting a part either drops its questions ("remove") or keeps them ("move"): into the part before it, at its end;
// a first part's questions go to the start of the next one.
export function deletePart(s: QuizEditing, index: number, mode: "move" | "remove"): QuizEditing {
  return withParts(s, (parts) => {
    const gone = parts[index];
    if (!gone) return parts;
    const rest = parts.filter((_, i) => i !== index);
    if (mode === "remove" || gone.questions.length === 0) return rest;
    const toPrevious = index > 0;
    const targetIndex = toPrevious ? index - 1 : 0;
    return rest.map((p, i) => (i === targetIndex ? insertQuestions(p, [...gone.questions], toPrevious ? undefined : 0) : p));
  });
}

// Questions. A single question added this way is "fresh": the editor opens it in its window, and cancelling there
// takes it out again. A batch (from the AI, the Excel import) just lands in the part.
export function addQuestions(s: QuizEditing, partId: string, questions: Question[]): QuizEditing {
  const next = withPart(s, partId, (p) => insertQuestions(p, questions));
  return questions.length === 1 ? { ...next, fresh: [...s.fresh, questions[0]!.id] } : next;
}

// The Excel import: added to the part, or in place of what it held.
export function importQuestions(s: QuizEditing, partId: string, questions: Question[], mode: "add" | "replace"): QuizEditing {
  return withPart(s, partId, (p) => insertQuestions(mode === "replace" ? { ...p, questions: [] } : p, questions));
}

// A copy of the question right below it.
export function duplicateQuestion(s: QuizEditing, partId: string, index: number): QuizEditing {
  return withPart(s, partId, (p) => (p.questions[index] ? insertQuestions(p, [copyOf(p.questions[index]!)], index + 1) : p));
}

export const removeQuestion = (s: QuizEditing, questionId: string): QuizEditing => removeQuestions(s, [questionId]);

export const removeQuestions = (s: QuizEditing, questionIds: Iterable<string>): QuizEditing => {
  const ids = new Set(questionIds);
  return withParts(s, (parts) => withoutQuestions(parts, ids));
};

// The one move: dragging a question, the move menu and the table's bulk move all land here. `index` is where among
// the part's questions it goes (default the end).
export const moveQuestionTo = (s: QuizEditing, questionId: string, partId: string, index?: number): QuizEditing =>
  withParts(s, (parts) => moveQuestion(parts, questionId, partId, index));

// Several questions to the end of a part, in the order given.
export const moveQuestionsTo = (s: QuizEditing, questionIds: readonly string[], partId: string): QuizEditing =>
  questionIds.reduce((next, id) => moveQuestionTo(next, id, partId), s);

// One step up or down: within the part, and past its edge into the neighbouring part.
export function stepQuestion(s: QuizEditing, questionId: string, delta: -1 | 1): QuizEditing {
  const parts = s.quiz.parts;
  const pi = parts.findIndex((p) => p.questions.some((q) => q.id === questionId));
  if (pi < 0) return s;
  const part = parts[pi]!;
  const qi = part.questions.findIndex((q) => q.id === questionId);
  if (delta === -1) {
    if (qi > 0) return moveQuestionTo(s, questionId, part.id, qi - 1);
    const previous = parts[pi - 1];
    return previous ? moveQuestionTo(s, questionId, previous.id) : s;
  }
  if (qi < part.questions.length - 1) return moveQuestionTo(s, questionId, part.id, qi + 2);
  const next = parts[pi + 1];
  return next ? moveQuestionTo(s, questionId, next.id, 0) : s;
}

export type CellEdit = { questionId: string; col: Col; text: string };

// Types text into cells of the table. Each cell that parses is applied (a pool's questions follow a change of
// points) and counted in `applied`; the others are named in `errors`, one message each, and change nothing. An
// edited question counts as kept: cancelling a window will not take it out.
export function editCells(s: QuizEditing, edits: readonly CellEdit[]): { state: QuizEditing; applied: number; errors: string[] } {
  let parts = s.quiz.parts;
  const errors: string[] = [];
  const kept = new Set<string>();
  let applied = 0;
  for (const e of edits) {
    const q = parts.flatMap((p) => p.questions).find((x) => x.id === e.questionId);
    if (!q) {
      errors.push("That question is gone.");
      continue;
    }
    const result = parseCell(q, e.col, e.text);
    if ("error" in result) errors.push(result.error);
    else {
      parts = replaceQuestion(parts, result.question);
      kept.add(e.questionId);
      applied += 1;
    }
  }
  if (applied === 0) return { state: s, applied, errors };
  const next = withParts(s, () => parts);
  return { state: { ...next, fresh: next.fresh.filter((id) => !kept.has(id)) }, applied, errors };
}

// "Save question" in the question window: the edited question replaces the old one and is no longer fresh.
export const saveQuestion = (s: QuizEditing, next: Question): QuizEditing => ({
  ...withParts(s, (parts) => replaceQuestion(parts, next)),
  fresh: s.fresh.filter((id) => id !== next.id),
});

// Cancel in the question window: a fresh question goes away, one that was already in the quiz stays as it was.
export const cancelQuestion = (s: QuizEditing, questionId: string): QuizEditing =>
  s.fresh.includes(questionId) ? removeQuestion(s, questionId) : s;

// Pools. A pool draws as many questions as the part has, and all its questions share one worth.
export const setPool = (s: QuizEditing, partId: string, on: boolean): QuizEditing => withPart(s, partId, (p) => withPool(p, on));
export const setPoolPoints = (s: QuizEditing, partId: string, points: number): QuizEditing =>
  withPart(s, partId, (p) => withPoolPoints(p, points));

// Points.
export const setPartPoints = (s: QuizEditing, partId: string, points: number): QuizEditing =>
  withPart(s, partId, (p) => ({ ...p, questions: p.questions.map((q) => withPoints(q, points)) }));

// Questions in pool parts follow their part, so a type's bulk points skip them.
export const setTypePoints = (s: QuizEditing, type: QuestionType, points: number): QuizEditing =>
  withParts(s, (parts) =>
    parts.map((p) => (p.poolSize !== null ? p : { ...p, questions: p.questions.map((q) => (q.type === type ? withPoints(q, points) : q)) })),
  );
