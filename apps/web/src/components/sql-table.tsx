import type { SqlResult } from "@/lib/sql";

const show = (v: SqlResult["rows"][number][number]) =>
  v === null ? <span className="text-muted italic">NULL</span> : v instanceof Uint8Array ? "(blob)" : String(v);

// A query result (or a table's rows) as a compact, scrollable table.
export function SqlTable({ result, caption }: { result: SqlResult; caption?: string }) {
  return (
    <div className="min-w-0">
      {caption && <p className="mb-1 text-xs font-medium text-muted">{caption}</p>}
      {result.columns.length === 0 ? (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-muted">No rows</p>
      ) : (
        <div className="max-h-64 overflow-auto rounded-md border border-border">
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-surface-muted">
              <tr>
                {result.columns.map((c, i) => (
                  <th key={i} className="border-b border-border px-2.5 py-1.5 text-left font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="even:bg-surface-muted/50">
                  {row.map((v, j) => (
                    <td key={j} className="px-2.5 py-1 whitespace-nowrap">
                      {show(v)}
                    </td>
                  ))}
                </tr>
              ))}
              {result.rows.length === 0 && (
                <tr>
                  <td colSpan={result.columns.length} className="px-2.5 py-1.5 text-muted italic">
                    No rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
