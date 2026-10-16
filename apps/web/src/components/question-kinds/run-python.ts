// Runs a student's Python in their own browser for the Run button, with Pyodide (CPython compiled to
// WebAssembly, copied to /pyodide by scripts/copy-wasm.mjs). Only the sample tests the student can see;
// grading runs again on the server with the hidden tests.
import { outputMatches } from "@examinus/domain/scoring";
import type { CodeTestCase } from "@examinus/domain/kinds/code";
import type { CodeTestResult } from "@examinus/domain/kinds/base";

const timeLimitMs = 3000;
// Loading Python the first time downloads ~13 MB (cached after), so it gets longer than a run.
const loadLimitMs = 60_000;

type Reply = { id: number; output: string; error?: string };

let worker: Worker | null = null;
let loaded: Promise<boolean> | null = null;
let nextId = 0;

function reset() {
  worker?.terminate();
  worker = null;
  loaded = null;
}

function start(): Promise<boolean> {
  if (loaded) return loaded;
  // One worker (public/runners/python.mjs) holds Python between runs, so only the first Run is slow.
  const w = new Worker("/runners/python.mjs", { type: "module" });
  worker = w;
  loaded = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), loadLimitMs);
    w.addEventListener("message", function onReady(e: MessageEvent) {
      if (!("ready" in e.data)) return;
      clearTimeout(timer);
      w.removeEventListener("message", onReady);
      resolve(e.data.ready);
    });
  });
  loaded.then((ok) => !ok && reset());
  return loaded;
}

function runOnce(code: string, input: string): Promise<{ output: string; error?: string }> {
  const w = worker!;
  const id = ++nextId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // An endless loop can't be interrupted, so throw the worker away; the next Run loads Python again.
      reset();
      resolve({ output: "", error: `Time limit exceeded (${timeLimitMs / 1000} s)` });
    }, timeLimitMs);
    w.addEventListener("message", function onReply(e: MessageEvent<Reply>) {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      w.removeEventListener("message", onReply);
      resolve(e.data);
    });
    w.postMessage({ id, code, input });
  });
}

// Starts loading Python ahead of the first Run (e.g. when a Python question comes into view).
export function preloadPython() {
  if (typeof window !== "undefined") void start();
}

export async function runPythonTests(code: string, tests: readonly CodeTestCase[]): Promise<CodeTestResult[] | { error: string }> {
  if (!(await start())) return { error: "Python couldn't load in this browser. Your code is still checked after you submit." };
  const results: CodeTestResult[] = [];
  for (const t of tests) {
    if (!worker && !(await start())) return { error: "Python couldn't load in this browser." };
    const { output, error } = await runOnce(code, t.input);
    results.push({ testId: t.id, passed: !error && outputMatches(output, t.expectedOutput), output, error });
  }
  return results;
}
