// Runs SQL in the browser with sql.js's own Web Worker (copied to /sqljs by scripts/copy-sqljs.mjs).
// For the Run button, the table preview and the teacher's preview only; grading runs again on the server.
import { checkQuery, maxRows, type SqlResult } from "./sql";

const timeLimitMs = 3000;

type Reply = { id: number; results?: { columns: string[]; values: SqlResult["rows"] }[]; error?: string };
type Exec = (sql: string) => Promise<Reply>;

// A fresh in-memory database for one job, stopped after the time limit whatever it's doing.
async function withDatabase<T>(job: (exec: Exec) => Promise<T>): Promise<T | { error: string }> {
  const worker = new Worker("/sqljs/worker.sql-wasm.js");
  let nextId = 0;
  const pending = new Map<number, (r: Reply) => void>();
  worker.onmessage = (e: MessageEvent<Reply>) => pending.get(e.data.id)?.(e.data);
  const send = (message: object) =>
    new Promise<Reply>((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      worker.postMessage({ id, ...message });
    });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ error: string }>((resolve) => {
    timer = setTimeout(() => resolve({ error: `Took too long (over ${timeLimitMs / 1000} s)` }), timeLimitMs);
  });
  try {
    return await Promise.race([send({ action: "open" }).then(() => job((sql) => send({ action: "exec", sql }))), timeout]);
  } finally {
    clearTimeout(timer);
    worker.terminate();
  }
}

export async function runSqlInBrowser(setup: string, query: string): Promise<{ result?: SqlResult; error?: string }> {
  const invalid = checkQuery(query);
  if (invalid) return { error: invalid };
  return withDatabase(async (exec) => {
    const made = await exec(setup);
    if (made.error) return { error: `The tables couldn't be created: ${made.error}` };
    const reply = await exec(query);
    if (reply.error) return { error: reply.error };
    // sql.js leaves out a result with no rows entirely, column names included.
    const last = reply.results?.at(-1);
    return { result: last ? { columns: last.columns, rows: last.values.slice(0, maxRows) } : { columns: [], rows: [] } };
  });
}

// Every table the setup makes, with its first rows, so students can see the data they're querying.
export async function previewTables(setup: string) {
  return withDatabase(async (exec): Promise<{ name: string; result: SqlResult }[] | { error: string }> => {
    const made = await exec(setup);
    if (made.error) return { error: made.error };
    const names = await exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
    );
    const tables: { name: string; result: SqlResult }[] = [];
    for (const [n] of names.results?.[0]?.values ?? []) {
      const name = String(n);
      const cols = await exec(`SELECT name FROM pragma_table_info('${name.replace(/'/g, "''")}')`);
      const rows = await exec(`SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT 50`);
      tables.push({
        name,
        result: { columns: (cols.results?.[0]?.values ?? []).map(([c]) => String(c)), rows: rows.results?.[0]?.values ?? [] },
      });
    }
    return tables;
  });
}
