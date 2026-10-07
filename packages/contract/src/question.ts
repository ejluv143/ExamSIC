// Question schemas. Every question type has three shapes:
//   - the teacher's question, with the answers (`Question`);
//   - its `body`: the type-specific part, stored as jsonb in the database (`QuestionBody`);
//   - the student's question, with every answer removed (`StudentQuestion`, made by `toStudentQuestion`).
// A new type is added by writing its fields, body, question and student question, then listing them in
// `questionTypes` and the three unions below; nothing else changes.
import { Schema } from "effect";

export const questionTypes = [
  "multiple_choice",
  "true_false",
  "identification",
  "fill_in_the_blank",
  "enumeration",
  "numeric",
  "essay",
  "code",
  "sql",
] as const;
export const QuestionType = Schema.Literals(questionTypes);
export type QuestionType = typeof QuestionType.Type;

export const codeLanguages = ["python", "java", "cpp", "c", "javascript", "php"] as const;
export const CodeLanguage = Schema.Literals(codeLanguages);
export type CodeLanguage = typeof CodeLanguage.Type;

// What every question carries, whatever its type.
const base = {
  id: Schema.String,
  prompt: Schema.String,
  points: Schema.Number,
  topic: Schema.optionalKey(Schema.String),
};

export const Choice = Schema.Struct({ id: Schema.String, text: Schema.String });
export type Choice = typeof Choice.Type;

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
  correctChoiceId: Schema.String,
};

const trueFalseFields = { answer: Schema.Boolean };

const identificationFields = {
  // Any of these counts as correct; compared case-insensitively unless caseSensitive.
  acceptedAnswers: Schema.Array(Schema.String),
  caseSensitive: Schema.Boolean,
};

// Blanks live in the prompt as [answer] or [answer|alternative]. Each blank earns an equal share of the points.
const fillInTheBlankFields = { caseSensitive: Schema.Boolean };

// Students list items.length answers. Each item may hold alternatives as "1NF|First Normal Form".
const enumerationFields = {
  items: Schema.Array(Schema.String),
  orderMatters: Schema.Boolean,
  caseSensitive: Schema.Boolean,
};

// Students type a number (decimals, fractions like 3/4, mixed numbers like 1 1/2).
const numericFields = {
  answer: Schema.Number,
  // How far off still counts as correct, e.g. 0.01. 0 means exact.
  tolerance: Schema.Number,
  // Shown after the answer box, e.g. "cm". May be empty.
  unit: Schema.String,
};

const essayFields = { rubric: Schema.String };

const codeFields = {
  language: CodeLanguage,
  starterCode: Schema.String,
  tests: Schema.Array(CodeTestCase),
  // PHP only: CREATE TABLE and INSERT statements loaded into a fresh SQLite database before each test. Shown to students.
  database: Schema.optionalKey(Schema.String),
  // Notes for the teacher's review (style, approach). Not shown to students.
  rubric: Schema.String,
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

const kind = {
  multiple_choice: Schema.Literal("multiple_choice"),
  true_false: Schema.Literal("true_false"),
  identification: Schema.Literal("identification"),
  fill_in_the_blank: Schema.Literal("fill_in_the_blank"),
  enumeration: Schema.Literal("enumeration"),
  numeric: Schema.Literal("numeric"),
  essay: Schema.Literal("essay"),
  code: Schema.Literal("code"),
  sql: Schema.Literal("sql"),
};

// --- Bodies: what the database stores in `questions.body` (the base fields have their own columns) ---

export const MultipleChoiceBody = Schema.Struct({ type: kind.multiple_choice, ...multipleChoiceFields });
export const TrueFalseBody = Schema.Struct({ type: kind.true_false, ...trueFalseFields });
export const IdentificationBody = Schema.Struct({ type: kind.identification, ...identificationFields });
export const FillInTheBlankBody = Schema.Struct({ type: kind.fill_in_the_blank, ...fillInTheBlankFields });
export const EnumerationBody = Schema.Struct({ type: kind.enumeration, ...enumerationFields });
export const NumericBody = Schema.Struct({ type: kind.numeric, ...numericFields });
export const EssayBody = Schema.Struct({ type: kind.essay, ...essayFields });
export const CodeBody = Schema.Struct({ type: kind.code, ...codeFields });
export const SqlBody = Schema.Struct({ type: kind.sql, ...sqlFields });

export const QuestionBody = Schema.Union([
  MultipleChoiceBody,
  TrueFalseBody,
  IdentificationBody,
  FillInTheBlankBody,
  EnumerationBody,
  NumericBody,
  EssayBody,
  CodeBody,
  SqlBody,
]);
export type QuestionBody = typeof QuestionBody.Type;

// --- Teacher questions ---

export const MultipleChoiceQuestion = Schema.Struct({ ...base, type: kind.multiple_choice, ...multipleChoiceFields });
export const TrueFalseQuestion = Schema.Struct({ ...base, type: kind.true_false, ...trueFalseFields });
export const IdentificationQuestion = Schema.Struct({ ...base, type: kind.identification, ...identificationFields });
export const FillInTheBlankQuestion = Schema.Struct({ ...base, type: kind.fill_in_the_blank, ...fillInTheBlankFields });
export const EnumerationQuestion = Schema.Struct({ ...base, type: kind.enumeration, ...enumerationFields });
export const NumericQuestion = Schema.Struct({ ...base, type: kind.numeric, ...numericFields });
export const EssayQuestion = Schema.Struct({ ...base, type: kind.essay, ...essayFields });
export const CodeQuestion = Schema.Struct({ ...base, type: kind.code, ...codeFields });
export const SqlQuestion = Schema.Struct({ ...base, type: kind.sql, ...sqlFields });

export type MultipleChoiceQuestion = typeof MultipleChoiceQuestion.Type;
export type TrueFalseQuestion = typeof TrueFalseQuestion.Type;
export type IdentificationQuestion = typeof IdentificationQuestion.Type;
export type FillInTheBlankQuestion = typeof FillInTheBlankQuestion.Type;
export type EnumerationQuestion = typeof EnumerationQuestion.Type;
export type NumericQuestion = typeof NumericQuestion.Type;
export type EssayQuestion = typeof EssayQuestion.Type;
export type CodeQuestion = typeof CodeQuestion.Type;
export type SqlQuestion = typeof SqlQuestion.Type;

export const Question = Schema.Union([
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  IdentificationQuestion,
  FillInTheBlankQuestion,
  EnumerationQuestion,
  NumericQuestion,
  EssayQuestion,
  CodeQuestion,
  SqlQuestion,
]);
export type Question = typeof Question.Type;

// --- Student questions: the same questions with every answer removed ---

export const StudentMultipleChoiceQuestion = Schema.Struct({
  ...base,
  type: kind.multiple_choice,
  choices: Schema.Array(Choice),
});
export const StudentTrueFalseQuestion = Schema.Struct({ ...base, type: kind.true_false });
export const StudentIdentificationQuestion = Schema.Struct({ ...base, type: kind.identification });
// The prompt's blanks are emptied: "A [] identifies a []."
export const StudentFillInTheBlankQuestion = Schema.Struct({ ...base, type: kind.fill_in_the_blank });
export const StudentEnumerationQuestion = Schema.Struct({
  ...base,
  type: kind.enumeration,
  // How many answer boxes to show.
  itemCount: Schema.Int,
  orderMatters: Schema.Boolean,
});
export const StudentNumericQuestion = Schema.Struct({ ...base, type: kind.numeric, unit: Schema.String });
export const StudentEssayQuestion = Schema.Struct({ ...base, type: kind.essay });
export const StudentCodeQuestion = Schema.Struct({
  ...base,
  type: kind.code,
  language: CodeLanguage,
  starterCode: Schema.String,
  // Sample tests only; hidden tests stay on the server.
  tests: Schema.Array(CodeTestCase),
  database: Schema.optionalKey(Schema.String),
});
export const StudentSqlQuestion = Schema.Struct({
  ...base,
  type: kind.sql,
  setupSql: Schema.String,
  orderMatters: Schema.Boolean,
  starterCode: Schema.String,
  sampleResult: Schema.optionalKey(SqlSampleResult),
});

export type StudentMultipleChoiceQuestion = typeof StudentMultipleChoiceQuestion.Type;
export type StudentTrueFalseQuestion = typeof StudentTrueFalseQuestion.Type;
export type StudentIdentificationQuestion = typeof StudentIdentificationQuestion.Type;
export type StudentFillInTheBlankQuestion = typeof StudentFillInTheBlankQuestion.Type;
export type StudentEnumerationQuestion = typeof StudentEnumerationQuestion.Type;
export type StudentNumericQuestion = typeof StudentNumericQuestion.Type;
export type StudentEssayQuestion = typeof StudentEssayQuestion.Type;
export type StudentCodeQuestion = typeof StudentCodeQuestion.Type;
export type StudentSqlQuestion = typeof StudentSqlQuestion.Type;

export const StudentQuestion = Schema.Union([
  StudentMultipleChoiceQuestion,
  StudentTrueFalseQuestion,
  StudentIdentificationQuestion,
  StudentFillInTheBlankQuestion,
  StudentEnumerationQuestion,
  StudentNumericQuestion,
  StudentEssayQuestion,
  StudentCodeQuestion,
  StudentSqlQuestion,
]);
export type StudentQuestion = typeof StudentQuestion.Type;

const blankPattern = /\[[^\]]*\]/g;

// The question as a student may see it. Builds each field by name, so a field added to a teacher
// question later is never sent to students by accident.
export function toStudentQuestion(q: Question): StudentQuestion {
  const common = { id: q.id, prompt: q.prompt, points: q.points, ...(q.topic === undefined ? {} : { topic: q.topic }) };
  switch (q.type) {
    case "multiple_choice":
      return { ...common, type: q.type, choices: q.choices.map(({ id, text }) => ({ id, text })) };
    case "true_false":
      return { ...common, type: q.type };
    case "identification":
      return { ...common, type: q.type };
    case "fill_in_the_blank":
      return { ...common, type: q.type, prompt: q.prompt.replace(blankPattern, "[]") };
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
  }
}
