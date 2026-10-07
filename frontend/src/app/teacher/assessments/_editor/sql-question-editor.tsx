"use client";

import { useState } from "react";
import { Play, Table2 } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { SqlTable } from "@/components/sql-table";
import { Button, inputClass } from "@/components/ui";
import { previewTables, runSqlInBrowser } from "@/lib/run-sql";
import type { SqlResult } from "@/lib/sql";
import type { Question, SqlQuestion } from "@/lib/types";

export const sqlTemplate = `CREATE TABLE students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    program TEXT
);

INSERT INTO students VALUES
    (1, 'Ana Cruz', 'BSIT'),
    (2, 'Ben Reyes', 'BSCS'),
    (3, 'Carla Lim', 'BSIT');
`;

type Check = { label: string; result?: SqlResult; error?: string };

function Errors({ text }: { text: string }) {
  return <p className="rounded-md bg-danger-soft px-3 py-2 font-mono text-xs text-danger">{text}</p>;
}

export function SqlQuestionEditor({ q, onChange }: { q: SqlQuestion; onChange: (q: Question) => void }) {
  const [tables, setTables] = useState<{ name: string; result: SqlResult }[] | { error: string } | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkAnswer() {
    setBusy(true);
    const runs: Check[] = [{ label: "Sample data (students see this result)", ...(await runSqlInBrowser(q.setupSql, q.answerSql)) }];
    if (q.hiddenDataSql.trim())
      runs.push({
        label: "With the hidden data",
        ...(await runSqlInBrowser(`${q.setupSql}\n;\n${q.hiddenDataSql}`, q.answerSql)),
      });
    setChecks(runs);
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Students write one SELECT query against your tables. It&apos;s right when it returns the same rows as your
        answer query; column names don&apos;t matter. Graded automatically on the server (SQLite).
      </p>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Tables and sample data</p>
          <Button
            variant="ghost"
            className="px-2.5 py-1 text-xs"
            onClick={async () => setTables(await previewTables(q.setupSql))}
          >
            <Table2 className="size-3.5" aria-hidden /> Preview tables
          </Button>
        </div>
        <CodeEditor
          value={q.setupSql}
          onChange={(setupSql) => onChange({ ...q, setupSql })}
          language="sql"
          minLines={8}
          label="Setup SQL"
        />
        <p className="mt-1 text-xs text-muted">CREATE TABLE and INSERT statements. Students see these tables.</p>
        {tables &&
          ("error" in tables ? (
            <div className="mt-2">
              <Errors text={tables.error} />
            </div>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {tables.map((t) => (
                <SqlTable key={t.name} result={t.result} caption={t.name} />
              ))}
            </div>
          ))}
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Answer query</p>
          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={checkAnswer} disabled={busy}>
            <Play className="size-3.5" aria-hidden /> {busy ? "Running…" : "Check answer"}
          </Button>
        </div>
        <CodeEditor
          value={q.answerSql}
          onChange={(answerSql) => onChange({ ...q, answerSql })}
          language="sql"
          minLines={4}
          label="Answer query"
        />
        <p className="mt-1 text-xs text-muted">Never shown to students.</p>
        {checks && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {checks.map((c) =>
              c.error ? (
                <div key={c.label}>
                  <p className="mb-1 text-xs font-medium text-muted">{c.label}</p>
                  <Errors text={c.error} />
                </div>
              ) : (
                <SqlTable key={c.label} result={c.result!} caption={c.label} />
              ),
            )}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">
          Hidden data <span className="font-normal text-muted">(optional)</span>
        </p>
        <CodeEditor
          value={q.hiddenDataSql}
          onChange={(hiddenDataSql) => onChange({ ...q, hiddenDataSql })}
          language="sql"
          minLines={3}
          label="Hidden data SQL"
        />
        <p className="mt-1 text-xs text-muted">
          More INSERTs (or UPDATEs) run after the sample data for a second, hidden check, so a query that just lists
          the expected names fails. With hidden data, each check is worth half the points.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm font-medium">Starter query</p>
          <CodeEditor
            value={q.starterCode}
            onChange={(starterCode) => onChange({ ...q, starterCode })}
            language="sql"
            minLines={2}
            label="Starter query"
          />
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-2 pt-7 text-sm">
            <input
              type="checkbox"
              checked={q.orderMatters}
              onChange={(e) => onChange({ ...q, orderMatters: e.target.checked })}
              className="size-4 accent-primary"
            />
            Row order matters (for ORDER BY questions)
          </label>
        </div>
      </div>

      <textarea
        value={q.rubric}
        onChange={(e) => onChange({ ...q, rubric: e.target.value })}
        placeholder="Review notes (optional), e.g. must use a JOIN, not a subquery. Shown to you while grading."
        rows={2}
        className={inputClass}
      />
    </div>
  );
}
