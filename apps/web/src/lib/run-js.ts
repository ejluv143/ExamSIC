// Runs a student's JavaScript in a throwaway Web Worker, in their own browser, for the Run button.
// It only tries the sample tests the student can already see; real grading happens on the server.
import { outputMatches } from "./code";
import type { CodeTestCase, CodeTestResult } from "./types";

const timeLimitMs = 2000;

// The worker can't reach the network or storage, prints through console.log, and reads input with readline().
const workerSource = `
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches"]) {
  try { self[name] = undefined; } catch {}
}
onmessage = ({ data: { code, input } }) => {
  const lines = input.replace(/\\r\\n?/g, "\\n").split("\\n");
  let next = 0;
  const readline = () => (next < lines.length ? lines[next++] : null);
  const out = [];
  const print = (...args) => out.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  console.log = print;
  console.info = print;
  try {
    new Function("readline", "input", "print", code)(readline, input, print);
    postMessage({ output: out.join("\\n") });
  } catch (e) {
    postMessage({ output: out.join("\\n"), error: String(e) });
  }
};
`;

function runOnce(code: string, input: string): Promise<{ output: string; error?: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const worker = new Worker(url);
    const done = (result: { output: string; error?: string }) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
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

export async function runJsTests(code: string, tests: CodeTestCase[]): Promise<CodeTestResult[]> {
  const results: CodeTestResult[] = [];
  for (const t of tests) {
    const { output, error } = await runOnce(code, t.input);
    results.push({ testId: t.id, passed: !error && outputMatches(output, t.expectedOutput), output, error });
  }
  return results;
}
