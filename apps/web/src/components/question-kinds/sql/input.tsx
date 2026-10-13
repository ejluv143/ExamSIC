"use client";

import { useState } from "react";
import clsx from "clsx";
import { Play, RotateCcw } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { SqlTable } from "@/components/sql-table";
import { Badge, Button } from "@/components/ui";
import { runSqlInBrowser } from "@/components/question-kinds/run-sql";
import { sameResult, type SqlResult } from "@/lib/sql";
import { TablesPreview } from "../shared/input-tables-preview";
import type { InputProps } from "../views/input";

export function Input({ q, value: answer, onChange, onEdit }: InputProps<"sql">) {
  const value = typeof answer === "string" ? answer : q.starterCode;
  const sample = q.sampleResult;
  const expected: SqlResult | null = sample ? { columns: [...sample.columns], rows: sample.rows.map((r) => [...r]) } : null;
  const [run, setRun] = useState<{ result?: SqlResult; error?: string } | null>(null);
  const [running, setRunning] = useState(false);

  // sql.js reports no columns for an empty result, so two empty results count as the same.
  const matches =
    run?.result && expected
      ? (run.result.rows.length === 0 && expected.rows.length === 0) || sameResult(run.result, expected, q.orderMatters)
      : null;

  return (
    <div className="space-y-3">
      <TablesPreview setup={q.setupSql} />
      {expected && (
        <SqlTable
          result={expected}
          caption={`Expected result on this data${q.orderMatters ? " (in this order)" : " (any order)"}`}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge>SQLite</Badge>
        <span className="flex-1" />
        <Button
          variant="ghost"
          className="px-2.5 py-1.5 text-xs"
          disabled={value === q.starterCode}
          onClick={() => {
            if (window.confirm("Replace your query with the starter query?")) {
              onChange(q.starterCode);
              setRun(null);
            }
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </Button>
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            setRun(await runSqlInBrowser(q.setupSql, value));
            setRunning(false);
          }}
        >
          <Play className="size-3.5" aria-hidden /> {running ? "Running…" : "Run query"}
        </Button>
      </div>
      <CodeEditor value={value} onChange={onChange} onEdit={onEdit} language="sql" minLines={5} label="Your query" />
      {run?.error && (
        <p role="status" className="rounded-md bg-danger-soft px-3 py-2 font-mono text-xs text-danger">
          {run.error}
        </p>
      )}
      {run?.result && (
        <div role="status" className="space-y-1.5">
          {matches !== null && (
            <p className={clsx("text-sm font-medium", matches ? "text-success" : "text-warning")}>
              {matches
                ? "Matches the expected result on this data. It's also checked on data you can't see."
                : "Doesn't match the expected result yet."}
            </p>
          )}
          <SqlTable result={run.result} caption="Your result" />
        </div>
      )}
    </div>
  );
}
