"use client";

import { useState } from "react";
import { Table2 } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { SqlTable } from "@/components/sql-table";
import { Button } from "@/components/ui";
import { previewTables } from "@/components/question-kinds/run-sql";
import type { SqlResult } from "@examinus/question-kinds-core/sql";

export function Errors({ text }: { text: string }) {
  return <p className="rounded-md bg-danger-soft px-3 py-2 font-mono text-xs text-danger">{text}</p>;
}

// Tables (CREATE TABLE + INSERT) with a button to see them as data. Used by SQL and PHP (Laravel) questions.
export function SqlTablesField({ value, onChange }: { value: string; onChange: (sql: string) => void }) {
  const [tables, setTables] = useState<{ name: string; result: SqlResult }[] | { error: string } | null>(null);
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Tables and sample data</p>
        <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={async () => setTables(await previewTables(value))}>
          <Table2 className="size-3.5" aria-hidden /> Preview tables
        </Button>
      </div>
      <CodeEditor value={value} onChange={onChange} language="sql" minLines={8} label="Setup SQL" />
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
  );
}
