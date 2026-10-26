"use client";

import { useEffect, useState } from "react";
import { SqlTable } from "@/components/sql-table";
import { previewTables } from "@/components/question-kinds/run-sql";
import type { SqlResult } from "@examinus/question-kinds-core/sql";

// The question's tables with their rows, built in the browser from its setup SQL.
export function TablesPreview({ setup }: { setup: string }) {
  const [tables, setTables] = useState<{ name: string; result: SqlResult }[] | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    previewTables(setup).then((t) => live && setTables(t));
    return () => {
      live = false;
    };
  }, [setup]);
  return (
    <details open>
      <summary className="cursor-pointer text-sm font-medium">Tables</summary>
      <div className="mt-2 grid gap-3 @lg:grid-cols-2">
        {tables === null ? (
          <p className="text-sm text-muted">Loading tables…</p>
        ) : "error" in tables ? (
          <pre className="overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs">{setup}</pre>
        ) : (
          tables.map((t) => <SqlTable key={t.name} result={t.result} caption={t.name} />)
        )}
      </div>
    </details>
  );
}
