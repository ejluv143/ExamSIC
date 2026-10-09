// Runs SQL for grading on the server: SQLite (sql.js, WebAssembly, in memory, no files or network) in a
// child process (sql-grader-worker.ts), so a runaway query is killed by the time limit instead of freezing the server.
import {
  checkQuery,
  formatTable,
  maxRows,
  sameResult,
  type CodeTestResult,
  type SqlQuestion,
  type SqlResult,
  type SqlSampleResult,
} from "@examora/contract";

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

// What the answer query returns on the sample data, shown to students as the expected result.
const samples = new Map<string, SqlSampleResult | null>();

export async function sampleResult(q: SqlQuestion): Promise<SqlSampleResult | null> {
  // The same question is shown to every student, so run it once.
  const key = `${q.setupSql}\u0000${q.answerSql}`;
  if (samples.has(key)) return samples.get(key)!;
  const run = await runQueries(q.setupSql, "", [q.answerSql]);
  const first = "results" in run ? run.results[0] : undefined;
  const result = first && !failed(first) ? { columns: first.columns, rows: first.rows.map((r) => r.map((v) => (v instanceof Uint8Array ? "(blob)" : v))) } : null;
  samples.set(key, result);
  return result;
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
