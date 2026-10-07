// Copies the WebAssembly runtimes the browser loads into public/: sql.js (SQL questions) and Pyodide
// (Python's Run button). Runs before dev and build, so they always match the installed versions.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pub = path.join(import.meta.dirname, "..", "public");

function copy(pkg, entry, folder, files) {
  const dist = path.dirname(require.resolve(`${pkg}/${entry}`));
  const out = path.join(pub, folder);
  mkdirSync(out, { recursive: true });
  for (const file of files) copyFileSync(path.join(dist, file), path.join(out, file));
}

copy("sql.js", "dist/sql-wasm.js", "sqljs", ["worker.sql-wasm.js", "sql-wasm.wasm"]);
copy("pyodide", "package.json", "pyodide", [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
]);
