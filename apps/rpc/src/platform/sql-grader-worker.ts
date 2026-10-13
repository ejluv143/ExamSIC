// Child process of sql-grader.ts: runs each query on a fresh sql.js database built from setup (+ extra), so one
// query can't change what the next sees. Reads the job as JSON on stdin, writes the result as JSON on stdout.
// A separate process (not a worker thread) because Bun can't terminate a worker that is busy inside WebAssembly;
// the parent kills this process when the time limit passes.
import initSqlJs, { type Database } from "sql.js";

const { setup, extra, queries, maxRows } = JSON.parse(await Bun.stdin.text()) as {
  setup: string;
  extra: string;
  queries: string[];
  maxRows: number;
};

const SQL = await initSqlJs();
const fresh = (): Database => {
  const db = new SQL.Database();
  // Huge blobs would only eat memory.
  for (const name of ["zeroblob", "randomblob"])
    db.create_function(name, () => {
      throw new Error(name + " is turned off");
    });
  db.exec(setup);
  if (extra) db.exec(extra);
  return db;
};
try {
  fresh().close();
} catch (e) {
  console.log(JSON.stringify({ setupError: String(e instanceof Error ? e.message : e) }));
  process.exit(0);
}

const results = queries.map((sql) => {
  const db = fresh();
  try {
    const stmt = db.prepare(sql);
    const columns = stmt.getColumnNames();
    const rows: unknown[][] = [];
    while (rows.length < maxRows && stmt.step()) rows.push(stmt.get().map((v) => (v instanceof Uint8Array ? "(blob)" : v)));
    stmt.free();
    return { columns, rows };
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e) };
  } finally {
    db.close();
  }
});
console.log(JSON.stringify({ results }));
