// Question schemas. Every question type has three shapes:
//   - the teacher's question, with the answers (`Question`);
//   - its `body`: the type-specific part, stored as jsonb in the database (`QuestionBody`);
//   - the student's question, with every answer removed (`StudentQuestion`, made by `toStudentQuestion`).
// The shapes of each type, and everything else that differs between types, live in its module in `./kinds/`. A new
// type is added by writing that module, then listing the type in `questionTypes`, the three unions below and the
// registry (`./kinds/index.ts`); nothing else changes.
import { Schema } from "effect";
import { CategorizationBody, CategorizationQuestion, StudentCategorizationQuestion } from "./kinds/categorization.ts";
import { BlankBody, BlankQuestion, StudentBlankQuestion } from "./kinds/blank.ts";
import { CodeBody, CodeQuestion, StudentCodeQuestion } from "./kinds/code.ts";
import { DrawingBody, DrawingQuestion, StudentDrawingQuestion } from "./kinds/drawing.ts";
import { EnumerationBody, EnumerationQuestion, StudentEnumerationQuestion } from "./kinds/enumeration.ts";
import { EssayBody, EssayQuestion, StudentEssayQuestion } from "./kinds/essay.ts";
import { HotspotBody, HotspotQuestion, StudentHotspotQuestion } from "./kinds/hotspot.ts";
import { kindOf } from "./kinds/index.ts";
import { MatchingBody, MatchingQuestion, StudentMatchingQuestion } from "./kinds/matching.ts";
import { MultipleChoiceBody, MultipleChoiceQuestion, StudentMultipleChoiceQuestion } from "./kinds/multiple-choice.ts";
import { NumericBody, NumericQuestion, StudentNumericQuestion } from "./kinds/numeric.ts";
import { OrderingBody, OrderingQuestion, StudentOrderingQuestion } from "./kinds/ordering.ts";
import { SqlBody, SqlQuestion, StudentSqlQuestion } from "./kinds/sql.ts";
import { StudentTrueFalseQuestion, TrueFalseBody, TrueFalseQuestion } from "./kinds/true-false.ts";

export const questionTypes = [
  "multiple_choice",
  "true_false",
  "blank",
  "matching",
  "enumeration",
  "numeric",
  "essay",
  "code",
  "sql",
  "drawing",
  "categorization",
  "ordering",
  "hotspot",
] as const;
export const QuestionType = Schema.Literals(questionTypes);
export type QuestionType = typeof QuestionType.Type;

// What the database stores in `questions.body` (the base fields have their own columns).
export const QuestionBody = Schema.Union([
  MultipleChoiceBody,
  TrueFalseBody,
  BlankBody,
  MatchingBody,
  EnumerationBody,
  NumericBody,
  EssayBody,
  CodeBody,
  SqlBody,
  DrawingBody,
  CategorizationBody,
  OrderingBody,
  HotspotBody,
]);
export type QuestionBody = typeof QuestionBody.Type;

export const Question = Schema.Union([
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  BlankQuestion,
  MatchingQuestion,
  EnumerationQuestion,
  NumericQuestion,
  EssayQuestion,
  CodeQuestion,
  SqlQuestion,
  DrawingQuestion,
  CategorizationQuestion,
  OrderingQuestion,
  HotspotQuestion,
]);
export type Question = typeof Question.Type;

// The same questions with every answer removed.
export const StudentQuestion = Schema.Union([
  StudentMultipleChoiceQuestion,
  StudentTrueFalseQuestion,
  StudentBlankQuestion,
  StudentMatchingQuestion,
  StudentEnumerationQuestion,
  StudentNumericQuestion,
  StudentEssayQuestion,
  StudentCodeQuestion,
  StudentSqlQuestion,
  StudentDrawingQuestion,
  StudentCategorizationQuestion,
  StudentOrderingQuestion,
  StudentHotspotQuestion,
]);
export type StudentQuestion = typeof StudentQuestion.Type;

// The question as a student may see it. With `random`, the lists students pick from (cloze dropdowns and word
// bank, categorization items) are shuffled; without it they are sorted or left as they are, so their order never
// gives an answer away.
export const toStudentQuestion = (q: Question, random?: () => number): StudentQuestion => kindOf(q).toStudent(q, random);
