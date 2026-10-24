// What the question editor needs to know about a type besides how to draw it: how a new question starts, what makes
// one invalid, how its units are scored, what the table's cells show, and how a spreadsheet row becomes one. Each
// type's model is in `models/<type>.ts`; this table lists them. No React in the models, so the pure code
// around the editor (`features/quiz/question-defaults.ts`, `question-import.ts`, `quiz-editor.ts`) can use them.
import type { Question, QuestionType } from "@examinus/domain/question";
import type { AnswerHeading } from "./editor-shared.ts";
import { blankModel } from "./models/blank.ts";
import { categorizationModel } from "./models/categorization.ts";
import { codeModel } from "./models/code.ts";
import { drawingModel } from "./models/drawing.ts";
import { enumerationModel } from "./models/enumeration.ts";
import { essayModel } from "./models/essay.ts";
import { hotspotModel } from "./models/hotspot.ts";
import { matchingModel } from "./models/matching.ts";
import { multipleChoiceModel } from "./models/multiple-choice.ts";
import { numericModel } from "./models/numeric.ts";
import { orderingModel } from "./models/ordering.ts";
import { sqlModel } from "./models/sql.ts";
import { trueFalseModel } from "./models/true-false.ts";

type OfType<T extends QuestionType> = Extract<Question, { type: T }>;

export type Parsed<Q> = { question: Q } | { error: string };

// The Answer column of the table, for the types whose answer fits in a cell. The others open the full editor.
export type AnswerCell<Q> = {
  // Missing: always.
  editable?(q: Q): boolean;
  // What the cell starts with when edited, and what copies out of it.
  text(q: Q): string;
  // What typed or pasted text does to the question.
  parse(q: Q, text: string): Parsed<Q>;
  // The cell is a dropdown of these [value, label] pairs instead of typed text.
  options?: readonly (readonly [string, string])[];
  // The cell holds a number: right-aligned, with a decimal keypad.
  numeric?: true;
};

// One row of an imported spreadsheet, read by the columns of the import template.
export type SheetRow = {
  prompt: string;
  points: number;
  // The Points cell as typed; empty when the row has none.
  rawPoints: string;
  // The fields every question has, filled in from the row.
  base: { id: string; prompt: string; points: number; topic?: string; gamePoints: "standard"; partialCredit: true };
  // The Correct Answer cell, and the Option cells that are filled in.
  answer: string;
  options: string[];
  // The option a number in Correct Answer names ("2" is the Option 2 cell), or null when it isn't a number or names a blank cell.
  optionByNumber(answer: string): string | null;
  // Any other cell of the row, by its column name.
  at(column: string): string;
};

export type EditorModel<T extends QuestionType> = {
  readonly type: T;
  // A new question of the type, ready for the teacher to fill in.
  create(id?: string): OfType<T>;
  // What is wrong with a question of this type beyond what every question needs, or null. Callers add "Question N".
  validate?(q: OfType<T>): string | null;
  // The hint in the empty question text.
  promptPlaceholder: string | ((q: OfType<T>) => string);
  // The question text marks blanks with {{…}}.
  readonly promptBlanks?: true;
  // The heading above the answer's editor.
  readonly answer: AnswerHeading;
  // What the points are split over, named in the weights list. `labels`: the units have weights the teacher may set.
  readonly unit?: { noun: string; labels?(q: OfType<T>): string[] };
  // Whether the Partial credit switch makes sense for the question, and what it does when on (default: each unit's share).
  readonly partialCredit?: { applies(q: OfType<T>): boolean; hint?: string };
  // The answer in a few words: what the table's Answer column shows.
  summary(q: OfType<T>): string;
  readonly answerCell?: AnswerCell<OfType<T>>;
  // The question with new points; types with a rubric scale its rows to match. Missing: only the points change.
  rescale?(q: OfType<T>, points: number): OfType<T>;
  // The spreadsheet import: the type names a row may carry, and how a row becomes a question. Missing: not importable.
  readonly sheet?: {
    aliases: readonly string[];
    // The points of a row without any. Missing: 1.
    defaultPoints?: number;
    parse(row: SheetRow): OfType<T> | { error: string };
  };
};

// Every question type's editor model. A type missing here is a compile error.
export const editorModels: { readonly [T in QuestionType]: EditorModel<T> } = {
  multiple_choice: multipleChoiceModel,
  true_false: trueFalseModel,
  blank: blankModel,
  matching: matchingModel,
  enumeration: enumerationModel,
  numeric: numericModel,
  essay: essayModel,
  code: codeModel,
  sql: sqlModel,
  drawing: drawingModel,
  categorization: categorizationModel,
  ordering: orderingModel,
  hotspot: hotspotModel,
};

// The model of a question's type. TypeScript can't see that the model found by `q.type` is the one that takes `q`,
// hence the one cast.
export const modelOf = (q: { readonly type: QuestionType }): EditorModel<QuestionType> =>
  editorModels[q.type] as unknown as EditorModel<QuestionType>;
