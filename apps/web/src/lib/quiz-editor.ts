// The editor works on one flat list of questions and prints one paper part per question type; the API stores
// a quiz as parts with questions. These two functions convert between the shapes without losing anything.
import type { PaperHeader, PaperSettings, Question, QuestionType, QuizDetail, QuizDraft, QuizSettings, SubjectArea } from "@examora/contract";
import { defaultPart, partOrder } from "./paper-parts";
import type { PaperKind, PartSettings } from "./types";

export type EditorQuiz = {
  // "new" until the first save.
  id: string;
  title: string;
  description: string;
  subject?: string;
  subjectArea?: SubjectArea;
  header: PaperHeader;
  // Each question type is printed as one part. Empty values fall back to the defaults.
  paper: PaperSettings & { parts: Partial<Record<QuestionType, PartSettings>> };
  questions: Question[];
  settings: QuizSettings;
  // The API's part ids by question type, so saving updates the parts in place.
  partIds: Partial<Record<QuestionType, string>>;
};

// A paper with a grading period is an exam; the rest print as quizzes.
export const paperKind = (header: PaperHeader): PaperKind => (header.period ? "exam" : "quiz");

export function toEditorQuiz({ quiz, parts }: QuizDetail): EditorQuiz {
  const { header, paper, settings } = quiz;
  const customParts: EditorQuiz["paper"]["parts"] = {};
  const partIds: EditorQuiz["partIds"] = {};
  for (const part of parts) {
    const type = part.questions[0]?.type;
    if (!type || partIds[type]) continue;
    partIds[type] = part.id;
    // A heading or instructions equal to a default stay empty, so they keep following the default.
    const defaults = [defaultPart(type, false), defaultPart(type, true)];
    customParts[type] = {
      title: defaults.some((d) => d.title === part.title) ? "" : part.title,
      instructions: defaults.some((d) => d.instructions === part.instructions) ? "" : part.instructions,
    };
  }
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    ...(quiz.subject === null ? {} : { subject: quiz.subject }),
    ...(quiz.subjectArea === null ? {} : { subjectArea: quiz.subjectArea }),
    header,
    paper: { ...paper, parts: customParts },
    questions: parts.flatMap((p) => p.questions),
    settings,
    partIds,
  };
}

export function toDraft(q: EditorQuiz): QuizDraft {
  const { parts: customParts, ...paper } = q.paper;
  const parts = partOrder
    .map((type) => ({ type, questions: q.questions.filter((x) => x.type === type) }))
    .filter((p) => p.questions.length > 0)
    .map(({ type, questions }) => {
      const fallback = defaultPart(type, paper.answerSheet);
      return {
        id: q.partIds[type] ?? `new-${type}`,
        title: customParts[type]?.title.trim() || fallback.title,
        instructions: customParts[type]?.instructions.trim() || fallback.instructions,
        shuffleQuestions: q.settings.shuffleQuestions,
        poolSize: null,
        questions,
      };
    });
  return {
    ...(q.id === "new" ? {} : { id: q.id }),
    title: q.title,
    description: q.description,
    subject: q.subject ?? null,
    subjectArea: q.subjectArea ?? null,
    header: q.header,
    paper,
    settings: q.settings,
    parts,
  };
}
