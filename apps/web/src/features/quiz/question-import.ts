// Turns spreadsheet rows into questions. The columns follow Wayground's (Quizizz) import
// template, so their files work as-is, plus optional Points and Topic columns.
import { type Question, type QuestionType } from "@examinus/domain/question";
import { editorModels } from "@examinus/question-kinds-core/editor-model";

// Whatever the spreadsheet reader returns; every cell is read as trimmed text.
type Cell = unknown;

export const optionCount = 5;

export const templateColumns = [
  "Question Text",
  "Question Type",
  ...Array.from({ length: optionCount }, (_, i) => `Option ${i + 1}`),
  "Correct Answer",
  "Points",
  "Topic",
  "Tolerance",
  "Unit",
] as const;

export type ImportProblem = { row: number; message: string };
export type ImportResult = { questions: Question[]; problems: ImportProblem[] };

// The type names a spreadsheet may use, lowercase: each type lists its own in its editor model.
const typeAliases = new Map<string, QuestionType>(
  Object.values(editorModels).flatMap((m) => (m.sheet?.aliases ?? []).map((alias) => [alias, m.type] as const)),
);

const norm = (v: Cell) => (v === null || v === undefined ? "" : String(v).trim());
const key = (v: Cell) => norm(v).toLowerCase().replace(/\s+/g, " ");

export function parseQuestionSheet(rows: Cell[][]): ImportResult {
  const headerIndex = rows.findIndex((r) => r.some((c) => key(c) === "question text"));
  if (headerIndex === -1) {
    return {
      questions: [],
      problems: [{ row: 1, message: "Couldn't find a “Question Text” column. Start from the template." }],
    };
  }
  const header = rows[headerIndex].map(key);
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const at = (r: Cell[], name: string) => (col(name) === -1 ? "" : norm(r[col(name)]));

  const questions: Question[] = [];
  const problems: ImportProblem[] = [];

  rows.slice(headerIndex + 1).forEach((r, i) => {
    const row = headerIndex + i + 2; // 1-based, as Excel shows it
    if (r.every((c) => norm(c) === "")) return;
    const fail = (message: string) => problems.push({ row, message });

    const prompt = at(r, "Question Text");
    if (!prompt) return fail("Question text is empty.");

    const rawType = at(r, "Question Type");
    const type = rawType ? typeAliases.get(key(rawType)) : "multiple_choice";
    const sheet = type && editorModels[type].sheet;
    if (!type || !sheet)
      return fail(
        `“${rawType}” questions aren't supported. Use Multiple Choice, True/False, Identification, Enumeration, Numeric or Essay.`,
      );

    // Keep column positions so "Correct Answer: 3" means the Option 3 column even if one before it is blank.
    const optionCells = Array.from({ length: optionCount }, (_, n) => at(r, `Option ${n + 1}`));
    const options = optionCells.filter(Boolean);
    const optionByNumber = (a: string) => (/^\d+$/.test(a) ? optionCells[Number(a) - 1] || null : null);
    const answer = at(r, "Correct Answer");

    const rawPoints = at(r, "Points");
    const points = rawPoints ? Number(rawPoints) : (sheet.defaultPoints ?? 1);
    if (!(points > 0)) return fail(`Points must be a number above 0 (got “${rawPoints}”).`);

    const topic = at(r, "Topic") || undefined;
    const base = {
      id: crypto.randomUUID().slice(0, 8),
      prompt,
      points,
      ...(topic ? { topic } : {}),
      gamePoints: "standard" as const,
      partialCredit: true as const,
    };

    const made = sheet.parse({ prompt, points, rawPoints, base, answer, options, optionByNumber, at: (name) => at(r, name) });
    if ("error" in made) return fail(made.error);
    questions.push(made);
  });

  return { questions, problems };
}
