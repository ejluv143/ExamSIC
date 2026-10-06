"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { questionTypeLabel } from "@/lib/format";
import { parseQuestionSheet, templateColumns, type ImportResult } from "@/lib/question-import";
import type { Question } from "@/lib/types";

const sampleRows = [
  ["Which normal form removes partial dependencies?", "Multiple Choice", "1NF", "2NF", "3NF", "BCNF", "", 2, 1, "Normalization"],
  ["A primary key can contain NULL values.", "True/False", "", "", "", "", "", "False", 1, "Keys"],
  ["SQL keyword that removes duplicate rows from a result.", "Identification", "", "", "", "", "", "DISTINCT", 1, "SQL"],
  ["A [primary key|PK] identifies each row; a [foreign key|FK] links to another table.", "Fill in the Blanks", "", "", "", "", "", "", 2, "Keys"],
  ["Give the three data anomalies normalization prevents.", "Enumeration", "Insertion", "Update", "Deletion", "", "", "", 3, "Normalization"],
  ["Solve for $x$: $\\frac{2x + 3}{5} = 3$", "Numeric", "", "", "", "", "", 6, 2, "Algebra"],
  ["A circle has radius $r = 4$ cm. Find its area using $\\pi \\approx 3.14$.", "Numeric", "", "", "", "", "", 50.24, 2, "Geometry", 0.01, "cm²"],
  ["Explain when you would denormalize a table.", "Essay", "", "", "", "", "", "Names a trade-off; gives an example", 10, "Normalization"],
];

const instructions = [
  ["Column", "What to put"],
  ["Question Text", "The question. Required. For Fill in the Blanks, put each answer in [brackets] where the blank goes, e.g. A [primary key|PK] identifies a row."],
  ["Question Type", "Multiple Choice, True/False, Identification, Fill in the Blanks, Enumeration, Numeric or Essay. Blank means Multiple Choice. Wayground's Fill-in-the-Blank and Open-Ended also work."],
  ["Option 1–5", "Multiple Choice: the choices (at least 2). Identification: optional extra accepted answers. Enumeration: one expected item per column."],
  ["Correct Answer", "Multiple Choice: the option number (e.g. 2). True/False: True or False. Identification: the answer; separate alternatives with |. Enumeration: items separated by ; (if more than 5). Numeric: the number (12, -3.5, 3/4). Essay: optional rubric. Fill in the Blanks: leave empty."],
  ["Math", "Write math as LaTeX between dollar signs, e.g. $\\frac{3}{4}$, $x^2$, $\\sqrt{2}$. Works in Question Text and options. Type \\$ for a dollar sign."],
  ["Tolerance", "Numeric only, optional. How far off still counts as correct, e.g. 0.01. Blank means exact."],
  ["Unit", "Numeric only, optional. Shown after the answer box, e.g. cm²."],
  ["Points", "Optional. Defaults to 1; essays 10; enumeration 1 per item. Fill in the Blanks and Enumeration give partial credit per blank or item."],
  ["Topic", "Optional. Used for filtering and item analysis."],
];

async function downloadTemplate() {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  await writeExcelFile([
    {
      sheet: "Questions",
      data: [templateColumns.map(bold), ...sampleRows],
      columns: templateColumns.map((c) => ({ width: c === "Question Text" ? 50 : c === "Correct Answer" ? 24 : 14 })),
      stickyRowsCount: 1,
    },
    {
      sheet: "How to fill",
      data: [instructions[0].map(bold), ...instructions.slice(1)],
      columns: [{ width: 18 }, { width: 100 }],
    },
  ]).toFile("examora-questions-template.xlsx");
}

export function ExcelImport({
  hasQuestions,
  onImport,
}: {
  hasQuestions: boolean;
  onImport: (questions: Question[], mode: "add" | "replace") => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      setResult(parseQuestionSheet(await readSheet(file)));
    } catch {
      setError("Couldn't read that file. Save it as .xlsx and try again.");
    } finally {
      setBusy(false);
    }
  }

  function finish(mode: "add" | "replace") {
    if (!result) return;
    onImport(result.questions, mode);
    setResult(null);
    setFileName(null);
  }

  const counts = result
    ? Object.entries(
        result.questions.reduce<Record<string, number>>((acc, q) => {
          acc[q.type] = (acc[q.type] ?? 0) + 1;
          return acc;
        }, {}),
      )
    : [];

  return (
    <Card>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">Import questions from Excel</p>
            <p className="mt-0.5 text-sm text-muted">
              Fill in the template, then upload it. Wayground (Quizizz) spreadsheets work too.
            </p>
          </div>
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download className="size-4" aria-hidden /> Download template
          </Button>
        </div>

        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm hover:bg-surface-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
          <FileSpreadsheet className="size-6 text-muted" aria-hidden />
          <span className="font-medium">{busy ? "Reading…" : fileName ?? "Choose an .xlsx file"}</span>
          <span className="text-xs text-muted">The first sheet is read.</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              read(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-3" role="status">
            <p className="text-sm">
              <span className="font-medium">
                {result.questions.length} {result.questions.length === 1 ? "question" : "questions"} ready
              </span>
              {counts.length > 0 && (
                <span className="text-muted">
                  {" "}
                  ({counts.map(([t, n]) => `${n} ${questionTypeLabel[t as Question["type"]].toLowerCase()}`).join(", ")})
                </span>
              )}
            </p>
            {result.problems.length > 0 && (
              <div className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
                <p className="font-medium">
                  {result.problems.length} {result.problems.length === 1 ? "row" : "rows"} skipped
                </p>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                  {result.problems.map((p) => (
                    <li key={p.row}>
                      Row {p.row}: {p.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.questions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => finish("add")}>
                  Add {result.questions.length} {result.questions.length === 1 ? "question" : "questions"}
                </Button>
                {hasQuestions && (
                  <Button variant="secondary" onClick={() => finish("replace")}>
                    Replace current questions
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
