// Quiz rows as contract types. Pure: the row types are the only thing taken from the database layer.
import type { Question, Quiz, QuizPart } from "@examinus/contract";
import type { QuestionItem, QuizItem, QuizPartItem } from "../../database/schemas/index.ts";

export const toQuiz = (r: QuizItem): Quiz => ({
  id: r.id,
  ownerId: r.ownerId,
  title: r.title,
  description: r.description,
  subject: r.subject,
  subjectArea: r.subjectArea,
  header: r.header,
  paper: r.paper,
  settings: r.settings,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const toPart = (r: QuizPartItem): QuizPart => ({
  id: r.id,
  quizId: r.quizId,
  position: r.position,
  title: r.title,
  instructions: r.instructions,
  shuffleQuestions: r.shuffleQuestions,
  poolSize: r.poolSize,
});

// The body holds the type-specific fields (and `type`); the base fields have their own columns.
export const toQuestion = (r: QuestionItem): Question =>
  ({
    id: r.id,
    prompt: r.prompt,
    points: r.points,
    gamePoints: r.gamePoints,
    partialCredit: r.partialCredit,
    ...(r.topic === null ? {} : { topic: r.topic }),
    ...r.body,
  }) as Question;
