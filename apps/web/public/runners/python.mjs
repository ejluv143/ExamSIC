// Holds Python between runs for the Run button (src/components/question-kinds/run-python.ts). A file of its own, not a
// blob, so the page's Content-Security-Policy doesn't apply to it. Each run gets fresh globals, stdin is the test
// input, and the network is switched off once Python has loaded.
import { loadPyodide } from "../pyodide/pyodide.mjs";

const ready = loadPyodide({ indexURL: new URL("../pyodide/", import.meta.url).href }).then((py) => {
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
  py.setStdin({ stdin: () => (given ? null : ((given = true), input.endsWith("\n") ? input : input + "\n")) });
  py.setStdout(writer(out));
  py.setStderr(writer(err));
  const text = (chunks) => new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));
  const globals = py.globals.get("dict")();
  try {
    py.runPython(code, { globals });
    postMessage({ id, output: text(out) });
  } catch (e) {
    // The last line of a traceback says what went wrong, e.g. "ValueError: invalid literal for int()".
    const lines = String(e.message ?? e).trim().split("\n");
    postMessage({ id, output: text(out), error: lines.slice(-1)[0] + (text(err) ? "\n" + text(err) : "") });
  } finally {
    globals.destroy();
  }
};
