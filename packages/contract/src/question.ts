// Question schemas. Every question type has three shapes:
//   - the teacher's question, with the answers (`Question`);
//   - its `body`: the type-specific part, stored as jsonb in the database (`QuestionBody`);
//   - the student's question, with every answer removed (`StudentQuestion`, made by `toStudentQuestion`).
// A new type is added by writing its fields, body, question and student question, then listing them in
// `questionTypes` and the three unions below; nothing else changes.
import { Schema } from "effect";
import { blankAnswers, blankCount, emptyBlanks } from "./blanks.ts";
import { idRandom, shuffled, shuffledNotSorted } from "./shuffle.ts";

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

export const codeLanguages = ["python", "java", "cpp", "c", "javascript", "php"] as const;
export const CodeLanguage = Schema.Literals(codeLanguages);
export type CodeLanguage = typeof CodeLanguage.Type;

// Whole or half points, e.g. 0.5, 1, 2.
export const Points = Schema.Number.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isMultipleOf(0.5, { message: "Points are whole or half points" }),
);

// Standard is worth 1000 in a game, double 2000, none is practice. Separate from the question's grading points.
export const GamePoints = Schema.Literals(["standard", "double", "none"]);
export type GamePoints = typeof GamePoints.Type;

// What every student question carries, whatever its type. `prompt` is markdown.
const studentBase = {
  id: Schema.String,
  prompt: Schema.String,
  points: Points,
  topic: Schema.optionalKey(Schema.String),
};

// What every teacher question carries. `partialCredit`: part of the points for part of the answer
// (each blank, pair, item, test or choice), or all of them only for a fully correct answer.
const base = {
  ...studentBase,
  gamePoints: GamePoints,
  partialCredit: Schema.Boolean,
  // Markdown shown after an answer in mastery mode (and with the results). Missing: none.
  explanation: Schema.optionalKey(Schema.String),
};

// Points per blank, pair, item or test, in order. Missing or empty: equal shares.
const weights = { weights: Schema.optionalKey(Schema.Array(Schema.Number)) };

// `text` is markdown. `imageId` is an uploaded image (an asset id) shown with, or instead of, the text; `alt`
// describes it for screen readers and the printed paper, and is required whenever there is an image.
const image = { imageId: Schema.optionalKey(Schema.String), alt: Schema.optionalKey(Schema.String) };
export const Choice = Schema.Struct({ id: Schema.String, text: Schema.String, ...image });
export type Choice = typeof Choice.Type;

export const blankModes = ["fill", "cloze"] as const;
export const BlankMode = Schema.Literals(blankModes);
export type BlankMode = typeof BlankMode.Type;

// How students fill the blanks of a cloze passage.
export const clozeInputs = ["typed", "dropdown", "bank"] as const;
export const ClozeInput = Schema.Literals(clozeInputs);
export type ClozeInput = typeof ClozeInput.Type;

// One line of an essay rubric; the points of all rows add up to the question's points.
export const RubricRow = Schema.Struct({ id: Schema.String, criterion: Schema.String, points: Points });
export type RubricRow = typeof RubricRow.Type;

// An item of one matching column. `text` is markdown.
export const MatchItem = Schema.Struct({ id: Schema.String, text: Schema.String, ...image });
export type MatchItem = typeof MatchItem.Type;

// A left item and the id of the right item it goes with. Several left items may share a right item.
export const MatchLeft = Schema.Struct({ id: Schema.String, text: Schema.String, rightId: Schema.String, ...image });
export type MatchLeft = typeof MatchLeft.Type;

// A category of a categorization question. `description` is markdown, shown under the name. May be missing.
export const Category = Schema.Struct({ id: Schema.String, name: Schema.String, description: Schema.optionalKey(Schema.String) });
export type Category = typeof Category.Type;

// An item students sort into categories. `categoryId`: the category it belongs to, or null for a distractor that
// belongs to none (it is right when left unsorted).
export const CategoryItem = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  categoryId: Schema.NullOr(Schema.String),
  ...image,
});
export type CategoryItem = typeof CategoryItem.Type;

// A correct area of a hotspot image, in coordinates from 0 to 1 across the image's width and height: the top-left
// corner (`x`, `y`) and the size (`w`, `h`). An ellipse is the one that fits inside that box (a circle on a square one).
export const hotspotShapes = ["rect", "ellipse"] as const;
export const HotspotShape = Schema.Literals(hotspotShapes);
export type HotspotShape = typeof HotspotShape.Type;
export const HotspotRegion = Schema.Struct({
  id: Schema.String,
  shape: HotspotShape,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
  label: Schema.optionalKey(Schema.String),
});
export type HotspotRegion = typeof HotspotRegion.Type;

// The program reads `input` from standard input and must print `expectedOutput`.
// Hidden tests are never sent to students, so they can't hard-code the answers.
export const CodeTestCase = Schema.Struct({
  id: Schema.String,
  input: Schema.String,
  expectedOutput: Schema.String,
  hidden: Schema.Boolean,
});
export type CodeTestCase = typeof CodeTestCase.Type;

// `expected` is filled in for SQL checks, where the expected rows come from running the answer query.
export const CodeTestResult = Schema.Struct({
  testId: Schema.String,
  passed: Schema.Boolean,
  output: Schema.String,
  error: Schema.optionalKey(Schema.String),
  expected: Schema.optionalKey(Schema.String),
});
export type CodeTestResult = typeof CodeTestResult.Type;

// What the answer query returns on the sample data, shown to students as the expected result.
export const SqlSampleResult = Schema.Struct({
  columns: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Array(Schema.NullOr(Schema.Union([Schema.String, Schema.Number])))),
});
export type SqlSampleResult = typeof SqlSampleResult.Type;

// --- Type-specific fields, with the answers (teacher) ---

const multipleChoiceFields = {
  choices: Schema.Array(Choice),
  // One id, unless multipleCorrect: then students tick every correct choice.
  correctChoiceIds: Schema.Array(Schema.String),
  multipleCorrect: Schema.Boolean,
};

const trueFalseFields = { answer: Schema.Boolean };

// Blanks live in the markdown prompt as {{answer}} or {{answer|alternative}}, compared case-insensitively
// unless caseSensitive. A `fill` question with no blanks in the prompt is an identification: one answer box
// after it, and any of `acceptedAnswers` is correct. With blanks they are answered inline and `acceptedAnswers`
// is unused. `cloze` takes its answers from the prompt; cloze blanks are
// typed, picked from a dropdown (the first answer plus that blank's `wrongOptions`) or picked from one shared
// word bank (every blank's first answer plus `extraWords`).
const blankFields = {
  mode: BlankMode,
  caseSensitive: Schema.Boolean,
  acceptedAnswers: Schema.Array(Schema.String),
  clozeInput: ClozeInput,
  wrongOptions: Schema.Array(Schema.Array(Schema.String)),
  extraWords: Schema.Array(Schema.String),
  ...weights,
};

// Students pair each left item with one right item (the right column may hold extra wrong options).
const matchingFields = {
  left: Schema.Array(MatchLeft),
  right: Schema.Array(MatchItem),
  ...weights,
};

// Students list items.length answers. Each item may hold alternatives as "1NF|First Normal Form".
const enumerationFields = {
  items: Schema.Array(Schema.String),
  orderMatters: Schema.Boolean,
  caseSensitive: Schema.Boolean,
  ...weights,
};

// Students type a number (decimals, fractions like 3/4, mixed numbers like 1 1/2).
const numericFields = {
  answer: Schema.Number,
  // How far off still counts as correct, e.g. 0.01. 0 means exact.
  tolerance: Schema.Number,
  // Shown after the answer box, e.g. "cm". May be empty.
  unit: Schema.String,
};

// Rows with points that add up to the question's points. May be empty.
const essayFields = { rubric: Schema.Array(RubricRow) };

// Students draw on a canvas, or photograph their work (up to three photos), and the teacher grades the picture
// against the rubric. `backgroundImageId` is an image to draw on (described by `backgroundAlt`). `cameraOnly`:
// photos must be taken with the camera, not picked from the gallery.
const drawingStudentFields = {
  backgroundImageId: Schema.optionalKey(Schema.String),
  backgroundAlt: Schema.optionalKey(Schema.String),
  allowDraw: Schema.Boolean,
  allowUpload: Schema.Boolean,
  cameraOnly: Schema.Boolean,
  canvasWidth: Schema.Int,
  canvasHeight: Schema.Int,
};
const drawingFields = { ...drawingStudentFields, rubric: Schema.Array(RubricRow) };

const codeFields = {
  language: CodeLanguage,
  starterCode: Schema.String,
  tests: Schema.Array(CodeTestCase),
  // PHP only: CREATE TABLE and INSERT statements loaded into a fresh SQLite database before each test. Shown to students.
  database: Schema.optionalKey(Schema.String),
  // Notes for the teacher's review (style, approach). Not shown to students.
  rubric: Schema.String,
  ...weights,
};

// Students write a SELECT query against tables made by setupSql. It's right when it returns the same rows
// as answerSql. With hiddenDataSql, both run again after it adds rows, so a hard-coded answer fails.
const sqlFields = {
  // CREATE TABLE and INSERT statements. Shown to students.
  setupSql: Schema.String,
  // The teacher's query. Never sent to students.
  answerSql: Schema.String,
  // Extra statements (more INSERTs) for a second, hidden check. Empty: only the sample data is checked.
  hiddenDataSql: Schema.String,
  orderMatters: Schema.Boolean,
  starterCode: Schema.String,
  rubric: Schema.String,
  // Filled in by the server for students.
  sampleResult: Schema.optionalKey(SqlSampleResult),
};

// Students drag the items into the categories (or leave a distractor out). Points are shared by the items.
const categorizationFields = {
  categories: Schema.Array(Category),
  items: Schema.Array(CategoryItem),
  ...weights,
};

// The items are listed in their correct order; students get them shuffled and drag them into order. Points are
// shared equally by the positions.
const orderingFields = { items: Schema.Array(MatchItem) };

// Students click the image where the answer is. `maxClicks` (1 up to the number of regions) is how many markers
// they may place; `tolerance` (0 to 0.1, in image widths) widens every region a little. Points are shared equally
// by the regions.
const hotspotStudentFields = {
  imageId: Schema.String,
  alt: Schema.String,
  maxClicks: Schema.Int,
};
const hotspotFields = { ...hotspotStudentFields, regions: Schema.Array(HotspotRegion), tolerance: Schema.Number };

const kind = {
  multiple_choice: Schema.Literal("multiple_choice"),
  true_false: Schema.Literal("true_false"),
  blank: Schema.Literal("blank"),
  matching: Schema.Literal("matching"),
  enumeration: Schema.Literal("enumeration"),
  numeric: Schema.Literal("numeric"),
  essay: Schema.Literal("essay"),
  code: Schema.Literal("code"),
  sql: Schema.Literal("sql"),
  drawing: Schema.Literal("drawing"),
  categorization: Schema.Literal("categorization"),
  ordering: Schema.Literal("ordering"),
  hotspot: Schema.Literal("hotspot"),
};

// --- Bodies: what the database stores in `questions.body` (the base fields have their own columns) ---

export const MultipleChoiceBody = Schema.Struct({ type: kind.multiple_choice, ...multipleChoiceFields });
export const TrueFalseBody = Schema.Struct({ type: kind.true_false, ...trueFalseFields });
export const BlankBody = Schema.Struct({ type: kind.blank, ...blankFields });
export const MatchingBody = Schema.Struct({ type: kind.matching, ...matchingFields });
export const EnumerationBody = Schema.Struct({ type: kind.enumeration, ...enumerationFields });
export const NumericBody = Schema.Struct({ type: kind.numeric, ...numericFields });
export const EssayBody = Schema.Struct({ type: kind.essay, ...essayFields });
export const CodeBody = Schema.Struct({ type: kind.code, ...codeFields });
export const SqlBody = Schema.Struct({ type: kind.sql, ...sqlFields });
export const DrawingBody = Schema.Struct({ type: kind.drawing, ...drawingFields });
export const CategorizationBody = Schema.Struct({ type: kind.categorization, ...categorizationFields });
export const OrderingBody = Schema.Struct({ type: kind.ordering, ...orderingFields });
export const HotspotBody = Schema.Struct({ type: kind.hotspot, ...hotspotFields });

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

// --- Teacher questions ---

export const MultipleChoiceQuestion = Schema.Struct({ ...base, type: kind.multiple_choice, ...multipleChoiceFields });
export const TrueFalseQuestion = Schema.Struct({ ...base, type: kind.true_false, ...trueFalseFields });
export const BlankQuestion = Schema.Struct({ ...base, type: kind.blank, ...blankFields });
export const MatchingQuestion = Schema.Struct({ ...base, type: kind.matching, ...matchingFields });
export const EnumerationQuestion = Schema.Struct({ ...base, type: kind.enumeration, ...enumerationFields });
export const NumericQuestion = Schema.Struct({ ...base, type: kind.numeric, ...numericFields });
export const EssayQuestion = Schema.Struct({ ...base, type: kind.essay, ...essayFields });
export const CodeQuestion = Schema.Struct({ ...base, type: kind.code, ...codeFields });
export const SqlQuestion = Schema.Struct({ ...base, type: kind.sql, ...sqlFields });
export const DrawingQuestion = Schema.Struct({ ...base, type: kind.drawing, ...drawingFields });
export const CategorizationQuestion = Schema.Struct({ ...base, type: kind.categorization, ...categorizationFields });
export const OrderingQuestion = Schema.Struct({ ...base, type: kind.ordering, ...orderingFields });
export const HotspotQuestion = Schema.Struct({ ...base, type: kind.hotspot, ...hotspotFields });

export type MultipleChoiceQuestion = typeof MultipleChoiceQuestion.Type;
export type TrueFalseQuestion = typeof TrueFalseQuestion.Type;
export type BlankQuestion = typeof BlankQuestion.Type;
export type MatchingQuestion = typeof MatchingQuestion.Type;
export type EnumerationQuestion = typeof EnumerationQuestion.Type;
export type NumericQuestion = typeof NumericQuestion.Type;
export type EssayQuestion = typeof EssayQuestion.Type;
export type CodeQuestion = typeof CodeQuestion.Type;
export type SqlQuestion = typeof SqlQuestion.Type;
export type DrawingQuestion = typeof DrawingQuestion.Type;
export type CategorizationQuestion = typeof CategorizationQuestion.Type;
export type OrderingQuestion = typeof OrderingQuestion.Type;
export type HotspotQuestion = typeof HotspotQuestion.Type;

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

// --- Student questions: the same questions with every answer removed ---

export const StudentMultipleChoiceQuestion = Schema.Struct({
  ...studentBase,
  type: kind.multiple_choice,
  choices: Schema.Array(Choice),
  multipleCorrect: Schema.Boolean,
});
export const StudentTrueFalseQuestion = Schema.Struct({ ...studentBase, type: kind.true_false });
// The prompt's blanks are emptied: "A {{}} identifies a {{}}." A question without blanks has none: one box after the prompt.
export const StudentBlankQuestion = Schema.Struct({
  ...studentBase,
  type: kind.blank,
  mode: BlankMode,
  blankCount: Schema.Int,
  clozeInput: ClozeInput,
  // Dropdown: the choices of each blank.
  options: Schema.Array(Schema.Array(Schema.String)),
  // Word bank: every word, answers and extras together.
  bank: Schema.Array(Schema.String),
});
export const StudentMatchingQuestion = Schema.Struct({
  ...studentBase,
  type: kind.matching,
  left: Schema.Array(MatchItem),
  right: Schema.Array(MatchItem),
});
export const StudentEnumerationQuestion = Schema.Struct({
  ...studentBase,
  type: kind.enumeration,
  // How many answer boxes to show.
  itemCount: Schema.Int,
  orderMatters: Schema.Boolean,
});
export const StudentNumericQuestion = Schema.Struct({ ...studentBase, type: kind.numeric, unit: Schema.String });
export const StudentEssayQuestion = Schema.Struct({ ...studentBase, type: kind.essay });
export const StudentCodeQuestion = Schema.Struct({
  ...studentBase,
  type: kind.code,
  language: CodeLanguage,
  starterCode: Schema.String,
  // Sample tests only; hidden tests stay on the server.
  tests: Schema.Array(CodeTestCase),
  database: Schema.optionalKey(Schema.String),
});
export const StudentSqlQuestion = Schema.Struct({
  ...studentBase,
  type: kind.sql,
  setupSql: Schema.String,
  orderMatters: Schema.Boolean,
  starterCode: Schema.String,
  sampleResult: Schema.optionalKey(SqlSampleResult),
});
export const StudentDrawingQuestion = Schema.Struct({ ...studentBase, type: kind.drawing, ...drawingStudentFields });
export const StudentCategorizationQuestion = Schema.Struct({
  ...studentBase,
  type: kind.categorization,
  categories: Schema.Array(Category),
  items: Schema.Array(MatchItem),
});
// The items come in a shuffled order that is never the right one.
export const StudentOrderingQuestion = Schema.Struct({ ...studentBase, type: kind.ordering, items: Schema.Array(MatchItem) });
export const StudentHotspotQuestion = Schema.Struct({ ...studentBase, type: kind.hotspot, ...hotspotStudentFields });

export type StudentMultipleChoiceQuestion = typeof StudentMultipleChoiceQuestion.Type;
export type StudentTrueFalseQuestion = typeof StudentTrueFalseQuestion.Type;
export type StudentBlankQuestion = typeof StudentBlankQuestion.Type;
export type StudentMatchingQuestion = typeof StudentMatchingQuestion.Type;
export type StudentEnumerationQuestion = typeof StudentEnumerationQuestion.Type;
export type StudentNumericQuestion = typeof StudentNumericQuestion.Type;
export type StudentEssayQuestion = typeof StudentEssayQuestion.Type;
export type StudentCodeQuestion = typeof StudentCodeQuestion.Type;
export type StudentSqlQuestion = typeof StudentSqlQuestion.Type;
export type StudentDrawingQuestion = typeof StudentDrawingQuestion.Type;
export type StudentCategorizationQuestion = typeof StudentCategorizationQuestion.Type;
export type StudentOrderingQuestion = typeof StudentOrderingQuestion.Type;
export type StudentHotspotQuestion = typeof StudentHotspotQuestion.Type;

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

// How a blank question is answered: one box after the prompt, blanks inside the sentence, or a cloze passage.
// The one place that decides it.
export type BlankStyle = "single" | "inline" | "cloze";
export function blankStyle(q: Pick<BlankQuestion, "mode" | "prompt">): BlankStyle {
  return q.mode === "cloze" ? "cloze" : blankCount(q.prompt) > 0 ? "inline" : "single";
}

// The accepted answers of each blank: the accepted answers of a single box, or each blank written in the prompt.
export function blankKey(q: Pick<BlankQuestion, "mode" | "prompt" | "acceptedAnswers">): string[][] {
  return blankStyle(q) === "single" ? [[...q.acceptedAnswers]] : blankAnswers(q.prompt);
}

const sortWords = (words: string[]) => [...words].sort((a, b) => a.localeCompare(b));

// The question as a student may see it. Builds each field by name, so a field added to a teacher
// question later is never sent to students by accident. With `random`, the lists students pick from (cloze
// dropdowns and word bank) are shuffled; without it they are sorted, so their order never gives an answer away.
export function toStudentQuestion(q: Question, random?: () => number): StudentQuestion {
  const common = { id: q.id, prompt: q.prompt, points: q.points, ...(q.topic === undefined ? {} : { topic: q.topic }) };
  const order = (words: string[]) => (random ? shuffled(words, random) : sortWords(words));
  // The text and image of a choice or item, without anything else it carries (the right item of a pair).
  const shown = ({ id, text, imageId, alt }: { id: string; text: string; imageId?: string; alt?: string }) => ({
    id,
    text,
    ...(imageId === undefined ? {} : { imageId }),
    ...(alt === undefined ? {} : { alt }),
  });
  switch (q.type) {
    case "multiple_choice":
      return {
        ...common,
        type: q.type,
        choices: q.choices.map(shown),
        multipleCorrect: q.multipleCorrect,
      };
    case "true_false":
      return { ...common, type: q.type };
    case "blank": {
      const key = blankKey(q);
      const cloze = q.mode === "cloze";
      return {
        ...common,
        type: q.type,
        prompt: emptyBlanks(q.prompt),
        mode: q.mode,
        blankCount: blankStyle(q) === "single" ? 1 : blankCount(q.prompt),
        clozeInput: q.clozeInput,
        options:
          cloze && q.clozeInput === "dropdown"
            ? key.map((answers, i) => order([...new Set([...answers.slice(0, 1), ...(q.wrongOptions[i] ?? [])])]))
            : [],
        bank: cloze && q.clozeInput === "bank" ? order([...key.flatMap((a) => a.slice(0, 1)), ...q.extraWords]) : [],
      };
    }
    case "matching":
      return {
        ...common,
        type: q.type,
        left: q.left.map(shown),
        right: q.right.map(shown),
      };
    case "enumeration":
      return { ...common, type: q.type, itemCount: q.items.length, orderMatters: q.orderMatters };
    case "numeric":
      return { ...common, type: q.type, unit: q.unit };
    case "essay":
      return { ...common, type: q.type };
    case "code":
      return {
        ...common,
        type: q.type,
        language: q.language,
        starterCode: q.starterCode,
        tests: q.tests.filter((t) => !t.hidden).map(({ id, input, expectedOutput, hidden }) => ({ id, input, expectedOutput, hidden })),
        ...(q.database === undefined ? {} : { database: q.database }),
      };
    case "sql":
      return {
        ...common,
        type: q.type,
        setupSql: q.setupSql,
        orderMatters: q.orderMatters,
        starterCode: q.starterCode,
        ...(q.sampleResult === undefined ? {} : { sampleResult: q.sampleResult }),
      };
    case "drawing":
      return {
        ...common,
        type: q.type,
        ...(q.backgroundImageId === undefined ? {} : { backgroundImageId: q.backgroundImageId }),
        ...(q.backgroundAlt === undefined ? {} : { backgroundAlt: q.backgroundAlt }),
        allowDraw: q.allowDraw,
        allowUpload: q.allowUpload,
        cameraOnly: q.cameraOnly,
        canvasWidth: q.canvasWidth,
        canvasHeight: q.canvasHeight,
      };
    case "categorization":
      return {
        ...common,
        type: q.type,
        categories: q.categories.map(({ id, name, description }) => ({ id, name, ...(description === undefined ? {} : { description }) })),
        items: (random ? shuffled(q.items, random) : q.items).map(shown),
      };
    case "ordering":
      // Always shuffled, or the list would give the answer away; without a seed, by one taken from the question's id.
      return { ...common, type: q.type, items: shuffledNotSorted(q.items, random ?? idRandom(q.id)).map(shown) };
    case "hotspot":
      return { ...common, type: q.type, imageId: q.imageId, alt: q.alt, maxClicks: q.maxClicks };
  }
}
