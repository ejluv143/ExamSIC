// Runs one student's JavaScript for the Run button (src/components/question-kinds/run-js.ts). A file of its own, not a
// blob: a blob worker inherits the page's Content-Security-Policy, which forbids the eval behind `new Function`.
// The worker can't reach the network or storage, prints through console.log, and reads input with readline().
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches"]) {
  try { self[name] = undefined; } catch {}
}
onmessage = ({ data: { code, input } }) => {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  let next = 0;
  const readline = () => (next < lines.length ? lines[next++] : null);
  const out = [];
  const print = (...args) => out.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  console.log = print;
  console.info = print;
  try {
    new Function("readline", "input", "print", code)(readline, input, print);
    postMessage({ output: out.join("\n") });
  } catch (e) {
    postMessage({ output: out.join("\n"), error: String(e) });
  }
};
