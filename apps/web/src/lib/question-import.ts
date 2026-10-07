// Turns spreadsheet rows into questions. The columns follow Wayground's (Quizizz) import
// template, so their files work as-is, plus optional Points and Topic columns.
import { blankAnswers } from "./blanks";
import { parseNumber } from "./math";
import type { Question } from "@examora/contract";

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

const typeAliases: Record<string, Question["type"]> = {
  "multiple choice": "multiple_choice",
  "multiple-choice": "multiple_choice",
  mcq: "multiple_choice",
  mc: "multiple_choice",
  "true/false": "true_false",
  "true or false": "true_false",
  "true false": "true_false",
  tf: "true_false",
  identification: "identification",
  "fill-in-the-blank": "identification",
  "fill in the blank": "identification",
  "fill in the blanks": "identification",
  "short answer": "identification",
  "fill in the blanks (multiple)": "fill_in_the_blank",
  enumeration: "enumeration",
  numeric: "numeric",
  number: "numeric",
  numerical: "numeric",
  "problem solving": "numeric",
  computation: "numeric",
  enumerate: "enumeration",
  list: "enumeration",
  essay: "essay",
  "open-ended": "essay",
  "open ended": "essay",
};

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
    let type = rawType ? typeAliases[key(rawType)] : "multiple_choice";
    if (!type)
      return fail(
        `“${rawType}” questions aren't supported. Use Multiple Choice, True/False, Identification, Fill in the Blanks, Enumeration, Numeric or Essay.`,
      );
    // Wayground's Fill-in-the-Blank has one answer; a prompt with [brackets] has inline blanks instead.
    if (type === "identification" && blankAnswers(prompt).length > 0) type = "fill_in_the_blank";

    // Keep column positions so "Correct Answer: 3" means the Option 3 column even if one before it is blank.
    const optionCells = Array.from({ length: optionCount }, (_, n) => at(r, `Option ${n + 1}`));
    const options = optionCells.filter(Boolean);
    const optionByNumber = (a: string) => (/^\d+$/.test(a) ? optionCells[Number(a) - 1] || null : null);
    const answer = at(r, "Correct Answer");

    const rawPoints = at(r, "Points");
    const points = rawPoints ? Number(rawPoints) : type === "essay" ? 10 : 1;
    if (!(points > 0)) return fail(`Points must be a number above 0 (got “${rawPoints}”).`);

    const topic = at(r, "Topic") || undefined;
    const base = { id: crypto.randomUUID().slice(0, 8), prompt, points, topic };

    switch (type) {
      case "multiple_choice": {
        if (options.length < 2) return fail("Multiple choice needs at least 2 options.");
        if (!answer) return fail("Correct Answer is empty. Put the option number, e.g. 2.");
        if (answer.includes(",")) return fail("Only one correct option is supported per question.");
        // Wayground uses the option number; also accept the option's text.
        const correct = (optionByNumber(answer) ?? answer).toLowerCase();
        const index = options.findIndex((o) => o.toLowerCase() === correct);
        if (index < 0) return fail(`Correct Answer “${answer}” doesn't match any option.`);
        const choices = options.map((text, n) => ({ id: String.fromCharCode(97 + n), text }));
        questions.push({ ...base, type, choices, correctChoiceId: choices[index].id });
        return;
      }
      case "true_false": {
        // Excel turns TRUE/FALSE into booleans, which norm() makes "true"/"false".
        let a = answer.toLowerCase();
        a = (optionByNumber(a) ?? a).toLowerCase();
        if (["true", "t"].includes(a)) questions.push({ ...base, type, answer: true });
        else if (["false", "f"].includes(a)) questions.push({ ...base, type, answer: false });
        else return fail("Correct Answer must be True or False.");
        return;
      }
      case "identification": {
        const accepted = [...answer.split("|"), ...options].map((x) => x.trim()).filter(Boolean);
        if (!accepted.length) return fail("Add the answer in Correct Answer. Separate alternatives with |.");
        questions.push({ ...base, type, acceptedAnswers: [...new Set(accepted)], caseSensitive: false });
        return;
      }
      case "fill_in_the_blank": {
        const blanks = blankAnswers(prompt);
        if (blanks.some((b) => b.length === 0)) return fail("A blank is empty. Write the answer inside the [brackets].");
        questions.push({ ...base, type, caseSensitive: false });
        return;
      }
      case "numeric": {
        const value = parseNumber(answer);
        if (value === null) return fail(`Correct Answer must be a number, like 12, -3.5 or 3/4 (got “${answer}”).`);
        const rawTolerance = at(r, "Tolerance");
        const tolerance = rawTolerance ? parseNumber(rawTolerance) : 0;
        if (tolerance === null || tolerance < 0) return fail(`Tolerance must be 0 or more (got “${rawTolerance}”).`);
        questions.push({ ...base, type, answer: value, tolerance, unit: at(r, "Unit") });
        return;
      }
      case "enumeration": {
        const items = [...options, ...answer.split(";")].map((x) => x.trim()).filter(Boolean);
        if (!items.length) return fail("List the expected items in Option 1–5, or in Correct Answer separated by ;.");
        questions.push({ ...base, type, points: rawPoints ? points : items.length, items, orderMatters: false, caseSensitive: false });
        return;
      }
      case "essay":
        questions.push({ ...base, type, rubric: answer });
        return;
    }
  });

  return { questions, problems };
}
