// Runs SQL for grading on the server: SQLite (sql.js, WebAssembly, in memory, no files or network) in a
// worker thread, so a runaway query is stopped by the time limit instead of freezing the server.
import "server-only";
import { createRequire } from "node:module";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { checkQuery, formatTable, maxRows, sameResult, type SqlResult } from "../sql";
import type { CodeTestResult, SqlQuestion } from "../types";

const timeLimitMs = 3000;
// Resolved from the app folder at run time; the worker loads it itself, outside the bundle.
const sqljsPath = createRequire(path.join(process.cwd(), "package.json")).resolve("sql.js");

// Each query gets a fresh database from setup (+ extra), so one query can't change what the next sees.
const workerSource = `
const { parentPort, workerData } = require("node:worker_threads");
const { sqljs, setup, extra, queries, maxRows } = workerData;
require(sqljs)().then((SQL) => {
  const fresh = () => {
    const db = new SQL.Database();
    // Huge blobs would only eat memory.
    for (const name of ["zeroblob", "randomblob"]) db.create_function(name, () => { throw new Error(name + " is turned off"); });
    db.exec(setup);
    if (extra) db.exec(extra);
    return db;
  };
  try { fresh().close(); } catch (e) { return parentPort.postMessage({ setupError: String(e.message || e) }); }
  const results = queries.map((sql) => {
    const db = fresh();
    try {
      const stmt = db.prepare(sql);
      const columns = stmt.getColumnNames();
      const rows = [];
      while (rows.length < maxRows && stmt.step())
        rows.push(stmt.get().map((v) => (v instanceof Uint8Array ? "(blob)" : v)));
      stmt.free();
      return { columns, rows };
    } catch (e) {
      return { error: String(e.message || e) };
    } finally {
      db.close();
    }
  });
  parentPort.postMessage({ results });
});`;

type Outcome = SqlResult | { error: string };
type Run = { results: Outcome[] } | { setupError: string } | { timedOut: true };

function runQueries(setup: string, extra: string, queries: string[]): Promise<Run> {
  return new Promise((resolve) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { sqljs: sqljsPath, setup, extra, queries, maxRows },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    const finish = (run: Run) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(run);
    };
    const timer = setTimeout(() => finish({ timedOut: true }), timeLimitMs);
    worker.on("message", finish);
    worker.on("error", (e) => finish({ setupError: e.message }));
  });
}

const failed = (o: Outcome): o is { error: string } => "error" in o;

// What the answer query returns on the sample data, shown to students as the expected result.
export async function sampleResult(q: SqlQuestion): Promise<SqlResult | null> {
  const run = await runQueries(q.setupSql, "", [q.answerSql]);
  if (!("results" in run) || failed(run.results[0])) return null;
  return run.results[0];
}

// One check on the sample data, and one on the hidden data if the teacher wrote some.
// null when the question itself is broken (bad setup or answer): the teacher grades it by hand.
export async function runSqlChecks(q: SqlQuestion, studentSql: string): Promise<CodeTestResult[] | null> {
  const checks = [{ id: "sample", extra: "" }];
  if (q.hiddenDataSql.trim()) checks.push({ id: "hidden", extra: q.hiddenDataSql });
  const invalid = checkQuery(studentSql);

  const results: CodeTestResult[] = [];
  for (const check of checks) {
    const run = await runQueries(q.setupSql, check.extra, invalid ? [q.answerSql] : [q.answerSql, studentSql]);
    if ("setupError" in run) return null;
    if ("timedOut" in run) {
      // Every check would time out the same way; don't make the student wait for each.
      for (const c of checks.slice(results.length))
        results.push({ testId: c.id, passed: false, output: "", error: `Took too long (over ${timeLimitMs / 1000} s)` });
      break;
    }
    const [expected, actual] = run.results;
    if (failed(expected)) return null;
    if (invalid || !actual || failed(actual)) {
      results.push({
        testId: check.id,
        passed: false,
        output: "",
        error: invalid ?? (actual && failed(actual) ? actual.error : "No result"),
        expected: formatTable(expected),
      });
      continue;
    }
    results.push({
      testId: check.id,
      passed: sameResult(actual, expected, q.orderMatters),
      output: formatTable(actual),
      expected: formatTable(expected),
    });
  }
  return results;
}
