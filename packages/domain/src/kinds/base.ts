// What every question type is built from: the fields all questions share, the `QuestionKind` interface a type
// fills in, and the small helpers the kinds have in common. The kinds (one module each, listed in `./index.ts`) build
// on this module and never on `../question.ts`, which builds its unions from them.
import { Schema } from "effect";
import type { AiDraft } from "../ai.ts";
import type { PairKind } from "../integrity.ts";
import type { Question, QuestionType, StudentQuestion } from "../question.ts";
import type { AnswerValue } from "../quiz.ts";
import type { SimilarPair } from "../similarity.ts";

// Whole or half points, e.g. 0.5, 1, 2.
export const Points = Schema.Number.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isMultipleOf(0.5, { message: "Points are whole or half points" }),
);

// Standard is worth 1000 in a game, double 2000, none is practice. Separate from the question's grading points.
export const GamePoints = Schema.Literals(["standard", "double", "none"]);
export type GamePoints = typeof GamePoints.Type;

// What every student question carries, whatever its type. `prompt` is markdown.
export const studentBase = {
  id: Schema.String,
  prompt: Schema.String,
  points: Points,
  topic: Schema.optionalKey(Schema.String),
};

// What every teacher question carries. `partialCredit`: part of the points for part of the answer
// (each blank, pair, item, test or choice), or all of them only for a fully correct answer.
export const teacherBase = {
  ...studentBase,
  gamePoints: GamePoints,
  partialCredit: Schema.Boolean,
  // Markdown shown after an answer in mastery mode (and with the results). Missing: none.
  explanation: Schema.optionalKey(Schema.String),
};

// Points per blank, pair, item or test, in order. Missing or empty: equal shares.
export const weights = { weights: Schema.optionalKey(Schema.Array(Schema.Number)) };

// `text` is markdown. `imageId` is an uploaded image (an asset id) shown with, or instead of, the text; `alt`
// describes it for screen readers and the printed paper, and is required whenever there is an image.
export const image = { imageId: Schema.optionalKey(Schema.String), alt: Schema.optionalKey(Schema.String) };

// One line of an essay rubric; the points of all rows add up to the question's points.
export const RubricRow = Schema.Struct({ id: Schema.String, criterion: Schema.String, points: Points });
export type RubricRow = typeof RubricRow.Type;

// An item of one matching column, or an item to put in order or in a category. `text` is markdown.
export const MatchItem = Schema.Struct({ id: Schema.String, text: Schema.String, ...image });
export type MatchItem = typeof MatchItem.Type;

// `expected` is filled in for SQL checks, where the expected rows come from running the answer query.
export const CodeTestResult = Schema.Struct({
  testId: Schema.String,
  passed: Schema.Boolean,
  output: Schema.String,
  error: Schema.optionalKey(Schema.String),
  expected: Schema.optionalKey(Schema.String),
});
export type CodeTestResult = typeof CodeTestResult.Type;

// --- The kind interface ---

type OfType<T extends QuestionType> = Extract<Question, { type: T }>;
type StudentOfType<T extends QuestionType> = Extract<StudentQuestion, { type: T }>;

// An answer that was given: `undefined` and `null` (left blank) are dealt with before a kind sees the value.
export type Given = Exclude<AnswerValue, null>;

// Each blank, pair or listed item with whether it matched the key.
export type PartResult = { given: string; correct: boolean };

// An image a question refers to, and where (for the editor's missing-alt-text message).
export type ImageRef = { id: string; alt: string; where: string };

// One bar of the split of answers after a game question.
export type GameBucket = { label: string; count: number; correct: boolean };

// What something outside the domain does to check an answer that needs more than a key: `runner` runs the student's
// code against tests (apps/runner), `sql` runs their query against the question's tables.
export type Checker = "runner" | "sql";

// What a kind needs to turn an AI draft into a question: the fields every question has already filled in, and an
// id generator (the domain doesn't make ids).
export type DraftContext = { prompt: string; points: number; base: Record<string, unknown>; newId: () => string };

// Everything that differs between question types. `Q` is the teacher's question of the type, `S` the student's.
// Optional members are capabilities only some types have; the code that uses them says what a type without does.
export interface QuestionKind<T extends QuestionType> {
  readonly type: T;

  // --- What the student sees ---
  // Builds each field by name, so a field added to a teacher question later is never sent to students by accident.
  // With `random`, lists students pick from are shuffled; without it they are sorted or left as they are.
  toStudent(q: OfType<T>, random?: () => number): StudentOfType<T>;
  // The choices or columns shuffled for one attempt (`random` comes from the attempt's seed). Types without
  // anything to shuffle here have none.
  shuffle?(q: OfType<T>, random: () => number): OfType<T>;
  // Uploaded images in the question's own fields (the prompt's are found in the markdown).
  images?(q: OfType<T> | StudentOfType<T>): ImageRef[];
  // The answer is a set of uploaded pictures that must be the student's own.
  readonly answerPictures?: true;
  // The answer the student gave, kept in the shape this type expects and a sane size. null: nothing usable.
  cleanAnswer(q: OfType<T>, v: AnswerValue): AnswerValue;

  // --- Scoring ---
  // The fraction (0..1) of the points the answer earns by itself. null: needs a teacher (essays), or a checker that
  // hasn't run (`results`: what the checker returned, for code and SQL).
  autoScore(q: OfType<T>, answer: AnswerValue, results?: readonly CodeTestResult[] | null): number | null;
  // How many units (blanks, pairs, items, tests) the points are split over. Missing: 1.
  units?(q: OfType<T>): number;
  // Each unit with whether it matched the key. Missing: the type has no units to list.
  partResults?(q: OfType<T>, answer: AnswerValue): PartResult[];
  // A teacher may want to check the typed answers by hand: essays always need it, and the others can be re-scored
  // when the key missed a valid answer (a misspelling, a synonym, a different wording).
  readonly reviewable: boolean;
  // Needs the code runner or the SQL grader to be scored.
  readonly checker?: Checker;
  // What the answer query returns on the sample data is shown to students as the expected result.
  readonly sampleResult?: true;

  // --- Text ---
  answerKey(q: OfType<T>): string;
  // What the student put, as text. Empty string when it says nothing.
  answerText(q: OfType<T>, value: Given): string;
  // Whether the answer says something. Missing: a non-empty text or list.
  answerGiven?(q: OfType<T> | StudentOfType<T>, value: Given): boolean;
  // The answer in a few words for the review screen, for an answer that was given. Missing: the text, on one line.
  summary?(q: OfType<T> | StudentOfType<T>, value: Given): string;

  // --- Telemetry and integrity ---
  // The typing is kept for the teacher's replay.
  readonly typing: boolean;
  // Multiple choice and true/false: the id of the right option, as the coach's telemetry names it.
  optionKey?(q: OfType<T>): string;
  // Answers written freely: students' wrong answers can't be compared for a shared mistake.
  readonly freeForm?: true;
  // Answers that are compared across students for copying.
  similarity?: {
    readonly kind: PairKind;
    pairs(q: OfType<T>, texts: { id: string; text: string }[]): SimilarPair[];
    detail(score: number): string;
  };

  // --- Games ---
  // What stops a game from running questions of this type (given those of the quiz that have it, in a game that
  // is paced by the `pacing` and is or isn't a `relay`), or null.
  gameProblem?(questions: readonly { gamePoints: GamePoints }[], rules: { pacing: "teacher" | "student"; relay: boolean }): string | null;
  // In a game an answer (or a timeout) is never scored: the class sees them as a gallery.
  readonly gameUnscored?: true;
  // The keys an answer is counted under for the split after the question. Missing: one of `ok`, `part` or `bad`.
  gameTally?(q: OfType<T>, value: AnswerValue, fraction: number | null): string[];
  // The bars after the question, from how many answers each key got; null: no bars. Missing: Correct, Partly
  // correct and Wrong.
  gameBuckets?(q: OfType<T>, count: (key: string) => number): GameBucket[] | null;
  // The right answer in words for the types whose bars don't show it. Missing: none.
  gameAnswer?(q: OfType<T>): string;

  // --- AI drafts ---
  // Only some types are drafted by the AI helper: how it is asked for the type (the JSON shape the model must send)
  // and how what it sent becomes a question (null when it doesn't hold up).
  draft?: { readonly shape: string; decode(raw: AiDraft, ctx: DraftContext): Record<string, unknown> | null };
}

// --- Helpers the kinds share ---

export const round2 = (n: number) => Math.round(n * 100) / 100;

// The sum of an essay rubric's rows.
export const rubricTotal = (rubric: readonly { points: number }[]) => round2(rubric.reduce((sum, r) => sum + r.points, 0));

export const asList = (answer: AnswerValue): string[] => (Array.isArray(answer) ? answer : typeof answer === "string" ? [answer] : []);

// The share (0..1) of the points the correct units earn. Units (blanks, pairs, items, tests) are worth
// equal shares unless `weights` has one positive number for each. Without partial credit, only all of them count.
export function weightedFraction(correct: readonly boolean[], weights: readonly number[] | undefined, partialCredit: boolean): number {
  if (correct.length === 0) return 0;
  if (correct.every(Boolean)) return 1;
  if (!partialCredit) return 0;
  const custom = weights && weights.length === correct.length && weights.every((w) => w >= 0) && weights.some((w) => w > 0);
  const w = custom ? weights : correct.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  return correct.reduce((sum, ok, i) => sum + (ok ? w[i]! : 0), 0) / total;
}

export function matches(given: string, accepted: readonly string[], caseSensitive: boolean): boolean {
  const g = caseSensitive ? given.trim() : given.trim().toLowerCase();
  return g !== "" && accepted.some((a) => (caseSensitive ? a.trim() : a.trim().toLowerCase()) === g);
}

// Markdown on one short line (math stays, for the page to render).
export function oneLine(markdown: string, max = 80): string {
  const text = markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// An item as text: its words, else "(picture)".
export const itemText = (item: { text: string; imageId?: string | undefined; alt?: string | undefined }) =>
  item.text.trim() || item.alt?.trim() || (item.imageId ? "(picture)" : "—");

// The text and image of a choice or item, without anything else it carries (the right item of a pair).
export const shown = ({ id, text, imageId, alt }: { id: string; text: string; imageId?: string; alt?: string }) => ({
  id,
  text,
  ...(imageId === undefined ? {} : { imageId }),
  ...(alt === undefined ? {} : { alt }),
});

// The images in a list of [id, alt, where]; those without an id are left out.
export const imageRefs = (entries: readonly (readonly [string | undefined, string | undefined, string])[]): ImageRef[] =>
  entries.flatMap(([id, alt, where]) => (id !== undefined && id !== "" ? [{ id, alt: alt ?? "", where }] : []));

// How long a saved text answer or code answer may be.
export const maxTextLength = 5000;
export const maxCodeLength = 20000;

// The answer as it was given when that is all the type keeps: text, cut to a sane size.
export const cleanText = (v: AnswerValue, max: number = maxTextLength): AnswerValue => (typeof v === "string" ? v.slice(0, max) : null);

// A list of texts, one per blank, pair or listed item.
export const cleanList = (v: AnswerValue): AnswerValue =>
  Array.isArray(v) ? v.slice(0, 50).map((x) => String(x ?? "").slice(0, maxTextLength)) : null;

// What a typed answer reads as: the boxes joined, or the text, trimmed. Empty when it says nothing.
export const plainAnswerText = (value: Given): string =>
  Array.isArray(value) ? (value.some((x) => x.trim()) ? value.map((x) => x.trim() || "—").join("; ") : "") : typeof value === "string" ? value.trim() : "";

// The student's question fields every type has.
export const studentCommon = (q: { id: string; prompt: string; points: number; topic?: string | undefined }) => ({
  id: q.id,
  prompt: q.prompt,
  points: q.points,
  ...(q.topic === undefined ? {} : { topic: q.topic }),
});
