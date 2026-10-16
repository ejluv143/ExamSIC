// Runs a student's JavaScript in a throwaway Web Worker, in their own browser, for the Run button.
// It only tries the sample tests the student can already see; real grading happens on the server.
import { outputMatches } from "@examinus/domain/scoring";
import type { CodeTestCase } from "@examinus/domain/kinds/code";
import type { CodeTestResult } from "@examinus/domain/kinds/base";

const timeLimitMs = 2000;

function runOnce(code: string, input: string): Promise<{ output: string; error?: string }> {
  return new Promise((resolve) => {
    // public/runners/javascript.js; it can't reach the network or storage.
    const worker = new Worker("/runners/javascript.js");
    const done = (result: { output: string; error?: string }) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    // An endless loop never answers, so stop it.
    const timer = setTimeout(() => done({ output: "", error: `Time limit exceeded (${timeLimitMs / 1000} s)` }), timeLimitMs);
    worker.onmessage = (e) => done(e.data);
    worker.onerror = (e) => {
      e.preventDefault();
      done({ output: "", error: e.message });
    };
    worker.postMessage({ code, input });
  });
}

export async function runJsTests(code: string, tests: readonly CodeTestCase[]): Promise<CodeTestResult[]> {
  const results: CodeTestResult[] = [];
  for (const t of tests) {
    const { output, error } = await runOnce(code, t.input);
    results.push({ testId: t.id, passed: !error && outputMatches(output, t.expectedOutput), output, error });
  }
  return results;
}
