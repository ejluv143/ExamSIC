// The editor works on the quiz the way the API stores it: parts (each with markdown instructions, shuffle and
// pool settings) holding questions. These functions convert to and from the API's shapes.
import { type QuizDetail, type QuizDraft, type QuizDraftPart } from "@examinus/contract/quiz";
import { type Question } from "@examinus/domain/question";
import { type PaperHeader, type PaperSettings, type QuizSettings } from "@examinus/domain/quiz";
import { type SubjectArea } from "@examinus/domain/roles";
import { quizTotals } from "@examinus/domain/shuffle";
import { kindOf } from "@examinus/domain/kinds";
import type { PaperKind } from "@/lib/format";

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

// A part's name wherever the editor lists parts: its title, or "Part 2" while it has none.
export const partName = (part: Pick<EditorPart, "title">, index: number) => part.title.trim() || `Part ${index + 1}`;

// The answer a question has, in a few words: what the table's Answer column shows.
export const answerSummary = (q: Question): string => kindOf(q).editor.summary(q);

// Whether the table lets the teacher type the answer into the cell; the other types open the full editor.
export function answerEditableInTable(q: Question): boolean {
  const cell = kindOf(q).editor.answerCell;
  return cell !== undefined && (cell.editable?.(q) ?? true);
}
