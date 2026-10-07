// Runs a student's Python in their own browser for the Run button, with Pyodide (CPython compiled to
// WebAssembly, copied to /pyodide by scripts/copy-wasm.mjs). Only the sample tests the student can see;
// grading runs again on the server with the hidden tests.
import { outputMatches } from "./code";
import type { CodeTestCase, CodeTestResult } from "./types";

const timeLimitMs = 3000;
// Loading Python the first time downloads ~13 MB (cached after), so it gets longer than a run.
const loadLimitMs = 60_000;

// One worker holds Python between runs, so only the first Run is slow. Each run gets fresh globals,
// stdin is the test input, and the network is switched off once Python has loaded.
const workerSource = (origin: string) => `
import { loadPyodide } from "${origin}/pyodide/pyodide.mjs";
const ready = loadPyodide({ indexURL: "${origin}/pyodide/" }).then((py) => {
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches"]) {
    try { self[name] = undefined; } catch {}
  }
  return py;
});
ready.then(() => postMessage({ ready: true }), (e) => postMessage({ ready: false, error: String(e) }));
onmessage = async ({ data: { id, code, input } }) => {
  const py = await ready;
  const out = [];
  const err = [];
  const writer = (chunks) => ({ write: (buf) => { chunks.push(buf.slice()); return buf.length; } });
  let given = false;
  py.setStdin({ stdin: () => (given ? null : ((given = true), input.endsWith("\\n") ? input : input + "\\n")) });
  py.setStdout(writer(out));
  py.setStderr(writer(err));
  const text = (chunks) => new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));
  const globals = py.globals.get("dict")();
  try {
    py.runPython(code, { globals });
    postMessage({ id, output: text(out) });
  } catch (e) {
    // The last line of a traceback says what went wrong, e.g. "ValueError: invalid literal for int()".
    const lines = String(e.message ?? e).trim().split("\\n");
    postMessage({ id, output: text(out), error: lines.slice(-1)[0] + (text(err) ? "\\n" + text(err) : "") });
  } finally {
    globals.destroy();
  }
};
`;

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
  const url = URL.createObjectURL(new Blob([workerSource(location.origin)], { type: "text/javascript" }));
  const w = new Worker(url, { type: "module" });
  worker = w;
  loaded = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), loadLimitMs);
    w.addEventListener("message", function onReady(e: MessageEvent) {
      if (!("ready" in e.data)) return;
      clearTimeout(timer);
      w.removeEventListener("message", onReady);
      URL.revokeObjectURL(url);
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

export async function runPythonTests(code: string, tests: CodeTestCase[]): Promise<CodeTestResult[] | { error: string }> {
  if (!(await start())) return { error: "Python couldn't load in this browser. Your code is still checked after you submit." };
  const results: CodeTestResult[] = [];
  for (const t of tests) {
    if (!worker && !(await start())) return { error: "Python couldn't load in this browser." };
    const { output, error } = await runOnce(code, t.input);
    results.push({ testId: t.id, passed: !error && outputMatches(output, t.expectedOutput), output, error });
  }
  return results;
}
