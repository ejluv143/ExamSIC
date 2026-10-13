// Runs SQL for grading on the server: SQLite (sql.js, WebAssembly, in memory, no files or network) in a
// child process (sql-grader-worker.ts), so a runaway query is killed by the time limit instead of freezing the server.
import { type CodeTestResult, type SqlQuestion, type SqlSampleResult } from "@examinus/domain/question";
import { checkQuery, formatTable, maxRows, sameResult, type SqlResult } from "@examinus/domain/sql";
import { Effect } from "effect";
import { createHash } from "node:crypto";
import type { Cache } from "./Cache.ts";

const timeLimitMs = 3000;
const workerPath = new URL("./sql-grader-worker.ts", import.meta.url).pathname;

type Outcome = SqlResult | { error: string };
type Run = { results: Outcome[] } | { setupError: string } | { timedOut: true };

async function runQueries(setup: string, extra: string, queries: string[]): Promise<Run> {
  const child = Bun.spawn([process.execPath, workerPath], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  child.stdin.write(JSON.stringify({ setup, extra, queries, maxRows }));
  child.stdin.end();
  const timer = setTimeout(() => child.kill("SIGKILL"), timeLimitMs);
  try {
    const [output, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    if (child.signalCode === "SIGKILL") return { timedOut: true };
    if (code !== 0) return { setupError: (await new Response(child.stderr).text()).trim() || `grader exited with ${code}` };
    return JSON.parse(output) as Run;
  } finally {
    clearTimeout(timer);
  }
}

const failed = (o: Outcome): o is { error: string } => "error" in o;

// What the answer query returns on the sample data, shown to students as the expected result. Kept in Dragonfly by
// a hash of the setup and answer SQL (an edited question gets a new key), so the grader runs once per question.
// A grader failure isn't cached: it may work next time.
export const sampleResult = Effect.fn("sql-grader.sampleResult")(function* (cache: Cache["Service"], q: SqlQuestion) {
  const key = `sql-sample:${createHash("sha256").update(`${q.setupSql}\u0000${q.answerSql}`).digest("base64url")}`;
  const cached = yield* cache.getJson<{ sample: SqlSampleResult | null }>(key);
  if (cached) return cached.sample;
  const run = yield* Effect.promise(() => runQueries(q.setupSql, "", [q.answerSql]));
  const first = "results" in run ? run.results[0] : undefined;
  const sample = first && !failed(first) ? { columns: first.columns, rows: first.rows.map((r) => r.map((v) => (v instanceof Uint8Array ? "(blob)" : v))) } : null;
  yield* cache.setJson(key, { sample }, 24 * 60 * 60_000);
  return sample;
});

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
    if (!expected || failed(expected)) return null;
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
